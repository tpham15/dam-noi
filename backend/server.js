// server.js — Dám Nói backend. Proxies Claude, persists sessions/streak/errors.
// Run: ANTHROPIC_API_KEY=sk-... node server.js
const express = require("express");
const cors = require("cors");
const db = require("./db");
const { buildSystemPrompt, OPENING } = require("./prompt");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.TOKI_MODEL || "claude-haiku-4-5-20251001";
if (!API_KEY) console.warn("WARNING: ANTHROPIC_API_KEY is not set.");

// ---- The structured-output tool (forces clean JSON every turn) ----
const TOKI_TOOL = {
  name: "toki_reply",
  description: "Toki's structured response for one conversational turn.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["spoken_reply", "vi_translation", "scaffold_chips", "errors_noticed", "used_vietnamese", "encouragement"],
    properties: {
      spoken_reply: { type: "string" },
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
    },
  },
};

async function askToki({ system, messages }) {
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
      messages,
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === "tool_use");
  if (!block) throw new Error("no tool_use block");
  const r = block.input;
  return {
    spoken_reply: r.spoken_reply || "Sorry, say that again?",
    vi_translation: r.vi_translation || "",
    scaffold_chips: (r.scaffold_chips || []).slice(0, 4),
    errors_noticed: r.errors_noticed || [],
    used_vietnamese: !!r.used_vietnamese,
    encouragement: r.encouragement || "",
  };
}

function countWords(s) {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

// ---- POST /api/session/start : create or resume a user, open a session ----
app.post("/api/session/start", (req, res) => {
  try {
    const { userId } = req.body || {};
    const s = db.startSession(userId);
    // seed the opening greeting into history
    db.logTurn(s.sessionId, "user", `[SESSION_START] session_number=${s.sessionNumber} confidence=${s.confidenceLevel}`);
    db.logTurn(s.sessionId, "assistant", OPENING);
    res.json({
      userId: s.userId,
      sessionId: s.sessionId,
      sessionNumber: s.sessionNumber,
      streakDays: s.streakDays,
      greeting: OPENING,
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
    const session = db.getSession.get(sessionId);
    const user = db.getUser.get(userId);
    if (!session || !user) return res.status(404).json({ error: "unknown session/user" });

    // Build the user turn content. A silence signal replaces normal text.
    const content = silentCount > 0 ? `[USER_SILENT count=${silentCount}]` : (text || "").trim();
    if (!content) return res.status(400).json({ error: "empty turn" });

    // Persist the user turn (skip storing silence as a "spoken" turn's words)
    db.logTurn(sessionId, "user", content);
    if (silentCount === 0) {
      db.bumpSpoken(userId, sessionId, secondsSpoken, countWords(content));
    }

    const system = buildSystemPrompt({
      sessionNumber: session.session_number,
      confidenceLevel: user.confidence_level,
      streakDays: user.streak_days,
    });
    const messages = db.historyFor(sessionId);

    const reply = await askToki({ system, messages });

    db.logTurn(sessionId, "assistant", reply.spoken_reply);
    db.logErrors(userId, sessionId, reply.errors_noticed); // hidden, for review only

    // errors_noticed is intentionally NOT returned in the live payload by default,
    // mirroring the design (invisible during conversation). The client fetches them
    // via /api/review when the user opts in.
    res.json({
      spoken_reply: reply.spoken_reply,
      vi_translation: reply.vi_translation,
      scaffold_chips: reply.scaffold_chips,
      used_vietnamese: reply.used_vietnamese,
      encouragement: reply.encouragement,
      streakDays: user.streak_days,
    });
  } catch (e) {
    // graceful fallback so the session never crashes
    res.json({
      spoken_reply: "Hmm, I didn't catch that — but no worries. Tell me one small thing about your day?",
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
    const reply = await askToki({ system, messages });
    res.json(reply); // includes spoken_reply, vi_translation, scaffold_chips, errors_noticed, used_vietnamese, encouragement
  } catch (e) {
    console.error("chat error:", e.message);
    res.json({
      spoken_reply: "Hmm, I didn't catch that — but no worries. Tell me one small thing about your day?",
      vi_translation: "Hmm, mình chưa nghe rõ — không sao cả. Kể mình nghe một điều nhỏ trong ngày của bạn nhé?",
      scaffold_chips: [], errors_noticed: [], used_vietnamese: false, encouragement: "", degraded: true,
    });
  }
});

// ---- GET /api/review?userId=... : the optional, positive review list ----
app.get("/api/review", (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const list = db.getErrorsForUser(userId, 50);
    res.json({ items: list });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`Dám Nói backend on http://localhost:${PORT}`));
