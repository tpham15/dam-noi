const crypto = require('crypto');
const { pool } = require('../db');

const toInt = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
};

const HOURLY_GENERATION_LIMIT = () => toInt(process.env.AI_MISSION_GEN_HOURLY_LIMIT, 10);
const DAILY_GENERATION_LIMIT = () => toInt(process.env.AI_MISSION_GEN_DAILY_LIMIT, 30);
const CACHE_MINUTES = () => Math.max(0, Math.min(60, toInt(process.env.AI_MISSION_GEN_CACHE_MINUTES, 5)));

function estimateCostUsd(inputTokens = 0, outputTokens = 0) {
  // Pricing changes over time, so rates are deliberately configuration-driven.
  // Example env values are USD per 1,000,000 tokens.
  const inputRate = Number(process.env.AI_INPUT_COST_PER_MTOK || 0);
  const outputRate = Number(process.env.AI_OUTPUT_COST_PER_MTOK || 0);
  if (!(inputRate > 0 || outputRate > 0)) return null;
  return Number((((Number(inputTokens) || 0) * inputRate + (Number(outputTokens) || 0) * outputRate) / 1_000_000).toFixed(6));
}

async function initPilotMetrics() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_usage_events (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      user_id TEXT,
      center_id TEXT,
      endpoint TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'reserved',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd NUMERIC(12,6),
      request_hash TEXT,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ai_usage_user_endpoint_time
      ON ai_usage_events(user_id, endpoint, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_center_time
      ON ai_usage_events(center_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_endpoint_time
      ON ai_usage_events(endpoint, created_at DESC);

    CREATE TABLE IF NOT EXISTS mission_generation_cache (
      cache_key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      center_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      draft JSONB NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_generation_cache_created
      ON mission_generation_cache(created_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_ux_events (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      event_name TEXT NOT NULL,
      user_id TEXT,
      center_id TEXT,
      class_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS idx_pilot_ux_event_time
      ON pilot_ux_events(event_name, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pilot_ux_class_time
      ON pilot_ux_events(class_id, created_at DESC);
  `);
}

const UX_EVENTS = new Set([
  'teacher_portal_open','center_created','class_created','students_added',
  'mission_generated','assignment_created','student_login_success',
  'student_mission_opened','student_mission_finished','parent_report_open'
]);

async function recordUxEvent(eventName, { userId=null, centerId=null, classId=null, metadata={} } = {}) {
  if (!UX_EVENTS.has(String(eventName || ''))) return false;
  await pool.query(`INSERT INTO pilot_ux_events(event_name,user_id,center_id,class_id,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)`, [
    eventName,userId,centerId,classId,JSON.stringify(metadata || {})
  ]);
  return true;
}

function stableGeneratorHash({ userId, classId, input }) {
  const canonical = {
    userId: String(userId || ''),
    classId: String(classId || ''),
    grade: Number(input?.grade || 0),
    ageBand: String(input?.ageBand || ''),
    topic: String(input?.topic || ''),
    targetVocab: Array.isArray(input?.targetVocab) ? input.targetVocab : [],
    targetPatterns: Array.isArray(input?.targetPatterns) ? input.targetPatterns : [],
    durationMinutes: Number(input?.durationMinutes || 0),
    missionType: String(input?.missionType || ''),
    teacherNote: String(input?.teacherNote || ''),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

async function getGenerationCache(cacheKey) {
  const minutes = CACHE_MINUTES();
  if (!minutes) return null;
  const r = await pool.query(`
    SELECT draft,meta,created_at
    FROM mission_generation_cache
    WHERE cache_key=$1 AND created_at >= NOW() - ($2::text || ' minutes')::interval
    LIMIT 1
  `, [cacheKey, String(minutes)]);
  return r.rows[0] || null;
}

async function putGenerationCache({ cacheKey, userId, centerId, classId, draft, meta = {} }) {
  await pool.query(`
    INSERT INTO mission_generation_cache(cache_key,user_id,center_id,class_id,draft,meta,created_at)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,NOW())
    ON CONFLICT (cache_key) DO UPDATE SET
      draft=EXCLUDED.draft, meta=EXCLUDED.meta, created_at=NOW()
  `, [cacheKey,userId,centerId,classId,JSON.stringify(draft || {}),JSON.stringify(meta || {})]);
}

async function reserveAiCall({ userId = null, centerId = null, endpoint, model = '', requestHash = null, hourlyLimit = null, dailyLimit = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize quota checks per user+endpoint even if two browser requests land together.
    if (userId) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${userId}:${endpoint}`]);

    let hourCount = 0;
    let dayCount = 0;
    if (userId && (hourlyLimit != null || dailyLimit != null)) {
      const c = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')::int AS hour_count,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS day_count
        FROM ai_usage_events
        WHERE user_id=$1 AND endpoint=$2
      `, [userId, endpoint]);
      hourCount = Number(c.rows[0]?.hour_count || 0);
      dayCount = Number(c.rows[0]?.day_count || 0);
      if (hourlyLimit != null && hourCount >= hourlyLimit) {
        await client.query('ROLLBACK');
        return { allowed:false, reason:'hourly', hourCount, dayCount, hourlyLimit, dailyLimit };
      }
      if (dailyLimit != null && dayCount >= dailyLimit) {
        await client.query('ROLLBACK');
        return { allowed:false, reason:'daily', hourCount, dayCount, hourlyLimit, dailyLimit };
      }
    }

    const r = await client.query(`
      INSERT INTO ai_usage_events(user_id,center_id,endpoint,model,status,request_hash)
      VALUES ($1,$2,$3,$4,'reserved',$5)
      RETURNING id
    `, [userId,centerId,endpoint,String(model || ''),requestHash]);
    await client.query('COMMIT');
    return {
      allowed:true,
      eventId:r.rows[0].id,
      hourCount:hourCount + 1,
      dayCount:dayCount + 1,
      hourlyLimit,
      dailyLimit,
    };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function startAiCall({ userId = null, centerId = null, endpoint, model = '', requestHash = null }) {
  const r = await reserveAiCall({ userId, centerId, endpoint, model, requestHash });
  return r.eventId;
}

async function completeAiCall(eventId, { status = 'success', inputTokens = 0, outputTokens = 0, latencyMs = 0, errorMessage = '' } = {}) {
  if (!eventId) return;
  const cost = estimateCostUsd(inputTokens, outputTokens);
  await pool.query(`
    UPDATE ai_usage_events
    SET finished_at=NOW(),status=$1,input_tokens=$2,output_tokens=$3,latency_ms=$4,
        estimated_cost_usd=$5,error_message=$6
    WHERE id=$7
  `, [
    String(status || 'success').slice(0,24),
    Math.max(0,Number(inputTokens)||0),
    Math.max(0,Number(outputTokens)||0),
    Math.max(0,Math.round(Number(latencyMs)||0)),
    cost,
    errorMessage ? String(errorMessage).slice(0,500) : null,
    eventId,
  ]);
}

async function reserveMissionGeneration({ userId, centerId, model, requestHash }) {
  return reserveAiCall({
    userId,
    centerId,
    endpoint:'mission_generate',
    model,
    requestHash,
    hourlyLimit:HOURLY_GENERATION_LIMIT(),
    dailyLimit:DAILY_GENERATION_LIMIT(),
  });
}

async function getPilotStats(days = 7) {
  const safeDays = Math.max(1, Math.min(90, Number(days) || 7));
  const [counts, activity, ai, stt, teacherReuse, ux, firstAssignment] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM centers WHERE status='active') AS centers,
        (SELECT COUNT(DISTINCT user_id)::int FROM center_members) AS teachers,
        (SELECT COUNT(*)::int FROM users WHERE role='student') AS students,
        (SELECT COUNT(*)::int FROM classes WHERE status='active') AS classes
    `),
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM missions WHERE center_id IS NOT NULL AND created_at::timestamptz >= NOW() - ($1::text || ' days')::interval) AS missions_saved,
        (SELECT COUNT(*)::int FROM assignments WHERE assigned_at::timestamptz >= NOW() - ($1::text || ' days')::interval) AS assignments_created,
        (SELECT COUNT(*)::int FROM mission_attempts WHERE started_at::timestamptz >= NOW() - ($1::text || ' days')::interval) AS attempts_started,
        (SELECT COUNT(*)::int FROM mission_attempts WHERE status='completed' AND completed_at::timestamptz >= NOW() - ($1::text || ' days')::interval) AS attempts_completed,
        (SELECT COUNT(DISTINCT student_user_id)::int FROM mission_attempts WHERE started_at::timestamptz >= NOW() - ($1::text || ' days')::interval) AS active_students,
        (SELECT COALESCE(SUM(actual_speaking_seconds),0)::int FROM mission_attempts WHERE completed_at::timestamptz >= NOW() - ($1::text || ' days')::interval) AS speaking_seconds,
        (
          SELECT COUNT(*)::int
          FROM assignments a
          JOIN class_students cs ON cs.class_id=a.class_id AND cs.status='active'
          WHERE a.assigned_at::timestamptz >= NOW() - ($1::text || ' days')::interval
        ) AS assignment_slots,
        (
          SELECT COUNT(DISTINCT (ma.assignment_id,ma.student_user_id))::int
          FROM mission_attempts ma
          JOIN assignments a ON a.id=ma.assignment_id
          WHERE ma.status='completed'
            AND a.assigned_at::timestamptz >= NOW() - ($1::text || ' days')::interval
        ) AS completed_slots,
        (
          SELECT COUNT(DISTINCT actor)::int FROM (
            SELECT created_by AS actor
            FROM missions
            WHERE center_id IS NOT NULL
              AND created_at::timestamptz >= NOW() - ($1::text || ' days')::interval
            UNION
            SELECT assigned_by AS actor
            FROM assignments
            WHERE assigned_at::timestamptz >= NOW() - ($1::text || ' days')::interval
          ) q
        ) AS active_teachers,
        (
          SELECT COUNT(*)::int FROM report_shares
          WHERE created_at::timestamptz >= NOW() - ($1::text || ' days')::interval
        ) AS parent_report_links
    `, [String(safeDays)]),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE endpoint='mission_generate')::int AS mission_generate_calls,
        COALESCE(SUM(input_tokens),0)::bigint AS input_tokens,
        COALESCE(SUM(output_tokens),0)::bigint AS output_tokens,
        COALESCE(SUM(estimated_cost_usd),0)::numeric AS estimated_cost_usd,
        ROUND(AVG(latency_ms))::int AS avg_latency_ms,
        COUNT(*) FILTER (WHERE status='error')::int AS errors
      FROM ai_usage_events
      WHERE created_at >= NOW() - ($1::text || ' days')::interval
    `, [String(safeDays)]),
    pool.query(`
      SELECT
        COALESCE(SUM(s.stt_attempt_count),0)::int AS attempts,
        COALESCE(SUM(s.stt_retry_count),0)::int AS retries,
        COALESCE(SUM(s.stt_low_confidence_count),0)::int AS low_confidence
      FROM sessions s
      WHERE s.assignment_id IS NOT NULL
        AND s.started_at::timestamptz >= NOW() - ($1::text || ' days')::interval
    `, [String(safeDays)]),
    pool.query(`
      SELECT COUNT(*)::int AS teachers_reused
      FROM (
        SELECT created_by
        FROM missions
        WHERE center_id IS NOT NULL AND created_at::timestamptz >= NOW() - ($1::text || ' days')::interval
        GROUP BY created_by
        HAVING COUNT(*) >= 2
      ) x
    `, [String(safeDays)]),
    pool.query(`
      SELECT event_name,COUNT(*)::int AS count,
        COUNT(DISTINCT user_id)::int AS unique_users,
        COUNT(*) FILTER (WHERE metadata->>'source'='join_link')::int AS join_link_count
      FROM pilot_ux_events
      WHERE created_at >= NOW() - ($1::text || ' days')::interval
      GROUP BY event_name
    `, [String(safeDays)]),
    pool.query(`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds_to_first)::numeric AS median_seconds
      FROM (
        SELECT c.id,
          EXTRACT(EPOCH FROM (MIN(a.assigned_at::timestamptz) - c.created_at::timestamptz)) AS seconds_to_first
        FROM classes c
        JOIN assignments a ON a.class_id=c.id
        WHERE c.created_at::timestamptz >= NOW() - ($1::text || ' days')::interval
        GROUP BY c.id,c.created_at
        HAVING MIN(a.assigned_at::timestamptz) >= c.created_at::timestamptz
      ) q
    `, [String(safeDays)]),
  ]);

  const c = counts.rows[0] || {};
  const a = activity.rows[0] || {};
  const aiRow = ai.rows[0] || {};
  const voice = stt.rows[0] || {};
  const started = Number(a.attempts_started || 0);
  const completed = Number(a.attempts_completed || 0);
  const assignmentSlots = Number(a.assignment_slots || 0);
  const completedSlots = Number(a.completed_slots || 0);
  const activeStudents = Number(a.active_students || 0);
  const speaking = Number(a.speaking_seconds || 0);
  const sttAttempts = Number(voice.attempts || 0);
  const sttRetries = Number(voice.retries || 0);
  const uxMap = Object.fromEntries((ux.rows || []).map(r => [r.event_name, { count:Number(r.count||0), uniqueUsers:Number(r.unique_users||0), joinLinkCount:Number(r.join_link_count||0) }]));

  return {
    periodDays:safeDays,
    centers:Number(c.centers || 0),
    teachers:Number(c.teachers || 0),
    students:Number(c.students || 0),
    classes:Number(c.classes || 0),
    missionsSaved:Number(a.missions_saved || 0),
    assignmentsCreated:Number(a.assignments_created || 0),
    activeTeachers:Number(a.active_teachers || 0),
    parentReportLinksCreated:Number(a.parent_report_links || 0),
    attemptsStarted:started,
    attemptsCompleted:completed,
    assignmentSlots,
    completedAssignmentSlots:completedSlots,
    assignmentCompletionRatePercent:assignmentSlots ? Math.round(completedSlots / assignmentSlots * 100) : 0,
    attemptCompletionRatePercent:started ? Math.round(completed / started * 100) : 0,
    activeStudents,
    actualSpeakingSeconds:speaking,
    avgSpeakingSecondsPerActiveStudent:activeStudents ? Math.round(speaking / activeStudents) : 0,
    teacherUnpromptedReuseCount:Number(teacherReuse.rows[0]?.teachers_reused || 0),
    sttAttemptCount:sttAttempts,
    sttRetryCount:sttRetries,
    sttRetryRatePercent:sttAttempts ? Math.round(sttRetries / sttAttempts * 100) : 0,
    sttLowConfidenceCount:Number(voice.low_confidence || 0),
    ux:{
      medianTimeToFirstAssignmentSeconds:Math.round(Number(firstAssignment.rows[0]?.median_seconds || 0)),
      teacherPortalOpens:uxMap.teacher_portal_open?.count || 0,
      studentLoginSuccesses:uxMap.student_login_success?.count || 0,
      studentLoginViaJoinLink:uxMap.student_login_success?.joinLinkCount || 0,
      studentMissionOpens:uxMap.student_mission_opened?.count || 0,
      studentMissionFinishes:uxMap.student_mission_finished?.count || 0,
      parentReportOpens:uxMap.parent_report_open?.count || 0,
      events:uxMap,
    },
    ai:{
      missionGenerationCalls:Number(aiRow.mission_generate_calls || 0),
      inputTokens:Number(aiRow.input_tokens || 0),
      outputTokens:Number(aiRow.output_tokens || 0),
      estimatedCostUsd:Number(aiRow.estimated_cost_usd || 0),
      avgLatencyMs:Number(aiRow.avg_latency_ms || 0),
      errorCount:Number(aiRow.errors || 0),
      costConfigured:(Number(process.env.AI_INPUT_COST_PER_MTOK || 0) > 0 || Number(process.env.AI_OUTPUT_COST_PER_MTOK || 0) > 0),
    },
  };
}

module.exports = {
  initPilotMetrics,
  stableGeneratorHash,
  getGenerationCache,
  putGenerationCache,
  reserveMissionGeneration,
  startAiCall,
  completeAiCall,
  recordUxEvent,
  getPilotStats,
};
