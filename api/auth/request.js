const { sql, migrate } = require('../../lib/db');
const { randomToken, sha256, MAGIC_TTL_MS } = require('../../lib/auth');
const { sendMagicLink } = require('../../lib/email');

async function readBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  try {
    await migrate();
    const body = await readBody(req);
    const email = (body.email || '').toString().trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) {
      res.status(400).json({ error: 'invalid email' });
      return;
    }
    const token = randomToken(32);
    const hash = sha256(token);
    const expiresAt = Date.now() + MAGIC_TTL_MS;
    await sql`
      INSERT INTO magic_tokens (token_hash, email, expires_at, consumed)
      VALUES (${hash}, ${email}, ${expiresAt}, false)
    `;
    const proto = (req.headers['x-forwarded-proto'] || 'https').toString();
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString();
    const base = process.env.PUBLIC_URL || `${proto}://${host}`;
    const link = `${base}/api/auth/verify?token=${encodeURIComponent(token)}`;
    const r = await sendMagicLink({ to: email, link });
    res.status(200).json({ ok: true, dev: !!r.dev });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
