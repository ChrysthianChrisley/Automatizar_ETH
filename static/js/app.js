/**
 * Binance Market Terminal - Realtime & Historical Engine
 * Connects directly to Binance Public Spot REST API & WebSockets.
 */

// Configuration & State
const CONFIG = {
  restBaseUrl: 'https://api.binance.com',
  restFallbackUrl: 'https://data-api.binance.vision',
  wsBaseUrl: 'wss://stream.binance.com:9443/stream?streams=',
  defaultSymbol: 'ETHUSDT',
  defaultInterval: '15m',
  candleLimit: 500,
};

let currentSymbol = CONFIG.defaultSymbol;
let currentInterval = CONFIG.defaultInterval;
let activeWs = null;
let lastPrice = 0;
let historicalCandles = [];
let tvChart = null;
let candleSeries = null;
let volumeSeries = null;
let ema20Series = null;
let ema50Series = null;
let upperBandSeries = null;
let lowerBandSeries = null;

let showEma20 = true;
let showEma50 = true;
let showRsi = false;
let showBands = false;

// DOM Elements
const el = {
  livePrice: document.getElementById('livePrice'),
  priceCurrency: document.getElementById('priceCurrency'),
  priceChange24h: document.getElementById('priceChange24h'),
  changeVal: document.getElementById('changeVal'),
  changePercentBadge: document.getElementById('changePercentBadge'),
  high24h: document.getElementById('high24h'),
  low24h: document.getElementById('low24h'),
  volBase24h: document.getElementById('volBase24h'),
  volQuote24h: document.getElementById('volQuote24h'),
  baseAssetLabel: document.getElementById('baseAssetLabel'),
  rangePercent: document.getElementById('rangePercent'),
  rangeBarFill: document.getElementById('rangeBarFill'),
  chartLoader: document.getElementById('chartLoader'),
  tvChartContainer: document.getElementById('tvChartContainer'),
  asksList: document.getElementById('asksList'),
  bidsList: document.getElementById('bidsList'),
  spreadPrice: document.getElementById('spreadPrice'),
  spreadValue: document.getElementById('spreadValue'),
  spreadArrow: document.getElementById('spreadArrow'),
  bidsRatio: document.getElementById('bidsRatio'),
  asksRatio: document.getElementById('asksRatio'),
  tradesList: document.getElementById('tradesList'),
  wsStatus: document.getElementById('wsStatus'),
  wsStatusText: document.getElementById('wsStatusText'),
  footerClock: document.getElementById('footerClock'),
  footerPing: document.getElementById('footerPing'),
  // Stats
  statCandlesCount: document.getElementById('statCandlesCount'),
  statOpen: document.getElementById('statOpen'),
  statHigh: document.getElementById('statHigh'),
  statLow: document.getElementById('statLow'),
  statClose: document.getElementById('statClose'),
  statLastUpdate: document.getElementById('statLastUpdate'),
  // Indicators Legend
  valEma20: document.getElementById('valEma20'),
  valEma50: document.getElementById('valEma50'),
  valRsi: document.getElementById('valRsi'),
  legendRsi: document.getElementById('legendRsi'),
  // Analytics Card
  cardRsi: document.getElementById('cardRsi'),
  cardEma20: document.getElementById('cardEma20'),
  cardEma50: document.getElementById('cardEma50'),
  cardTrendBadge: document.getElementById('cardTrendBadge'),
  cardVwap: document.getElementById('cardVwap'),
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  setupEventListeners();
  loadSymbolData(currentSymbol, currentInterval);
  startClock();
});

// Setup Clock
function startClock() {
  setInterval(() => {
    const now = new Date();
    el.footerClock.textContent = now.toUTCString().slice(17, 25) + ' UTC';
  }, 1000);
}

