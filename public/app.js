const COLORS = [
  '#7c5cff',
  '#00d4ff',
  '#29d391',
  '#ffb547',
  '#ff5577',
  '#5b8def',
  '#ff8ac1',
  '#9be36b',
];

const state = {
  holdings: [], // { symbol, name, weight, color, visible }
  range: '1y',
  cache: {}, // `${symbol}|${range}` -> points
  searchSeq: 0,
  loadSeq: 0,
  saved: [], // [{ id, name, holdings, savedAt }]
  activeId: null,
};


const els = {
  search: document.getElementById('search'),
  suggestions: document.getElementById('suggestions'),
  holdings: document.getElementById('holdings'),
  totalWeight: document.getElementById('totalWeight'),
  presets: document.getElementById('presets'),
  saveBtn: document.getElementById('saveBtn'),
  saved: document.getElementById('saved'),
  ranges: document.getElementById('ranges'),
  chartCanvas: document.getElementById('chart'),
  chartEmpty: document.getElementById('chartEmpty'),
  chartLoading: document.getElementById('chartLoading'),
  chartReturn: document.getElementById('chartReturn'),
  chartReturnSub: document.getElementById('chartReturnSub'),
  legend: document.getElementById('legend'),
  mainSubtitle: document.getElementById('mainSubtitle'),
  statReturn: document.getElementById('statReturn'),
  statAnnual: document.getElementById('statAnnual'),
  statDrawdown: document.getElementById('statDrawdown'),
};

/* --- Chart setup ---------------------------------------------------- */
const ctx = els.chartCanvas.getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: { datasets: [] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#181c25',
        borderColor: '#2e3441',
        borderWidth: 1,
        padding: 10,
        titleColor: '#e6e8ee',
        bodyColor: '#e6e8ee',
        titleFont: { weight: '600' },
        callbacks: {
          title: (items) => {
            const t = items[0].parsed.x;
            return new Date(t).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
          },
          label: (item) => {
            const v = item.parsed.y;
            const sign = v >= 0 ? '+' : '';
            return `  ${item.dataset.label}: ${sign}${v.toFixed(2)}%`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: { tooltipFormat: 'PP' },
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: '#5b6273',
          maxRotation: 0,
          autoSkipPadding: 24,
          font: { size: 11 },
        },
        border: { display: false },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: '#5b6273',
          font: { size: 11 },
          callback: (v) => `${v > 0 ? '+' : ''}${v}%`,
        },
        border: { display: false },
      },
    },
    elements: {
      point: { radius: 0, hoverRadius: 4 },
      line: { borderWidth: 2, tension: 0.18 },
    },
  },
});

/* --- Search --------------------------------------------------------- */
let searchTimer = null;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = els.search.value.trim();
  if (!q) {
    hideSuggestions();
    return;
  }
  searchTimer = setTimeout(() => runSearch(q), 180);
});

els.search.addEventListener('blur', () => {
  setTimeout(hideSuggestions, 150);
});

els.search.addEventListener('focus', () => {
  if (els.suggestions.children.length) els.suggestions.classList.remove('hidden');
});

async function runSearch(q) {
  const seq = ++state.searchSeq;
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error('search failed');
    const data = await r.json();
    if (seq !== state.searchSeq) return;
    renderSuggestions(data.quotes || []);
  } catch (e) {
    hideSuggestions();
  }
}

