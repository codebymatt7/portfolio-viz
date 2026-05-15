const crypto = require('crypto');
const { sql } = require('./db');

const SESSION_COOKIE = 'pvz_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAGIC_TTL_MS = 15 * 60 * 1000; // 15 min

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers && (req.headers.cookie || req.headers.Cookie);
  if (!raw) return out;
  raw.split(/;\s*/).forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > 0) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  });
  return out;
}

function buildSetCookie(name, value, { maxAge, clear } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push('Path=/');
  parts.push('HttpOnly');
  parts.push('SameSite=Lax');
  parts.push('Secure');
  if (clear) {
    parts.push('Max-Age=0');
  } else if (maxAge != null) {
    parts.push(`Max-Age=${Math.floor(maxAge / 1000)}`);
  }
  return parts.join('; ');
}

async function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return null;
  const now = Date.now();
  const r = await sql`
    SELECT u.id, u.email, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sid} AND s.expires_at > ${now}
    LIMIT 1
  `;
  if (!r.rows.length) return null;
  return { id: r.rows[0].id, email: r.rows[0].email };
}

async function requireUser(req, res) {
  const u = await getCurrentUser(req);
  if (!u) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return u;
}

async function createSession(userId) {
  const id = newId('s');
  const expires = Date.now() + SESSION_TTL_MS;
  await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${id}, ${userId}, ${expires})`;
  return { id, expiresAt: expires };
}

async function deleteSession(sid) {
  await sql`DELETE FROM sessions WHERE id = ${sid}`;
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  MAGIC_TTL_MS,
  randomToken,
  sha256,
  newId,
  parseCookies,
  buildSetCookie,
  getCurrentUser,
  requireUser,
  createSession,
  deleteSession,
};
