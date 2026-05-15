const { migrate } = require('../../lib/db');
const { getCurrentUser } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  try {
    await migrate();
    const u = await getCurrentUser(req);
    if (!u) {
      res.status(200).json({ user: null });
      return;
    }
    res.status(200).json({ user: { email: u.email } });
  } catch (e) {
    // If DB isn't configured yet, treat as signed-out so the app still works.
    res.status(200).json({ user: null });
  }
};