function renderSuggestions(quotes) {
  els.suggestions.innerHTML = '';
  if (!quotes.length) {
    hideSuggestions();
    return;
  }
  for (const q of quotes) {
    const row = document.createElement('div');
    row.className = 'suggestion';
    row.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
        <span class="symbol">${q.symbol}</span>
        <span class="name">${escapeHtml(q.name)}</span>
      </div>
      <span class="exchange">${escapeHtml(q.exchange)}</span>
    `;
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      addHolding(q);
      els.search.value = '';
      hideSuggestions();
      els.search.focus();
    });
    els.suggestions.appendChild(row);
  }
  els.suggestions.classList.remove('hidden');
}

function hideSuggestions() {
  els.suggestions.classList.add('hidden');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

/* --- Holdings ------------------------------------------------------- */
function addHolding(q) {
  if (state.holdings.find((h) => h.symbol === q.symbol)) return;
  const color = nextColor();
  const remaining = Math.max(0, 100 - totalWeight());
  const weight = state.holdings.length === 0 ? 100 : Math.min(remaining || 0, 25);
  state.holdings.push({
    symbol: q.symbol,
    name: q.name,
    weight,
    color,
    visible: false,
    group: '',
  });
  applyCurrentPreset();
  renderHoldings();
  reloadChart();
}

function removeHolding(symbol) {
  state.holdings = state.holdings.filter((h) => h.symbol !== symbol);
  applyCurrentPreset();
  renderHoldings();
  reloadChart();
}

function nextColor() {
  const used = new Set(state.holdings.map((h) => h.color));
  for (const c of COLORS) if (!used.has(c)) return c;
  return COLORS[state.holdings.length % COLORS.length];
}

function totalWeight() {
  return state.holdings.reduce((s, h) => s + (Number(h.weight) || 0), 0);
}

function renderHoldings() {
  els.holdings.innerHTML = '';
  if (!state.holdings.length) {
    els.holdings.classList.add('empty');
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No holdings yet — search above.';
    els.holdings.appendChild(empty);
  } else {
    els.holdings.classList.remove('empty');
    for (const h of state.holdings) {
      const row = document.createElement('div');
      row.className = 'holding';
      row.innerHTML = `
        <div class="holding-info">
          <div class="holding-symbol">
            <button class="holding-dot ${h.visible ? '' : 'hidden-line'}"
              style="--dot-color:${h.color}"
              title="${h.visible ? 'Hide line on chart' : 'Show line on chart'}"
              aria-label="Toggle ${escapeHtml(h.symbol)} on chart"></button>
            ${escapeHtml(h.symbol)}
            <input class="group-input ${h.group ? 'has-value' : ''}" type="text"
              placeholder="+ group" value="${escapeHtml(h.group || '')}"
              maxlength="24" />
          </div>
          <div class="holding-name">${escapeHtml(h.name)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:2px;">
          <input class="weight-input" type="number" min="0" max="100" step="0.1" value="${h.weight}" />
          <span class="weight-unit">%</span>
        </div>
        <button class="remove-btn" title="Remove">×</button>
      `;
      const input = row.querySelector('.weight-input');
      input.addEventListener('input', () => {
        const v = Math.max(0, Math.min(100, Number(input.value) || 0));
        h.weight = v;
        // Manual edit drops us out of any preset.
        if (els.presets.value !== 'custom') els.presets.value = 'custom';
        updateWeightSummary();
        scheduleRecompute();
      });
      const groupInput = row.querySelector('.group-input');
      groupInput.addEventListener('input', () => {
        h.group = groupInput.value.trim();
        groupInput.classList.toggle('has-value', !!h.group);
      });
      groupInput.addEventListener('change', () => {
        // On blur/Enter, re-apply preset (relevant for Equal-by-group).
        applyCurrentPreset();
        renderHoldings();
        scheduleRecompute();
      });
      row.querySelector('.holding-dot').addEventListener('click', () => {
        h.visible = !h.visible;
        renderHoldings();
        renderChart();
      });
      row.querySelector('.remove-btn').addEventListener('click', () =>
        removeHolding(h.symbol)
      );
      els.holdings.appendChild(row);
    }
  }
  updateWeightSummary();
}

function updateWeightSummary() {
  const t = totalWeight();
  els.totalWeight.textContent = `${t.toFixed(0)}%`;
  els.totalWeight.classList.toggle('warn', Math.abs(t - 100) > 0.5 && t !== 0);
  els.totalWeight.classList.toggle('ok', Math.abs(t - 100) <= 0.5);
}

function applyCurrentPreset() {
  const v = els.presets.value;
  const n = state.holdings.length;
  if (!n || v === 'custom' || !v) return;
  if (v === 'equal') {
    const w = +(100 / n).toFixed(2);
    state.holdings.forEach((h) => (h.weight = w));
  } else if (v === 'equalGroup') {
    // Each group gets an equal share of 100%; within a group, members split equally.
    // Ungrouped stocks are treated as their own individual "groups".
    const groups = new Map();
    state.holdings.forEach((h, i) => {
      const key = (h.group || '').trim().toLowerCase() || `__solo_${i}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(h);
    });
    const groupCount = groups.size;
    const perGroup = 100 / groupCount;
    for (const arr of groups.values()) {
      const w = +(perGroup / arr.length).toFixed(2);
      arr.forEach((h) => (h.weight = w));
    }
  } else if (v === '6040' || v === '8020') {
    const first = v === '6040' ? 60 : 80;
    if (n === 1) {
      state.holdings[0].weight = 100;
    } else {
      const rest = +((100 - first) / (n - 1)).toFixed(2);
      state.holdings.forEach((h, i) => (h.weight = i === 0 ? first : rest));
    }
  } else if (v === 'reverse') {
    const ws = state.holdings.map((h) => h.weight).reverse();
    state.holdings.forEach((h, i) => (h.weight = ws[i]));
  }
}

