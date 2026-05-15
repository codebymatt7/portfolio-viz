const express = require('express');
const path = require('path');

const searchHandler = require('./api/search');
const chartHandler = require('./api/chart');
const portfoliosHandler = require('./api/portfolios/index');
const portfolioIdHandler = require('./api/portfolios/[id]');

const app = express();
const PORT = process.env.PORT || 3017;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (h) => (req, res) => h(req, res);

app.get('/api/search', wrap(searchHandler));
app.get('/api/chart', wrap(chartHandler));
app.get('/api/portfolios', wrap(portfoliosHandler));
app.post('/api/portfolios', wrap(portfoliosHandler));
app.patch('/api/portfolios/:id', (req, res) => {
  req.query = { ...req.query, id: req.params.id };
  return portfolioIdHandler(req, res);
});
app.delete('/api/portfolios/:id', (req, res) => {
  req.query = { ...req.query, id: req.params.id };
  return portfolioIdHandler(req, res);
});

app.listen(PORT, () => {
  console.log(`Portfolio viz running at http://localhost:${PORT}`);
});
