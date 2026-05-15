const { sql, migrate } = require('../../lib/db');
const { requireUser } = require('../../lib/auth');

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
    const user = await requireUser(req, res);
    if (!user) return;

    const id = (req.query && req.query.id) || '';
    if (!id) {
      res.status(400).json({ error: 'id required' });
      return;
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await readBody(req);
      const now = Date.now();
      // Build dynamic update. @vercel/postgres tagged-template doesn't compose
      // well, so handle the cases explicitly.
      const setName = typeof body.name === 'string';
      const setHoldings = Array.isArray(body.holdings);
      if (!setName && !setHoldings) {
        res.status(400).json({ error: 'no fields to update' });
        return;
      }
      let result;
      if (setName && setHoldings) {
        const trimmed = body.name.trim();
        if (!trimmed) {
          res.status(400).json({ error: 'name cannot be empty' });
          return;
        }
        result = await sql`
          UPDATE portfolios
          SET name = ${trimmed}, holdings = ${JSON.stringify(body.holdings)}, updated_at = ${now}
          WHERE id = ${id} AND user_id = ${user.id}
          RETURNING id, name, holdings, created_at, updated_at
        `;
      } else if (setName) {
        const trimmed = body.name.trim();
        if (!trimmed) {
          res.status(400).json({ error: 'name cannot be empty' });
          return;
        }
        result = await sql`
          UPDATE portfolios
          SET name = ${trimmed}, updated_at = ${now}
          WHERE id = ${id} AND user_id = ${user.id}
          RETURNING id, name, holdings, created_at, updated_at
        `;
      } else {
        result = await sql`
          UPDATE portfolios
          SET holdings = ${JSON.stringify(body.holdings)}, updated_at = ${now}
          WHERE id = ${id} AND user_id = ${user.id}
          RETURNING id, name, holdings, created_at, updated_at
        `;
      }
      if (!result.rows.length) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const row = result.rows[0];
      res.status(200).json({
        portfolio: {
          id: row.id,
          name: row.name,
          holdings: typeof row.holdings === 'string' ? JSON.parse(row.holdings) : row.holdings,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
        },
      });
      return;
    }

    if (req.method === 'DELETE') {
      const r = await sql`
        DELETE FROM portfolios WHERE id = ${id} AND user_id = ${user.id}
      `;
      if (r.rowCount === 0) {
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