// 1. CHART INITIALIZATION (TradingView Lightweight Charts)
function initChart() {
  const container = el.tvChartContainer;
  container.innerHTML = ''; // clear

  tvChart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: { color: '#0b0e14' },
      textColor: '#848e9c',
      fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
    },
    grid: {
      vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
      horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: '#f0b90b',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
        labelBackgroundColor: '#1f273b',
      },
      horzLine: {
        color: '#f0b90b',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
        labelBackgroundColor: '#1f273b',
      },
    },
    rightPriceScale: {
      borderColor: 'rgba(255, 255, 255, 0.08)',
      scaleMargins: {
        top: 0.1,
        bottom: 0.22, // Space for volume
      },
    },
    timeScale: {
      borderColor: 'rgba(255, 255, 255, 0.08)',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  // Candlestick Series
  candleSeries = tvChart.addCandlestickSeries({
    upColor: '#0ecb81',
    downColor: '#f6465d',
    borderVisible: false,
    wickUpColor: '#0ecb81',
    wickDownColor: '#f6465d',
  });

  // Volume Series
  volumeSeries = tvChart.addHistogramSeries({
    color: '#26a69a',
    priceFormat: {
      type: 'volume',
    },
    priceScaleId: '', // overlay
    scaleMargins: {
      top: 0.8,
      bottom: 0,
    },
  });

  // EMA 20 (Yellow)
  ema20Series = tvChart.addLineSeries({
    color: '#f0b90b',
    lineWidth: 2,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  });

  // EMA 50 (Cyan)
  ema50Series = tvChart.addLineSeries({
    color: '#00d2ff',
    lineWidth: 2,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  });

  // Bollinger Bands
  upperBandSeries = tvChart.addLineSeries({
    color: 'rgba(153, 69, 255, 0.6)',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  });
  lowerBandSeries = tvChart.addLineSeries({
    color: 'rgba(153, 69, 255, 0.6)',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  });

  // Handle Resize
  window.addEventListener('resize', () => {
    if (tvChart && container) {
      tvChart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    }
  });

  // Crosshair move listener for footer stats
  tvChart.subscribeCrosshairMove((param) => {
    if (!param || !param.time || !param.seriesPrices) {
      return;
    }
    const candleData = param.seriesPrices.get(candleSeries);
    if (candleData) {
      el.statOpen.textContent = formatPrice(candleData.open);
      el.statHigh.textContent = formatPrice(candleData.high);
      el.statLow.textContent = formatPrice(candleData.low);
      el.statClose.textContent = formatPrice(candleData.close);
    }
  });
}

// Helper to fetch with fallback
async function fetchBinance(endpoint) {
  try {
    const res = await fetch(`${CONFIG.restBaseUrl}${endpoint}`);
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn(`Tentando fallback para ${endpoint}...`, err);
    return fetch(`${CONFIG.restFallbackUrl}${endpoint}`);
  }
}

// 2. DATA FETCHER (REST API)
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
    el.footerPing.textContent = `Latência: ${latency}ms`;

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

// 3. PROCESS HISTORICAL CANDLES & INDICATORS
function processAndRenderCandles(rawKlines) {
  historicalCandles = rawKlines.map(k => ({
    time: Math.floor(k[0] / 1000), // convert ms to seconds
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }));

  // Ensure strictly ascending and deduplicated by time for TradingView Lightweight Charts
  const candleMap = new Map();
  historicalCandles.forEach(c => candleMap.set(c.time, c));
  const sortedUnique = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
  historicalCandles = sortedUnique;

  const candleChartData = historicalCandles.map(c => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));

  const volumeChartData = historicalCandles.map(c => ({
    time: c.time,
    value: c.volume,
    color: c.close >= c.open ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)',
  }));

  candleSeries.setData(candleChartData);
  volumeSeries.setData(volumeChartData);

  // Compute and Render Indicators
  updateIndicatorsData();

  // Update Footer Stats with latest candle
  if (historicalCandles.length > 0) {
    const last = historicalCandles[historicalCandles.length - 1];
    el.statCandlesCount.textContent = historicalCandles.length;
    el.statOpen.textContent = formatPrice(last.open);
    el.statHigh.textContent = formatPrice(last.high);
    el.statLow.textContent = formatPrice(last.low);
    el.statClose.textContent = formatPrice(last.close);
    el.statLastUpdate.textContent = new Date(last.closeTime).toLocaleTimeString();
  }

  tvChart.timeScale().fitContent();
}

