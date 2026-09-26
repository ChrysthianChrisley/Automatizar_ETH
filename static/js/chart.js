/**
 * Binance Market Terminal - TradingView Lightweight Charts Engine
 */

// Initialize Chart
function initChart() {
  const container = el.tvChartContainer;
  if (!container) return;
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
        bottom: 0.22, // Space for volume overlay
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

// Process and Plot Historical Candlesticks
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

// Compute Technical Indicators Data on Chart
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
  if (el.valRsi) el.valRsi.textContent = currentRsi.toFixed(1);
  if (el.cardRsi) {
    el.cardRsi.textContent = currentRsi.toFixed(1);
    if (currentRsi >= 70) {
      el.cardRsi.className = 'font-mono font-bold red';
    } else if (currentRsi <= 30) {
      el.cardRsi.className = 'font-mono font-bold green';
    } else {
      el.cardRsi.className = 'font-mono font-bold';
    }
  }

  const needle = document.getElementById('cardRsiNeedle');
  if (needle) {
    needle.style.left = `${Math.min(100, Math.max(0, currentRsi))}%`;
  }
}
