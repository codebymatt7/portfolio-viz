const { db, migrate } = require('../../lib/db');

function newId() {
  return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

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

module.exports = async function handler(req, res) {
  try {
    await migrate();
    if (req.method === 'GET') {
      const r = await db.execute(
        'SELECT id, name, holdings, created_at, updated_at FROM portfolios ORDER BY updated_at DESC'
      );
      const portfolios = r.rows.map((row) => ({
        id: row.id,
        name: row.name,
        holdings: JSON.parse(row.holdings),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      }));
      res.status(200).json({ portfolios });
      return;
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || '').toString().trim();
      const holdings = body.holdings;
      if (!name) {
        res.status(400).json({ error: 'name required' });
        return;
      }
      if (!Array.isArray(holdings)) {
        res.status(400).json({ error: 'holdings must be array' });
        return;
      }
      const id = newId();
      const now = Date.now();
      await db.execute({
        sql:
          'INSERT INTO portfolios (id, name, holdings, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        args: [id, name, JSON.stringify(holdings), now, now],
      });
      res.status(200).json({
        portfolio: { id, name, holdings, createdAt: now, updatedAt: now },
      });
      return;
    }
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
