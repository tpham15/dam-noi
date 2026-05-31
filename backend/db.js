// db.js — persistence for Dám Nói (users, sessions, turns, errors, streak).
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "damnoi.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  confidence_level TEXT NOT NULL DEFAULT 'low',
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,              -- YYYY-MM-DD
  total_sessions INTEGER NOT NULL DEFAULT 0,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  total_words INTEGER NOT NULL DEFAULT 0
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,                 -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  said TEXT NOT NULL,
  natural TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// Days between two YYYY-MM-DD strings.
function dayDiff(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

const getUser = db.prepare("SELECT * FROM users WHERE id = ?");
const insertUser = db.prepare(
  "INSERT INTO users (id, created_at, confidence_level) VALUES (?, ?, 'low')"
);

function ensureUser(userId) {
  let u = userId && getUser.get(userId);
  if (u) return u;
  const id = userId || uid();
  insertUser.run(id, now());
  return getUser.get(id);
}

// Update streak when a new session starts. Returns the user row after update.
const updateStreak = db.prepare(
  "UPDATE users SET streak_days = ?, last_active_date = ?, total_sessions = total_sessions + 1 WHERE id = ?"
);

function startSession(userId) {
  const u = ensureUser(userId);
  const t = today();
  let streak = u.streak_days;
  if (u.last_active_date === t) {
    // already active today — streak unchanged
  } else if (u.last_active_date && dayDiff(u.last_active_date, t) === 1) {
    streak = u.streak_days + 1; // consecutive day
  } else {
    streak = 1; // first ever, or streak broken — restart at 1
  }
  const sessionNumber = u.total_sessions + 1; // capture BEFORE the update
  updateStreak.run(streak, t, u.id);

  const sessionId = uid();
  db.prepare(
    "INSERT INTO sessions (id, user_id, session_number, started_at) VALUES (?, ?, ?, ?)"
  ).run(sessionId, u.id, sessionNumber, now());

  return {
    userId: u.id,
    sessionId,
    sessionNumber,
    confidenceLevel: u.confidence_level,
    streakDays: streak,
  };
}

const getSession = db.prepare("SELECT * FROM sessions WHERE id = ?");
const insertTurn = db.prepare(
  "INSERT INTO turns (session_id, role, content, created_at) VALUES (?, ?, ?, ?)"
);
const getTurns = db.prepare(
  "SELECT role, content FROM turns WHERE session_id = ? ORDER BY id ASC"
);

function logTurn(sessionId, role, content) {
  insertTurn.run(sessionId, role, content, now());
}

function historyFor(sessionId) {
  return getTurns.all(sessionId).map((r) => ({ role: r.role, content: r.content }));
}

const insertError = db.prepare(
  "INSERT INTO errors (user_id, session_id, said, natural, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
);
function logErrors(userId, sessionId, list) {
  const tx = db.transaction((items) => {
    for (const e of items) {
      if (e && e.said && e.natural) insertError.run(userId, sessionId, e.said, e.natural, e.type || "other", now());
    }
  });
  tx(list || []);
}
const getErrors = db.prepare(
  "SELECT said, natural, type, created_at FROM errors WHERE user_id = ? ORDER BY id DESC LIMIT ?"
);

function bumpSpoken(userId, sessionId, seconds, words) {
  db.prepare(
    "UPDATE sessions SET seconds_spoken = seconds_spoken + ?, words_spoken = words_spoken + ? WHERE id = ?"
  ).run(seconds, words, sessionId);
  db.prepare(
    "UPDATE users SET total_seconds = total_seconds + ?, total_words = total_words + ? WHERE id = ?"
  ).run(seconds, words, userId);
}

module.exports = {
  startSession, getSession, ensureUser, getUser,
  logTurn, historyFor, logErrors,
  getErrorsForUser: (userId, limit = 50) => getErrors.all(userId, limit),
  bumpSpoken,
};
