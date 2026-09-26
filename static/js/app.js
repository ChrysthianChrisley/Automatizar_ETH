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
  // Whale Radar Elements
  whalesCardsList: document.getElementById('whalesCardsList'),
  whaleOrdersFeed: document.getElementById('whaleOrdersFeed'),
  toggleWhalesOnly: document.getElementById('toggleWhalesOnly'),
  whaleTradesCount: document.getElementById('whaleTradesCount'),
  whaleSessionTotal: document.getElementById('whaleSessionTotal'),
  etherscanCallsUsed: document.getElementById('etherscanCallsUsed'),
  whaleCacheBadge: document.getElementById('whaleCacheBadge'),
  btnRefreshWhales: document.getElementById('btnRefreshWhales'),
  whaleSearchInput: document.getElementById('whaleSearchInput'),
  whaleCategoryFilters: document.getElementById('whaleCategoryFilters'),
  subviewHolders: document.getElementById('subviewHolders'),
  subviewOrders: document.getElementById('subviewOrders'),
  contentWhaleHolders: document.getElementById('contentWhaleHolders'),
  contentWhaleOrders: document.getElementById('contentWhaleOrders'),
  obWhaleRadarStatus: document.getElementById('obWhaleRadarStatus'),
  // Tape Reading / Expanded Live Trades Elements
  btnViewChart: document.getElementById('btnViewChart'),
  btnViewTape: document.getElementById('btnViewTape'),
  chartMainView: document.getElementById('chartMainView'),
  tapeReadingMainView: document.getElementById('tapeReadingMainView'),
  chartControlsGroup: document.getElementById('chartControlsGroup'),
  chartLegend: document.getElementById('chartLegend'),
  tapeBuyVol: document.getElementById('tapeBuyVol'),
  tapeBuyUsd: document.getElementById('tapeBuyUsd'),
  tapeSellVol: document.getElementById('tapeSellVol'),
  tapeSellUsd: document.getElementById('tapeSellUsd'),
  tapeDeltaVol: document.getElementById('tapeDeltaVol'),
  aggressionFillBuy: document.getElementById('aggressionFillBuy'),
  aggressionFillSell: document.getElementById('aggressionFillSell'),
  tapeSpeed: document.getElementById('tapeSpeed'),
  tapeMaxBuy: document.getElementById('tapeMaxBuy'),
  tapeMaxSell: document.getElementById('tapeMaxSell'),
  btnPauseTape: document.getElementById('btnPauseTape'),
  txtPauseTape: document.getElementById('txtPauseTape'),
  btnClearTape: document.getElementById('btnClearTape'),
  tapeSizeFilters: document.getElementById('tapeSizeFilters'),
  tapeSideFilters: document.getElementById('tapeSideFilters'),
  tapeTableBody: document.getElementById('tapeTableBody'),
};

// Whale Tracker State
let rawWhalesData = [];
let currentWhaleCategory = 'all';
let whaleSearchQuery = '';
let whaleOrdersCount = 0;
let whaleOrdersTotalUSD = 0.0;

// Tape Reading / Expanded Live Trades State
const tapeState = {
  activeView: 'chart',
  paused: false,
  queue: [],
  recentTrades: [],
  sizeFilter: 'all',
  sideFilter: 'all',
  buyVolume: 0,
  buyUsd: 0,
  sellVolume: 0,
  sellUsd: 0,
  maxBuyQty: 0,
  maxBuyPrice: 0,
  maxSellQty: 0,
  maxSellPrice: 0,
  timestamps: [],
  maxDomRows: 150,
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
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
  const isWhaleTrade = (currentSymbol.startsWith('ETH') && qty >= 10.0) ||
                       (currentSymbol.startsWith('BTC') && qty >= 0.5) ||
                       (qty * price >= 25000.0);

  // If Whale Trade, record in Whale Radar
  if (isWhaleTrade) {
    recordWhaleOrder(tradeType, price, qty, time);
  }

  // Process Expanded Tape Reading Pro Feed
  processTapeReadingTrade(trade);

  // Filter if user toggled "Only Whales"
  if (el.toggleWhalesOnly && el.toggleWhalesOnly.checked && !isWhaleTrade) {
    return;
  }

  const row = document.createElement('div');
  row.className = `trade-row ${tradeType} ${isWhaleTrade ? 'whale-trade' : ''}`;
  row.innerHTML = `
    <span>${formatPrice(price)} ${isWhaleTrade ? '<span class="whale-tag-inline">🐋 BALEIA</span>' : ''}</span>
    <span>${qty.toFixed(4)}</span>
    <span class="trade-time">${time}</span>
  `;

  el.tradesList.prepend(row);

  // Limit list to 40 rows
  if (el.tradesList.children.length > 40) {
    el.tradesList.removeChild(el.tradesList.lastChild);
  }
}