els.presets.addEventListener('change', () => {
  applyCurrentPreset();
  renderHoldings();
  scheduleRecompute();
});

let recomputeTimer = null;
function scheduleRecompute() {
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(renderChart, 150);
}

/* --- Ranges --------------------------------------------------------- */
els.ranges.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    els.ranges.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.range = btn.dataset.range;
    reloadChart();
  });
});

/* --- Data loading & chart render ------------------------------------ */
async function reloadChart() {
  if (!state.holdings.length) {
    chart.data.datasets = [];
    chart.update('none');
    showEmpty(true);
    setHeadline(null);
    renderLegend();
    updateStats(null);
    return;
  }
  const seq = ++state.loadSeq;
  showLoading(true);
  try {
    await Promise.all(
      state.holdings.map((h) => loadSeries(h.symbol, state.range))
    );
    if (seq !== state.loadSeq) return;
    renderChart();
  } catch (e) {
    console.error(e);
  } finally {
    if (seq === state.loadSeq) showLoading(false);
  }
}

async function loadSeries(symbol, range) {
  const key = `${symbol}|${range}`;
  if (state.cache[key]) return state.cache[key];
  const r = await fetch(
    `/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`
  );
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `chart failed for ${symbol}`);
  }
  const data = await r.json();
  state.cache[key] = data.points || [];
  return state.cache[key];
}

function renderChart() {
  if (!state.holdings.length) return;
  const range = state.range;
  const seriesByHolding = state.holdings.map((h) => ({
    holding: h,
    points: state.cache[`${h.symbol}|${range}`] || [],
  }));

  // Per-holding return series (% from first point) — only for toggled-on holdings
  const datasets = seriesByHolding
    .filter((s) => s.holding.visible && s.points.length > 1)
    .map((s) => {
      const base = s.points[0].c;
      return {
        label: s.holding.symbol,
        borderColor: s.holding.color,
        backgroundColor: s.holding.color + '22',
        data: s.points.map((p) => ({ x: p.t, y: ((p.c - base) / base) * 100 })),
        borderWidth: 1.5,
        order: 2,
        fill: false,
      };
    });

  // Portfolio weighted return: align by common timestamps
  const portfolio = buildPortfolioSeries(seriesByHolding);
  if (portfolio.length > 1) {
    const portColor = '#e6e8ee';
    datasets.unshift({
      label: 'Portfolio',
      borderColor: portColor,
      backgroundColor: 'rgba(124, 92, 255, 0.12)',
      data: portfolio,
      borderWidth: 2.5,
      order: 1,
      fill: {
        target: 'origin',
        above: 'rgba(41, 211, 145, 0.08)',
        below: 'rgba(255, 85, 119, 0.08)',
      },
    });
  }

  chart.data.datasets = datasets;
  chart.update('none');
  showEmpty(portfolio.length < 2 && datasets.length === 0);

  const final = portfolio.length ? portfolio[portfolio.length - 1].y : null;
  setHeadline(final, portfolio);
  renderLegend();
  updateStats(portfolio);
}