// Compute Technical Indicators
function updateIndicatorsData() {
  const closes = historicalCandles.map(c => c.close);
  const times = historicalCandles.map(c => c.time);

  // EMA 20
  if (showEma20) {
    const ema20 = calculateEMA(closes, 20);
    const ema20Data = times.map((t, i) => ({ time: t, value: ema20[i] })).filter(d => !isNaN(d.value));
    ema20Series.setData(ema20Data);
    const lastEma20 = ema20[ema20.length - 1];
    el.valEma20.textContent = formatPrice(lastEma20);
    el.cardEma20.textContent = formatPrice(lastEma20);
  } else {
    ema20Series.setData([]);
    el.valEma20.textContent = 'Off';
  }

  // EMA 50
  if (showEma50) {
    const ema50 = calculateEMA(closes, 50);
    const ema50Data = times.map((t, i) => ({ time: t, value: ema50[i] })).filter(d => !isNaN(d.value));
    ema50Series.setData(ema50Data);
    const lastEma50 = ema50[ema50.length - 1];
    el.valEma50.textContent = formatPrice(lastEma50);
    el.cardEma50.textContent = formatPrice(lastEma50);

    // Trend Evaluation
    const lastPriceVal = closes[closes.length - 1];
    if (lastPriceVal > lastEma50) {
      el.cardTrendBadge.textContent = 'Bullish (Acima EMA 50)';
      el.cardTrendBadge.className = 'badge green';
    } else {
      el.cardTrendBadge.textContent = 'Bearish (Abaixo EMA 50)';
      el.cardTrendBadge.className = 'badge red';
    }
  } else {
    ema50Series.setData([]);
    el.valEma50.textContent = 'Off';
  }

  // Bollinger Bands (20 periods, 2 std dev)
  if (showBands) {
    const { upper, lower } = calculateBollingerBands(closes, 20, 2);
    const upperData = times.map((t, i) => ({ time: t, value: upper[i] })).filter(d => !isNaN(d.value));
    const lowerData = times.map((t, i) => ({ time: t, value: lower[i] })).filter(d => !isNaN(d.value));
    upperBandSeries.setData(upperData);
    lowerBandSeries.setData(lowerData);
  } else {
    upperBandSeries.setData([]);
    lowerBandSeries.setData([]);
  }

  // RSI 14
  const rsiValues = calculateRSI(closes, 14);
  const currentRsi = rsiValues[rsiValues.length - 1] || 50;
  el.valRsi.textContent = currentRsi.toFixed(1);
  el.cardRsi.textContent = currentRsi.toFixed(1);
  if (currentRsi >= 70) {
    el.cardRsi.className = 'font-mono font-bold red';
  } else if (currentRsi <= 30) {
    el.cardRsi.className = 'font-mono font-bold green';
  } else {
    el.cardRsi.className = 'font-mono font-bold';
  }
}

// 4. WEBSOCKET REALTIME STREAMING
function connectWebSocket(symbol, interval) {
  if (activeWs) {
    activeWs.close();
  }

  const s = symbol.toLowerCase();
  // Combined streams: kline, trade, depth, and 24h ticker
  const streams = `${s}@kline_${interval}/${s}@trade/${s}@depth20@100ms/${s}@ticker`;
  const wsUrl = `${CONFIG.wsBaseUrl}${streams}`;

  setWsStatus('Conectando...', 'connecting');
  activeWs = new WebSocket(wsUrl);

  activeWs.onopen = () => {
    setWsStatus('WebSocket Conectado', 'connected');
  };

  activeWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      const stream = msg.stream;
      const data = msg.data;

      if (!stream || !data) return;

      if (stream.includes('@kline')) {
        handleRealtimeKline(data.k);
      } else if (stream.includes('@trade')) {
        handleRealtimeTrade(data);
      } else if (stream.includes('@depth')) {
        renderOrderBook(data);
      } else if (stream.includes('@ticker')) {
        renderTicker24h(data);
      }
    } catch (err) {
      console.error('WS parse error:', err);
    }
  };

  activeWs.onerror = (err) => {
    console.warn('WS error:', err);
    setWsStatus('Erro de Conexão', 'error');
  };

  activeWs.onclose = () => {
    setWsStatus('Desconectado (Reconectando...)', 'disconnected');
    // Auto-reconnect after 3 seconds
    setTimeout(() => {
      if (currentSymbol === symbol) {
        connectWebSocket(symbol, interval);
      }
    }, 3000);
  };
}

