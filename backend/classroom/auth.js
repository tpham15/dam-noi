const crypto = require('crypto');

const SECRET = process.env.AUTH_SECRET || process.env.ADMIN_KEY || 'dam-noi-dev-auth-secret-change-me';
if (!process.env.AUTH_SECRET) console.warn('WARNING: AUTH_SECRET is not set. Using fallback; set it in production.');

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sig = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function signToken(payload, ttlSeconds = 60 * 60 * 24 * 30) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = b64(body);
  return `${encoded}.${sig(encoded)}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = sig(encoded);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch { return null; }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now()/1000)) return null;
    return payload;
  } catch { return null; }
}

function authMiddleware(req, res, next) {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const auth = verifyToken(token);
  if (!auth) return res.status(401).json({ error: 'unauthorized' });
  req.auth = auth;
  next();
}

function hashPin(pin) {
  const clean = String(pin || '').trim();
  if (!/^\d{4,6}$/.test(clean)) throw new Error('PIN must be 4-6 digits');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(clean, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPin(pin, stored) {
  try {
    const [salt, hash] = String(stored || '').split(':');
    if (!salt || !hash) return false;
    const got = crypto.scryptSync(String(pin || '').trim(), salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash,'hex'), Buffer.from(got,'hex'));
  } catch { return false; }
}

module.exports = { signToken, verifyToken, authMiddleware, hashPin, verifyPin };
