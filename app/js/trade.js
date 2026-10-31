'use strict';

// ==========================================
// 1. TRADE LOOPS (Ardent Insight market data)
// ==========================================
function makeLeg(buy, sell, cargo) {
    const units = Math.min(cargo, buy.stock, sell.demand > 0 ? sell.demand : cargo);
    const profitPerTon = sell.sellPrice - buy.buyPrice;
    return { commodity: buy.commodityName, buy, sell, units, profitPerTon, total: profitPerTon * units };
}

function bestReturnLeg(exportsB, importsA, cargo) {
    const bestSell = {};
    for (const s of importsA || []) {
        if (!(s.sellPrice > 0) || !marketOk(s)) continue;
        if (!bestSell[s.commodityName] || s.sellPrice > bestSell[s.commodityName].sellPrice) bestSell[s.commodityName] = s;
    }
    let best = null;
    for (const b of exportsB || []) {
        const s = bestSell[b.commodityName];
        if (!s || !(b.buyPrice > 0) || !(b.stock > 0) || !marketOk(b)) continue;
        const leg = makeLeg(b, s, cargo);
        if (leg.profitPerTon > 0 && (!best || leg.total > best.total)) best = leg;
    }
    return best;
}

function legHtml(label, leg) {
    const demand = leg.sell.demand > 0 ? `${fmtInt(leg.sell.demand)} t` : 'no limit reported';
    return `
    <div class="sell-station-box">
        <strong class="cyan">${esc(label)}: ${esc(commodityLabel(leg.commodity))}</strong>
        <div class="detail-grid">
            <div><strong class="cyan">BUY</strong><br>${stationLine(leg.buy)}<br>Price: ${formatCR(leg.buy.buyPrice)} / t<br>Stock: ${fmtInt(leg.buy.stock)} t<br><span class="muted">Updated ${timeAgo(leg.buy.updatedAt)}</span></div>
            <div><strong class="cyan">SELL</strong><br>${stationLine(leg.sell)}<br>Price: ${formatCR(leg.sell.sellPrice)} / t<br>Demand: ${demand}<br><span class="muted">Updated ${timeAgo(leg.sell.updatedAt)}</span></div>
        </div>
        <p style="color: var(--ed-green);">Profit: ${formatCR(leg.profitPerTon)} / t × ${fmtInt(leg.units)} t = ${formatCR(leg.total)}</p>
        <p class="muted">Investment: ${formatCR(leg.buy.buyPrice * leg.units)}</p>
    </div>`;
}

function searchTradeRoutes(btn) {
    return runSearch('trade', btn, async progress => {
        const sys = requireSystem();
        const cargo = Math.round(numInput('cargo-space', 100, 1, 5000));
        const maxDistance = Math.round(numInput('max-trade-dist', 50, 1, 500));
        const market = marketParams();

        progress(`READING MARKETS IN ${sys}...`);
        const [exportsA, report] = await Promise.all([
            ardent(sysPath(sys) + '/commodities/exports', { minVolume: 1, ...market }),
            ardent('/commodities').catch(() => []),
            loadCommodityNames()
        ]);

        const bestBuy = {};
        for (const r of exportsA || []) {
            if (!(r.buyPrice > 0) || !(r.stock > 0) || !marketOk(r)) continue;
            if (!bestBuy[r.commodityName] || r.buyPrice < bestBuy[r.commodityName].buyPrice) bestBuy[r.commodityName] = r;
        }
        // Rank by the best known galactic sell price (daily Ardent report), falling back to the galactic mean price.
        const maxSell = Object.fromEntries((Array.isArray(report) ? report : []).map(c => [c.commodityName, c.maxSellPrice]));
        const candidates = Object.values(bestBuy)
            .map(buy => ({ buy, potential: (maxSell[buy.commodityName] || buy.meanPrice || 0) - buy.buyPrice }))
            .filter(c => c.potential > 0)
            .sort((a, b) => b.potential - a.potential)
            .slice(0, TRADE_CANDIDATES);

        if (!candidates.length) {
            return infoBox(`No market in <strong>${esc(sys)}</strong> with export data from the last ${market.maxDaysAgo} day(s) fits a ${PAD_LABEL[requiredPad()]} pad. Try a populated system, a longer price age or a smaller pad.${planetaryHint()}`);
        }

        let checked = 0;
        const legs = (await mapLimit(candidates, 3, async ({ buy }) => {
            const buyers = await ardent(`${sysPath(sys)}/commodity/name/${encodeURIComponent(buy.commodityName)}/nearby/imports`,
                { minVolume: cargo, maxDistance, ...market });
            progress(`CHECKING BUYERS ${++checked}/${candidates.length}...`);
            const sell = (buyers || []).find(marketOk);
            return sell ? makeLeg(buy, sell, cargo) : null;
        })).filter(l => l && l.profitPerTon > 0).sort((a, b) => b.total - a.total).slice(0, 3);

        if (!legs.length) {
            return infoBox(`No profitable buyer within ${maxDistance} LY with demand for ${fmtInt(cargo)} t. Increase the route distance or the price age.${planetaryHint()}`);
        }

        progress('CALCULATING RETURN LEGS...');
        const importsA = await ardent(sysPath(sys) + '/commodities/imports', { minVolume: cargo, ...market }).catch(() => []);
        const loops = await mapLimit(legs, 3, async leg => {
            const exportsB = await ardent(`/system/address/${encodeURIComponent(leg.sell.systemAddress)}/commodities/exports`, { minVolume: 1, ...market });
            return bestReturnLeg(exportsB, importsA, cargo);
        }).catch(() => legs.map(() => null));

        return legs.map((leg, i) => {
            const back = loops[i];
            const title = esc(commodityLabel(leg.commodity)) + (back ? ' ⇄ ' + esc(commodityLabel(back.commodity)) : '');
            const body = legHtml('Leg 1', leg)
                + (back ? legHtml('Leg 2 (return)', back)
                        : infoBox('No profitable return cargo found with current data – fly back empty or continue from the destination.'))
                + `<div class="action-row">${copyButton(sys, 'Copy Start System')}${copyButton(leg.sell.systemName, 'Copy Destination System', 'btn-cyan')}</div>`;
            return accordionItem(i, {
                title,
                meta: `${esc(sys)} ➔ ${esc(leg.sell.systemName)} | ${fmtLy(leg.sell.distance)} LY${jumpsText(leg.sell.distance)}`,
                stat: formatCR(leg.total + (back ? back.total : 0)),
                statLabel: back ? 'Profit per loop' : 'Profit (one way)',
                body
            });
        }).join('');
    });
}
