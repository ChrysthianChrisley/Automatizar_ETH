/**
 * Binance Market Terminal - Global State & DOM Element Cache
 */

// Configuration
const CONFIG = {
  restBaseUrl: 'https://api.binance.com',
  restFallbackUrl: 'https://data-api.binance.vision',
  wsBaseUrl: 'wss://stream.binance.com:9443/stream?streams=',
  defaultSymbol: 'ETHUSDT',
  defaultInterval: '15m',
  candleLimit: 500,
};

// Global Runtime State
let currentSymbol = CONFIG.defaultSymbol;
let currentInterval = CONFIG.defaultInterval;
let activeWs = null;
let lastPrice = 0;
let historicalCandles = [];

// Lightweight Charts Series References
let tvChart = null;
let candleSeries = null;
let volumeSeries = null;
let ema20Series = null;
let ema50Series = null;
let upperBandSeries = null;
let lowerBandSeries = null;

// Indicator Visibility Toggles
let showEma20 = true;
let showEma50 = true;
let showRsi = false;
let showBands = false;

// DOM Elements Cache
const el = {};

function initDOMElements() {
  el.livePrice = document.getElementById('livePrice');
  el.priceCurrency = document.getElementById('priceCurrency');
  el.priceChange24h = document.getElementById('priceChange24h');
  el.changeVal = document.getElementById('changeVal');
  el.changePercentBadge = document.getElementById('changePercentBadge');
  el.high24h = document.getElementById('high24h');
  el.low24h = document.getElementById('low24h');
  el.volBase24h = document.getElementById('volBase24h');
  el.volQuote24h = document.getElementById('volQuote24h');
  el.baseAssetLabel = document.getElementById('baseAssetLabel');
  el.rangePercent = document.getElementById('rangePercent');
  el.rangeBarFill = document.getElementById('rangeBarFill');
  el.chartLoader = document.getElementById('chartLoader');
  el.tvChartContainer = document.getElementById('tvChartContainer');
  el.asksList = document.getElementById('asksList');
  el.bidsList = document.getElementById('bidsList');
  el.spreadPrice = document.getElementById('spreadPrice');
  el.spreadValue = document.getElementById('spreadValue');
  el.spreadArrow = document.getElementById('spreadArrow');
  el.bidsRatio = document.getElementById('bidsRatio');
  el.asksRatio = document.getElementById('asksRatio');
  el.tradesList = document.getElementById('tradesList');
  el.wsStatus = document.getElementById('wsStatus');
  el.wsStatusText = document.getElementById('wsStatusText');
  el.footerClock = document.getElementById('footerClock');
  el.footerPing = document.getElementById('footerPing');
  // Stats
  el.statCandlesCount = document.getElementById('statCandlesCount');
  el.statOpen = document.getElementById('statOpen');
  el.statHigh = document.getElementById('statHigh');
  el.statLow = document.getElementById('statLow');
  el.statClose = document.getElementById('statClose');
  el.statLastUpdate = document.getElementById('statLastUpdate');
  // Indicators Legend
  el.valEma20 = document.getElementById('valEma20');
  el.valEma50 = document.getElementById('valEma50');
  el.valRsi = document.getElementById('valRsi');
  el.legendRsi = document.getElementById('legendRsi');
  // Analytics Card
  el.cardRsi = document.getElementById('cardRsi');
  el.cardEma20 = document.getElementById('cardEma20');
  el.cardEma50 = document.getElementById('cardEma50');
  el.cardTrendBadge = document.getElementById('cardTrendBadge');
  el.cardVwap = document.getElementById('cardVwap');
  // Whale Radar Elements
  el.whalesCardsList = document.getElementById('whalesCardsList');
  el.whaleOrdersFeed = document.getElementById('whaleOrdersFeed');
  el.toggleWhalesOnly = document.getElementById('toggleWhalesOnly');
  el.whaleTradesCount = document.getElementById('whaleTradesCount');
  el.whaleSessionTotal = document.getElementById('whaleSessionTotal');
  el.etherscanCallsUsed = document.getElementById('etherscanCallsUsed');
  el.whaleCacheBadge = document.getElementById('whaleCacheBadge');
  el.btnRefreshWhales = document.getElementById('btnRefreshWhales');
  el.whaleSearchInput = document.getElementById('whaleSearchInput');
  el.whaleCategoryFilters = document.getElementById('whaleCategoryFilters');
  el.subviewHolders = document.getElementById('subviewHolders');
  el.subviewOrders = document.getElementById('subviewOrders');
  el.contentWhaleHolders = document.getElementById('contentWhaleHolders');
  el.contentWhaleOrders = document.getElementById('contentWhaleOrders');
  el.obWhaleRadarStatus = document.getElementById('obWhaleRadarStatus');
  // Tape Reading / Expanded Live Trades Elements
  el.btnViewChart = document.getElementById('btnViewChart');
  el.btnViewTape = document.getElementById('btnViewTape');
  el.chartMainView = document.getElementById('chartMainView');
  el.tapeReadingMainView = document.getElementById('tapeReadingMainView');
  el.chartControlsGroup = document.getElementById('chartControlsGroup');
  el.chartLegend = document.getElementById('chartLegend');
  el.tapeBuyVol = document.getElementById('tapeBuyVol');
  el.tapeBuyUsd = document.getElementById('tapeBuyUsd');
  el.tapeSellVol = document.getElementById('tapeSellVol');
  el.tapeSellUsd = document.getElementById('tapeSellUsd');
  el.tapeDeltaVol = document.getElementById('tapeDeltaVol');
  el.aggressionFillBuy = document.getElementById('aggressionFillBuy');
  el.aggressionFillSell = document.getElementById('aggressionFillSell');
  el.tapeSpeed = document.getElementById('tapeSpeed');
  el.tapeMaxBuy = document.getElementById('tapeMaxBuy');
  el.tapeMaxSell = document.getElementById('tapeMaxSell');
  el.btnPauseTape = document.getElementById('btnPauseTape');
  el.txtPauseTape = document.getElementById('txtPauseTape');
  el.btnClearTape = document.getElementById('btnClearTape');
  el.tapeSizeFilters = document.getElementById('tapeSizeFilters');
  el.tapeSideFilters = document.getElementById('tapeSideFilters');
  el.tapeTableBody = document.getElementById('tapeTableBody');
}
