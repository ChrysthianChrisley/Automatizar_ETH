/**
 * Binance Market Terminal - Utility & Formatting Functions
 */

// Helper to fetch Binance REST API with fallback URL
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

// Price Number Formatter
function formatPrice(num) {
  if (isNaN(num) || num === null) return '---';
  if (num >= 1000) return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num >= 1) return num.toFixed(2);
  if (num >= 0.0001) return num.toFixed(6);
  return num.toString();
}

// Compact Number Formatter (K, M, B)
function formatCompactNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return Number(num).toFixed(2);
}

// Update Base Asset Labels throughout the UI
function updateBaseAssetLabel(symbol) {
  if (symbol.startsWith('ETH')) el.baseAssetLabel.textContent = 'ETH';
  else if (symbol.startsWith('BTC')) el.baseAssetLabel.textContent = 'BTC';
  else if (symbol.startsWith('SOL')) el.baseAssetLabel.textContent = 'SOL';
  else el.baseAssetLabel.textContent = 'Crypto';

  if (symbol.endsWith('BTC')) el.priceCurrency.textContent = 'BTC';
  else el.priceCurrency.textContent = 'USDT';
}

// Set WebSocket Connection Status in Header
function setWsStatus(text, status) {
  if (!el.wsStatusText || !el.wsStatus) return;
  el.wsStatusText.textContent = text;
  const dot = el.wsStatus.querySelector('.status-dot');
  if (!dot) return;

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

// Show/Hide Chart Loading Overlay
function showLoading(show) {
  if (!el.chartLoader) return;
  if (show) el.chartLoader.classList.remove('hidden');
  else el.chartLoader.classList.add('hidden');
}

// Live Reload for Development
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
      // Ignora falhas momentâneas durante reinício do servidor
    }
  }, 1200);
}

// CSV Export Utility
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
