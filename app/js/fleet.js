'use strict';

// ==========================================
// LIVE FLEET MANAGER
// ==========================================
let fleet = {};
let activeShipId = null;
let appliedShipId = null;   // ship whose loadout was last pushed into the HUD inputs
let fleetDirty = false;
let commanderId = null;     // FID from the journal; saved fleets are kept per commander
let commanderName = null;   // shown by the intro
let fleetSeen = { storedShips: false, sold: new Set() };   // since the fleet was last rebuilt

// The journal scan reads only the newest files. Ships flown before that keep their last known loadout,
// saved per commander in the app's storage.
const FLEET_STORE = 'alopex_fleet';
const SAVED_SHIP_FIELDS = ['id', 'name', 'ident', 'type', 'jump', 'cargo', 'pax', 'modules', 'slots', 'system', 'loadoutAt'];

function readSavedFleets() {
    try {
        const all = JSON.parse(localStorage.getItem(FLEET_STORE) || '{}');
        return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
    } catch (e) { return {}; }
}

function saveFleet() {
    try {
        const all = readSavedFleets();
        const ships = {};
        for (const ship of Object.values(fleet)) {
            if (ship.type) ships[ship.id] = Object.fromEntries(SAVED_SHIP_FIELDS.filter(k => ship[k] !== undefined).map(k => [k, ship[k]]));
        }
        all[commanderId || 'unknown'] = { savedAt: new Date().toISOString(), ships };
        localStorage.setItem(FLEET_STORE, JSON.stringify(all));
    } catch (e) {}
}

// Fills in what the scanned files do not say. A ship sold in them stays sold; a shipyard list
// (StoredShips) in them names every ship still owned, so no other saved ship comes back.
function restoreSavedFleet() {
    const saved = readSavedFleets()[commanderId || 'unknown'];
    if (!saved || !saved.ships || typeof saved.ships !== 'object') return;
    for (const [id, old] of Object.entries(saved.ships)) {
        if (!old || typeof old !== 'object' || fleetSeen.sold.has(String(id))) continue;
        const ship = fleet[id];
        if (!ship) {
            if (!fleetSeen.storedShips) fleet[id] = { ...old, id: old.id ?? id };
            continue;
        }
        for (const key of SAVED_SHIP_FIELDS) if (ship[key] === undefined && old[key] !== undefined) ship[key] = old[key];
    }
    fleetDirty = true;
}

function resetFleet() {
    fleet = {};
    activeShipId = null;
    appliedShipId = null;
    fleetSeen = { storedShips: false, sold: new Set() };
}

// A second account on the same PC: show that commander's own fleet, not a mix of both.
function switchCommander(fid, live) {
    if (fid === commanderId) return;
    const switched = commanderId !== null;
    commanderId = fid;
    if (switched) {
        resetFleet();
        missions.clear();
        fleetDirty = true;
    }
    if (live) restoreSavedFleet();
}

const shipLabel = type => SHIPS[String(type || '').toLowerCase()]?.[0] || type || 'Unknown Ship';
const shipPad = type => SHIPS[String(type || '').toLowerCase()]?.[1];
const shipTitle = ship => ship.name ? `${ship.name} (${shipLabel(ship.type)})` : shipLabel(ship.type);
const isSpaceship = type => !!type && !/buggy|srv|fighter|suit|taxi/i.test(type);

function countSeats(modules = []) {
    let seats = 0;
    for (const mod of modules) {
        const match = /passengercabin_size(\d)_class(\d)/.exec(String(mod.Item || '').toLowerCase());
        if (match) seats += CABIN_SEATS[`${match[1]}_${match[2]}`] || 0;
    }
    return seats;
}

function upsertShip(id, props) {
    const ship = fleet[id] || (fleet[id] = { id });
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== '') ship[k] = v;
    fleetDirty = true;
    return ship;
}

function updateShipDropdown() {
    refreshOutfitShips();
    refreshMissionShips();
    const select = $('ship-preset');
    const previous = select.value;
    const ships = Object.values(fleet);

    if (ships.length === 0) {
        select.innerHTML = '<option value="custom">-- No Live Data found --</option>';
        return;
    }

    let html = '<option value="custom">-- Custom / Manual --</option><optgroup label="Live Fleet (Journal)">';
    for (const ship of ships) {
        const prefix = String(ship.id) === String(activeShipId) ? '[ACTIVE] ' : '';
        html += `<option value="${esc(ship.id)}">${esc(prefix + shipTitle(ship))}</option>`;
    }
    select.innerHTML = html + '</optgroup>';
    select.value = [...select.options].some(o => o.value === previous) ? previous : 'custom';
}

