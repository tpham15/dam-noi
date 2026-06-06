// db.js — persistence for MoHo (users, sessions, turns, errors, streak, vocab).
// Postgres version (async). Set DATABASE_URL in the environment (Render Postgres
// provides this). All exported functions are async — callers must await them.
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's managed Postgres requires SSL; locally you can set PGSSL=off.
  ssl: process.env.PGSSL === "off" ? false : { rejectUnauthorized: false },
});

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
function dayDiff(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

// Run the schema once at startup. Safe to run repeatedly (IF NOT EXISTS).
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      confidence_level TEXT NOT NULL DEFAULT 'low',
      streak_days INTEGER NOT NULL DEFAULT 0,
      last_active_date TEXT,
      total_sessions INTEGER NOT NULL DEFAULT 0,
      total_seconds INTEGER NOT NULL DEFAULT 0,
      total_words INTEGER NOT NULL DEFAULT 0,
      job TEXT NOT NULL DEFAULT '',
      email TEXT,
      name TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_number INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      seconds_spoken INTEGER NOT NULL DEFAULT 0,
      words_spoken INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS turns (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS errors (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      said TEXT NOT NULL,
      corrected TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vocab (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      word TEXT NOT NULL,
      meaning_vi TEXT NOT NULL DEFAULT '',
      example_en TEXT NOT NULL DEFAULT '',
      situation_vi TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(user_id, word)
    );
    CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
    CREATE INDEX IF NOT EXISTS idx_errors_user ON errors(user_id);
    CREATE INDEX IF NOT EXISTS idx_vocab_user ON vocab(user_id);
  `);
  // Safe migrations for pre-existing databases (add columns if missing).
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS job TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT");
  await pool.query("ALTER TABLE vocab ADD COLUMN IF NOT EXISTS situation_vi TEXT NOT NULL DEFAULT ''");
}

async function getUser(userId) {
  const r = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  return r.rows[0] || null;
}

async function ensureUser(userId) {
  const existing = userId && (await getUser(userId));
  if (existing) return existing;
  const id = userId || uid();
  await pool.query(
    "INSERT INTO users (id, created_at, confidence_level) VALUES ($1, $2, 'low') ON CONFLICT (id) DO NOTHING",
    [id, now()]
  );
  return getUser(id);
}

async function startSession(userId) {
  const u = await ensureUser(userId);
  const t = today();
  // Only ever compare the date portion (YYYY-MM-DD), so re-entering the app
  // multiple times in one day can NEVER advance the streak.
  const lastDay = u.last_active_date ? String(u.last_active_date).slice(0, 10) : null;
  let streak = u.streak_days || 0;
  if (lastDay === t) {
    // already active today — streak unchanged (this is the key fix)
  } else if (lastDay && dayDiff(lastDay, t) === 1) {
    streak = streak + 1;       // consecutive next day
  } else {
    streak = 1;                // first ever, or a gap — restart at 1
  }
  const sessionNumber = u.total_sessions + 1;
  await pool.query(
    "UPDATE users SET streak_days = $1, last_active_date = $2, total_sessions = total_sessions + 1 WHERE id = $3",
    [streak, t, u.id]
  );
  const sessionId = uid();
  await pool.query(
    "INSERT INTO sessions (id, user_id, session_number, started_at) VALUES ($1, $2, $3, $4)",
    [sessionId, u.id, sessionNumber, now()]
  );
  return { userId: u.id, sessionId, sessionNumber, confidenceLevel: u.confidence_level, streakDays: streak };
}

async function getSession(sessionId) {
  const r = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
  return r.rows[0] || null;
}

async function logTurn(sessionId, role, content) {
  await pool.query(
    "INSERT INTO turns (session_id, role, content, created_at) VALUES ($1, $2, $3, $4)",
    [sessionId, role, content, now()]
  );
}

async function historyFor(sessionId) {
  const r = await pool.query(
    "SELECT role, content FROM turns WHERE session_id = $1 ORDER BY id ASC",
    [sessionId]
  );
  return r.rows.map((x) => ({ role: x.role, content: x.content }));
}

async function logErrors(userId, sessionId, list) {
  for (const e of list || []) {
    if (e && e.said && e.natural) {
      await pool.query(
        "INSERT INTO errors (user_id, session_id, said, corrected, type, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [userId, sessionId, e.said, e.natural, e.type || "other", now()]
      );
    }
  }
}

async function getErrorsForUser(userId, limit = 50) {
  const r = await pool.query(
    "SELECT said, corrected AS natural, type, created_at FROM errors WHERE user_id = $1 ORDER BY id DESC LIMIT $2",
    [userId, limit]
  );
  return r.rows;
}

async function bumpSpoken(userId, sessionId, seconds, words) {
  await pool.query(
    "UPDATE sessions SET seconds_spoken = seconds_spoken + $1, words_spoken = words_spoken + $2 WHERE id = $3",
    [seconds, words, sessionId]
  );
  await pool.query(
    "UPDATE users SET total_seconds = total_seconds + $1, total_words = total_words + $2 WHERE id = $3",
    [seconds, words, userId]
  );
}

async function saveVocab(userId, items) {
  for (const v of items || []) {
    if (v && v.word) {
      // Single words: lowercase for clean dedup. Phrases/sentences: keep original
      // casing so "I'm swamped with work" doesn't become all-lowercase and ugly.
      const raw = String(v.word).trim();
      const word = raw.includes(" ") ? raw : raw.toLowerCase();
      await pool.query(
        "INSERT INTO vocab (user_id, word, meaning_vi, example_en, situation_vi, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, word) DO NOTHING",
        [userId, word, v.meaning_vi || "", v.example_en || "", v.situation_vi || "", now()]
      );
    }
  }
}

async function getVocabForUser(userId, limit = 200) {
  const r = await pool.query(
    "SELECT word, meaning_vi, example_en, situation_vi, created_at FROM vocab WHERE user_id = $1 ORDER BY id DESC LIMIT $2",
    [userId, limit]
  );
  return r.rows;
}

async function getWeaknesses(userId) {
  try {
    const r = await pool.query(
      "SELECT type, COUNT(*)::int AS n FROM errors WHERE user_id = $1 GROUP BY type ORDER BY n DESC LIMIT 3",
      [userId]
    );
    return r.rows.map((x) => ({ type: x.type, n: x.n }));
  } catch { return []; }
}

async function getUserTurnsToday(userId) {
  try {
    const r = await pool.query(
      "SELECT COUNT(*)::int AS n FROM turns t JOIN sessions s ON t.session_id = s.id WHERE s.user_id = $1 AND t.role = 'user' AND t.created_at LIKE $2",
      [userId, today() + "%"]
    );
    return r.rows[0].n || 0;
  } catch { return 0; }
}

async function getSessionErrorCount(sessionId) {
  try {
    const r = await pool.query("SELECT COUNT(*)::int AS n FROM errors WHERE session_id = $1", [sessionId]);
    return r.rows[0].n || 0;
  } catch { return 0; }
}

async function getProgress(userId) {
  const u = await getUser(userId);
  if (!u) return null;
  const e = await pool.query("SELECT COUNT(*)::int AS n FROM errors WHERE user_id = $1", [userId]);
  const v = await pool.query("SELECT COUNT(*)::int AS n FROM vocab WHERE user_id = $1", [userId]);
  // "Buổi đã nói" should mean sessions where the user actually spoke at least
  // one real turn — not just sessions that were opened. Count those.
  const s = await pool.query(
    "SELECT COUNT(*)::int AS n FROM sessions WHERE user_id = $1 AND words_spoken > 0",
    [userId]
  );
  return {
    streakDays: u.streak_days,
    totalSessions: s.rows[0].n,
    totalSeconds: u.total_seconds,
    totalWords: u.total_words,
    correctionsLearned: e.rows[0].n,
    vocabSaved: v.rows[0].n,
  };
}

async function setJob(userId, job) {
  await pool.query("UPDATE users SET job = $1 WHERE id = $2", [String(job || "").slice(0, 40), userId]);
}

// --- Google login support ---

// Find an existing account by Google email.
async function getUserByEmail(email) {
  const r = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return r.rows[0] || null;
}

// Attach Google identity (email+name) to an existing user row.
async function linkIdentity(userId, email, name) {
  await pool.query("UPDATE users SET email = $1, name = $2 WHERE id = $3", [email, name || "", userId]);
}

// Move all data owned by `fromId` (a device user) over to `toId` (the account),
// then delete the now-empty device user. Used when a guest logs in and we want to
// keep the streak/vocab/history they built before signing in.
async function mergeUser(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Re-point owned rows.
    await client.query("UPDATE sessions SET user_id = $1 WHERE user_id = $2", [toId, fromId]);
    await client.query("UPDATE errors SET user_id = $1 WHERE user_id = $2", [toId, fromId]);
    // Vocab has a UNIQUE(user_id, word) — move only words the account doesn't already have, drop the rest.
    await client.query(
      "UPDATE vocab SET user_id = $1 WHERE user_id = $2 AND word NOT IN (SELECT word FROM vocab WHERE user_id = $1)",
      [toId, fromId]
    );
    await client.query("DELETE FROM vocab WHERE user_id = $1", [fromId]);
    // Combine the running totals onto the account; keep the higher streak.
    await client.query(
      `UPDATE users SET
         total_sessions = total_sessions + COALESCE((SELECT total_sessions FROM users WHERE id = $2), 0),
         total_seconds  = total_seconds  + COALESCE((SELECT total_seconds  FROM users WHERE id = $2), 0),
         total_words    = total_words    + COALESCE((SELECT total_words    FROM users WHERE id = $2), 0),
         streak_days    = GREATEST(streak_days, COALESCE((SELECT streak_days FROM users WHERE id = $2), 0))
       WHERE id = $1`,
      [toId, fromId]
    );
    await client.query("DELETE FROM users WHERE id = $1", [fromId]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// The main login entry point: given a verified Google email+name and the
// current device userId (guest), return the account user id to use going forward.
async function loginWithGoogle(email, name, deviceUserId) {
  const account = await getUserByEmail(email);
  if (account) {
    // Existing account: merge the guest's recent data in, then use the account.
    if (deviceUserId && deviceUserId !== account.id) {
      const dev = await getUser(deviceUserId);
      if (dev && !dev.email) await mergeUser(deviceUserId, account.id);
    }
    return account;
  }
  // No account yet: promote the current device user into the account (or make one).
  const base = (deviceUserId && (await getUser(deviceUserId))) ? deviceUserId : (await ensureUser(null)).id;
  await linkIdentity(base, email, name);
  return getUser(base);
}

// Aggregate stats for the founder to watch behaviour (no per-user PII beyond counts).
// Retention here = "of users whose FIRST active day was N+ days ago, how many came
// back on a later day". D1 = returned the day after first use; D7 = returned 7+ days later.
async function getAdminStats() {
  const q = (s, p = []) => pool.query(s, p).then((r) => r.rows);

  const totalUsers = (await q("SELECT COUNT(*)::int AS n FROM users"))[0].n;
  const loggedIn = (await q("SELECT COUNT(*)::int AS n FROM users WHERE email IS NOT NULL"))[0].n;
  // Users who actually spoke at least one real turn.
  const spokeUsers = (await q(
    "SELECT COUNT(DISTINCT s.user_id)::int AS n FROM sessions s WHERE s.words_spoken > 0"
  ))[0].n;
  const totalSessions = (await q("SELECT COUNT(*)::int AS n FROM sessions WHERE words_spoken > 0"))[0].n;

  // Distinct active days per user (a "day" = a date on which they spoke a turn).
  // We derive first day and the set of active days from turns of role 'user'.
  const dayRows = await q(`
    SELECT s.user_id AS uid, substring(t.created_at, 1, 10) AS day
    FROM turns t JOIN sessions s ON t.session_id = s.id
    WHERE t.role = 'user'
    GROUP BY s.user_id, substring(t.created_at, 1, 10)
  `);
  // Group days by user.
  const byUser = new Map();
  for (const r of dayRows) {
    if (!byUser.has(r.uid)) byUser.set(r.uid, []);
    byUser.get(r.uid).push(r.day);
  }
  let returnedNextDay = 0;   // came back on a different (later) day at all
  let multiDayUsers = 0;     // used on 2+ distinct days
  for (const [, days] of byUser) {
    const uniq = Array.from(new Set(days)).sort();
    if (uniq.length >= 2) { multiDayUsers++; returnedNextDay++; }
  }
  const activeUsers = byUser.size;
  const returnRate = activeUsers ? Math.round((multiDayUsers / activeUsers) * 100) : 0;

  // Active today / last 7 days.
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const activeToday = (await q(
    "SELECT COUNT(DISTINCT s.user_id)::int AS n FROM turns t JOIN sessions s ON t.session_id = s.id WHERE t.role='user' AND t.created_at LIKE $1",
    [today + "%"]
  ))[0].n;
  const active7d = (await q(
    "SELECT COUNT(DISTINCT s.user_id)::int AS n FROM turns t JOIN sessions s ON t.session_id = s.id WHERE t.role='user' AND substring(t.created_at,1,10) >= $1",
    [weekAgo]
  ))[0].n;

  // Most-used topics (by session anchor in the first user turn isn't stored, so
  // approximate by counting sessions; topic seed isn't persisted — skip if absent).
  return {
    totalUsers,
    loggedIn,
    spokeUsers,
    totalSessions,
    activeUsers,            // users who spoke on at least one day
    multiDayUsers,          // users who came back on 2+ distinct days
    returnRatePercent: returnRate,
    activeToday,
    active7d,
  };
}

module.exports = {
  init,
  startSession, getSession, ensureUser, getUser,
  logTurn, historyFor, logErrors, getErrorsForUser,
  bumpSpoken, saveVocab, getVocabForUser,
  getWeaknesses, getProgress, getSessionErrorCount, getUserTurnsToday,
  setJob,
  getUserByEmail, linkIdentity, mergeUser, loginWithGoogle,
  getAdminStats,
};