function recordWhaleOrder(side, price, qty, time) {
  whaleOrdersCount++;
  const totalUSD = price * qty;
  whaleOrdersTotalUSD += totalUSD;

  if (el.whaleTradesCount) {
    el.whaleTradesCount.textContent = `${whaleOrdersCount} ordens`;
  }
  if (el.whaleSessionTotal) {
    el.whaleSessionTotal.textContent = `Total: $${formatCompactNumber(whaleOrdersTotalUSD)}`;
  }

  // Prepend to Whale Orders Feed
  if (el.whaleOrdersFeed) {
    const emptyState = el.whaleOrdersFeed.querySelector('.whale-empty-state');
    if (emptyState) emptyState.remove();

    const row = document.createElement('div');
    row.className = `whale-order-row ${side}`;
    row.innerHTML = `
      <span>${side === 'buy' ? '🟢 COMPRA' : '🔴 VENDA'} @ ${formatPrice(price)}</span>
      <span class="font-bold">${qty.toFixed(2)} ${currentSymbol.slice(0, 3)}</span>
      <span>$${formatCompactNumber(totalUSD)} <small style="color:var(--text-muted);font-size:9.5px">${time}</small></span>
    `;
    el.whaleOrdersFeed.prepend(row);

    if (el.whaleOrdersFeed.children.length > 50) {
      el.whaleOrdersFeed.removeChild(el.whaleOrdersFeed.lastChild);
    }
  }
}

// ==========================================================================
// EXPANDED TAPE READING / TIME & SALES PRO ENGINE
// ==========================================================================

function setMainView(view) {
  tapeState.activeView = view;
  if (view === 'chart') {
    if (el.btnViewChart) el.btnViewChart.classList.add('active');
    if (el.btnViewTape) el.btnViewTape.classList.remove('active');
    if (el.chartMainView) {
      el.chartMainView.style.display = 'flex';
      el.chartMainView.classList.add('active');
    }
    if (el.tapeReadingMainView) {
      el.tapeReadingMainView.style.display = 'none';
      el.tapeReadingMainView.classList.remove('active');
    }
    if (el.chartControlsGroup) el.chartControlsGroup.style.display = 'flex';
    if (el.chartLegend) el.chartLegend.style.display = 'flex';

    // Resize TradingView chart if dimensions changed
    if (tvChart && el.tvChartContainer) {
      tvChart.applyOptions({
        width: el.tvChartContainer.clientWidth,
        height: el.tvChartContainer.clientHeight,
      });
    }
  } else {
    if (el.btnViewTape) el.btnViewTape.classList.add('active');
    if (el.btnViewChart) el.btnViewChart.classList.remove('active');
    if (el.chartMainView) {
      el.chartMainView.style.display = 'none';
      el.chartMainView.classList.remove('active');
    }
    if (el.tapeReadingMainView) {
      el.tapeReadingMainView.style.display = 'flex';
      el.tapeReadingMainView.classList.add('active');
    }
    if (el.chartControlsGroup) el.chartControlsGroup.style.display = 'none';
    if (el.chartLegend) el.chartLegend.style.display = 'none';
  }
}

function getTradeTier(qty, price, symbol) {
  const isEth = symbol.startsWith('ETH');
  const usdValue = qty * price;

  if ((isEth && qty >= 10.0) || (!isEth && qty >= 0.5) || usdValue >= 25000.0) {
    const isMega = usdValue >= 100000.0 || (isEth && qty >= 50.0);
    return {
      id: 'whale',
      label: isMega ? '🐋 MEGA BALEIA' : '🐋 BALEIA',
      cssClass: isMega ? 'mega-whale' : 'whale',
      isWhale: true,
      isMegaWhale: isMega,
    };
  }
  if ((isEth && qty >= 5.0) || (!isEth && qty >= 0.25) || usdValue >= 12000.0) {
    return { id: 'shark', label: '🐬 TUBARÃO', cssClass: 'shark', isWhale: false, isMegaWhale: false };
  }
  if ((isEth && qty >= 1.0) || (!isEth && qty >= 0.05) || usdValue >= 2500.0) {
    return { id: 'medium', label: '🐟 MÉDIO', cssClass: 'medium', isWhale: false, isMegaWhale: false };
  }
  return { id: 'retail', label: '🦐 VAREJO', cssClass: 'retail', isWhale: false, isMegaWhale: false };
}

