'use strict';

// ==========================================
// 6. MISSION STACKS (own journal)
// ==========================================
// Missions that share a destination can be flown in one trip. The mission board itself is not in the
// journal — no tool can read it — so this works on the missions you have already accepted: take one at
// the board, press the button, and see whether the stack still fits into your ship.
const NO_DESTINATION = '(no destination system)';

const missionKind = m => (m.pax ? 'passenger' : m.count && m.commodity ? 'cargo' : m.killCount ? 'kill' : 'other');

// Active missions by destination system, the fullest stack first.
function missionStacks() {
    const now = Date.now();
    const active = [...missions.values()].filter(m => m.status === 'active' && !(Date.parse(m.expiry) <= now));
    const stacks = new Map();
    for (const m of active) {
        const key = firstDestination(m) || NO_DESTINATION;
        if (!stacks.has(key)) stacks.set(key, { system: key, missions: [], pax: 0, cargo: 0, kills: 0, reward: 0, stations: new Set() });
        const stack = stacks.get(key);
        stack.missions.push(m);
        stack.pax += m.pax || 0;
        stack.cargo += (m.commodity && m.count) || 0;
        stack.kills += m.killCount || 0;
        stack.reward += m.reward || 0;
        if (m.destStation) stack.stations.add(m.destStation);
    }
    for (const stack of stacks.values()) {
        stack.expiry = stack.missions.map(m => Date.parse(m.expiry)).filter(Number.isFinite).sort()[0] || null;
        stack.partial = stack.missions.some(m => m.partial);
    }
    return [...stacks.values()].sort((a, b) => b.missions.length - a.missions.length || (a.expiry || 0) - (b.expiry || 0));
}

// What the stack asks of a ship. Kills need no room, so they are not part of the check.
function stackNeeds(stack) {
    const needs = [];
    if (stack.pax) needs.push(`${fmtInt(stack.pax)} passenger${stack.pax > 1 ? 's' : ''}`);
    if (stack.cargo) needs.push(`${fmtInt(stack.cargo)} t cargo`);
    if (stack.kills) needs.push(`${fmtInt(stack.kills)} kill${stack.kills > 1 ? 's' : ''}`);
    return needs.join(' · ') || 'nothing to carry';
}

// Does the ship have room for the whole stack? Without a loadout in the journal nothing can be said.
function stackFit(stack, ship) {
    if (!ship || !ship.loadoutAt) return { known: false, fits: false, short: [] };
    const short = [];
    if (stack.pax > (ship.pax || 0)) short.push(`${fmtInt(stack.pax)} passengers, ${fmtInt(ship.pax || 0)} seats`);
    if (stack.cargo > (ship.cargo || 0)) short.push(`${fmtInt(stack.cargo)} t, a ${fmtInt(ship.cargo || 0)} t hold`);
    return { known: true, fits: !short.length, short };
}

// Ships of the fleet that would take the whole stack, the smallest one that still does it first.
const shipRoom = ship => (ship.pax || 0) + (ship.cargo || 0);
const fleetThatFits = (stack, exceptId) => Object.values(fleet)
    .filter(ship => ship.type && ship.loadoutAt && String(ship.id) !== String(exceptId) && stackFit(stack, ship).fits)
    .sort((a, b) => shipRoom(a) - shipRoom(b));

function missionShip() {
    const id = $('mission-ship').value;
    return fleet[id] || null;
}

function refreshMissionShips() {
    const select = $('mission-ship');
    if (!select) return;
    const previous = select.value;
    const ships = Object.values(fleet).filter(ship => ship.type);
    select.innerHTML = ships.length
        ? ships.map(ship => `<option value="${esc(ship.id)}">${esc((String(ship.id) === String(activeShipId) ? '[ACTIVE] ' : '') + shipTitle(ship))}</option>`).join('')
        : '<option value="">No ship in the journal yet</option>';
    const has = value => [...select.options].some(o => o.value === value);
    select.value = has(previous) ? previous : has(String(activeShipId)) ? String(activeShipId) : select.options[0].value;
}

