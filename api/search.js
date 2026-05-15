const { yf } = require('../lib/yahoo');

module.exports = async function handler(req, res) {
  const q = ((req.query && req.query.q) || '').trim();
  if (!q) {
    res.status(200).json({ quotes: [] });
    return;
  }
  try {
    const data = await yf.search(q, { quotesCount: 10, newsCount: 0 });
    const quotes = (data.quotes || [])
      .filter(
        (qt) =>
          qt && qt.symbol && (qt.quoteType === 'EQUITY' || qt.quoteType === 'ETF')
      )
      .map((qt) => ({
        symbol: qt.symbol,
        name: qt.shortname || qt.longname || qt.symbol,
        exchange: qt.exchDisp || qt.exchange || '',
        type: qt.quoteType,
      }));
    res.status(200).json({ quotes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
