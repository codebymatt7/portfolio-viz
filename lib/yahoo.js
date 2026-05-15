const { default: YahooFinance } = require('yahoo-finance2');

const yf = new YahooFinance();

const DAY = 24 * 60 * 60 * 1000;
const RANGE_SPECS = {
  '1w': { back: 10 * DAY, interval: '1h' },
  '1mo': { back: 32 * DAY, interval: '1d' },
  '3mo': { back: 95 * DAY, interval: '1d' },
  '6mo': { back: 186 * DAY, interval: '1d' },
  '1y': { back: 370 * DAY, interval: '1d' },
  '2y': { back: 2 * 370 * DAY, interval: '1wk' },
  '5y': { back: 5 * 370 * DAY, interval: '1wk' },
  max: { back: 40 * 365 * DAY, interval: '1mo' },
};

module.exports = { yf, RANGE_SPECS };
