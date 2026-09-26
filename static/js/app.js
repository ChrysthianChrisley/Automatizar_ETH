/**
 * Binance Market Terminal - Main Application Orchestrator
 * Coordinates modules: state, utils, indicators, chart, orderbook, tapereading, whales, and websocket.
 */

// Application Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  initDOMElements();
  initChart();
  setupEventListeners();
  loadSymbolData(currentSymbol, currentInterval);
  startClock();
  setupLiveReload();
});

// Setup Clock
function startClock() {
  setInterval(() => {
    const now = new Date();
    if (el.footerClock) {
      el.footerClock.textContent = now.toUTCString().slice(17, 25) + ' UTC';
    }
  }, 1000);
}

// REST Data Fetcher & Initializer
async function loadSymbolData(symbol, interval) {
  showLoading(true);
  updateBaseAssetLabel(symbol);

  try {
    const startTime = performance.now();

    // Parallel fetch: Klines, 24h Ticker, Depth, Recent Trades
    const [klinesRes, tickerRes, depthRes, tradesRes] = await Promise.all([
      fetchBinance(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${CONFIG.candleLimit}`),
      fetchBinance(`/api/v3/ticker/24hr?symbol=${symbol}`),
      fetchBinance(`/api/v3/depth?symbol=${symbol}&limit=15`),
      fetchBinance(`/api/v3/trades?symbol=${symbol}&limit=25`),
    ]);

    const latency = Math.round(performance.now() - startTime);
    if (el.footerPing) {
      el.footerPing.textContent = `Latência: ${latency}ms`;
    }

    if (!klinesRes.ok || !tickerRes.ok) {
      throw new Error('Falha ao comunicar com os servidores da Binance.');
    }

    const klinesData = await klinesRes.json();
    const tickerData = await tickerRes.json();
    const depthData = await depthRes.json();
    const tradesData = await tradesRes.json();

    // Process Historical Candles
    processAndRenderCandles(klinesData);

    // Process 24h Stats
    renderTicker24h(tickerData);

    // Process Orderbook
    renderOrderBook(depthData);

    // Process Recent Trades
    renderTrades(tradesData);

    // Connect WebSocket for Real-time Streaming
    connectWebSocket(symbol, interval);

  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    alert('Erro ao carregar dados da Binance API: ' + error.message);
  } finally {
    showLoading(false);
  }
}

// Render Recent Trades (from REST initial fetch)
function renderTrades(trades) {
  if (!el.tradesList) return;
  el.tradesList.innerHTML = '';
  const sorted = trades.slice().reverse();
  sorted.forEach(t => {
    const price = parseFloat(t.price);
    const qty = parseFloat(t.qty);
    const time = new Date(t.time).toLocaleTimeString();
    const tradeType = t.isBuyerMaker ? 'sell' : 'buy';

    const row = document.createElement('div');
    row.className = `trade-row ${tradeType}`;
    row.innerHTML = `
      <span>${formatPrice(price)}</span>
      <span>${qty.toFixed(4)}</span>
      <span class="trade-time">${time}</span>
    `;
    el.tradesList.appendChild(row);
  });

  // Seed Tape Reading with initial REST trades if empty
  if (tapeState.recentTrades.length === 0 && trades.length > 0) {
    seedTapeFromRest(trades);
  }
}

// Render 24h Ticker Stats
function renderTicker24h(data) {
  const price = parseFloat(data.lastPrice || data.c || 0);
  const changeVal = parseFloat(data.priceChange || data.p || 0);
  const changePct = parseFloat(data.priceChangePercent || data.P || 0);
  const high = parseFloat(data.highPrice || data.h || 0);
  const low = parseFloat(data.lowPrice || data.l || 0);
  const volBase = parseFloat(data.volume || data.v || 0);
  const volQuote = parseFloat(data.quoteVolume || data.q || 0);
  const vwap = parseFloat(data.weightedAvgPrice || data.w || 0);

  updateLivePrice(price);

  // Change value & percent
  const sign = changeVal >= 0 ? '+' : '';
  if (el.changeVal) el.changeVal.textContent = `${sign}${formatPrice(changeVal)}`;
  if (el.changePercentBadge) {
    el.changePercentBadge.textContent = `${sign}${changePct.toFixed(2)}%`;
    el.changePercentBadge.className = `badge ${changeVal >= 0 ? 'green' : 'red'}`;
  }

  // High & Low
  if (el.high24h) el.high24h.textContent = formatPrice(high);
  if (el.low24h) el.low24h.textContent = formatPrice(low);

  // Volume
  if (el.volBase24h) el.volBase24h.textContent = formatCompactNumber(volBase);
  if (el.volQuote24h) el.volQuote24h.textContent = '$' + formatCompactNumber(volQuote);

  if (vwap && el.cardVwap) {
    el.cardVwap.textContent = formatPrice(vwap);
  }

  // Range 24h bar
  if (high > low && el.rangePercent && el.rangeBarFill) {
    const rangePos = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
    el.rangePercent.textContent = `${rangePos.toFixed(0)}%`;
    el.rangeBarFill.style.width = `${rangePos}%`;
  }
}

// User Event Listeners Setup
function setupEventListeners() {
  // Symbol Switcher Tabs
  const symbolTabs = document.getElementById('symbolTabs');
  if (symbolTabs) {
    symbolTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.symbol-btn');
      if (!btn || btn.classList.contains('active')) return;

      symbolTabs.querySelectorAll('.symbol-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentSymbol = btn.dataset.symbol;
      resetTapeStats();
      loadSymbolData(currentSymbol, currentInterval);
    });
  }

  // Interval Switcher
  const intervalSelector = document.getElementById('intervalSelector');
  if (intervalSelector) {
    intervalSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.interval-btn');
      if (!btn || btn.classList.contains('active')) return;

      intervalSelector.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentInterval = btn.dataset.interval;
      loadSymbolData(currentSymbol, currentInterval);
    });
  }

  // Indicator Toggles
  const toggleEma20 = document.getElementById('toggleEma20');
  if (toggleEma20) {
    toggleEma20.addEventListener('click', function () {
      showEma20 = !showEma20;
      this.classList.toggle('active', showEma20);
      updateIndicatorsData();
    });
  }

  const toggleEma50 = document.getElementById('toggleEma50');
  if (toggleEma50) {
    toggleEma50.addEventListener('click', function () {
      showEma50 = !showEma50;
      this.classList.toggle('active', showEma50);
      updateIndicatorsData();
    });
  }

  const toggleBands = document.getElementById('toggleBands');
  if (toggleBands) {
    toggleBands.addEventListener('click', function () {
      showBands = !showBands;
      this.classList.toggle('active', showBands);
      updateIndicatorsData();
    });
  }

  const toggleRsi = document.getElementById('toggleRsi');
  if (toggleRsi) {
    toggleRsi.addEventListener('click', function () {
      showRsi = !showRsi;
      this.classList.toggle('active', showRsi);
      if (el.legendRsi) el.legendRsi.style.display = showRsi ? 'inline' : 'none';
    });
  }

  // Side Panel Tabs (Orderbook, Trades, Whales, Analytics)
  const sideTabs = document.querySelectorAll('.side-tab');
  sideTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sideTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const paneId = tab.dataset.tab === 'orderbook' ? 'paneOrderBook'
        : tab.dataset.tab === 'trades' ? 'paneTrades'
        : tab.dataset.tab === 'whales' ? 'paneWhales'
        : 'paneAnalytics';
      const targetPane = document.getElementById(paneId);
      if (targetPane) targetPane.classList.add('active');

      if (tab.dataset.tab === 'whales' && rawWhalesData.length === 0) {
        loadWhalesData();
      }
    });
  });

  // Whale Subview Switcher (Holders vs Live Orders)
  if (el.subviewHolders && el.subviewOrders) {
    el.subviewHolders.addEventListener('click', () => {
      el.subviewHolders.classList.add('active');
      el.subviewOrders.classList.remove('active');
      el.contentWhaleHolders.style.display = 'flex';
      el.contentWhaleOrders.style.display = 'none';
    });
    el.subviewOrders.addEventListener('click', () => {
      el.subviewOrders.classList.add('active');
      el.subviewHolders.classList.remove('active');
      el.contentWhaleOrders.style.display = 'flex';
      el.contentWhaleHolders.style.display = 'none';
    });
  }

  // Whale Refresh Button
  if (el.btnRefreshWhales) {
    el.btnRefreshWhales.addEventListener('click', () => {
      loadWhalesData(true);
    });
  }

  // Whale Category Filter Pills
  if (el.whaleCategoryFilters) {
    el.whaleCategoryFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-pill');
      if (!btn) return;
      el.whaleCategoryFilters.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentWhaleCategory = btn.dataset.cat;
      renderWhalesList();
    });
  }

  // Whale Search Input
  if (el.whaleSearchInput) {
    el.whaleSearchInput.addEventListener('input', (e) => {
      whaleSearchQuery = e.target.value.toLowerCase().trim();
      renderWhalesList();
    });
  }

  // Whale Only Checkbox in Trades
  if (el.toggleWhalesOnly) {
    el.toggleWhalesOnly.addEventListener('change', () => {
      if (el.tradesList) el.tradesList.innerHTML = '';
    });
  }

  // Refresh Button
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadSymbolData(currentSymbol, currentInterval);
    });
  }

  // Export CSV Button
  const btnExportCSV = document.getElementById('btnExportCSV');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', exportToCSV);
  }

  // View Switcher (Chart vs Expanded Live Tape)
  if (el.btnViewChart && el.btnViewTape) {
    el.btnViewChart.addEventListener('click', () => setMainView('chart'));
    el.btnViewTape.addEventListener('click', () => setMainView('tape'));
  }

  // Pause / Resume Tape
  if (el.btnPauseTape) {
    el.btnPauseTape.addEventListener('click', togglePauseTape);
  }

  // Clear Tape
  if (el.btnClearTape) {
    el.btnClearTape.addEventListener('click', clearTape);
  }

  // Tape Size Filters
  if (el.tapeSizeFilters) {
    el.tapeSizeFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.tape-pill');
      if (!btn) return;
      el.tapeSizeFilters.querySelectorAll('.tape-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tapeState.sizeFilter = btn.dataset.size;
      renderFilteredTapeList();
    });
  }

  // Tape Side Filters
  if (el.tapeSideFilters) {
    el.tapeSideFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.tape-pill');
      if (!btn) return;
      el.tapeSideFilters.querySelectorAll('.tape-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tapeState.sideFilter = btn.dataset.side;
      renderFilteredTapeList();
    });
  }
}