let lastFocus = null;
function openShipManager() {
    playTone('click');
    const modal = $('ship-manager-modal');
    lastFocus = document.activeElement;
    modal.style.display = 'flex';
    void modal.offsetWidth;
    modal.classList.add('show');

    if (!journalFolder) {
        $('sm-ship-list').innerHTML = `
            <div style="text-align: center; color: var(--ed-orange); padding: 20px;">
                <strong>NO CONNECTION</strong><br><br>
                Please select your Journal folder in the top right to scan your fleet.
            </div>`;
    } else {
        renderShipManagerList();
    }
    $('btn-close-modal').focus();
}

function closeShipManager() {
    const modal = $('ship-manager-modal');
    if (!modal.classList.contains('show')) return;
    playTone('click');
    modal.classList.remove('show');
    setTimeout(() => { if (!modal.classList.contains('show')) modal.style.display = 'none'; }, 300);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
}

function renderShipManagerList() {
    const list = $('sm-ship-list');
    const ships = Object.values(fleet);

    if (ships.length === 0) {
        list.innerHTML = '<div style="color: var(--ed-text-muted); font-size: 0.95rem; padding: 10px 0; text-align:center;">Scan in progress or fleet empty...</div>';
        return;
    }

    list.innerHTML = ships.map(ship => {
        const isActive = String(ship.id) === String(activeShipId);
        const statsHtml = ship.jump !== undefined
            ? `<div class="ship-stats">
                    <span>🚀 Jump: <strong class="cyan">${esc(ship.jump)} LY</strong></span>
                    <span>📦 Cargo: <strong class="cyan">${fmtInt(ship.cargo)} T</strong></span>
                    <span>🧑‍🚀 Pax: <strong class="cyan">${fmtInt(ship.pax)}</strong></span>
                    <span>🛬 Pad: <strong class="cyan">${PAD_LABEL[shipPad(ship.type)] || '?'}</strong></span>
                    ${ship.loadoutAt ? `<span>🕓 Loadout: <strong class="cyan">${timeAgo(ship.loadoutAt)}</strong></span>` : ''}
               </div>`
            : `<div class="ship-stats" style="color: var(--ed-red);">Loadout unknown (Board ship to sync)</div>`;
        const action = ship.jump !== undefined
            ? `<button class="btn-cyan btn-small" data-apply-ship="${esc(ship.id)}">Apply Loadout</button>`
            : `<button class="btn-small" disabled>No Data</button>`;
        return `
        <div class="sm-list-item${isActive ? ' active' : ''}">
            <div class="sm-info">
                <div class="ship-type-tag">${esc(shipLabel(ship.type))}</div>
                <strong style="color: ${isActive ? 'var(--ed-green)' : 'var(--ed-orange)'}; font-size:1.1rem; display: block;">${esc(ship.name || 'Unnamed')} ${ship.ident ? `[${esc(ship.ident)}]` : ''}</strong>
                <div class="ship-location">📍 ${esc(ship.system || 'Unknown System')}</div>
                ${statsHtml}
            </div>
            <div class="sm-actions">${action}</div>
        </div>`;
    }).join('');
}

function loadLiveShip(id) {
    $('ship-preset').value = id;
    applyPreset();
    closeShipManager();
    showToast('Ship data applied to HUD.');
    playTone('success');
}

// Mining sell check: the load of the ship you are flying if it carries something, otherwise a full hold.
function cargoToSell(ship) {
    return String(ship.id) === String(activeShipId) && ship.cargoLoaded > 0 ? ship.cargoLoaded : ship.cargo;
}

function applyPreset() {
    const ship = fleet[$('ship-preset').value];
    if (ship && ship.jump !== undefined) setVals(ship.jump, ship.cargo, ship.pax, shipPad(ship.type), cargoToSell(ship));
    savePrefs();
}

function flash(el) {
    el.classList.remove('auto-updated');
    void el.offsetWidth;
    el.classList.add('auto-updated');
}

function setVals(jump, cargo, pax, pad, cargoNow) {
    $('jump-range').value = jump;
    $('cargo-space').value = cargo;
    $('passenger-space').value = pax;
    $('current-cargo').value = cargoNow;
    const ids = ['jump-range', 'cargo-space', 'passenger-space', 'current-cargo'];
    if (pad) { $('pad-size').value = pad; ids.push('pad-size'); }
    ids.forEach(id => flash($(id)));
}
