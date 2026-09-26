/**
 * Binance Market Terminal - Order Book & Whale Wall Radar Engine
 */

// Render Order Book Depth (Top 15 Asks & Bids) with Whale Wall Detection
function renderOrderBook(depth) {
  const rawAsks = depth.asks || depth.a || [];
  const rawBids = depth.bids || depth.b || [];

  const asks = rawAsks.slice(0, 12).reverse(); // lowest ask at bottom
  const bids = rawBids.slice(0, 12); // highest bid at top

  // Thresholds for whale orders in order book
  // ETH: >= 15 ETH (~$40k), Mega >= 40 ETH (~$108k)
  // BTC: >= 0.7 BTC (~$58k), Mega >= 2.0 BTC (~$168k)
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
  if (el.asksList) {
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
  }

  // Render Bids
  if (el.bidsList) {
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
  }

  // Update Order Book Whale Wall Radar Status
  if (el.obWhaleRadarStatus) {
    if (bidWhaleWalls.length > 0 || askWhaleWalls.length > 0) {
      let parts = [];
      if (bidWhaleWalls.length > 0) {
        bidWhaleWalls.sort((a, b) => b.qty - a.qty);
        const topBid = bidWhaleWalls[0];
        parts.push(`<span class="green font-bold">🟢 ${topBid.qty.toFixed(1)} ${currentSymbol.slice(0, 3)} @ $${formatPrice(topBid.price)}</span>`);
      }
      if (askWhaleWalls.length > 0) {
        askWhaleWalls.sort((a, b) => b.qty - a.qty);
        const topAsk = askWhaleWalls[0];
        parts.push(`<span class="red font-bold">🔴 ${topAsk.qty.toFixed(1)} ${currentSymbol.slice(0, 3)} @ $${formatPrice(topAsk.price)}</span>`);
      }
      el.obWhaleRadarStatus.innerHTML = parts.join(' | ');
    } else {
      el.obWhaleRadarStatus.innerHTML = `<span style="color:var(--text-muted)">Sem paredes volumosas no topo</span>`;
    }
  }

  // Calculate Spread & Depth Ratio
  if (asksProcessed.length > 0 && bidsProcessed.length > 0) {
    const bestAsk = asksProcessed[asksProcessed.length - 1].price;
    const bestBid = bidsProcessed[0].price;
    const spread = bestAsk - bestBid;
    const spreadPct = (spread / bestAsk) * 100;

    if (el.spreadPrice) el.spreadPrice.textContent = formatPrice(bestAsk);
    if (el.spreadValue) el.spreadValue.textContent = `${spread.toFixed(2)} (${spreadPct.toFixed(3)}%)`;

    // Depth Volume Ratio
    const totalVolume = bidTotal + askTotal;
    if (totalVolume > 0 && el.bidsRatio && el.asksRatio) {
      const bidPercent = Math.round((bidTotal / totalVolume) * 100);
      const askPercent = 100 - bidPercent;
      el.bidsRatio.style.width = `${bidPercent}%`;
      el.bidsRatio.textContent = `${bidPercent}% Compra`;
      el.asksRatio.style.width = `${askPercent}%`;
      el.asksRatio.textContent = `${askPercent}% Venda`;
    }
  }
}