function buildPortfolioSeries(seriesByHolding) {
  // Daily-rebalanced portfolio: at each timestamp the portfolio return is the
  // weighted sum of the period-over-period returns of stocks that have data
  // at *both* this step and the previous one, with weights normalized over
  // the available subset. This makes the chart "just work" when a stock IPO'd
  // inside the window — earlier dates simply use the subset of stocks present.
  const usable = seriesByHolding.filter(
    (s) => s.points.length > 1 && (Number(s.holding.weight) || 0) > 0
  );
  if (!usable.length) return [];

  // Union of timestamps, sorted ascending
  const tSet = new Set();
  usable.forEach((s) => s.points.forEach((p) => tSet.add(p.t)));
  const ts = Array.from(tSet).sort((a, b) => a - b);

  // Per-series price-or-null aligned to `ts` (no forward-fill: a missing slot
  // genuinely means no data, e.g. before IPO).
  const series = usable.map((s) => {
    const map = new Map(s.points.map((p) => [p.t, p.c]));
    return {
      prices: ts.map((t) => (map.has(t) ? map.get(t) : null)),
      weight: Number(s.holding.weight) || 0,
    };
  });

  // Find first index where at least one series has data — start there.
  let startIdx = ts.length;
  for (let i = 0; i < ts.length; i++) {
    if (series.some((s) => s.prices[i] != null)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx >= ts.length) return [];

  // Iterate forward, computing weighted period returns.
  // For each pair (i-1 -> i), include only series with non-null prices at both.
  let cumulative = 1;
  const portfolio = [{ x: ts[startIdx], y: 0 }];
  for (let i = startIdx + 1; i < ts.length; i++) {
    let weightedRet = 0;
    let usedW = 0;
    for (const s of series) {
      const p0 = s.prices[i - 1];
      const p1 = s.prices[i];
      if (p0 == null || p1 == null || p0 === 0) continue;
      weightedRet += s.weight * (p1 / p0 - 1);
      usedW += s.weight;
    }
    if (usedW > 0) {
      cumulative *= 1 + weightedRet / usedW;
    }
    portfolio.push({ x: ts[i], y: (cumulative - 1) * 100 });
  }
  return portfolio;
}

function setHeadline(finalReturn, portfolio) {
  if (finalReturn == null) {
    els.chartReturn.textContent = '—';
    els.chartReturn.className = 'chart-return';
    els.chartReturnSub.textContent = state.holdings.length
      ? 'Loading…'
      : 'Add holdings to begin';
    els.mainSubtitle.textContent = 'Build a portfolio to see returns';
    return;
  }
  const sign = finalReturn >= 0 ? '+' : '';
  els.chartReturn.textContent = `${sign}${finalReturn.toFixed(2)}%`;
  els.chartReturn.className =
    'chart-return ' + (finalReturn >= 0 ? 'pos' : 'neg');

  const start = portfolio[0]?.x ? new Date(portfolio[0].x) : null;
  const end = portfolio[portfolio.length - 1]?.x
    ? new Date(portfolio[portfolio.length - 1].x)
    : null;
  const fmt = (d) =>
    d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  els.chartReturnSub.textContent =
    start && end ? `${fmt(start)} → ${fmt(end)}` : '';

  const rangeLabel = els.ranges.querySelector('button.active')?.textContent || '';
  els.mainSubtitle.textContent = `${state.holdings.length} holding${state.holdings.length === 1 ? '' : 's'} • ${rangeLabel} window`;
}

function renderLegend() {
  els.legend.innerHTML = '';
  if (!state.holdings.length) return;
  const items = [
    { label: 'Portfolio', color: '#e6e8ee' },
    ...state.holdings
      .filter((h) => h.visible)
      .map((h) => ({ label: h.symbol, color: h.color })),
  ];
  for (const it of items) {
    const el = document.createElement('div');
    el.className = 'legend-item';
    el.innerHTML = `<span class="legend-dot" style="background:${it.color}"></span>${escapeHtml(it.label)}`;
    els.legend.appendChild(el);
  }
}

function updateStats(portfolio) {
  if (!portfolio || portfolio.length < 2) {
    els.statReturn.textContent = '—';
    els.statReturn.className = 'stat-value';
    els.statAnnual.textContent = '—';
    els.statAnnual.className = 'stat-value';
    els.statDrawdown.textContent = '—';
    els.statDrawdown.className = 'stat-value';
    return;
  }
  const totalPct = portfolio[portfolio.length - 1].y;
  els.statReturn.textContent = `${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(2)}%`;
  els.statReturn.className = 'stat-value ' + (totalPct >= 0 ? 'pos' : 'neg');

  // Annualized
  const days =
    (portfolio[portfolio.length - 1].x - portfolio[0].x) / (1000 * 60 * 60 * 24);
  const years = days / 365.25;
  if (years > 0.05) {
    const annual = (Math.pow(1 + totalPct / 100, 1 / years) - 1) * 100;
    els.statAnnual.textContent = `${annual >= 0 ? '+' : ''}${annual.toFixed(2)}%`;
    els.statAnnual.className = 'stat-value ' + (annual >= 0 ? 'pos' : 'neg');
  } else {
    els.statAnnual.textContent = '—';
    els.statAnnual.className = 'stat-value';
  }

  // Max drawdown on cumulative return
  let peak = portfolio[0].y;
  let maxDd = 0;
  for (const p of portfolio) {
    if (p.y > peak) peak = p.y;
    // drawdown in terms of equity (1 + r/100)
    const peakEq = 1 + peak / 100;
    const curEq = 1 + p.y / 100;
    const dd = (curEq - peakEq) / peakEq;
    if (dd < maxDd) maxDd = dd;
  }
  els.statDrawdown.textContent = `${(maxDd * 100).toFixed(2)}%`;
  els.statDrawdown.className = 'stat-value neg';
}

function showEmpty(empty) {
  els.chartEmpty.classList.toggle('hidden', !empty);
}

function showLoading(on) {
  els.chartLoading.classList.toggle('hidden', !on);
}

/* --- Saved portfolios (server-backed, localStorage fallback) -------- */
const LS_KEY = 'portfolioViz.portfolios.v1';
let useLocalFallback = false;

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state.saved));
  } catch {}
}

