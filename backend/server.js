// server.js — Dám Nói backend. Proxies Claude, persists sessions/streak/errors.
// Run: ANTHROPIC_API_KEY=sk-... node server.js
const express = require("express");
const cors = require("cors");
const db = require("./db");
const { buildSystemPrompt, OPENING } = require("./prompt");
const { OAuth2Client } = require("google-auth-library");

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" }));

// Lightweight wake/health check — no DB, no AI. Used to warm the server up
// (e.g. an external ping to keep Render awake, and the app pinging on load).
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- GET /api/admin/stats?key=... : founder-only behaviour metrics ----
const ADMIN_KEY = process.env.ADMIN_KEY || "";
app.get("/api/admin/stats", async (req, res) => {
  try {
    if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) return res.status(403).json({ error: "forbidden" });
    res.json(await db.getAdminStats());
  } catch (e) {
    console.error("admin stats error:", e.message);
    res.status(500).json({ error: "stats failed" });
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
      roast_vi: { 
        type: "string", 
        description: "BẮT BUỘC: Một câu ngắn gọn bằng TIẾNG VIỆT để nhận xét, khịa hoặc sửa lỗi người dùng. Bắt buộc phải là Tiếng Việt." 
      },
      teach_en: { type: "string" },
      next_en: { 
        type: "string", 
        description: "BẮT BUỘC: Câu trả lời chính của Toki để duy trì hội thoại. CHỈ ĐƯỢC VIẾT BẰNG TIẾNG ANH, không được có tiếng Việt." 
      },
      vi_translation: { 
        type: "string",
        description: "Bản dịch Tiếng Việt của câu next_en."
      },
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
const MAX_RECENT = parseInt(process.env.TOKI_MAX_RECENT || "16", 10); 
function trimHistory(messages) {
  if (!Array.isArray(messages) || messages.length <= MAX_RECENT + 1) return messages;
  const anchor = messages[0];                 
  const recent = messages.slice(-MAX_RECENT);  
  return [anchor, ...recent];
}

async function askToki({ system, messages }) {
  const trimmed = trimHistory(messages);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system,
      tools: [TOKI_TOOL],
      tool_choice: { type: "tool", name: "toki_reply" },
      messages: trimmed,
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === "tool_use");
  if (!block) throw new Error("no tool_use block");
  const r = block.input;
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

function countWords(s) {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

app.post("/api/auth/google", async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) return res.status(501).json({ error: "login not configured" });
    const { credential, deviceUserId } = req.body || {};
    if (!credential) return res.status(400).json({ error: "credential required" });

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

app.post("/api/turn", async (req, res) => {
  try {
    const { userId, sessionId, text, secondsSpoken = 0, silentCount = 0 } = req.body || {};
    const session = await db.getSession(sessionId);
    const user = await db.getUser(userId);
    if (!session || !user) return res.status(404).json({ error: "unknown session/user" });

    const DAILY_LIMIT = Number(process.env.DAILY_TURN_LIMIT || 40);
    if (silentCount === 0 && (await db.getUserTurnsToday(userId)) >= DAILY_LIMIT) {
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

    const content = silentCount > 0 ? `[USER_SILENT count=${silentCount}]` : (text || "").trim();
    if (!content) return res.status(400).json({ error: "empty turn" });

    await db.logTurn(sessionId, "user", content);
    if (silentCount === 0) {
      await db.bumpSpoken(userId, sessionId, secondsSpoken, countWords(content));
    }

    const system = buildSystemPrompt({
      sessionNumber: session.session_number,
      confidenceLevel: user.confidence_level,
      streakDays: user.streak_days,
      weaknesses: await db.getWeaknesses(userId),
      job: user.job,
      errorCount: await db.getSessionErrorCount(sessionId),
    });
    const messages = await db.historyFor(sessionId);

    const reply = await askToki({ system, messages });

    const combined = [reply.roast_vi, reply.teach_en, reply.next_en].filter(Boolean).join(" ");
    await db.logTurn(sessionId, "assistant", combined);
    await db.logErrors(userId, sessionId, reply.errors_noticed); 
    if (reply.vocab && reply.vocab.length) await db.saveVocab(userId, reply.vocab); 

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
    });
  } catch (e) {
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

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }
    const system = buildSystemPrompt({ sessionNumber: 1, confidenceLevel: "low", streakDays: 1 });
    const reply = await askToki({ system, messages });
    res.json(reply); 
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

const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || "southeastasia";
const AZURE_VOICE = process.env.AZURE_SPEECH_VOICE || "en-US-SaraNeural";

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const TTS_CACHE = new Map();
const TTS_CACHE_MAX = 500;
function ttsCacheGet(key) {
  const v = TTS_CACHE.get(key);
  if (v) { TTS_CACHE.delete(key); TTS_CACHE.set(key, v); } 
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

app.post("/api/stt", async (req, res) => {
  try {
    if (!AZURE_KEY) return res.status(501).json({ error: "stt not configured" });
    const { audio, contentType } = req.body || {};
    if (!audio) return res.status(400).json({ error: "audio required" });

    const buf = Buffer.from(audio, "base64");
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
      return res.status(502).json({ error: "stt upstream" });
    }
    const data = await r.json();
    const text =
      data.DisplayText ||
      (data.NBest && data.NBest[0] && data.NBest[0].Display) ||
      "";
    res.json({ text: text.trim(), status: data.RecognitionStatus || "Unknown" });
  } catch (e) {
    console.error("stt error:", e.message);
    res.status(500).json({ error: "stt failed" });
  }
});

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

app.get("/api/vocab", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    res.json({ items: await db.getVocabForUser(userId, 200) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

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
  .then(() => {
    app.listen(PORT, () => console.log(`MoHo backend on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("Failed to init database:", e.message);
    process.exit(1);
  });