function processTapeReadingTrade(trade) {
  const price = parseFloat(trade.p);
  const qty = parseFloat(trade.q);
  const timeMs = trade.T || Date.now();
  const tradeId = trade.t || trade.a || Math.floor(Math.random() * 1000000);
  const isBuyerMaker = trade.m; // true = taker sell, false = taker buy
  const side = isBuyerMaker ? 'sell' : 'buy';
  const totalUSD = price * qty;
  const tier = getTradeTier(qty, price, currentSymbol);

  // Format millisecond time (HH:MM:SS.mmm)
  const dateObj = new Date(timeMs);
  const timeFormatted = dateObj.toTimeString().slice(0, 8) + '.' + String(dateObj.getMilliseconds()).padStart(3, '0');

  // 1. Update Aggression & Tape Metrics
  if (side === 'buy') {
    tapeState.buyVolume += qty;
    tapeState.buyUsd += totalUSD;
    if (qty > tapeState.maxBuyQty) {
      tapeState.maxBuyQty = qty;
      tapeState.maxBuyPrice = price;
    }
  } else {
    tapeState.sellVolume += qty;
    tapeState.sellUsd += totalUSD;
    if (qty > tapeState.maxSellQty) {
      tapeState.maxSellQty = qty;
      tapeState.maxSellPrice = price;
    }
  }

  // 2. Speed calculation (rolling window of 3 seconds)
  const now = Date.now();
  tapeState.timestamps.push(now);
  const cutoff = now - 3000;
  while (tapeState.timestamps.length > 0 && tapeState.timestamps[0] < cutoff) {
    tapeState.timestamps.shift();
  }
  const currentSpeed = (tapeState.timestamps.length / 3).toFixed(1);

  // 3. Update Dashboard DOM
  updateTapeDashboardUI(currentSpeed);

  // 4. Construct Item
  const tradeItem = {
    id: tradeId,
    timeFormatted,
    timeMs,
    side,
    price,
    qty,
    totalUSD,
    tier,
    symbol: currentSymbol,
  };

  tapeState.recentTrades.unshift(tradeItem);
  if (tapeState.recentTrades.length > 250) {
    tapeState.recentTrades.pop();
  }

  // 5. Handle Pause / Render
  if (tapeState.paused) {
    tapeState.queue.push(tradeItem);
    if (el.txtPauseTape) {
      el.txtPauseTape.textContent = `Pausado (${tapeState.queue.length} novos)`;
    }
    return;
  }

  // Render to DOM if matches current filters
  if (matchesTapeFilter(tradeItem)) {
    renderTapeRow(tradeItem, true);
  }
}

function updateTapeDashboardUI(speed) {
  const baseAsset = currentSymbol.slice(0, 3);
  const buyVol = tapeState.buyVolume;
  const sellVol = tapeState.sellVolume;
  const totalVol = buyVol + sellVol;
  const delta = buyVol - sellVol;
  const buyRatio = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;
  const sellRatio = totalVol > 0 ? (sellVol / totalVol) * 100 : 50;

  if (el.tapeBuyVol) el.tapeBuyVol.textContent = `${buyVol.toFixed(2)} ${baseAsset}`;
  if (el.tapeBuyUsd) el.tapeBuyUsd.textContent = `$${formatCompactNumber(tapeState.buyUsd)}`;
  if (el.tapeSellVol) el.tapeSellVol.textContent = `${sellVol.toFixed(2)} ${baseAsset}`;
  if (el.tapeSellUsd) el.tapeSellUsd.textContent = `$${formatCompactNumber(tapeState.sellUsd)}`;

  if (el.tapeDeltaVol) {
    const prefix = delta >= 0 ? '+' : '';
    el.tapeDeltaVol.textContent = `${prefix}${delta.toFixed(2)} ${baseAsset}`;
    el.tapeDeltaVol.className = `tape-metric-val font-mono ${delta >= 0 ? 'green' : 'red'}`;
  }

  if (el.aggressionFillBuy && el.aggressionFillSell) {
    el.aggressionFillBuy.style.width = `${buyRatio.toFixed(1)}%`;
    el.aggressionFillBuy.textContent = buyRatio > 15 ? `${buyRatio.toFixed(0)}%` : '';
    el.aggressionFillSell.style.width = `${sellRatio.toFixed(1)}%`;
    el.aggressionFillSell.textContent = sellRatio > 15 ? `${sellRatio.toFixed(0)}%` : '';
  }

  if (el.tapeSpeed) {
    el.tapeSpeed.textContent = `${speed} trades/s`;
  }

  if (el.tapeMaxBuy) {
    el.tapeMaxBuy.textContent = tapeState.maxBuyQty > 0
      ? `Maior C: ${tapeState.maxBuyQty.toFixed(2)} @ $${formatPrice(tapeState.maxBuyPrice)}`
      : 'Maior C: ---';
  }
  if (el.tapeMaxSell) {
    el.tapeMaxSell.textContent = tapeState.maxSellQty > 0
      ? `Maior V: ${tapeState.maxSellQty.toFixed(2)} @ $${formatPrice(tapeState.maxSellPrice)}`
      : 'Maior V: ---';
  }
}