async function fetchPortfolios() {
  try {
    const r = await fetch('/api/portfolios');
    if (!r.ok) throw new Error('failed');
    const data = await r.json();
    state.saved = data.portfolios || [];
    useLocalFallback = false;
  } catch (e) {
    console.warn('portfolio API unavailable, using localStorage', e);
    useLocalFallback = true;
    state.saved = readLocal();
  }
}

function serializeHoldings() {
  return state.holdings.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    weight: h.weight,
    color: h.color,
    visible: h.visible,
    group: h.group || '',
  }));
}

async function saveCurrentPortfolio() {
  if (!state.holdings.length) {
    alert('Add at least one holding before saving.');
    return;
  }
  const defaultName =
    state.holdings.map((h) => h.symbol).slice(0, 3).join(' / ') +
    (state.holdings.length > 3 ? ` +${state.holdings.length - 3}` : '');
  const name = window.prompt('Name this portfolio', defaultName);
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const localSnapshot = {
    id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: trimmed,
    holdings: serializeHoldings(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (useLocalFallback) {
    state.saved.unshift(localSnapshot);
    state.activeId = localSnapshot.id;
    writeLocal();
    renderSaved();
    return;
  }
  try {
    const r = await fetch('/api/portfolios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, holdings: serializeHoldings() }),
    });
    if (!r.ok) throw new Error('save failed');
    const data = await r.json();
    state.saved.unshift(data.portfolio);
    state.activeId = data.portfolio.id;
    renderSaved();
  } catch (e) {
    // Fall back to local on first failure.
    useLocalFallback = true;
    state.saved.unshift(localSnapshot);
    state.activeId = localSnapshot.id;
    writeLocal();
    renderSaved();
  }
}

function loadPortfolio(id) {
  const p = state.saved.find((s) => s.id === id);
  if (!p) return;
  state.holdings = p.holdings.map((h, i) => ({
    symbol: h.symbol,
    name: h.name,
    weight: Number(h.weight) || 0,
    color: h.color || COLORS[i % COLORS.length],
    visible: !!h.visible,
    group: h.group || '',
  }));
  state.activeId = id;
  state.cache = {};
  renderSaved();
  renderHoldings();
  reloadChart();
}

async function renamePortfolio(id) {
  const p = state.saved.find((s) => s.id === id);
  if (!p) return;
  const name = window.prompt('Rename portfolio', p.name);
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if (useLocalFallback) {
    p.name = trimmed;
    p.updatedAt = Date.now();
    writeLocal();
    renderSaved();
    return;
  }
  try {
    const r = await fetch(`/api/portfolios/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!r.ok) throw new Error('rename failed');
    const data = await r.json();
    Object.assign(p, data.portfolio);
    renderSaved();
  } catch (e) {
    alert('Rename failed: ' + e.message);
  }
}

async function deletePortfolio(id) {
  const p = state.saved.find((s) => s.id === id);
  if (!p) return;
  if (!window.confirm(`Delete "${p.name}"?`)) return;
  if (useLocalFallback) {
    state.saved = state.saved.filter((s) => s.id !== id);
    if (state.activeId === id) state.activeId = null;
    writeLocal();
    renderSaved();
    return;
  }
  try {
    const r = await fetch(`/api/portfolios/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!r.ok) throw new Error('delete failed');
    state.saved = state.saved.filter((s) => s.id !== id);
    if (state.activeId === id) state.activeId = null;
    renderSaved();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

function renderSaved() {
  els.saved.innerHTML = '';
  if (!state.saved.length) {
    els.saved.classList.add('empty');
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No saved portfolios.';
    els.saved.appendChild(empty);
    return;
  }
  els.saved.classList.remove('empty');
  for (const p of state.saved) {
    const row = document.createElement('div');
    row.className = 'saved-item' + (p.id === state.activeId ? ' active' : '');
    const count = p.holdings.length;
    row.innerHTML = `
      <div class="saved-item-info">
        <div class="saved-item-name">${escapeHtml(p.name)}</div>
        <div class="saved-item-meta">${count} holding${count === 1 ? '' : 's'}</div>
      </div>
      <div class="saved-actions">
        <button class="saved-action-btn" data-act="rename" title="Rename">✎</button>
        <button class="saved-action-btn danger" data-act="delete" title="Delete">×</button>
      </div>
    `;
    row.addEventListener('click', (e) => {
      const btn = e.target.closest('.saved-action-btn');
      if (btn) {
        e.stopPropagation();
        if (btn.dataset.act === 'rename') renamePortfolio(p.id);
        else if (btn.dataset.act === 'delete') deletePortfolio(p.id);
        return;
      }
      loadPortfolio(p.id);
    });
    els.saved.appendChild(row);
  }
}

els.saveBtn.addEventListener('click', saveCurrentPortfolio);

/* --- Boot ----------------------------------------------------------- */
(async function boot() {
  await fetchPortfolios();
  renderSaved();
  state.holdings = [
    { symbol: 'AAPL', name: 'Apple Inc.', weight: 50, color: COLORS[0], visible: false, group: '' },
    { symbol: 'MSFT', name: 'Microsoft Corp.', weight: 50, color: COLORS[1], visible: false, group: '' },
  ];
  renderHoldings();
  reloadChart();
})();
