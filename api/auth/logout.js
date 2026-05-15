const { migrate } = require('../../lib/db');
const {
  parseCookies,
  deleteSession,
  buildSetCookie,
  SESSION_COOKIE,
} = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  try {
    await migrate();
    const sid = parseCookies(req)[SESSION_COOKIE];
    if (sid) await deleteSession(sid);
    res.setHeader('Set-Cookie', buildSetCookie(SESSION_COOKIE, '', { clear: true }));
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
