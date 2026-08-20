// server.js — Dám Nói backend. Proxies Claude, persists sessions/streak/errors.
// Run: ANTHROPIC_API_KEY=sk-... node server.js
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const db = require("./db");
const { buildSystemPrompt, OPENING } = require("./prompt");
const { OAuth2Client } = require("google-auth-library");
const classroom = require("./classroom/classroomDb");
const { signToken, verifyToken, authMiddleware, hashPin, verifyPin } = require("./classroom/auth");
const { buildClassroomPrompt, CLASSROOM_TOOL, buildSummaryPrompt, CLASSROOM_SUMMARY_TOOL } = require("./classroom/classroomPrompt");
const { buildMissionGeneratorPrompt, MISSION_GENERATOR_TOOL, normalizeGeneratorInput, normalizeGeneratedDraft, normalizeMissionForSave, fallbackDraft } = require("./classroom/missionGenerator");
const pilot = require("./classroom/pilotMetrics");

const app = express();

// Phase 5.1: Speaking and Education are separate frontends sharing this API.
// Leave CORS_ORIGINS empty to preserve the previous allow-all behavior. In
// production, set a comma-separated allowlist for the two deployed app origins.
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((x) => x.trim().replace(/\/$/, ""))
  .filter(Boolean);
app.use(cors(CORS_ORIGINS.length ? {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/native apps/server-to-server
    const normalized = String(origin).replace(/\/$/, "");
    return CORS_ORIGINS.includes(normalized)
      ? cb(null, true)
      : cb(new Error("origin not allowed by CORS"));
  },
} : undefined));
app.use(express.json({ limit: "12mb" }));

// Lightweight wake/health check — no DB, no AI. Used to warm the server up
// (e.g. an external ping to keep Render awake, and the app pinging on load).
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- GET /api/admin/stats?key=... : founder-only behaviour metrics ----
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const isFounderAdmin = (req) => !!ADMIN_KEY && (req.get("x-admin-key") || req.query.key || "") === ADMIN_KEY;
app.get("/api/admin/stats", async (req, res) => {
  try {
    if (!isFounderAdmin(req)) return res.status(403).json({ error: "forbidden" });
    res.json(await db.getAdminStats());
  } catch (e) {
    console.error("admin stats error:", e.message);
    res.status(500).json({ error: "stats failed" });
  }
});

// Pilot dashboard: aggregate Classroom adoption, voice reliability and AI cost/latency.
// No student PII or transcripts are returned.
app.get("/api/admin/pilot", async (req, res) => {
  try {
    if (!isFounderAdmin(req)) return res.status(403).json({ error: "forbidden" });
    const days = Math.max(1, Math.min(90, Number(req.query.days) || 7));
    res.json(await pilot.getPilotStats(days));
  } catch (e) {
    console.error("pilot stats error:", e.message);
    res.status(500).json({ error: "pilot stats failed" });
  }
});

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.TOKI_MODEL || "claude-haiku-4-5-20251001";
if (!API_KEY) console.warn("WARNING: ANTHROPIC_API_KEY is not set.");

// Google login: verify ID tokens against your OAuth client ID.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ---- The structured-output tool (forces clean JSON every turn) ----
const TOKI_TOOL = {
  name: "toki_reply",
  description: "Toki's structured response for one conversational turn.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["roast_vi", "teach_en", "next_en", "vi_translation", "scaffold_chips", "errors_noticed", "used_vietnamese", "encouragement", "vocab"],
    properties: {
      roast_vi: { type: "string" },
      teach_en: { type: "string" },
      next_en: { type: "string" },
      vi_translation: { type: "string" },
      scaffold_chips: { type: "array", items: { type: "string" } },
      errors_noticed: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["said", "natural", "type"],
          properties: {
            said: { type: "string" },
            natural: { type: "string" },
            type: { type: "string", enum: ["tense", "article", "preposition", "plural", "word-order", "other"] },
          },
        },
      },
      used_vietnamese: { type: "boolean" },
      encouragement: { type: "string" },
      vocab: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["word", "meaning_vi", "example_en"],
          properties: {
            word: { type: "string" },
            meaning_vi: { type: "string" },
            example_en: { type: "string" },
            situation_vi: { type: "string" },
          },
        },
      },
    },
  },
};

// Cap conversation length to keep input-token cost low on long sessions.
// Always keep the first turn (the [SESSION_START] anchor that holds the topic/role),
// then keep only the most recent MAX_RECENT turns. The system prompt is separate
// and never trimmed.
const MAX_RECENT = parseInt(process.env.TOKI_MAX_RECENT || "16", 10); // ~8 back-and-forth exchanges
function trimHistory(messages) {
  if (!Array.isArray(messages) || messages.length <= MAX_RECENT + 1) return messages;
  const anchor = messages[0];                 // [SESSION_START] ... keeps topic/role context
  const recent = messages.slice(-MAX_RECENT);  // most recent turns
  // Anthropic requires the first message to be role 'user'. The anchor is a user
  // turn, so prepend it; if the recent slice happens to start with an assistant
  // turn, the leading user anchor still satisfies the constraint.
  return [anchor, ...recent];
}

