/**
 * Binance Market Terminal - Technical Indicators & Math Engine
 */

// Exponential Moving Average (EMA)
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

// Bollinger Bands (SMA + Multiplier * StdDev)
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

// Relative Strength Index (RSI - Wilder's Smoothing)
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

// Moving Average Convergence Divergence (MACD)
function calculateMACD(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = calculateEMA(values, fastPeriod);
  const emaSlow = calculateEMA(values, slowPeriod);
  const macdLine = new Array(values.length).fill(NaN);

  for (let i = 0; i < values.length; i++) {
    if (!isNaN(emaFast[i]) && !isNaN(emaSlow[i])) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  // Extract valid MACD indices and values
  const validEntries = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (!isNaN(macdLine[i])) {
      validEntries.push({ idx: i, val: macdLine[i] });
    }
  }

  const signalLine = new Array(values.length).fill(NaN);
  const histogram = new Array(values.length).fill(NaN);

  if (validEntries.length >= signalPeriod) {
    const vals = validEntries.map(e => e.val);
    const sigEma = calculateEMA(vals, signalPeriod);
    for (let k = 0; k < sigEma.length; k++) {
      if (!isNaN(sigEma[k])) {
        const origIdx = validEntries[k].idx;
        signalLine[origIdx] = sigEma[k];
        histogram[origIdx] = macdLine[origIdx] - sigEma[k];
      }
    }
  }

  return { macdLine, signalLine, histogram };
}