function matchesTapeFilter(trade) {
  // Side Filter
  if (tapeState.sideFilter !== 'all' && trade.side !== tapeState.sideFilter) {
    return false;
  }
  // Size Filter
  if (tapeState.sizeFilter !== 'all' && trade.tier.id !== tapeState.sizeFilter) {
    return false;
  }
  return true;
}

function renderTapeRow(trade, prepend = true) {
  if (!el.tapeTableBody) return;

  const emptyMsg = el.tapeTableBody.querySelector('.tape-empty-msg');
  if (emptyMsg) emptyMsg.remove();

  const row = document.createElement('div');
  const isMega = trade.tier.isMegaWhale;
  const isWhale = trade.tier.isWhale;
  const rowClass = `tape-row ${trade.side} ${isMega ? 'mega-whale-row' : isWhale ? 'whale-row' : ''}`;
  row.className = rowClass;

  const sideTag = trade.side === 'buy'
    ? `<span class="tape-tag-buy">🟢 COMPRA</span>`
    : `<span class="tape-tag-sell">🔴 VENDA</span>`;

  row.innerHTML = `
    <span>${trade.timeFormatted}</span>
    <span>${sideTag}</span>
    <span>${formatPrice(trade.price)}</span>
    <span>${trade.qty.toFixed(4)}</span>
    <span>$${formatCompactNumber(trade.totalUSD)}</span>
    <span><span class="tier-badge ${trade.tier.cssClass}">${trade.tier.label}</span></span>
    <span>#${trade.id}</span>
  `;

  if (prepend) {
    el.tapeTableBody.prepend(row);
    if (el.tapeTableBody.children.length > tapeState.maxDomRows) {
      el.tapeTableBody.removeChild(el.tapeTableBody.lastChild);
    }
  } else {
    el.tapeTableBody.appendChild(row);
  }
}

function renderFilteredTapeList() {
  if (!el.tapeTableBody) return;
  el.tapeTableBody.innerHTML = '';

  const filtered = tapeState.recentTrades.filter(matchesTapeFilter);
  if (filtered.length === 0) {
    el.tapeTableBody.innerHTML = `
      <div class="tape-empty-msg">
        <span>Nenhuma negociação recente corresponde aos filtros selecionados.</span>
      </div>
    `;
    return;
  }

  filtered.slice(0, tapeState.maxDomRows).forEach(trade => {
    renderTapeRow(trade, false);
  });
}

function togglePauseTape() {
  tapeState.paused = !tapeState.paused;
  if (el.btnPauseTape) {
    el.btnPauseTape.classList.toggle('paused', tapeState.paused);
  }
  if (tapeState.paused) {
    if (el.btnPauseTape) {
      el.btnPauseTape.innerHTML = `<i data-lucide="play"></i> <span id="txtPauseTape">Retomar Fluxo</span>`;
      if (window.lucide) lucide.createIcons();
    }
  } else {
    if (el.btnPauseTape) {
      el.btnPauseTape.innerHTML = `<i data-lucide="pause"></i> <span id="txtPauseTape">Pausar Fluxo</span>`;
      if (window.lucide) lucide.createIcons();
    }
    // Flush buffered queue
    tapeState.queue = [];
    renderFilteredTapeList();
  }
}