async function askStructured({ system, messages, tool, maxTokens = 1000, usageContext = null }) {
  const trimmed = trimHistory(messages);
  const startedAt = Date.now();
  let eventId = usageContext?.eventId || null;
  if (usageContext && !eventId) {
    try {
      eventId = await pilot.startAiCall({
        userId: usageContext.userId || null,
        centerId: usageContext.centerId || null,
        endpoint: usageContext.endpoint || tool.name || "anthropic",
        model: MODEL,
        requestHash: usageContext.requestHash || null,
      });
    } catch (metricErr) {
      console.warn("AI usage start metric failed:", metricErr.message);
    }
  }

  try {
    const aiTimeoutMs = Math.max(5000, Math.min(60000, Number(process.env.AI_TIMEOUT_MS || 25000)));
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(aiTimeoutMs),
      headers: {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: trimmed,
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const block = (data.content || []).find((b) => b.type === "tool_use" && b.name === tool.name);
    if (!block) throw new Error(`no ${tool.name} tool_use block`);
    try {
      await pilot.completeAiCall(eventId, {
        status: "success",
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        latencyMs: Date.now() - startedAt,
      });
    } catch (metricErr) {
      console.warn("AI usage completion metric failed:", metricErr.message);
    }
    return block.input || {};
  } catch (e) {
    try {
      await pilot.completeAiCall(eventId, {
        status: "error",
        latencyMs: Date.now() - startedAt,
        errorMessage: e.message,
      });
    } catch {}
    throw e;
  }
}

async function askToki({ system, messages, usageContext = null }) {
  const r = await askStructured({ system, messages, tool: TOKI_TOOL, usageContext });
  return {
    roast_vi: r.roast_vi || "",
    teach_en: r.teach_en || "",
    next_en: r.next_en || "Tell me more — what happened next?",
    vi_translation: r.vi_translation || "",
    scaffold_chips: (r.scaffold_chips || []).slice(0, 4),
    errors_noticed: r.errors_noticed || [],
    used_vietnamese: !!r.used_vietnamese,
    encouragement: r.encouragement || "",
    vocab: Array.isArray(r.vocab) ? r.vocab.slice(0, 3) : [],
  };
}

async function askClassroomToki({ system, messages, mission, usageContext = null }) {
  const r = await askStructured({ system, messages, tool: CLASSROOM_TOOL, maxTokens: 800, usageContext });
  const allowedVocab = new Map((mission.target_vocab || []).map(x => [String(x).toLowerCase(), String(x)]));
  const allowedPatterns = new Map((mission.target_patterns || []).map(x => [String(x).toLowerCase(), String(x)]));
  const onlyAllowed = (items, allowed) => [...new Set((Array.isArray(items) ? items : [])
    .map(x => allowed.get(String(x || '').trim().toLowerCase()))
    .filter(Boolean))];
  return {
    roast_vi: "",
    teach_en: "",
    next_en: String(r.spoken_reply || "Let's keep going.").trim(),
    vi_translation: String(r.vi_translation || "").trim(),
    scaffold_chips: (Array.isArray(r.scaffold_chips) ? r.scaffold_chips : []).map(String).slice(0, 4),
    errors_noticed: Array.isArray(r.errors_noticed) ? r.errors_noticed.slice(0, 3) : [],
    used_vietnamese: false,
    encouragement: String(r.encouragement || "").trim(),
    vocab: [],
    target_vocab_detected: onlyAllowed(r.target_vocab_detected, allowedVocab),
    target_patterns_detected: onlyAllowed(r.target_patterns_detected, allowedPatterns),
    mission_progress: {
      objective_reached: !!r.mission_progress?.objective_reached,
      should_finish: !!r.mission_progress?.should_finish,
      reason: String(r.mission_progress?.reason || "").slice(0, 240),
    },
  };
}

async function askClassroomSummary(context, usageContext = null) {
  const input = await askStructured({
    system: buildSummaryPrompt(context),
    messages: [{ role: "user", content: "Create the mission summary from the supplied transcript and metrics." }],
    tool: CLASSROOM_SUMMARY_TOOL,
    maxTokens: 500,
    usageContext,
  });
  return {
    strength: String(input.strength || "").trim().slice(0, 500),
    nextFocus: String(input.next_focus || "").trim().slice(0, 500),
    teacherNoteVi: String(input.teacher_note_vi || "").trim().slice(0, 900),
    learnerAchievementVi: String(input.learner_achievement_vi || "").trim().slice(0, 500),
  };
}

async function askMissionDraft(generatorInput, usageContext = null) {
  const raw = await askStructured({
    system: buildMissionGeneratorPrompt(generatorInput),
    messages: [{ role: "user", content: "Create one editable mission draft for the teacher. Follow the teacher targets exactly when supplied." }],
    tool: MISSION_GENERATOR_TOOL,
    maxTokens: 1100,
    usageContext,
  });
  return normalizeGeneratedDraft(raw, generatorInput);
}

function countWords(s) {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

// ---- POST /api/session/start : create or resume a user, open a session ----
// ---- POST /api/auth/google : verify a Google ID token, return the account ----
// Body: { credential: <google ID token>, deviceUserId?: <current guest id> }
app.post("/api/auth/google", async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) return res.status(501).json({ error: "login not configured" });
    const { credential, deviceUserId } = req.body || {};
    if (!credential) return res.status(400).json({ error: "credential required" });

    // Verify the token really came from Google and was issued for our app.
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.email_verified) {
      return res.status(401).json({ error: "invalid token" });
    }

    const user = await db.loginWithGoogle(payload.email, payload.name || "", deviceUserId);
    res.json({
      userId: user.id,
      email: user.email,
      name: user.name || payload.name || "",
      streakDays: user.streak_days,
      job: user.job || "",
      authToken: signToken({ userId: user.id, authSource: "google" }),
    });
  } catch (e) {
    console.error("google auth error:", e.message);
    res.status(401).json({ error: "auth failed" });
  }
});