// Handle Real-time Candle Tick
function handleRealtimeKline(k) {
  const candleTime = Math.floor(k.t / 1000);
  const open = parseFloat(k.o);
  const high = parseFloat(k.h);
  const low = parseFloat(k.l);
  const close = parseFloat(k.c);
  const volume = parseFloat(k.v);

  // Update Candlestick series
  candleSeries.update({
    time: candleTime,
    open: open,
    high: high,
    low: low,
    close: close,
  });

  // Update Volume series
  volumeSeries.update({
    time: candleTime,
    value: volume,
    color: close >= open ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)',
  });

  // Update Live Price Flash
  updateLivePrice(close);

  // If candle closed, add to historical list and recalculate indicators
  if (k.x) {
    historicalCandles.push({
      time: candleTime,
      open, high, low, close, volume,
      closeTime: k.T,
    });
    if (historicalCandles.length > CONFIG.candleLimit) {
      historicalCandles.shift();
    }
    updateIndicatorsData();
  }
}

// Handle Real-time Trade
function handleRealtimeTrade(trade) {
  const price = parseFloat(trade.p);
  const qty = parseFloat(trade.q);
  const time = new Date(trade.T).toLocaleTimeString();
  const isBuyerMaker = trade.m; // true = sell taker, false = buy taker
  const tradeType = isBuyerMaker ? 'sell' : 'buy';

  const row = document.createElement('div');
  row.className = `trade-row ${tradeType}`;
  row.innerHTML = `
    <span>${formatPrice(price)}</span>
    <span>${qty.toFixed(4)}</span>
    <span class="trade-time">${time}</span>
  `;

  el.tradesList.prepend(row);

  // Limit list to 30 rows
  if (el.tradesList.children.length > 30) {
    el.tradesList.removeChild(el.tradesList.lastChild);
  }
}

// Render Order Book Depth (Top 15 Asks & Bids)
function renderOrderBook(depth) {
  const rawAsks = depth.asks || depth.a || [];
  const rawBids = depth.bids || depth.b || [];

  const asks = rawAsks.slice(0, 12).reverse(); // lowest ask at bottom
  const bids = rawBids.slice(0, 12); // highest bid at top

  // Calculate totals and max for depth bars
  let askTotal = 0;
  const asksProcessed = asks.map(a => {
    const p = parseFloat(a[0]);
    const q = parseFloat(a[1]);
    askTotal += q;
    return { price: p, qty: q, total: askTotal };
  });

  let bidTotal = 0;
  const bidsProcessed = bids.map(b => {
    const p = parseFloat(b[0]);
    const q = parseFloat(b[1]);
    bidTotal += q;
    return { price: p, qty: q, total: bidTotal };
  });

  const maxTotal = Math.max(askTotal, bidTotal) || 1;

  // Render Asks
  el.asksList.innerHTML = asksProcessed.map(item => {
    const depthPct = Math.min(100, (item.total / maxTotal) * 100);
    return `
      <div class="ob-row">
        <div class="ob-depth-bar" style="width: ${depthPct}%"></div>
        <span>${formatPrice(item.price)}</span>
        <span>${item.qty.toFixed(4)}</span>
        <span>${item.total.toFixed(3)}</span>
      </div>
    `;
  }).join('');

  // Render Bids
  el.bidsList.innerHTML = bidsProcessed.map(item => {
    const depthPct = Math.min(100, (item.total / maxTotal) * 100);
    return `
      <div class="ob-row">
        <div class="ob-depth-bar" style="width: ${depthPct}%"></div>
        <span>${formatPrice(item.price)}</span>
        <span>${item.qty.toFixed(4)}</span>
        <span>${item.total.toFixed(3)}</span>
      </div>
    `;
  }).join('');

  // Calculate Spread
  if (asksProcessed.length > 0 && bidsProcessed.length > 0) {
    const bestAsk = asksProcessed[asksProcessed.length - 1].price;
    const bestBid = bidsProcessed[0].price;
    const spread = bestAsk - bestBid;
    const spreadPct = (spread / bestAsk) * 100;

    el.spreadPrice.textContent = formatPrice(bestAsk);
    el.spreadValue.textContent = `${spread.toFixed(2)} (${spreadPct.toFixed(3)}%)`;

    // Depth Volume Ratio
    const totalVolume = bidTotal + askTotal;
    if (totalVolume > 0) {
      const bidPercent = Math.round((bidTotal / totalVolume) * 100);
      const askPercent = 100 - bidPercent;
      el.bidsRatio.style.width = `${bidPercent}%`;
      el.bidsRatio.textContent = `${bidPercent}% Compra`;
      el.asksRatio.style.width = `${askPercent}%`;
      el.asksRatio.textContent = `${askPercent}% Venda`;
    }
  }
}