function missionLine(m) {
    const kind = missionKind(m);
    if (m.partial) return 'accepted before the scanned journal files';
    if (kind === 'passenger') return `${fmtInt(m.pax)} passengers${m.type ? ` (${esc(m.type)})` : ''}${m.vip ? ' · VIP' : ''}${m.wanted ? ' · wanted' : ''}`;
    if (kind === 'cargo') return `${fmtInt(m.count)} t ${esc(m.commodity)}`;
    if (kind === 'kill') return `${fmtInt(m.killCount)} × ${esc(m.target || 'targets')}${m.targetFaction ? ` (${esc(m.targetFaction)})` : ''}`;
    return esc(m.name);
}

function stackItem(i, stack, ship, distance) {
    const fit = stackFit(stack, ship);
    const others = fleetThatFits(stack, ship && ship.id);
    const stations = [...stack.stations];
    const verdict = !ship ? infoBox('No ship with a loadout in the journal: board a ship once.')
        : !fit.known ? infoBox(`Board the ${esc(shipTitle(ship))} once so ALOPEX knows its seats and hold.`)
        : fit.fits ? `<p class="fit-yes">✓ The ${esc(shipTitle(ship))} takes the whole stack.</p>`
        : `<p class="fit-no">✗ The ${esc(shipTitle(ship))} is short: ${esc(fit.short.join(', '))}.</p>`
            + (others.length
                ? `<p class="muted">Takes it all: ${others.map(s => esc(shipTitle(s))).join(', ')}.</p>`
                : '<p class="muted">No other ship in your fleet takes it all either.</p>');
    return accordionItem(i, {
        title: esc(stack.system),
        meta: `${stack.missions.length} mission${stack.missions.length > 1 ? 's' : ''}`
            + `${distance !== null ? ` | ${fmtLy(distance)} LY${jumpsText(distance)}` : ''}`
            + `${stack.expiry ? ` | first one expires in ${timeLeft(new Date(stack.expiry).toISOString())}` : ''}`,
        stat: formatCR(stack.reward),
        statLabel: 'Total reward',
        body: `
        <div class="sell-station-box">
            <strong>Needs:</strong> ${esc(stackNeeds(stack))}
            ${stations.length ? `<br><strong>Station${stations.length > 1 ? 's' : ''}:</strong> ${esc(stations.join(', '))}` : ''}
            ${verdict}
            <ul class="detail-list">
                ${stack.missions.map(m => `<li>◈ ${esc(m.name)} — ${missionLine(m)} · ${formatCR(m.reward || 0)}`
                    + `${m.expiry ? ` · ${timeLeft(m.expiry)}` : ''}</li>`).join('')}
            </ul>
            ${stack.pax ? '<span class="muted">Which cabin class a passenger needs is not in the journal, so only the seats are counted.</span>' : ''}
            <div class="action-row">${stack.system !== NO_DESTINATION ? copyButton(stack.system, 'Copy Destination System', 'btn-cyan') : ''}</div>
        </div>`
    });
}

function searchMissions(btn) {
    return runSearch('missions', btn, async progress => {
        if (!journalFolder) {
            return infoBox('Connect your journal folder first (top right: <strong>Select Folder</strong>). Mission boards are not in any public data, so this works on the missions your own journal records.');
        }
        const stacks = missionStacks();
        if (!stacks.length) {
            return infoBox('No active missions in your journal. Accept one at a station, then press the button again.');
        }
        const ship = missionShip();

        progress('RESOLVING DESTINATION COORDINATES...');
        const here = journalSystem || $('current-system').value.trim();
        const coords = {};
        const names = [...new Set([here, ...stacks.map(s => s.system)].filter(name => name && name !== NO_DESTINATION))];
        await mapLimit(names, 3, async name => { coords[name] = await getSystem(name); }).catch(() => {});

        const total = stacks.reduce((sum, s) => sum + s.missions.length, 0);
        const reward = stacks.reduce((sum, s) => sum + s.reward, 0);
        const stackable = stacks.filter(s => s.missions.length > 1).length;
        const head = `<h4>${total} active mission${total > 1 ? 's' : ''} · ${stacks.length} destination${stacks.length > 1 ? 's' : ''}`
            + `${stackable ? ` · ${stackable} that stack` : ''} · ${formatCR(reward)}</h4>`;
        return head + stacks.map((stack, i) => {
            const dist = coords[here] && coords[stack.system] ? distance3d(coords[here], coords[stack.system]) : null;
            return stackItem(i, stack, ship, dist);
        }).join('');
    });
}
