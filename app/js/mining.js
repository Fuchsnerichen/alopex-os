'use strict';

// ==========================================
// 3. MINING HOTSPOTS (Spansh) & SELL STATIONS (Ardent)
// ==========================================
function normalizeSignals(signals) {
    if (Array.isArray(signals)) return signals.map(s => ({ name: s.name, count: s.count || 1 }));
    const obj = (signals && signals.signals) || signals || {};
    return Object.entries(obj).filter(([, v]) => typeof v === 'number').map(([name, count]) => ({ name, count }));
}

// Reserve level of a body's rings as Spansh and the journal write it ("Pristine", "PristineResources").
const RESERVE_LEVELS = ['Pristine', 'Major', 'Common', 'Low', 'Depleted'];
const reserveLevel = body => {
    const level = String(body.reserve_level || '').replace(/resources$/i, '').toLowerCase();
    return RESERVE_LEVELS.find(l => l.toLowerCase() === level) || null;
};
const MINING_RESULTS = 10;

function searchMiningHotspots(btn) {
    return runSearch('mining', btn, async progress => {
        const sys = requireSystem();
        const resource = $('mine-resource').value;
        const radius = numInput('mine-radius', 50, 1, 500);
        const levels = RESERVE_LEVELS.filter(l => $(`reserve-${l.toLowerCase()}`).checked);
        if (!levels.length) return infoBox('Tick at least one reserve level.');
        // With a reserve level filter the app sorts out the rings itself, so it asks Spansh for more bodies.
        const filtering = levels.length < RESERVE_LEVELS.length;
        const size = filtering ? 50 : MINING_RESULTS, pages = filtering ? 3 : 1;

        const rings = [];
        for (let page = 0; page < pages && rings.length < MINING_RESULTS; page++) {
            progress(page ? `CHECKING MORE RINGS... PAGE ${page + 1}` : 'QUERYING SPANSH RING DATABASE...');
            const data = await spanshSearch('bodies', {
                filters: {
                    distance: { min: 0, max: radius },
                    ring_signals: [{ comparison: '<=>', count: [1, 9999], name: [resource] }]
                },
                reference_system: sys,
                sort: [{ distance: { direction: 'asc' } }],
                size,
                page
            });
            const bodies = (data && data.results) || [];
            for (const body of bodies) {
                if (filtering && !levels.includes(reserveLevel(body))) continue;
                for (const ring of body.rings || []) {
                    const signals = normalizeSignals(ring.signals);
                    const hit = signals.find(s => String(s.name).toLowerCase() === resource.toLowerCase());
                    if (hit) rings.push({ body, ring, count: hit.count, others: signals.filter(s => s !== hit) });
                }
            }
            if (bodies.length < size) break;
        }
        rings.splice(MINING_RESULTS);
        if (!rings.length) {
            const reserve = filtering ? ` and reserve level ${levels.join(' / ')}` : '';
            return infoBox(`No ring with a mapped <strong>${esc(resource)}</strong> hotspot${reserve} within ${fmtInt(radius)} LY of ${esc(sys)} in the Spansh database. Increase the radius${filtering ? ' or allow more reserve levels' : ''} – hotspots are only known where commanders have mapped the ring.`);
        }

        return rings.map(({ body, ring, count, others }, i) => {
            const targetId = `mining-station-${i}`;
            const details = [
                `<li>◈ Ring type: ${esc(ring.type || 'unknown')}</li>`,
                `<li>◈ Reserve level: ${esc(reserveLevel(body) || 'unknown')}</li>`,
                others.length ? `<li>◈ Other hotspots in this ring: ${others.map(o => `${esc(o.name)} ×${o.count}`).join(', ')}</li>` : ''
            ].join('');
            return accordionItem(i, {
                title: esc(ring.name || body.name),
                meta: `${esc(body.system_name)} | ${fmtLy(body.distance)} LY${jumpsText(body.distance)}${body.distance_to_arrival ? ` | ${fmtInt(body.distance_to_arrival)} Ls` : ''}`
                    + ` | ${esc(reserveLevel(body) || 'reserve unknown')}`,
                stat: `${count}× ${esc(resource)}`,
                statLabel: 'Hotspots in ring',
                body: `<ul class="detail-list">${details}</ul>
                       <div class="action-row">
                           ${copyButton(body.system_name, 'Copy System Name')}
                           <button class="btn-cyan" data-sell-system="${esc(body.system_name)}" data-resource="${esc(resource)}" data-target="${targetId}">Find Highest Price Sell Station</button>
                       </div>
                       <div id="${targetId}" style="display:none;"></div>`
            });
        }).join('');
    });
}