// Render Recent Trades (from REST initial fetch)
function renderTrades(trades) {
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
}

// Render 24h Ticker Stats
function renderTicker24h(data) {
  // Can be from REST or WS
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
  el.changeVal.textContent = `${sign}${formatPrice(changeVal)}`;
  el.changePercentBadge.textContent = `${sign}${changePct.toFixed(2)}%`;
  el.changePercentBadge.className = `badge ${changeVal >= 0 ? 'green' : 'red'}`;

  // High & Low
  el.high24h.textContent = formatPrice(high);
  el.low24h.textContent = formatPrice(low);

  // Volume
  el.volBase24h.textContent = formatCompactNumber(volBase);
  el.volQuote24h.textContent = '$' + formatCompactNumber(volQuote);

  if (vwap) {
    el.cardVwap.textContent = formatPrice(vwap);
  }

  // Range 24h bar
  if (high > low) {
    const rangePos = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
    el.rangePercent.textContent = `${rangePos.toFixed(0)}%`;
    el.rangeBarFill.style.width = `${rangePos}%`;
  }
}

// Live Price Flash Animation
function updateLivePrice(price) {
  if (!price) return;
  el.livePrice.textContent = formatPrice(price);

  if (lastPrice > 0 && price !== lastPrice) {
    const isUp = price > lastPrice;
    el.livePrice.classList.remove('price-flash-up', 'price-flash-down');
    void el.livePrice.offsetWidth; // trigger reflow
    el.livePrice.classList.add(isUp ? 'price-flash-up' : 'price-flash-down');
  }
  lastPrice = price;
}

// 5. EVENT LISTENERS & USER INTERACTIONS
function setupEventListeners() {
  // Symbol Switcher Tabs
  const symbolTabs = document.getElementById('symbolTabs');
  symbolTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.symbol-btn');
    if (!btn || btn.classList.contains('active')) return;

    symbolTabs.querySelectorAll('.symbol-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentSymbol = btn.dataset.symbol;
    loadSymbolData(currentSymbol, currentInterval);
  });

  // Interval Switcher
  const intervalSelector = document.getElementById('intervalSelector');
  intervalSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.interval-btn');
    if (!btn || btn.classList.contains('active')) return;

    intervalSelector.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentInterval = btn.dataset.interval;
    loadSymbolData(currentSymbol, currentInterval);
  });

  // Indicator Toggles
  document.getElementById('toggleEma20').addEventListener('click', function () {
    showEma20 = !showEma20;
    this.classList.toggle('active', showEma20);
    updateIndicatorsData();
  });

  document.getElementById('toggleEma50').addEventListener('click', function () {
    showEma50 = !showEma50;
    this.classList.toggle('active', showEma50);
    updateIndicatorsData();
  });

  document.getElementById('toggleBands').addEventListener('click', function () {
    showBands = !showBands;
    this.classList.toggle('active', showBands);
    updateIndicatorsData();
  });

  document.getElementById('toggleRsi').addEventListener('click', function () {
    showRsi = !showRsi;
    this.classList.toggle('active', showRsi);
    el.legendRsi.style.display = showRsi ? 'inline' : 'none';
  });

  // Side Panel Tabs (Orderbook, Trades, Analytics)
  const sideTabs = document.querySelectorAll('.side-tab');
  sideTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sideTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const paneId = tab.dataset.tab === 'orderbook' ? 'paneOrderBook'
        : tab.dataset.tab === 'trades' ? 'paneTrades' : 'paneAnalytics';
      document.getElementById(paneId).classList.add('active');
    });
  });

  // Refresh Button
  document.getElementById('btnRefresh').addEventListener('click', () => {
    loadSymbolData(currentSymbol, currentInterval);
  });

  // Export CSV Button
  document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);
}

