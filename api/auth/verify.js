const { sql, migrate } = require('../../lib/db');
const {
  sha256,
  newId,
  createSession,
  buildSetCookie,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  try {
    await migrate();
    const token = (req.query && req.query.token) || '';
    if (!token) {
      res.status(400).send('missing token');
      return;
    }
    const hash = sha256(token);
    const now = Date.now();
    const row = await sql`
      SELECT email, expires_at, consumed
      FROM magic_tokens
      WHERE token_hash = ${hash}
      LIMIT 1
    `;
    if (!row.rows.length) {
      res.status(400).send('Invalid or expired link.');
      return;
    }
    const t = row.rows[0];
    if (t.consumed) {
      res.status(400).send('This link was already used.');
      return;
    }
    if (Number(t.expires_at) < now) {
      res.status(400).send('Link expired. Request a new one.');
      return;
    }
    await sql`UPDATE magic_tokens SET consumed = true WHERE token_hash = ${hash}`;

    // Find-or-create user
    const email = t.email;
    let user = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    let userId;
    if (user.rows.length) {
      userId = user.rows[0].id;
    } else {
      userId = newId('u');
      await sql`INSERT INTO users (id, email, created_at) VALUES (${userId}, ${email}, ${now})`;
    }

    const session = await createSession(userId);
    res.setHeader(
      'Set-Cookie',
      buildSetCookie(SESSION_COOKIE, session.id, { maxAge: SESSION_TTL_MS })
    );
    res.statusCode = 302;
    res.setHeader('Location', '/?signed_in=1');
    res.end();
  } catch (e) {
    res.status(500).send('Server error: ' + e.message);
  }
};
