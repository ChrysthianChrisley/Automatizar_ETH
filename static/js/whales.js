/**
 * Binance Market Terminal - Whale Radar & Etherscan Intelligence Engine
 */

// Whale Tracker State
let rawWhalesData = [];
let currentWhaleCategory = 'all';
let whaleSearchQuery = '';
let whaleOrdersCount = 0;
let whaleOrdersTotalUSD = 0.0;

// Record real-time whale trade in sidebar feed
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

// Fetch Top 50 ETH Whales from Flask / Etherscan API
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

// Render Whale Cards List
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

// Copy Whale Address Helper
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