// 6. CSV EXPORT UTILITY
function exportToCSV() {
  if (!historicalCandles || historicalCandles.length === 0) {
    alert('Nenhum dado histórico carregado para exportar.');
    return;
  }

  const headers = ['Timestamp_UTC', 'DateTime', 'Open', 'High', 'Low', 'Close', 'Volume'];
  const rows = historicalCandles.map(c => [
    c.time * 1000,
    new Date(c.time * 1000).toISOString(),
    c.open,
    c.high,
    c.low,
    c.close,
    c.volume,
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BINANCE_${currentSymbol}_${currentInterval}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 7. TECHNICAL ANALYSIS MATH HELPERS
function calculateEMA(values, period) {
  const k = 2 / (period + 1);
  const ema = new Array(values.length).fill(NaN);
  if (values.length < period) return ema;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  ema[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    ema[i] = values[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calculateBollingerBands(values, period = 20, multiplier = 2) {
  const upper = new Array(values.length).fill(NaN);
  const lower = new Array(values.length).fill(NaN);

  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((acc, val) => acc + val, 0) / period;
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    upper[i] = mean + multiplier * stdDev;
    lower[i] = mean - multiplier * stdDev;
  }

  return { upper, lower };
}

function calculateRSI(values, period = 14) {
  const rsi = new Array(values.length).fill(NaN);
  if (values.length <= period) return rsi;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }

  return rsi;
}

// 8. FORMATTERS & UI HELPERS
function formatPrice(num) {
  if (isNaN(num) || num === null) return '---';
  if (num >= 1000) return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num >= 1) return num.toFixed(2);
  if (num >= 0.0001) return num.toFixed(6);
  return num.toString();
}

function formatCompactNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

function updateBaseAssetLabel(symbol) {
  if (symbol.startsWith('ETH')) el.baseAssetLabel.textContent = 'ETH';
  else if (symbol.startsWith('BTC')) el.baseAssetLabel.textContent = 'BTC';
  else if (symbol.startsWith('SOL')) el.baseAssetLabel.textContent = 'SOL';
  else el.baseAssetLabel.textContent = 'Crypto';

  if (symbol.endsWith('BTC')) el.priceCurrency.textContent = 'BTC';
  else el.priceCurrency.textContent = 'USDT';
}

function setWsStatus(text, status) {
  el.wsStatusText.textContent = text;
  const dot = el.wsStatus.querySelector('.status-dot');
  if (status === 'connected') {
    dot.className = 'status-dot pulsing';
    el.wsStatus.style.borderColor = 'rgba(14, 203, 129, 0.25)';
    el.wsStatusText.style.color = '#0ecb81';
  } else if (status === 'connecting') {
    dot.className = 'status-dot';
    el.wsStatus.style.borderColor = 'rgba(240, 185, 11, 0.3)';
    el.wsStatusText.style.color = '#f0b90b';
  } else {
    dot.className = 'status-dot';
    el.wsStatus.style.borderColor = 'rgba(246, 70, 93, 0.3)';
    el.wsStatusText.style.color = '#f6465d';
  }
}

function showLoading(show) {
  if (show) el.chartLoader.classList.remove('hidden');
  else el.chartLoader.classList.add('hidden');
}