function clearTape() {
  tapeState.recentTrades = [];
  tapeState.queue = [];
  tapeState.buyVolume = 0;
  tapeState.buyUsd = 0;
  tapeState.sellVolume = 0;
  tapeState.sellUsd = 0;
  tapeState.maxBuyQty = 0;
  tapeState.maxBuyPrice = 0;
  tapeState.maxSellQty = 0;
  tapeState.maxSellPrice = 0;
  tapeState.timestamps = [];

  if (el.tapeTableBody) {
    el.tapeTableBody.innerHTML = `
      <div class="tape-empty-msg">
        <span>⚡ Fita limpa. Aguardando novas execuções da Binance...</span>
      </div>
    `;
  }
  updateTapeDashboardUI('0.0');
}

function resetTapeStats() {
  clearTape();
}

function seedTapeFromRest(trades) {
  trades.forEach(t => {
    processTapeReadingTrade({
      p: t.price,
      q: t.qty,
      T: t.time,
      m: t.isBuyerMaker,
      t: t.id,
    });
  });
}

// Render Order Book Depth (Top 15 Asks & Bids) with Whale Wall Detection
function renderOrderBook(depth) {
  const rawAsks = depth.asks || depth.a || [];
  const rawBids = depth.bids || depth.b || [];

  const asks = rawAsks.slice(0, 12).reverse(); // lowest ask at bottom
  const bids = rawBids.slice(0, 12); // highest bid at top

  // Thresholds for whale orders in order book
  // ETH: >= 15 ETH (~$40k), Mega >= 40 ETH (~$108k)
  // BTC: >= 0.7 BTC (~$58k), Mega >= 2.0 BTC (~$168k)
  // General: value >= $35,000, Mega >= $90,000
  const isEth = currentSymbol.startsWith('ETH');
  const isBtc = currentSymbol.startsWith('BTC');
  const whaleQtyThreshold = isEth ? 15.0 : isBtc ? 0.70 : 40.0;
  const megaWhaleThreshold = isEth ? 40.0 : isBtc ? 1.80 : 120.0;

  let askWhaleWalls = [];
  let bidWhaleWalls = [];

  // Calculate totals and max for depth bars
  let askTotal = 0;
  const asksProcessed = asks.map(a => {
    const p = parseFloat(a[0]);
    const q = parseFloat(a[1]);
    askTotal += q;
    const isWhale = q >= whaleQtyThreshold || (p * q >= 35000.0);
    const isMegaWhale = q >= megaWhaleThreshold || (p * q >= 90000.0);
    if (isWhale) {
      askWhaleWalls.push({ price: p, qty: q, usd: p * q, isMega: isMegaWhale });
    }
    return { price: p, qty: q, total: askTotal, isWhale, isMegaWhale };
  });

  let bidTotal = 0;
  const bidsProcessed = bids.map(b => {
    const p = parseFloat(b[0]);
    const q = parseFloat(b[1]);
    bidTotal += q;
    const isWhale = q >= whaleQtyThreshold || (p * q >= 35000.0);
    const isMegaWhale = q >= megaWhaleThreshold || (p * q >= 90000.0);
    if (isWhale) {
      bidWhaleWalls.push({ price: p, qty: q, usd: p * q, isMega: isMegaWhale });
    }
    return { price: p, qty: q, total: bidTotal, isWhale, isMegaWhale };
  });

  const maxTotal = Math.max(askTotal, bidTotal) || 1;

  // Render Asks
  el.asksList.innerHTML = asksProcessed.map(item => {
    const depthPct = Math.min(100, (item.total / maxTotal) * 100);
    const whaleClass = item.isMegaWhale ? 'whale-wall mega-whale-wall' : item.isWhale ? 'whale-wall' : '';
    const whaleBadge = item.isMegaWhale
      ? `<span class="ob-whale-badge" title="Mega Parede de Venda: ${item.qty.toFixed(2)} ($${formatCompactNumber(item.price * item.qty)})">🐋 MEGA</span>`
      : item.isWhale
      ? `<span class="ob-whale-badge" title="Parede de Venda: ${item.qty.toFixed(2)} ($${formatCompactNumber(item.price * item.qty)})">🐋 BALEIA</span>`
      : '';

    return `
      <div class="ob-row ${whaleClass}">
        <div class="ob-depth-bar" style="width: ${depthPct}%"></div>
        <span>${formatPrice(item.price)} ${whaleBadge}</span>
        <span>${item.qty.toFixed(4)}</span>
        <span>${item.total.toFixed(3)}</span>
      </div>
    `;
  }).join('');

  // Render Bids
  el.bidsList.innerHTML = bidsProcessed.map(item => {
    const depthPct = Math.min(100, (item.total / maxTotal) * 100);
    const whaleClass = item.isMegaWhale ? 'whale-wall mega-whale-wall' : item.isWhale ? 'whale-wall' : '';
    const whaleBadge = item.isMegaWhale
      ? `<span class="ob-whale-badge" title="Mega Parede de Compra: ${item.qty.toFixed(2)} ($${formatCompactNumber(item.price * item.qty)})">🐋 MEGA</span>`
      : item.isWhale
      ? `<span class="ob-whale-badge" title="Parede de Compra: ${item.qty.toFixed(2)} ($${formatCompactNumber(item.price * item.qty)})">🐋 BALEIA</span>`
      : '';

    return `
      <div class="ob-row ${whaleClass}">
        <div class="ob-depth-bar" style="width: ${depthPct}%"></div>
        <span>${formatPrice(item.price)} ${whaleBadge}</span>
        <span>${item.qty.toFixed(4)}</span>
        <span>${item.total.toFixed(3)}</span>
      </div>
    `;
  }).join('');

  // Update Order Book Whale Wall Radar Status
  if (el.obWhaleRadarStatus) {
    if (bidWhaleWalls.length > 0 || askWhaleWalls.length > 0) {
      let parts = [];
      if (bidWhaleWalls.length > 0) {
        // Largest bid wall
        bidWhaleWalls.sort((a, b) => b.qty - a.qty);
        const topBid = bidWhaleWalls[0];
        parts.push(`<span class="green font-bold">🟢 ${topBid.qty.toFixed(1)} ${currentSymbol.slice(0, 3)} @ $${formatPrice(topBid.price)}</span>`);
      }
      if (askWhaleWalls.length > 0) {
        // Largest ask wall
        askWhaleWalls.sort((a, b) => b.qty - a.qty);
        const topAsk = askWhaleWalls[0];
        parts.push(`<span class="red font-bold">🔴 ${topAsk.qty.toFixed(1)} ${currentSymbol.slice(0, 3)} @ $${formatPrice(topAsk.price)}</span>`);
      }
      el.obWhaleRadarStatus.innerHTML = parts.join(' | ');
    } else {
      el.obWhaleRadarStatus.innerHTML = `<span style="color:var(--text-muted)">Sem paredes volumosas no topo</span>`;
    }
  }

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

  // Seed Tape Reading with initial REST trades if empty
  if (tapeState.recentTrades.length === 0 && trades.length > 0) {
    seedTapeFromRest(trades);
  }
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
    resetTapeStats();
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
      document.getElementById(paneId).classList.add('active');

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

  // Whale Refresh Button (Uses cache if < 5 min unless forced)
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
      // Clear trades list to show filtered stream
      el.tradesList.innerHTML = '';
    });
  }

  // Refresh Button
  document.getElementById('btnRefresh').addEventListener('click', () => {
    loadSymbolData(currentSymbol, currentInterval);
  });

  // Export CSV Button
  document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);

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

