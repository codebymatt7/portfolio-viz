const { db, migrate } = require('../../lib/db');

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
    const id = (req.query && req.query.id) || '';
    if (!id) {
      res.status(400).json({ error: 'id required' });
      return;
    }
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await readBody(req);
      const fields = [];
      const args = [];
      if (typeof body.name === 'string') {
        const n = body.name.trim();
        if (!n) {
          res.status(400).json({ error: 'name cannot be empty' });
          return;
        }
        fields.push('name = ?');
        args.push(n);
      }
      if (Array.isArray(body.holdings)) {
        fields.push('holdings = ?');
        args.push(JSON.stringify(body.holdings));
      }
      if (!fields.length) {
        res.status(400).json({ error: 'no fields to update' });
        return;
      }
      fields.push('updated_at = ?');
      args.push(Date.now());
      args.push(id);
      const r = await db.execute({
        sql: `UPDATE portfolios SET ${fields.join(', ')} WHERE id = ?`,
        args,
      });
      if (r.rowsAffected === 0) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const fetch = await db.execute({
        sql:
          'SELECT id, name, holdings, created_at, updated_at FROM portfolios WHERE id = ?',
        args: [id],
      });
      const row = fetch.rows[0];
      res.status(200).json({
        portfolio: {
          id: row.id,
          name: row.name,
          holdings: JSON.parse(row.holdings),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
        },
      });
      return;
    }
    if (req.method === 'DELETE') {
      const r = await db.execute({
        sql: 'DELETE FROM portfolios WHERE id = ?',
        args: [id],
      });
      if (r.rowsAffected === 0) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }
    res.setHeader('Allow', 'PATCH, PUT, DELETE');
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