app.post("/api/session/start", async (req, res) => {
  try {
    const { userId, topicSeed, greeting, job } = req.body || {};
    const s = await db.startSession(userId);
    if (job) { try { await db.setJob(s.userId, job); } catch {} }
    const opener = greeting || OPENING;
    // seed the session anchor (topic/role) + opening greeting into history
    const anchor = topicSeed
      ? `[SESSION_START] ${topicSeed} session_number=${s.sessionNumber} confidence=${s.confidenceLevel}`
      : `[SESSION_START] session_number=${s.sessionNumber} confidence=${s.confidenceLevel}`;
    await db.logTurn(s.sessionId, "user", anchor);
    await db.logTurn(s.sessionId, "assistant", opener);
    res.json({
      userId: s.userId,
      sessionId: s.sessionId,
      sessionNumber: s.sessionNumber,
      streakDays: s.streakDays,
      greeting: opener,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---- POST /api/turn : one conversational turn ----
// body: { userId, sessionId, text, secondsSpoken?, silentCount? }
app.post("/api/turn", async (req, res) => {
  try {
    const { userId, sessionId, text, secondsSpoken = 0, silentCount = 0 } = req.body || {};
    const measuredSeconds = Number(secondsSpoken);
    const safeSecondsSpoken = Number.isFinite(measuredSeconds)
      ? Math.max(0, Math.min(120, Math.round(measuredSeconds)))
      : 0;
    const session = await db.getSession(sessionId);
    const user = await db.getUser(userId);
    if (!session || !user) return res.status(404).json({ error: "unknown session/user" });
    if (session.assignment_id) {
      const h = String(req.headers.authorization || "");
      const auth = verifyToken(h.startsWith("Bearer ") ? h.slice(7) : "");
      if (!auth || auth.authSource !== "student" || auth.userId !== userId) {
        return res.status(401).json({ error: "classroom session requires student auth" });
      }
    }

    // Daily free cap: stop before any AI call once the user hits the limit.
    const DAILY_LIMIT = Number(process.env.DAILY_TURN_LIMIT || 40);
    if (!session.assignment_id && silentCount === 0 && (await db.getUserTurnsToday(userId)) >= DAILY_LIMIT) {
      return res.json({
        roast_vi: "Ní nói sung dữ luôn á! Hết lượt free hôm nay rồi, mai quay lại khịa tiếp nha 😏",
        teach_en: "",
        next_en: "That's your free practice for today — come back tomorrow, okay?",
        vi_translation: "Đó là phần luyện miễn phí hôm nay của bạn — mai quay lại nhé!",
        scaffold_chips: [],
        used_vietnamese: true,
        encouragement: "",
        streakDays: user.streak_days,
        errorsThisTurn: 0,
        vocabThisTurn: 0,
        limitReached: true,
      });
    }

    // Build the user turn content. A silence signal replaces normal text.
    const content = silentCount > 0 ? `[USER_SILENT count=${silentCount}]` : (text || "").trim();
    if (!content) return res.status(400).json({ error: "empty turn" });

    // Persist the user turn (skip storing silence as a "spoken" turn's words)
    await db.logTurn(sessionId, "user", content);
    if (silentCount === 0) {
      await db.bumpSpoken(userId, sessionId, safeSecondsSpoken, countWords(content));
    }

    const messages = await db.historyFor(sessionId);
    let reply;
    let missionProgress = null;
    let targetVocabDetected = [];
    let targetPatternsDetected = [];

    if (session.assignment_id) {
      // Classroom uses a separate age-aware learning engine. Mission context is
      // always loaded server-side; the student cannot manipulate the prompt.
      const mission = await classroom.getMissionRuntimeBySession(sessionId);
      if (!mission) throw new Error("classroom mission context missing");
      const system = buildClassroomPrompt({
        ageBand: mission.age_band,
        grade: mission.grade,
        title: mission.title,
        missionType: mission.mission_type,
        aiRole: mission.ai_role,
        scenePrompt: mission.scene_prompt,
        learningObjective: mission.learning_objective,
        targetVocab: mission.target_vocab,
        targetPatterns: mission.target_patterns,
        targetTurns: mission.target_turns,
        targetSpeakingSeconds: mission.target_speaking_seconds,
        turnCount: mission.live_turn_count,
        actualSpeakingSeconds: mission.seconds_spoken,
        targetVocabUsed: mission.target_vocab_used,
        targetPatternsUsed: mission.target_patterns_used,
        objectiveReached: mission.objective_reached,
      });
      reply = await askClassroomToki({
        system,
        messages,
        mission,
        usageContext: {
          userId,
          centerId: mission.center_id || null,
          endpoint: "classroom_turn",
        },
      });
      targetVocabDetected = reply.target_vocab_detected || [];
      targetPatternsDetected = reply.target_patterns_detected || [];
      missionProgress = await classroom.recordMissionTurnSignals(session.attempt_id, {
        targetVocabDetected,
        targetPatternsDetected,
        objectiveReached: reply.mission_progress?.objective_reached,
        aiShouldFinish: reply.mission_progress?.should_finish,
        reason: reply.mission_progress?.reason,
      });
    } else {
      const system = buildSystemPrompt({
        sessionNumber: session.session_number,
        confidenceLevel: user.confidence_level,
        streakDays: user.streak_days,
        weaknesses: await db.getWeaknesses(userId),
        job: user.job,
        errorCount: await db.getSessionErrorCount(sessionId),
      });
      reply = await askToki({
        system,
        messages,
        usageContext: { userId, endpoint: "consumer_turn" },
      });
    }

    // Store one clean assistant turn so history stays coherent for the model.
    const combined = [reply.roast_vi, reply.teach_en, reply.next_en].filter(Boolean).join(" ");
    await db.logTurn(sessionId, "assistant", combined);
    await db.logErrors(userId, sessionId, reply.errors_noticed); // hidden in Classroom, optional review in consumer
    if (!session.assignment_id && reply.vocab && reply.vocab.length) await db.saveVocab(userId, reply.vocab);

    res.json({
      roast_vi: reply.roast_vi,
      teach_en: reply.teach_en,
      next_en: reply.next_en,
      vi_translation: reply.vi_translation,
      scaffold_chips: reply.scaffold_chips,
      used_vietnamese: reply.used_vietnamese,
      encouragement: reply.encouragement,
      streakDays: user.streak_days,
      errorsThisTurn: (reply.errors_noticed || []).length,
      vocabThisTurn: (reply.vocab || []).length,
      ...(session.assignment_id ? {
        targetVocabDetected,
        targetPatternsDetected,
        missionProgress,
      } : {}),
    });
  } catch (e) {
    // graceful fallback so the session never crashes
    res.json({
      roast_vi: "Ơ, mạng lag hay sao á, nói lại giúp mình cái nào!",
      teach_en: "",
      next_en: "Tell me one small thing about your day?",
      vi_translation: "Kể mình nghe một điều nhỏ trong ngày của bạn nhé?",
      scaffold_chips: [],
      used_vietnamese: false,
      encouragement: "",
      degraded: true,
    });
    console.error("turn error:", e.message);
  }
});

// ---- POST /api/chat : stateless proxy for local testing / client-managed history ----
// body: { messages: [{role, content}, ...] }  -> returns the full parsed Toki reply.
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }
    const system = buildSystemPrompt({ sessionNumber: 1, confidenceLevel: "low", streakDays: 1 });
    const reply = await askToki({
      system,
      messages,
      usageContext: { endpoint: "dev_chat" },
    });
    res.json(reply); // roast_vi, teach_en, next_en, vi_translation, scaffold_chips, errors_noticed, used_vietnamese, encouragement
  } catch (e) {
    console.error("chat error:", e.message);
    res.json({
      roast_vi: "Ơ, mạng lag hay sao á, nói lại giúp mình cái nào!",
      teach_en: "",
      next_en: "Tell me one small thing about your day?",
      vi_translation: "Kể mình nghe một điều nhỏ trong ngày của bạn nhé?",
      scaffold_chips: [], errors_noticed: [], used_vietnamese: false, encouragement: "", degraded: true,
    });
  }
});

// ---- POST /api/tts : high-quality voice via Azure Speech (Neural) ----
// Returns MP3 audio. If AZURE_SPEECH_KEY/REGION are not set, responds 501 so the
// frontend gracefully falls back to the browser's built-in speech voice.
const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || "southeastasia";
const AZURE_VOICE = process.env.AZURE_SPEECH_VOICE || "en-US-SaraNeural";
const parsedSttThreshold = Number(process.env.STT_CONFIDENCE_THRESHOLD || "0.55");
const STT_CONFIDENCE_THRESHOLD = Number.isFinite(parsedSttThreshold)
  ? Math.max(0, Math.min(1, parsedSttThreshold))
  : 0.55;

// Escape text so it's safe inside SSML/XML.
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Simple in-memory cache: voice+text -> mp3 Buffer. Shared across all users, so
// repeated lines (openers, common replies) are spoken by Azure only once.
// Capped so memory can't grow unbounded; oldest entries drop first.
const TTS_CACHE = new Map();
const TTS_CACHE_MAX = 500;
function ttsCacheGet(key) {
  const v = TTS_CACHE.get(key);
  if (v) { TTS_CACHE.delete(key); TTS_CACHE.set(key, v); } // mark as recently used
  return v;
}
function ttsCacheSet(key, buf) {
  TTS_CACHE.set(key, buf);
  if (TTS_CACHE.size > TTS_CACHE_MAX) {
    const oldest = TTS_CACHE.keys().next().value;
    TTS_CACHE.delete(oldest);
  }
}

app.post("/api/tts", async (req, res) => {
  try {
    if (!AZURE_KEY) return res.status(501).json({ error: "tts not configured" });
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: "text required" });

    const cacheKey = `${AZURE_VOICE}:${text}`;
    const cached = ttsCacheGet(cacheKey);
    if (cached) {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-Cache", "HIT");
      return res.send(cached);
    }

    // Build SSML. Lang must match the voice.
    const ssml =
      `<speak version='1.0' xml:lang='en-US'>` +
      `<voice xml:lang='en-US' name='${AZURE_VOICE}'>${xmlEscape(text)}</voice>` +
      `</speak>`;

    const r = await fetch(
      `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": AZURE_KEY,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "MoHo",
        },
        body: ssml,
      }
    );
    if (!r.ok) {
      console.error("azure tts error", r.status, await r.text());
      return res.status(502).json({ error: "tts upstream" });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    ttsCacheSet(cacheKey, buf);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("X-Cache", "MISS");
    res.send(buf);
  } catch (e) {
    console.error("tts error:", e.message);
    res.status(500).json({ error: "tts failed" });
  }
});

// ---- POST /api/stt : speech-to-text via Azure (returns the RAW transcript) ----
// Body: { audio: <base64>, contentType?: "audio/wav" | "audio/ogg; codecs=opus" }
// We deliberately want the literal words the user said (including mistakes), so the
// learner gets corrected on what they ACTUALLY said — unlike on-device STT that
// silently "fixes" grammar. Keep the audio short (push-to-talk, a few seconds).
app.post("/api/stt", async (req, res) => {
  try {
    if (!AZURE_KEY) return res.status(501).json({ error: "stt not configured" });
    const { audio, contentType, userId, sessionId } = req.body || {};
    if (!audio) return res.status(400).json({ error: "audio required" });
    if (sessionId) {
      const sttSession = await db.getSession(sessionId);
      if (sttSession?.assignment_id) {
        const h = String(req.headers.authorization || "");
        const auth = verifyToken(h.startsWith("Bearer ") ? h.slice(7) : "");
        if (!auth || auth.authSource !== "student" || auth.userId !== sttSession.user_id || auth.userId !== userId) {
          return res.status(401).json({ error: "classroom STT requires student auth" });
        }
      }
    }

    const buf = Buffer.from(audio, "base64");
    if (!buf.length) return res.status(400).json({ error: "empty audio", code: "empty_audio" });
    // Azure short-audio REST endpoint. Content-Type must match what the app records.
    const ct = contentType || "audio/wav; codecs=audio/pcm; samplerate=16000";
    const url =
      `https://${AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=en-US&format=detailed&profanity=raw`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": ct,
        Accept: "application/json",
      },
      body: buf,
    });
    if (!r.ok) {
      console.error("azure stt error", r.status, await r.text());
      try { await db.recordSttAttempt(userId, sessionId, { retry: true }); } catch (metricErr) {
        console.warn("stt metric error:", metricErr.message);
      }
      return res.status(502).json({ error: "stt upstream", code: "stt_upstream" });
    }
    const data = await r.json();
    const best = Array.isArray(data.NBest) && data.NBest.length ? data.NBest[0] : null;
    const text = String(data.DisplayText || best?.Display || "").trim();
    const rawConfidence = Number(best?.Confidence);
    const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : null;
    const recognitionOk = data.RecognitionStatus === "Success" && !!text;
    const lowConfidence = recognitionOk && confidence != null && confidence < STT_CONFIDENCE_THRESHOLD;
    const mustRetry = !recognitionOk || lowConfidence;

    try {
      await db.recordSttAttempt(userId, sessionId, { retry: mustRetry, lowConfidence });
    } catch (metricErr) {
      console.warn("stt metric error:", metricErr.message);
    }

    res.json({
      text,
      confidence,
      lowConfidence,
      threshold: STT_CONFIDENCE_THRESHOLD,
      status: data.RecognitionStatus || "Unknown",
    });
  } catch (e) {
    console.error("stt error:", e.message);
    const { userId, sessionId } = req.body || {};
    try { await db.recordSttAttempt(userId, sessionId, { retry: true }); } catch {}
    res.status(500).json({ error: "stt failed", code: "stt_failed" });
  }
});


