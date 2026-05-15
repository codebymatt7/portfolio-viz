const { yf, RANGE_SPECS } = require('../lib/yahoo');

module.exports = async function handler(req, res) {
  const symbol = ((req.query && req.query.symbol) || '').trim().toUpperCase();
  const rangeKey = (req.query && req.query.range) || '1y';
  const spec = RANGE_SPECS[rangeKey] || RANGE_SPECS['1y'];
  if (!symbol) {
    res.status(400).json({ error: 'symbol required' });
    return;
  }
  try {
    const period2 = new Date();
    const period1 = new Date(Date.now() - spec.back);
    const r = await yf.chart(symbol, {
      period1,
      period2,
      interval: spec.interval,
    });
    const points = [];
    for (const q of r.quotes || []) {
      const close = q.close ?? q.adjclose;
      if (close == null || Number.isNaN(close)) continue;
      const t = q.date instanceof Date ? q.date.getTime() : new Date(q.date).getTime();
      points.push({ t, c: close });
    }
    res.status(200).json({
      symbol,
      currency: r.meta?.currency || 'USD',
      points,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