// 9. AUTOMATIC LIVERELOAD (Desenvolvimento em Tempo Real)
function setupLiveReload() {
  let initialServerTime = null;
  setInterval(async () => {
    try {
      const res = await fetch('/dev/version');
      if (res.ok) {
        const data = await res.json();
        if (initialServerTime === null) {
          initialServerTime = data.server_start_time;
        } else if (data.server_start_time && data.server_start_time !== initialServerTime) {
          console.log('[LiveReload] Servidor Flask reiniciado por alteração de código. Recarregando página...');
          window.location.reload();
        }
      }
    } catch (e) {
      // Ignora pequenas falhas de rede durante o reinício do servidor
    }
  }, 1200);
}

// 10. WHALE RADAR & ETHERSCAN INTEGRATION
async function loadWhalesData(force = false) {
  if (!el.whalesCardsList) return;

  if (force && el.btnRefreshWhales) {
    el.btnRefreshWhales.innerHTML = `<div class="spinner" style="width:12px;height:12px;border-width:2px;"></div> Consultando...`;
  }

  try {
    const res = await fetch(`/api/whales?refresh=${force ? 'true' : 'false'}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    rawWhalesData = json.whales || [];

    // Update Quota status
    if (el.etherscanCallsUsed) {
      el.etherscanCallsUsed.textContent = `${json.daily_calls_used || 3}`;
    }
    if (el.whaleCacheBadge) {
      if (json.cached) {
        el.whaleCacheBadge.textContent = `Cache (${json.cache_age_seconds}s atrás)`;
        el.whaleCacheBadge.className = 'badge green';
      } else {
        el.whaleCacheBadge.textContent = 'Atualizado agora';
        el.whaleCacheBadge.className = 'badge green';
      }
    }

    renderWhalesList();

  } catch (err) {
    console.error('Erro ao carregar baleias:', err);
    if (el.whalesCardsList) {
      el.whalesCardsList.innerHTML = `
        <div style="padding:20px;text-align:center;color:var(--red);">
          <p>Erro ao consultar Etherscan: ${err.message}</p>
          <button class="btn btn-secondary" onclick="loadWhalesData(true)" style="margin:10px auto;">Tentar Novamente</button>
        </div>
      `;
    }
  } finally {
    if (el.btnRefreshWhales) {
      el.btnRefreshWhales.innerHTML = `<i data-lucide="refresh-cw"></i> Atualizar`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

function renderWhalesList() {
  if (!el.whalesCardsList) return;

  let filtered = rawWhalesData;

  // Filter by category
  if (currentWhaleCategory !== 'all') {
    filtered = filtered.filter(w => w.category === currentWhaleCategory);
  }

  // Filter by search query
  if (whaleSearchQuery) {
    filtered = filtered.filter(w =>
      w.name.toLowerCase().includes(whaleSearchQuery) ||
      w.address.toLowerCase().includes(whaleSearchQuery) ||
      (w.category && w.category.toLowerCase().includes(whaleSearchQuery)) ||
      (w.description && w.description.toLowerCase().includes(whaleSearchQuery))
    );
  }

  if (filtered.length === 0) {
    el.whalesCardsList.innerHTML = `
      <div class="whale-empty-state">
        <p>Nenhuma carteira encontrada com o filtro aplicado.</p>
      </div>
    `;
    return;
  }

  el.whalesCardsList.innerHTML = filtered.map(w => {
    const catClass = `cat-${w.category.toLowerCase()}`;
    const rankClass = w.rank === 1 ? 'rank-1' : w.rank === 2 ? 'rank-2' : w.rank === 3 ? 'rank-3' : '';
    const pctSupply = w.percent_supply || 0;
    const barWidth = Math.min(100, Math.max(3, pctSupply * 1.3));

    return `
      <div class="whale-card ${rankClass}">
        <div class="whale-card-header">
          <div class="whale-card-title">
            <span class="whale-rank-badge">#${w.rank}</span>
            <span class="whale-name" title="${w.name}">${w.name}</span>
          </div>
          <span class="whale-category-badge ${catClass}">${w.category}</span>
        </div>

        <div class="whale-card-body">
          <span class="whale-balance-eth">${w.balance_eth.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ETH</span>
          <span class="whale-balance-usd">$${formatCompactNumber(w.balance_usd)}</span>
        </div>

        <div class="whale-supply-row">
          <div class="whale-supply-bar">
            <div class="whale-supply-fill" style="width: ${barWidth}%"></div>
          </div>
          <span>${pctSupply.toFixed(2)}% do suprimento</span>
        </div>

        <div class="whale-card-footer">
          <a href="${w.etherscan_url}" target="_blank" rel="noopener noreferrer" class="whale-address-link" title="Ver endereço no Etherscan">
            <code>${w.short_address}</code>
            <i data-lucide="external-link" style="width:11px;height:11px;"></i>
          </a>
          <button class="whale-copy-btn" onclick="copyWhaleAddress('${w.address}', this)">
            <i data-lucide="copy" style="width:11px;height:11px;"></i> Copiar
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

function copyWhaleAddress(address, btn) {
  navigator.clipboard.writeText(address).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check" style="width:11px;height:11px;color:var(--green)"></i> Copiado!`;
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = originalText;
      if (window.lucide) lucide.createIcons();
    }, 1500);
  });
}