// ============================== CLASSROOM PHASE 1 ==============================
async function requireCenterMember(req, res, centerId) {
  const m = await classroom.getMembership(req.auth.userId, centerId);
  if (!m) { res.status(403).json({ error: "not a center member" }); return null; }
  return m;
}

app.get("/api/classroom/me", authMiddleware, async (req, res) => {
  try {
    if (req.auth.authSource !== "google") return res.status(403).json({ error: "teacher login required" });
    const user = await db.getUser(req.auth.userId);
    const centers = await classroom.getMemberships(req.auth.userId);
    pilot.recordUxEvent('teacher_portal_open',{userId:req.auth.userId,centerId:centers?.[0]?.id || null}).catch(()=>{});
    res.json({ user: user ? { id:user.id, name:user.name, email:user.email } : null, centers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/classroom/centers", authMiddleware, async (req, res) => {
  try {
    if (req.auth.authSource !== "google") return res.status(403).json({ error: "teacher login required" });
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "center name required" });
    const center = await classroom.createCenter(req.auth.userId, name, req.body?.code);
    pilot.recordUxEvent('center_created',{userId:req.auth.userId,centerId:center.id}).catch(()=>{});
    res.json({ center, authToken: signToken({ userId:req.auth.userId, authSource:"google" }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/classroom/classes", authMiddleware, async (req, res) => {
  try {
    const centerId = String(req.query.centerId || "");
    const m = await requireCenterMember(req,res,centerId); if (!m) return;
    res.json({ items: await classroom.listClasses(centerId, req.auth.userId, m.role === 'admin') });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post("/api/classroom/classes", authMiddleware, async (req, res) => {
  try {
    const centerId = String(req.body?.centerId || "");
    const m = await requireCenterMember(req,res,centerId); if (!m) return;
    const item = await classroom.createClass({ centerId, teacherUserId:req.auth.userId, name:req.body?.name, grade:req.body?.grade, ageBand:req.body?.ageBand, academicYear:req.body?.academicYear, classCode:req.body?.classCode });
    pilot.recordUxEvent('class_created',{userId:req.auth.userId,centerId,classId:item.id}).catch(()=>{});
    res.json({ item });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.patch("/api/classroom/classes/:id", authMiddleware, async (req,res) => {
  try {
    const cls = await classroom.getClass(req.params.id); if (!cls || cls.status !== 'active') return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    const item = await classroom.updateClass(cls.id,{name:req.body?.name,grade:req.body?.grade,academicYear:req.body?.academicYear});
    if (!item) return res.status(404).json({error:'class not found'});
    res.json({item});
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.delete("/api/classroom/classes/:id", authMiddleware, async (req,res) => {
  try {
    const cls = await classroom.getClass(req.params.id); if (!cls || cls.status !== 'active') return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    const item = await classroom.archiveClass(cls.id);
    if (!item) return res.status(404).json({error:'class not found'});
    res.json({ok:true,id:cls.id});
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.get("/api/classroom/classes/:id", authMiddleware, async (req,res) => {
  try {
    const cls = await classroom.getClass(req.params.id); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    res.json({ item:cls, students:await classroom.listClassStudents(cls.id), assignments:await classroom.listClassAssignments(cls.id) });
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post("/api/classroom/classes/:id/students", authMiddleware, async (req,res) => {
  try {
    const cls = await classroom.getClass(req.params.id); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    const displayName = String(req.body?.displayName || '').trim();
    if (!displayName) return res.status(400).json({error:'displayName required'});
    const pinHash = hashPin(req.body?.pin || '');
    const item = await classroom.createStudent({ classId:cls.id, displayName, studentCode:req.body?.studentCode, pinHash });
    pilot.recordUxEvent('students_added',{userId:req.auth.userId,centerId:cls.center_id,classId:cls.id,metadata:{count:1,mode:'single'}}).catch(()=>{});
    res.json({ item, classCode:cls.class_code, joinPath:`/join/${encodeURIComponent(cls.class_code)}/${encodeURIComponent(item.student_code)}` });
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.post("/api/classroom/classes/:id/students/bulk", authMiddleware, async (req,res) => {
  try {
    const cls = await classroom.getClass(req.params.id); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    const names = Array.isArray(req.body?.names) ? req.body.names : String(req.body?.names || '').split(/\r?\n/);
    const clean = names.map(x=>String(x||'').trim()).filter(Boolean).slice(0,60);
    if (!clean.length) return res.status(400).json({error:'Dán ít nhất một tên học sinh'});
    const credentials = clean.map(displayName=>{
      const pin = String(crypto.randomInt(1000,10000));
      return {displayName,pin,pinHash:hashPin(pin)};
    });
    const created = await classroom.createStudentsBulk({classId:cls.id,students:credentials});
    const items = created.map((student,i)=>({
      ...student,
      pin:credentials[i].pin,
      class_code:cls.class_code,
      joinPath:`/join/${encodeURIComponent(cls.class_code)}/${encodeURIComponent(student.student_code)}`,
    }));
    pilot.recordUxEvent('students_added',{userId:req.auth.userId,centerId:cls.center_id,classId:cls.id,metadata:{count:items.length,mode:'bulk'}}).catch(()=>{});
    res.json({items,classCode:cls.class_code});
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.post("/api/classroom/classes/:id/students/:studentId/reset-pin", authMiddleware, async (req,res) => {
  try {
    const cls = await classroom.getClass(req.params.id); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    const pin = String(crypto.randomInt(1000,10000));
    const item = await classroom.updateStudentPin(cls.id,req.params.studentId,hashPin(pin));
    res.json({item,pin,classCode:cls.class_code,joinPath:`/join/${encodeURIComponent(cls.class_code)}/${encodeURIComponent(item.student_code)}`});
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.get("/api/classroom/classes/:id/students", authMiddleware, async (req,res) => {
  try {
    const cls = await classroom.getClass(req.params.id); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    res.json({items:await classroom.listClassStudents(cls.id)});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/classroom/missions", authMiddleware, async (req,res) => {
  try {
    const centerId = String(req.query.centerId || '');
    const m = await requireCenterMember(req,res,centerId); if (!m) return;
    res.json({items:await classroom.listMissions({centerId,ageBand:req.query.ageBand || null,grade:req.query.grade || null})});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Phase 3: AI creates a DRAFT only. Nothing is saved or assigned until the teacher reviews it.
app.post("/api/classroom/missions/generate", authMiddleware, async (req,res) => {
  try {
    if (req.auth.authSource !== 'google') return res.status(403).json({error:'teacher login required'});
    const cls = await classroom.getClass(req.body?.classId); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    if (!cls.grade) return res.status(400).json({error:'class grade required'});
    const input = normalizeGeneratorInput({
      grade: cls.grade,
      topic: req.body?.topic,
      targetVocab: req.body?.targetVocab,
      targetPatterns: req.body?.targetPatterns,
      durationMinutes: req.body?.durationMinutes,
      missionType: req.body?.missionType,
      teacherNote: req.body?.teacherNote,
    });
    const requestHash = pilot.stableGeneratorHash({ userId:req.auth.userId, classId:cls.id, input });
    const forceNew = req.body?.forceNew === true;

    // Identical inputs within a short window reuse a draft instead of spending
    // another Claude call. "Generate lại" explicitly sends forceNew=true.
    if (!forceNew) {
      const cached = await pilot.getGenerationCache(requestHash);
      if (cached?.draft) {
        pilot.recordUxEvent('mission_generated',{userId:req.auth.userId,centerId:cls.center_id,classId:cls.id,metadata:{source:'cache'}}).catch(()=>{});
        return res.json({
          draft: cached.draft,
          meta: {
            ...(cached.meta || {}),
            source: 'cache',
            warning: '',
            grade: cls.grade,
            ageBand: cls.age_band,
            generationUsage: null,
          },
        });
      }
    }

    let draft, source='ai', warning='';
    let rate = null;
    if (!API_KEY) {
      draft = fallbackDraft(input); source='fallback'; warning='ANTHROPIC_API_KEY is not configured; generated a deterministic draft.';
    } else {
      rate = await pilot.reserveMissionGeneration({
        userId:req.auth.userId,
        centerId:cls.center_id,
        model:MODEL,
        requestHash,
      });
      if (!rate.allowed) {
        return res.status(429).json({
          error: rate.reason === 'hourly'
            ? `Đã đạt giới hạn ${rate.hourlyLimit} lần tạo AI trong 1 giờ. Hãy thử lại sau.`
            : `Đã đạt giới hạn ${rate.dailyLimit} lần tạo AI trong 24 giờ. Hãy thử lại sau.`,
          code:'AI_GENERATION_RATE_LIMIT',
          limit:{ reason:rate.reason, hourly:rate.hourlyLimit, daily:rate.dailyLimit },
        });
      }
      try {
        draft = await askMissionDraft(input, {
          eventId: rate.eventId,
          userId:req.auth.userId,
          centerId:cls.center_id,
          endpoint:'mission_generate',
          requestHash,
        });
      } catch (aiErr) {
        console.error('mission generator AI error:', aiErr.message);
        draft = fallbackDraft(input); source='fallback'; warning='AI generation failed; generated a safe fallback draft you can edit.';
      }
    }

    const meta = {
      source,
      warning,
      grade:cls.grade,
      ageBand:cls.age_band,
      ...(rate?.allowed ? {
        generationUsage: {
          hourUsed:rate.hourCount,
          hourLimit:rate.hourlyLimit,
          dayUsed:rate.dayCount,
          dayLimit:rate.dailyLimit,
        },
      } : {}),
    };
    if (source === 'ai' && !forceNew) {
      try {
        await pilot.putGenerationCache({
          cacheKey:requestHash,
          userId:req.auth.userId,
          centerId:cls.center_id,
          classId:cls.id,
          draft,
          meta,
        });
      } catch (cacheErr) {
        console.warn('mission generation cache error:', cacheErr.message);
      }
    }
    pilot.recordUxEvent('mission_generated',{userId:req.auth.userId,centerId:cls.center_id,classId:cls.id,metadata:{source}}).catch(()=>{});
    res.json({ draft, meta });
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.post("/api/classroom/missions", authMiddleware, async (req,res) => {
  try {
    if (req.auth.authSource !== 'google') return res.status(403).json({error:'teacher login required'});
    const cls = await classroom.getClass(req.body?.classId); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    const mission = normalizeMissionForSave(req.body?.draft || {}, {grade:cls.grade,ageBand:cls.age_band});
    const item = await classroom.createMission({centerId:cls.center_id,createdBy:req.auth.userId,mission});
    res.json({item});
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.put("/api/classroom/missions/:id", authMiddleware, async (req,res) => {
  try {
    if (req.auth.authSource !== 'google') return res.status(403).json({error:'teacher login required'});
    const cls = await classroom.getClass(req.body?.classId); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    const mission = normalizeMissionForSave(req.body?.draft || {}, {grade:cls.grade,ageBand:cls.age_band});
    const item = await classroom.updateMission({id:req.params.id,centerId:cls.center_id,mission});
    res.json({item});
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.post("/api/classroom/assignments", authMiddleware, async (req,res) => {
  try {
    const cls = await classroom.getClass(req.body?.classId); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    const mission = await classroom.getMission(req.body?.missionId, cls.center_id); if (!mission) return res.status(404).json({error:'mission not found'});
    // Enforce age/grade compatibility server-side too; UI filtering is not a security or pedagogy boundary.
    if (mission.age_band !== cls.age_band) return res.status(400).json({error:'mission is not suitable for this age band'});
    if (cls.grade && mission.grade_min && Number(cls.grade) < Number(mission.grade_min)) return res.status(400).json({error:'mission is above this class level'});
    if (cls.grade && mission.grade_max && Number(cls.grade) > Number(mission.grade_max)) return res.status(400).json({error:'mission is below this class level'});
    const result = await classroom.createAssignment({missionId:mission.id,classId:cls.id,assignedBy:req.auth.userId,dueAt:req.body?.dueAt});
    const item = result.item;
    if (result.created) {
      pilot.recordUxEvent('assignment_created',{userId:req.auth.userId,centerId:cls.center_id,classId:cls.id,metadata:{assignmentId:item.id}}).catch(()=>{});
    }
    res.status(result.created ? 201 : 200).json({item,created:result.created,duplicate:!result.created});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/classroom/classes/:id/assignments", authMiddleware, async (req,res) => {
  try {
    const cls = await classroom.getClass(req.params.id); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    res.json({items:await classroom.listClassAssignments(cls.id)});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/classroom/assignments/:id/results", authMiddleware, async (req,res) => {
  try {
    const asg = await classroom.getAssignment(req.params.id); if (!asg) return res.status(404).json({error:'assignment not found'});
    const m = await requireCenterMember(req,res,asg.center_id); if (!m) return;
    const cls = await classroom.getClass(asg.class_id);
    if (m.role !== 'admin' && cls?.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    res.json({assignment:asg,items:await classroom.assignmentResults(asg.id)});
  } catch(e) { res.status(500).json({error:e.message}); }
});


// ============================== CLASSROOM PHASE 4 — REPORTS ==============================
app.get("/api/classroom/classes/:id/report", authMiddleware, async (req,res) => {
  try {
    const cls = await classroom.getClass(req.params.id); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    const days = Math.max(1,Math.min(30,Number(req.query.days)||7));
    res.json({report:await classroom.getClassWeeklyReport(cls.id,days)});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/classroom/students/:id/progress", authMiddleware, async (req,res) => {
  try {
    const classId = String(req.query.classId || '');
    const cls = await classroom.getClass(classId); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    if (!(await classroom.getStudentInClass(classId,req.params.id))) return res.status(404).json({error:'student not found'});
    const days = Math.max(1,Math.min(30,Number(req.query.days)||7));
    res.json({report:await classroom.getStudentProgressReport(req.params.id,classId,days),shares:await classroom.listParentReportShares(req.params.id,classId)});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post("/api/classroom/students/:id/reports/share", authMiddleware, async (req,res) => {
  try {
    const classId = String(req.body?.classId || '');
    const cls = await classroom.getClass(classId); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    if (!(await classroom.getStudentInClass(classId,req.params.id))) return res.status(404).json({error:'student not found'});
    const item = await classroom.createParentReportShare({studentUserId:req.params.id,classId,createdBy:req.auth.userId,days:req.body?.days||7,expiresDays:req.body?.expiresDays||30});
    res.json({id:item.id,sharePath:`/report/${item.token}`,expiresAt:item.expiresAt,snapshot:item.snapshot});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/classroom/students/:id/reports/shares", authMiddleware, async (req,res) => {
  try {
    const classId = String(req.query.classId || '');
    const cls = await classroom.getClass(classId); if (!cls) return res.status(404).json({error:'class not found'});
    const m = await requireCenterMember(req,res,cls.center_id); if (!m) return;
    if (m.role !== 'admin' && cls.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    res.json({items:await classroom.listParentReportShares(req.params.id,classId)});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post("/api/classroom/reports/:id/revoke", authMiddleware, async (req,res) => {
  try {
    const meta = await classroom.getParentReportShareMeta(req.params.id); if (!meta) return res.status(404).json({error:'report not found'});
    const m = await requireCenterMember(req,res,meta.center_id); if (!m) return;
    const cls = await classroom.getClass(meta.class_id);
    if (m.role !== 'admin' && cls?.teacher_user_id !== req.auth.userId) return res.status(403).json({error:'not your class'});
    const item = await classroom.revokeParentReportShare(req.params.id,meta.center_id);
    if (!item) return res.status(404).json({error:'report already revoked'});
    res.json({item});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Public by design: this endpoint returns an immutable, privacy-filtered snapshot only.
// It never exposes transcripts, error logs, student codes, PINs, email, or teacher notes.
app.get("/api/classroom/reports/share/:token", async (req,res) => {
  try {
    const item = await classroom.getParentReportShare(req.params.token);
    if (!item) return res.status(404).json({error:'Báo cáo không tồn tại, đã hết hạn hoặc đã được thu hồi.'});
    res.set('Cache-Control','private, no-store');
    pilot.recordUxEvent('parent_report_open',{metadata:{reportId:item.id}}).catch(()=>{});
    res.json(item);
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/classroom/student/join-check", async (req,res) => {
  try {
    const classCode = String(req.query?.classCode || '').trim();
    const studentCode = String(req.query?.studentCode || '').trim();
    res.set('Cache-Control','private, no-store');
    if (!classCode || !studentCode) {
      return res.status(400).json({valid:false,error:'Link học sinh chưa đầy đủ. Hãy xin lại link từ giáo viên.'});
    }
    const student = await classroom.findStudentLogin(classCode, studentCode);
    if (!student) {
      return res.status(404).json({valid:false,error:'Không tìm thấy học sinh. Kiểm tra lại link hoặc liên hệ giáo viên nhé.'});
    }
    res.json({valid:true});
  } catch(e) {
    res.status(500).json({valid:false,error:'Toki chưa kiểm tra được link lúc này. Thử lại sau nhé.'});
  }
});

app.post("/api/classroom/student/login", async (req,res) => {
  try {
    const classCode = String(req.body?.classCode || '').trim();
    const studentCode = String(req.body?.studentCode || '').trim();
    const pin = String(req.body?.pin || '').trim();
    const student = await classroom.findStudentLogin(classCode, studentCode);
    if (!student || !verifyPin(pin, student.pin_hash)) return res.status(401).json({error:'Mã chưa đúng rồi — kiểm tra lại giúp Toki nhé!'});
    const token = signToken({userId:student.id,authSource:'student',classId:student.class_id,centerId:student.center_id},60*60*24*90);
    pilot.recordUxEvent('student_login_success',{userId:student.id,centerId:student.center_id,classId:student.class_id,metadata:{source:req.body?.loginSource==='join_link'?'join_link':'manual'}}).catch(()=>{});
    res.json({authToken:token,student:{id:student.id,displayName:student.display_name,studentCode:student.student_code,grade:student.class_grade,ageBand:student.class_age_band,className:student.class_name}});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/classroom/student/home", authMiddleware, async (req,res) => {
  try {
    if (req.auth.authSource !== 'student') return res.status(403).json({error:'student auth required'});
    const user = await db.getUser(req.auth.userId); if (!user) return res.status(404).json({error:'student not found'});
    const assignments = await classroom.listStudentAssignments(req.auth.userId);
    let progress = null;
    try { if (req.auth.classId) progress = await classroom.getStudentProgressReport(req.auth.userId,req.auth.classId,7); } catch {}
    res.json({student:{id:user.id,displayName:user.display_name || user.name,grade:user.grade,ageBand:user.age_band,streakDays:user.streak_days},assignments,progress});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post("/api/classroom/assignments/:id/start", authMiddleware, async (req,res) => {
  try {
    if (req.auth.authSource !== 'student') return res.status(403).json({error:'student auth required'});
    const started = await classroom.startAttempt(req.auth.userId, req.params.id);
    pilot.recordUxEvent('student_mission_opened',{userId:req.auth.userId,centerId:req.auth.centerId,classId:req.auth.classId,metadata:{assignmentId:req.params.id}}).catch(()=>{});
    res.json({attemptId:started.attemptId,sessionId:started.sessionId,userId:started.userId,streakDays:started.streakDays,mission:{id:started.mission_id,title:started.title,description:started.description,grade:started.grade,ageBand:started.age_band,missionType:started.mission_type,learningObjective:started.learning_objective,targetVocab:started.target_vocab,targetPatterns:started.target_patterns,targetTurns:started.target_turns,targetSpeakingSeconds:started.target_speaking_seconds,openingEn:started.opening_en,openingVi:started.opening_vi}});
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.post("/api/classroom/attempts/:id/finish", authMiddleware, async (req,res) => {
  try {
    if (req.auth.authSource !== 'student') return res.status(403).json({error:'student auth required'});
    let item = await classroom.finishAttempt(req.params.id, req.auth.userId);
    pilot.recordUxEvent('student_mission_finished',{userId:req.auth.userId,centerId:req.auth.centerId,classId:req.auth.classId,metadata:{attemptId:req.params.id,status:item.status}}).catch(()=>{});

    // Generate a short teacher/learner summary from learner turns only. A failed
    // summary call never blocks completion; deterministic metrics remain valid.
    if (Number(item.turn_count || 0) > 0) {
      try {
        const ctx = await classroom.getAttemptSummaryContext(req.params.id);
        const aiSummary = await askClassroomSummary({
          ageBand: item.age_band,
          grade: item.grade,
          title: item.title,
          learningObjective: item.learning_objective,
          targetVocab: item.target_vocab,
          targetPatterns: item.target_patterns,
          transcript: ctx.transcript,
          metrics: ctx.metrics,
        }, {
          userId:req.auth.userId,
          centerId:item.center_id || null,
          endpoint:"classroom_summary",
        });
        item = await classroom.saveAttemptSummary(req.params.id, aiSummary);
      } catch (summaryErr) {
        console.error("classroom summary error:", summaryErr.message);
        const numeric = item.summary || {};
        const fallback = {
          learnerAchievementVi: `Bạn đã nói ${Number(item.turn_count || 0)} lượt và luyện ${Math.round(Number(item.actual_speaking_seconds || 0))} giây tiếng Anh.`,
          teacherNoteVi: `Học sinh đã thực hành ${Number(item.turn_count || 0)} lượt, dùng ${Number(numeric.targetVocabUsed || 0)}/${Number(numeric.targetVocabTotal || 0)} từ mục tiêu và ${Number(numeric.targetPatternsUsed || 0)}/${Number(numeric.targetPatternsTotal || 0)} mẫu câu.`,
          strength: "Completed real speaking practice in the assigned mission.",
          nextFocus: item.status === 'completed' ? "Reuse the target language in another short speaking situation." : "Try the mission again and speak a little longer.",
        };
        item = await classroom.saveAttemptSummary(req.params.id, fallback);
      }
    }
    res.json({item});
  } catch(e) { res.status(400).json({error:e.message}); }
});

// ---- GET /api/review?userId=... : the optional, positive review list ----
app.get("/api/review", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const list = await db.getErrorsForUser(userId, 50);
    res.json({ items: list });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---- GET /api/vocab?userId=... : the saved-words notebook ----
app.get("/api/vocab", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    res.json({ items: await db.getVocabForUser(userId, 200) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---- GET /api/progress?userId=... : journey stats ----
app.get("/api/progress", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = await db.getProgress(userId);
    if (!p) return res.status(404).json({ error: "unknown user" });
    res.json(p);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PORT = process.env.PORT || 8787;
db.init()
  .then(() => classroom.initClassroom())
  .then(() => pilot.initPilotMetrics())
  .then(() => {
    app.listen(PORT, () => console.log(`Dám Nói backend on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("Failed to init database:", e.message);
    process.exit(1);
  });