async function findSellStation(btn) {
    const box = $(btn.dataset.target);
    const system = btn.dataset.sellSystem;
    const resource = btn.dataset.resource;
    const commodity = MINING_RESOURCES[resource];
    playTone('click');
    btn.disabled = true;
    box.style.display = 'block';
    box.innerHTML = `<div class="loading-container" style="display: block; margin: 10px 0;"><div class="loading-text" style="font-size: 0.8rem;">QUERYING MARKET NETWORK...</div><div class="scanner-bar"></div></div>`;

    try {
        const market = marketParams();
        const maxDistance = Math.round(numInput('sell-radius', 100, 1, 500));
        const [nearby, local] = await Promise.all([
            ardent(`${sysPath(system)}/commodity/name/${commodity}/nearby/imports`, { minVolume: 1, maxDistance, ...market }),
            ardent(`${sysPath(system)}/commodity/name/${commodity}`, { maxDaysAgo: market.maxDaysAgo }).catch(() => [])
        ]);
        const localBuyers = (local || [])
            .filter(r => r.sellPrice > 0 && r.demand > 0)
            .map(r => ({ ...r, distance: 0 }));
        const buyers = [...localBuyers, ...(nearby || [])].filter(marketOk).sort((a, b) => b.sellPrice - a.sellPrice).slice(0, 3);

        if (!buyers.length) {
            box.innerHTML = infoBox(`No station buying ${esc(resource)} within ${maxDistance} LY of ${esc(system)} (prices from the last ${market.maxDaysAgo} day(s), ${PAD_LABEL[requiredPad()]} pad).${planetaryHint()}`);
            playTone('alert');
            return;
        }

        const cargo = numInput('current-cargo', 0, 0, 5000);
        box.innerHTML = buyers.map((b, i) => {
            let check = '';
            if (cargo > 0 && b.demand > 0 && cargo > b.demand) {
                check = warningBox(`<strong>⚠️ Demand too low:</strong> the station wants ${fmtInt(b.demand)} t, you carry ${fmtInt(cargo)} t. Not everything can be sold here at this price.`);
            } else if (cargo > 0 && b.demand > 0) {
                check = infoBox(`Your ${fmtInt(cargo)} t are ${Math.round(cargo / b.demand * 100)} % of the station's demand. Selling a large share of the demand at once lowers the price.`);
            }
            const sellable = b.demand > 0 ? Math.min(cargo, b.demand) : cargo;
            return `
            <div class="sell-station-box" style="animation: slideInTab 0.4s ease-out;">
                <strong class="cyan" style="font-size: 1.1rem;">${i === 0 ? '💰 Top Buyer' : `Alternative ${i}`}</strong><br>
                <strong>Station:</strong> ${stationLine(b)}<br>
                <strong>Distance:</strong> ${b.distance ? `${fmtLy(b.distance)} LY from ${esc(system)}` : 'same system'}<br>
                <strong>Price:</strong> <span style="color: var(--ed-green); font-size: 1.2rem;">${formatCR(b.sellPrice)} / t</span><br>
                <strong>Demand:</strong> ${b.demand > 0 ? fmtInt(b.demand) + ' t' : 'no limit reported'} · <span class="muted">Updated ${timeAgo(b.updatedAt)}</span><br>
                ${cargo > 0 ? `<strong>Estimated revenue:</strong> ${formatCR(b.sellPrice * sellable)}<br>` : ''}
                ${check}
                <div class="action-row">${copyButton(b.systemName, 'Copy System Name')}</div>
            </div>`;
        }).join('');
        playTone('success');
    } catch (e) {
        box.innerHTML = errorBox(e.message);
        playTone('alert');
    } finally {
        btn.disabled = false;   // ready for another search, e.g. after changing the market filters
    }
}
