'use strict';

// ==========================================
// DATA SOURCES & GAME CONSTANTS
// ==========================================
// This page has no direct internet or file access. Market data (Ardent), Spansh searches,
// commodity names and the journal all come from the app core through the global `alopex`
// bridge that preload.cjs provides.

const JOURNAL_FILES_TO_SCAN = 20;
const TRADE_CANDIDATES = 8;
const PAD_LABEL = { 1: 'S', 2: 'M', 3: 'L' };

// Journal "Ship" id (lower case) -> [name, landing pad 1-3]. Source: EDDiscovery ship data.
const SHIPS = {"sidewinder":["Sidewinder",1],"cobramkiii":["Cobra Mk III",1],"empire_trader":["Imperial Clipper",3],"federation_dropship":["Federal Dropship",2],"python":["Python",2],"anaconda":["Anaconda",3],"empire_courier":["Imperial Courier",1],"cobramkiv":["Cobra Mk IV",1],"typex":["Alliance Chieftain",2],"typex_2":["Alliance Crusader",2],"krait_light":["Krait Phantom",2],"mamba":["Mamba",2],"typex_3":["Alliance Challenger",2],"krait_mkii":["Krait Mk II",2],"python_nx":["Python Mk II",2],"cobramkv":["Cobra Mk V",1],"corsair":["Corsair",2],"anacondamkii":["Anaconda Mk II",3],"eagle":["Eagle",1],"viper":["Viper Mk III",1],"vulture":["Vulture",1],"ferdelance":["Fer-de-Lance",2],"empire_eagle":["Imperial Eagle",1],"federation_dropship_mkii":["Federal Assault Ship",2],"federation_gunship":["Federal Gunship",2],"viper_mkiv":["Viper Mk IV",1],"smallcombat01_nx":["Kestrel Mk II",1],"hauler":["Hauler",1],"type6":["Type-6 Transporter",2],"type7":["Type-7 Transporter",3],"type9":["Type-9 Heavy",3],"independant_trader":["Keelback",2],"type9_military":["Type-10 Defender",3],"type8":["Type-8 Transporter",2],"lakonminer":["Type-11 Prospector",2],"adder":["Adder",1],"asp":["Asp Explorer",2],"diamondback":["Diamondback Scout",1],"diamondbackxl":["Diamondback Explorer",1],"asp_scout":["Asp Scout",2],"mandalay":["Mandalay",2],"explorer_nx":["Caspian Explorer",3],"orca":["Orca",3],"belugaliner":["Beluga Liner",3],"dolphin":["Dolphin",1],"mediumtransport01":["Lynx Highliner",2],"federation_corvette":["Federal Corvette",3],"cutter":["Imperial Cutter",3],"panthermkii":["Panther Clipper Mk II",3]};

// int_passengercabin_size{S}_class{C} -> seats (class 0 = prison cell). Source: EDDiscovery module data.
const CABIN_SEATS = { '2_1': 2, '3_1': 4, '3_2': 3, '4_1': 8, '4_2': 6, '4_3': 3, '5_1': 16, '5_2': 10, '5_3': 6, '5_4': 4, '6_1': 32, '6_2': 16, '6_3': 12, '6_4': 8 };

// [genus, species, Vista Genomics base value]. Source: Canonn codex reference.
const EXO_SPECIES = [
    ['Fonticulua', 'Fluctus', 20000000], ['Stratum', 'Tectonicas', 19010800], ['Concha', 'Biconcavis', 19010800],
    ['Tussock', 'Stigmasis', 19010800], ['Fonticulua', 'Segmentatus', 19010800], ['Clypeus', 'Speculumi', 16202800],
    ['Cactoida', 'Vermis', 16202800], ['Recepta', 'Deltahedronix', 16202800], ['Fumerola', 'Extremus', 16202800],
    ['Stratum', 'Cucumisis', 16202800], ['Recepta', 'Conditivus', 14313700], ['Tussock', 'Virgam', 14313700],
    ['Aleoida', 'Gravis', 12934900], ['Osseus', 'Discus', 12934900], ['Recepta', 'Umbrux', 12934900],
    ['Clypeus', 'Margaritus', 11873200], ['Tubus', 'Cavas', 11873200], ['Frutexa', 'Flammasis', 10326000],
    ['Osseus', 'Pellebantus', 9739000], ['Bacterium', 'Informem', 8418000], ['Clypeus', 'Lacrimam', 8418000],
    ['Fungoida', 'Bullarum', 3703200], ['Fungoida', 'Gelata', 3330300]
];
const EXO_VALUE = Object.fromEntries(EXO_SPECIES.map(([g, s, v]) => [`${g} ${s}`, v]));

// Minimum distance between genetic samples of the same genus (metres).
const COLONY_RANGE_M = { Aleoida: 150, Bacterium: 500, Cactoida: 300, Clypeus: 150, Concha: 150, Electricae: 1000, Fonticulua: 500, Frutexa: 150, Fumerola: 100, Fungoida: 300, Osseus: 800, Recepta: 150, Stratum: 500, Tubus: 800, Tussock: 200 };

// Spansh ring signal name -> Ardent commodity id.
const MINING_RESOURCES = { 'Void Opals': 'opal', 'Low Temperature Diamonds': 'lowtemperaturediamond', 'Platinum': 'platinum', 'Painite': 'painite', 'Musgravite': 'musgravite', 'Alexandrite': 'alexandrite', 'Grandidierite': 'grandidierite', 'Monazite': 'monazite', 'Rhodplumsite': 'rhodplumsite', 'Serendibite': 'serendibite', 'Benitoite': 'benitoite', 'Bromellite': 'bromellite', 'Tritium': 'tritium' };

// ==========================================
// UTILS
// ==========================================
const $ = id => document.getElementById(id);
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]);
const fmtInt = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const formatCR = n => fmtInt(n) + ' CR';
const fmtLy = n => (Number(n) || 0).toFixed(1);

function numInput(id, fallback, min, max) {
    let v = parseFloat($(id).value);
    if (!Number.isFinite(v)) v = fallback;
    return Math.min(max, Math.max(min, v));
}

function requireSystem() {
    const sys = $('current-system').value.trim();
    if (!sys) throw new Error('Enter your current system first.');
    return sys;
}

function timeAgo(iso) {
    const t = Date.parse(iso);
    if (!t) return 'age unknown';
    const s = (Date.now() - t) / 1000;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
}

function timeLeft(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (!Number.isFinite(ms)) return 'unknown';
    if (ms <= 0) return 'expired';
    const h = Math.floor(ms / 3600000);
    return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${Math.floor(ms / 60000) % 60} min`;
}

function jumpsText(ly) {
    const range = parseFloat($('jump-range').value);
    if (!(range > 0) || !(ly > 0)) return '';
    const jumps = Math.ceil(ly / range);
    return ` | min. ${jumps} jump${jumps > 1 ? 's' : ''}`;
}

const distance3d = (a, b) => Math.hypot(a.systemX - b.systemX, a.systemY - b.systemY, a.systemZ - b.systemZ);
const requiredPad = () => parseInt($('pad-size').value, 10) || 1;
// Station types as Ardent reports them; the planetary ones sit on a planet surface.
const STATION_TYPES = {
    Coriolis: 'Coriolis starport', Orbis: 'Orbis starport', Ocellus: 'Ocellus starport', Dodec: 'Dodec starport',
    AsteroidBase: 'Asteroid base', Outpost: 'Outpost', MegaShip: 'Megaship', FleetCarrier: 'Fleet Carrier',
    StrongholdCarrier: 'Stronghold carrier', SpaceConstructionDepot: 'Construction site',
    CraterPort: 'Port', CraterOutpost: 'Outpost', SurfaceStation: 'Surface station', OnFootSettlement: 'Settlement',
    PlanetaryConstructionDepot: 'Construction site', DockablePlanetStation: 'Station'
};
const PLANETARY_TYPES = new Set(['CraterPort', 'CraterOutpost', 'SurfaceStation', 'OnFootSettlement', 'PlanetaryConstructionDepot', 'DockablePlanetStation']);

const carriersAllowed = () => $('include-carriers').checked;
const planetaryAllowed = () => $('include-planetary').checked;
// Station type allowed by the STATIONS switches (Fleet Carriers, planetary stations)?
const stationTypeAllowed = type => (carriersAllowed() || type !== 'FleetCarrier') && (planetaryAllowed() || !PLANETARY_TYPES.has(type));
// Market row usable with the current ship? (pad size and station type)
const marketOk = row => (row.maxLandingPadSize == null || row.maxLandingPadSize >= requiredPad()) && stationTypeAllowed(row.stationType);
// Appended to "nothing found" messages, so a hidden station type is not mistaken for no market at all.
const planetaryHint = () => planetaryAllowed() ? '' : ' Planetary stations are hidden (see "Include planetary stations").';

// Runs fn over items with limited concurrency. Failed items become null; throws only if every item failed.
async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0, firstError = null;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            try { results[i] = await fn(items[i], i); } catch (e) { results[i] = null; firstError = firstError || e; }
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    if (firstError && results.every(r => r == null)) throw firstError;
    return results;
}

// ==========================================
// API CLIENTS
// ==========================================
// The app core answers { ok: true, data } or { ok: false, error }.
async function unwrap(request) {
    const result = await request;
    if (!result || !result.ok) throw new Error(result ? result.error : 'No answer from the app core');
    return result.data;
}

const ardent = (path, params = {}) => unwrap(alopex.ardent(path, params));
const sysPath = name => '/system/name/' + encodeURIComponent(name);
const marketParams = () => ({ maxDaysAgo: parseInt($('price-age').value, 10) || 7, fleetCarriers: carriersAllowed() ? undefined : false });

const systemCache = new Map();
function getSystem(name) {
    const key = name.toLowerCase();
    if (!systemCache.has(key)) {
        systemCache.set(key, ardent(sysPath(name)).catch(e => { systemCache.delete(key); throw e; }));
    }
    return systemCache.get(key);
}

const spanshSearch = (type, body) => unwrap(alopex.spansh(type, body));

// Commodity display names (Ardent uses lower-case FDev symbols)
let commodityNames = {};
async function loadCommodityNames() {
    if (Object.keys(commodityNames).length) return;
    try { commodityNames = await unwrap(alopex.commodityNames()); } catch (e) {}
}
const commodityLabel = id => commodityNames[id] || id;

// ==========================================
// WEB AUDIO API (Cockpit Sounds)
// ==========================================
let audioCtx;
let isAudioMuted = false;

function updateAudioButtonUI() {
    const btn = $('btn-audio');
    btn.textContent = isAudioMuted ? '🔇 SFX: OFF' : '🔊 SFX: ON';
    btn.classList.toggle('btn-cyan', !isAudioMuted);
    btn.classList.toggle('btn-muted', isAudioMuted);
}

function toggleAudio() {
    isAudioMuted = !isAudioMuted;
    try { localStorage.setItem('alopex_audio_muted', isAudioMuted ? 'true' : 'false'); } catch (e) {}
    updateAudioButtonUI();
    if (!isAudioMuted) {
        playTone('success');
        showToast('Cockpit audio enabled');
    } else {
        showToast('Cockpit audio muted');
    }
}

function loadAudioPref() {
    try { isAudioMuted = localStorage.getItem('alopex_audio_muted') === 'true'; } catch (e) {}
    updateAudioButtonUI();
}

function initAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(type) {
    if (isAudioMuted) return;
    initAudio();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === 'click') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
        gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now); osc.stop(now + 0.08);
    } else if (type === 'success') {
        osc.type = 'square'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.03, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'alert') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, now); osc.frequency.setValueAtTime(400, now + 0.1); osc.frequency.setValueAtTime(300, now + 0.2);
        gain.gain.setValueAtTime(0.06, now); gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    }
}

document.body.addEventListener('mousedown', initAudio, { once: true });
document.body.addEventListener('touchstart', initAudio, { once: true });

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
const SAVED_SHIP_FIELDS = ['id', 'name', 'ident', 'type', 'jump', 'cargo', 'pax', 'modules', 'system', 'loadoutAt'];

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

// ==========================================
// PREFS & THEME
// ==========================================
const inputsToSave = ['theme-selector', 'current-system', 'jump-range', 'pad-size', 'include-carriers', 'include-planetary', 'cargo-space', 'max-trade-dist', 'price-age', 'passenger-space', 'passenger-type', 'mine-resource', 'mine-radius', 'current-cargo', 'sell-radius', 'exo-target', 'exo-radius', 'outfit-radius', 'outfit-buy-ship', 'intro-enabled'];

function savePrefs() {
    try {
        inputsToSave.forEach(id => {
            const el = $(id);
            localStorage.setItem('ed_nav_' + id, el.type === 'checkbox' ? String(el.checked) : el.value);
        });
    } catch (e) {}
}

function loadPrefs() {
    try {
        inputsToSave.forEach(id => {
            const val = localStorage.getItem('ed_nav_' + id);
            if (val === null) return;
            const el = $(id);
            if (el.type === 'checkbox') el.checked = val === 'true';
            else if (el.tagName !== 'SELECT' || [...el.options].some(o => o.value === val)) el.value = val;
        });
    } catch (e) {}
    changeTheme(false);
}

inputsToSave.forEach(id => {
    $(id).addEventListener('change', savePrefs);
    $(id).addEventListener('input', savePrefs);
});

function changeTheme(playSnd = true) {
    const theme = $('theme-selector').value;
    if (theme === 'default') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    if (playSnd) playTone('success');
    savePrefs();
}

// ==========================================
// UI HELPERS
// ==========================================
function showToast(message, isWarning = false) {
    if (!isWarning && $('intro')) return;   // the intro already shows the start-up status
    const toast = document.createElement('div');
    toast.className = 'toast' + (isWarning ? ' toast-warning' : '');
    const icon = document.createElement('span');
    icon.textContent = '◈';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);
    $('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function copyToClipboard(text) {
    playTone('click');
    alopex.copy(text);
    showToast(`"${text}" copied!`);
}

function openTab(tabId, buttonElement) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => { btn.classList.remove('active'); btn.setAttribute('aria-selected', 'false'); });
    $(tabId).classList.add('active');
    buttonElement.classList.add('active');
    buttonElement.setAttribute('aria-selected', 'true');
}

function toggleAccordion(header) {
    playTone('click');
    const item = header.closest('.accordion-item');
    const open = item.classList.toggle('open');
    header.setAttribute('aria-expanded', String(open));
}

const warningBox = html => `<div class="warning-box">${html}</div>`;
const infoBox = html => `<div class="info-box">${html}</div>`;
const errorBox = message => warningBox(`<strong>⚠️ Query failed:</strong> ${esc(message)}`);
const copyButton = (text, label, cls = '') => `<button class="${cls}" data-copy="${esc(text)}">${esc(label)}</button>`;

function accordionItem(idx, { title, meta, stat, statLabel, body }) {
    return `
    <div class="accordion-item stagger-item" style="animation-delay: ${(idx * 0.12).toFixed(2)}s">
        <div class="accordion-header" role="button" tabindex="0" aria-expanded="false">
            <div class="header-main"><span class="chevron" aria-hidden="true">▼</span><div class="title-block">
                <div class="accordion-title">${title}</div>
                <div class="accordion-meta">${meta}</div>
            </div></div>
            <div class="header-stat"><div class="stat-value">${stat}</div><div class="stat-label">${statLabel}</div></div>
        </div>
        <div class="accordion-body-wrapper"><div class="accordion-body-inner"><div class="accordion-content">${body}</div></div></div>
    </div>`;
}

function stationKind(row) {
    const label = STATION_TYPES[row.stationType];
    if (!label) return '<span class="station-kind">❔ Type unknown</span>';
    if (!PLANETARY_TYPES.has(row.stationType)) return `<span class="station-kind">🛰️ Orbital · ${label}</span>`;
    const body = row.bodyName && row.bodyName !== row.stationName ? ` · on ${esc(row.bodyName)}` : '';
    return `<span class="station-kind planetary">🪐 Planetary · ${label}${body}</span>`;
}

function stationLine(row) {
    const parts = [esc(row.systemName), `Pad ${PAD_LABEL[row.maxLandingPadSize] || '?'}`];
    if (row.distanceToArrival) parts.push(`${fmtInt(row.distanceToArrival)} Ls`);
    return `${esc(row.stationName)} <span class="muted">(${parts.join(' · ')})</span> ${stationKind(row)}`;
}

// Shared wrapper: loading bar, disabled button, error display.
async function runSearch(tab, button, task) {
    if (button.disabled) return;
    const results = $(`${tab}-results`);
    const loading = $(`${tab}-loading`);
    const label = loading.querySelector('.loading-text');
    label.dataset.default = label.dataset.default || label.textContent;
    label.textContent = label.dataset.default;
    button.disabled = true;
    results.innerHTML = '';
    loading.style.display = 'block';
    try {
        results.innerHTML = await task(msg => { label.textContent = msg; });
        playTone('success');
    } catch (e) {
        results.innerHTML = errorBox(e.message);
        playTone('alert');
    } finally {
        loading.style.display = 'none';
        button.disabled = false;
    }
}

// Buttons declare their action with data-action / data-tab (no inline handlers, so a strict CSP is possible).
const ACTIONS = {
    toggleAudio: () => toggleAudio(),
    connectJournal: () => chooseJournalFolder(),
    rescanJournal: btn => manualSync(btn),
    openShipManager: () => openShipManager(),
    closeShipManager: () => closeShipManager(),
    searchTrade: btn => searchTradeRoutes(btn),
    searchPassenger: btn => searchPassengerRoutes(btn),
    searchMining: btn => searchMiningHotspots(btn),
    searchExo: btn => searchExoRoutes(btn),
    addOutfitPart: () => addOutfitPart(),
    addCorePackage: () => addCorePackage(),
    updateAction: () => updateAction(),
    closeUpdateNotice: () => { $('update-notice').hidden = true; },
    searchOutfit: btn => searchOutfitting(btn)
};

document.addEventListener('click', e => {
    const action = e.target.closest('[data-action]');
    if (action) return ACTIONS[action.dataset.action](action);
    const tab = e.target.closest('[data-tab]');
    if (tab) return openTab(tab.dataset.tab, tab);
    if (e.target.id === 'ship-manager-modal') return closeShipManager();
    const copy = e.target.closest('[data-copy]');
    if (copy) return copyToClipboard(copy.dataset.copy);
    const sell = e.target.closest('[data-sell-system]');
    if (sell) return findSellStation(sell);
    const apply = e.target.closest('[data-apply-ship]');
    if (apply) return loadLiveShip(apply.dataset.applyShip);
    const removePart = e.target.closest('[data-remove-part]');
    if (removePart) return removeOutfitPart(removePart.dataset.removePart);
    const header = e.target.closest('.accordion-header');
    if (header) toggleAccordion(header);
});

document.addEventListener('mousedown', e => {
    if (e.target.closest('[data-sound]')) playTone('click');
});
$('theme-selector').addEventListener('change', () => changeTheme());
$('ship-preset').addEventListener('change', () => { applyPreset(); playTone('success'); });
$('outfit-ship').addEventListener('change', () => { outfitShipChosen = true; refreshOutfitModules(); });
$('outfit-search').addEventListener('input', () => {
    if ($('outfit-search').value !== outfitModule) {
        outfitModule = null;
        refreshOutfitVariants();
    }
    suggestIndex = $('outfit-search').value.trim() ? 0 : -1;
    renderSuggestions();
});
$('outfit-search').addEventListener('focus', () => renderSuggestions());
$('outfit-search').addEventListener('blur', () => closeSuggestions());
$('outfit-search').addEventListener('keydown', e => {
    const list = $('outfit-suggest');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) renderSuggestions();
        suggestIndex = Math.max(0, Math.min(suggestHits.length - 1, suggestIndex + (e.key === 'ArrowDown' ? 1 : -1)));
        renderSuggestions();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const hit = suggestHits[Math.max(0, suggestIndex)];
        if (hit) choosePart(hit.name, suggestVariant);
    } else if (e.key === 'Escape') {
        closeSuggestions();
    }
});
// mousedown, not click: picking a part must not blur (and close) the search field first
$('outfit-suggest').addEventListener('mousedown', e => {
    e.preventDefault();
    const option = e.target.closest('[data-part]');
    if (option) choosePart(option.dataset.part, suggestVariant);
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('ship-manager-modal').classList.contains('show')) closeShipManager();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('accordion-header')) {
        e.preventDefault();
        toggleAccordion(e.target);
    }
});

// ==========================================
// JOURNAL LOGIC (incremental reading)
// ==========================================
let journalFolder = null;
let journalFile = null;          // { name, offset, remainder }
let journalSystem = null;
let journalStation = null;
let journalScanning = false;
let pollTimer = null;
let pollErrors = 0;
let pollCount = 0;
const missions = new Map();

function setJournalStatus(text, active) {
    const el = $('journal-status');
    el.textContent = text;
    el.classList.toggle('active', active);
}

function updateSyncTime() {
    const now = new Date();
    $('sync-time').textContent = `${now.toLocaleDateString('de-DE')} - ${now.toLocaleTimeString('de-DE')}`;
}

// The app core finds the Elite Dangerous journal folder by itself; "Select Folder" picks another one.
async function startJournal() {
    try {
        const folder = await unwrap(alopex.journal.folder());
        if (folder) return await connectJournal(folder);
    } catch (e) {}
    setJournalStatus('🔴 Journal folder not found – use "Select Folder"', false);
}

async function chooseJournalFolder() {
    try {
        const folder = await unwrap(alopex.journal.choose());
        if (folder) await connectJournal(folder);
    } catch (e) {
        showToast('Journal folder could not be opened: ' + e.message, true);
        playTone('alert');
    }
}

async function connectJournal(folder) {
    journalFolder = folder;
    setJournalStatus('🟢 Journal Auto-Link active', true);
    $('journal-status').title = folder;
    showToast('Uplink established! Loading fleet data...');
    playTone('success');
    pollErrors = 0;
    await performFullJournalScan();
    schedulePoll();
}

// [{ name, size }], oldest first
const listJournals = () => unwrap(alopex.journal.list());
// { size, text }: everything from byte offset to the current end of the file
const readJournal = (name, offset) => unwrap(alopex.journal.read(name, offset));

async function performFullJournalScan() {
    if (!journalFolder || journalScanning) return;
    journalScanning = true;
    try {
        const files = await listJournals();
        if (!files.length) {
            showToast('No Journal.*.log files in this folder.', true);
            return;
        }
        resetFleet();
        commanderId = null;
        commanderName = null;
        missions.clear();
        for (const { name } of files.slice(-JOURNAL_FILES_TO_SCAN)) {
            journalFile = { name, offset: 0, remainder: '' };
            const { size, text } = await readJournal(name, 0);
            consumeJournalChunk(text, false);
            journalFile.offset = size;
        }
        restoreSavedFleet();
        saveFleet();

        updateShipDropdown();
        const active = fleet[activeShipId];
        if (active && active.jump !== undefined) {
            $('ship-preset').value = String(activeShipId);
            applyPreset();
            appliedShipId = activeShipId;
        }
        fleetDirty = false;
        if (journalSystem) {
            const input = $('current-system');
            if (input.value !== journalSystem) { input.value = journalSystem; flash(input); savePrefs(); }
        }
        if ($('ship-manager-modal').classList.contains('show')) renderShipManagerList();
        updateSyncTime();
        showToast('Fleet synchronized.');
    } catch (e) {
        console.error(e);
        showToast('Journal scan failed: ' + e.message, true);
    } finally {
        journalScanning = false;
    }
}

function schedulePoll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(pollJournal, 3000);
}

async function pollJournal() {
    if (!journalFolder || !journalFile) return;
    if (!journalScanning) {
        try {
            await readJournalDelta();
            // A new journal file appears after a game restart or a "Continued" split; checking every ~30 s is enough.
            if (++pollCount % 10 === 0 || journalFile.checkForNewer) {
                journalFile.checkForNewer = false;
                const files = await listJournals();
                const newest = files[files.length - 1];
                if (newest && newest.name !== journalFile.name) {
                    journalFile = { name: newest.name, offset: 0, remainder: '' };
                    await readJournalDelta();
                }
            }
            pollErrors = 0;
        } catch (e) {
            if (++pollErrors >= 5) {
                setJournalStatus('🔴 Journal Error – use "Select Folder"', false);
                showToast('Journal connection lost. Please select the folder again.', true);
                journalFolder = null;
                return;
            }
        }
    }
    schedulePoll();
}

async function readJournalDelta() {
    const { size, text } = await readJournal(journalFile.name, journalFile.offset);
    if (size < journalFile.offset) { journalFile.offset = 0; journalFile.remainder = ''; return; }   // file was replaced
    if (size === journalFile.offset) return;
    journalFile.offset = size;
    consumeJournalChunk(text, true);
    updateSyncTime();
}

function consumeJournalChunk(text, live) {
    const lines = (journalFile.remainder + text).split(/\r?\n/);
    journalFile.remainder = lines.pop();   // incomplete last line (game still writing)
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        let event;
        try { event = JSON.parse(line); } catch (e) { continue; }
        handleJournalEvent(event, live);
    }
    if (live && fleetDirty) {
        fleetDirty = false;
        saveFleet();
        updateShipDropdown();
        if ($('ship-manager-modal').classList.contains('show')) renderShipManagerList();
    }
}

function setJournalSystem(name, live, isJump) {
    journalSystem = name;
    if (fleet[activeShipId]) { fleet[activeShipId].system = name; fleetDirty = true; }
    if (!live) return;
    const input = $('current-system');
    if (input.value !== name) { input.value = name; flash(input); savePrefs(); }
    if (isJump) { showToast(`Jump detected: ${name}`); playTone('alert'); }
}

function setActiveShip(id, live, hasLoadout) {
    if (String(activeShipId) !== String(id)) fleetDirty = true;
    activeShipId = id;
    if (!live || !hasLoadout) return;
    const swapped = String(appliedShipId) !== String(id);
    // Follow a ship swap; after outfitting changes only update if this ship is the one selected.
    if (swapped || $('ship-preset').value === String(id)) {
        updateShipDropdown();
        $('ship-preset').value = String(id);
        applyPreset();
        appliedShipId = id;
        if (swapped) { showToast(`Active ship: ${shipTitle(fleet[id])}`); playTone('success'); }
    }
}

function handleJournalEvent(ev, live) {
    switch (ev.event) {
        case 'Location':
        case 'FSDJump':
        case 'CarrierJump':
            journalStation = ev.Docked ? (ev.StationName || null) : null;
            if (ev.StarSystem) setJournalSystem(ev.StarSystem, live, ev.event !== 'Location');
            break;
        case 'Docked':
            journalStation = ev.StationName || null;
            if (ev.StarSystem) setJournalSystem(ev.StarSystem, live, false);
            break;
        case 'Undocked':
            journalStation = null;
            break;
        case 'Continued':
        case 'Shutdown':
            if (journalFile) journalFile.checkForNewer = true;
            break;
        case 'Commander':
            if (ev.FID) switchCommander(ev.FID, live);
            if (ev.Name) commanderName = ev.Name;
            break;
        case 'LoadGame':
            if (ev.FID) switchCommander(ev.FID, live);
            if (ev.Commander) commanderName = ev.Commander;
            if (isSpaceship(ev.Ship) && ev.ShipID != null) {
                upsertShip(ev.ShipID, { name: ev.ShipName, ident: ev.ShipIdent, type: ev.Ship });
                setActiveShip(ev.ShipID, live, false);
            }
            break;
        case 'Loadout':
            if (isSpaceship(ev.Ship) && ev.ShipID != null) {
                upsertShip(ev.ShipID, {
                    name: ev.ShipName, ident: ev.ShipIdent, type: ev.Ship,
                    jump: ev.MaxJumpRange ? Number(ev.MaxJumpRange.toFixed(2)) : 0,
                    cargo: ev.CargoCapacity || 0,
                    pax: countSeats(ev.Modules),
                    modules: (ev.Modules || []).map(m => String(m.Item || '').toLowerCase()).filter(Boolean),
                    loadoutAt: ev.timestamp,
                    system: journalSystem
                });
                setActiveShip(ev.ShipID, live, true);
            }
            break;
        case 'Cargo':
            // Load of the ship being flown; the mining field follows it while that ship is selected.
            if (ev.Vessel === 'Ship' && Number.isFinite(ev.Count) && fleet[activeShipId]) {
                const ship = fleet[activeShipId];
                ship.cargoLoaded = ev.Count;
                const input = $('current-cargo');
                if (live && $('ship-preset').value === String(ship.id) && Number(input.value) !== cargoToSell(ship)) {
                    input.value = cargoToSell(ship);
                    flash(input);
                    savePrefs();
                }
            }
            break;
        case 'StoredShips':
            fleetSeen.storedShips = true;
            for (const sh of ev.ShipsHere || []) upsertShip(sh.ShipID, { name: sh.Name, type: sh.ShipType, system: ev.StarSystem });
            for (const sh of ev.ShipsRemote || []) upsertShip(sh.ShipID, { name: sh.Name, type: sh.ShipType, system: sh.InTransit ? 'In transit' : sh.StarSystem });
            break;
        case 'ShipyardSell':
        case 'SellShipOnRebuy': {
            const id = ev.SellShipID ?? ev.SellShipId;   // the journal spells it both ways
            delete fleet[id];
            fleetSeen.sold.add(String(id));
            fleetDirty = true;
            break;
        }
        case 'MissionAccepted':
            if (ev.PassengerCount === undefined) break;
            missions.set(ev.MissionID, {
                id: ev.MissionID, name: ev.LocalisedName || ev.Name, reward: ev.Reward || 0,
                pax: ev.PassengerCount, vip: !!ev.PassengerVIPs, wanted: !!ev.PassengerWanted, type: ev.PassengerType || '',
                destSystem: ev.DestinationSystem || '', destStation: ev.DestinationStation || '',
                originSystem: journalSystem, originStation: journalStation,
                expiry: ev.Expiry, accepted: ev.timestamp, status: 'active'
            });
            break;
        case 'MissionRedirected': {
            const m = missions.get(ev.MissionID);
            if (m) { m.destSystem = ev.NewDestinationSystem || m.destSystem; m.destStation = ev.NewDestinationStation || m.destStation; }
            break;
        }
        case 'MissionCompleted': {
            const m = missions.get(ev.MissionID);
            if (m) { m.status = 'completed'; if (ev.Reward != null) m.reward = ev.Reward; m.completed = ev.timestamp; }
            break;
        }
        case 'MissionFailed':
        case 'MissionAbandoned': {
            const m = missions.get(ev.MissionID);
            if (m) m.status = ev.event === 'MissionFailed' ? 'failed' : 'abandoned';
            break;
        }
        case 'Missions': {
            // Written at login: the authoritative list of active missions.
            const activeIds = new Set((ev.Active || []).map(a => a.MissionID));
            for (const m of missions.values()) if (m.status === 'active' && !activeIds.has(m.id)) m.status = 'gone';
            for (const a of ev.Active || []) {
                if (a.PassengerMission && !missions.has(a.MissionID)) {
                    const name = String(a.Name || 'Passenger mission').replace(/^Mission_|_name$/gi, '').replace(/_/g, ' ');
                    missions.set(a.MissionID, { id: a.MissionID, name, partial: true, status: 'active',
                        expiry: new Date(Date.parse(ev.timestamp) + (a.Expires || 0) * 1000).toISOString() });
                }
            }
            break;
        }
    }
}

async function manualSync(btn) {
    if (!journalFolder) {
        showToast('No journal folder connected – use "Select Folder".', true);
        playTone('alert');
        return;
    }
    if (btn.disabled) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Syncing...';
    try {
        await performFullJournalScan();
        playTone('success');
    } finally {
        btn.textContent = label;
        btn.disabled = false;
    }
}

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

// ==========================================
// 2. PASSENGER MISSIONS (own journal)
// ==========================================
const firstDestination = m => String(m.destSystem || '').split('$MISSIONUTIL_MULTIPLE_INNER_SEPARATOR;')[0];
const destinationLabel = m => String(m.destSystem || '').split('$MISSIONUTIL_MULTIPLE_INNER_SEPARATOR;').filter(Boolean).join(' → ');

function searchPassengerRoutes(btn) {
    return runSearch('passenger', btn, async progress => {
        if (!journalFolder) {
            return infoBox('Connect your journal folder first (top right: <strong>Select Folder</strong>). Passenger mission boards are not available through any public API, so this view analyses the missions recorded in your own journal.');
        }
        const filter = $('passenger-type').value;
        const matches = m => filter === 'all' || m.partial || (filter === 'vip') === !!m.vip;
        const all = [...missions.values()].filter(matches);
        const now = Date.now();
        const active = all.filter(m => m.status === 'active' && !(Date.parse(m.expiry) <= now))
            .sort((a, b) => (Date.parse(a.expiry) || 0) - (Date.parse(b.expiry) || 0));
        const completed = all.filter(m => m.status === 'completed' && m.originSystem && m.destSystem);

        progress('RESOLVING DESTINATION COORDINATES...');
        const here = journalSystem || $('current-system').value.trim();
        const coords = {};
        const names = [...new Set([here, ...active.map(firstDestination)].filter(Boolean))];
        await mapLimit(names, 3, async name => { coords[name] = await getSystem(name); }).catch(() => {});

        let html = '';
        const seats = active.reduce((sum, m) => sum + (m.pax || 0), 0);
        const cabins = numInput('passenger-space', 0, 0, 10000);
        const totalReward = active.reduce((sum, m) => sum + (m.reward || 0), 0);
        html += `<h4>Active passenger missions: ${active.length} · Seats ${fmtInt(seats)} / ${fmtInt(cabins)} · Total ${formatCR(totalReward)}</h4>`;
        if (!active.length) html += infoBox('No active passenger missions in your journal. Accept missions at a station, then press the button again.');

        html += active.map((m, i) => {
            const dest = firstDestination(m);
            const dist = coords[here] && coords[dest] ? distance3d(coords[here], coords[dest]) : null;
            const warn = m.wanted ? warningBox('<strong>⚠️ Wanted passengers:</strong> expect security scans.') : '';
            const body = m.partial
                ? infoBox('Accepted before the scanned journal files – details are in an older journal file.')
                : `<ul class="detail-list">
                        <li>◈ Mission: ${esc(m.name)}</li>
                        <li>◈ Passengers: ${fmtInt(m.pax)} ${m.type ? '(' + esc(m.type) + ')' : ''} · ${m.vip ? 'VIP' : 'Bulk'}</li>
                        <li>◈ Destination: ${esc(destinationLabel(m))}${m.destStation ? ' / ' + esc(m.destStation) : ''}</li>
                        <li>◈ Accepted at: ${esc(m.originSystem || 'unknown')}${m.originStation ? ' / ' + esc(m.originStation) : ''}</li>
                        <li>◈ Expires in: ${timeLeft(m.expiry)}</li>
                   </ul>${warn}
                   <div class="action-row">${dest ? copyButton(dest, 'Copy Destination System', 'btn-cyan') : ''}</div>`;
            return accordionItem(i, {
                title: esc(m.partial ? m.name : destinationLabel(m) || 'Unknown destination'),
                meta: m.partial ? 'Details not in scanned files' : `${fmtInt(m.pax)} pax · ${m.vip ? 'VIP' : 'Bulk'}${dist !== null ? ` | ${fmtLy(dist)} LY${jumpsText(dist)}` : ''} | expires in ${timeLeft(m.expiry)}`,
                stat: m.partial ? '—' : formatCR(m.reward),
                statLabel: 'Reward',
                body
            });
        }).join('');

        const routes = {};
        for (const m of completed) {
            const key = `${m.originSystem}|${firstDestination(m)}`;
            const r = routes[key] || (routes[key] = { from: m.originSystem, station: m.originStation, to: firstDestination(m), runs: 0, total: 0, pax: 0, best: 0 });
            r.runs++; r.total += m.reward || 0; r.pax += m.pax || 0; r.best = Math.max(r.best, m.reward || 0);
        }
        const top = Object.values(routes).sort((a, b) => b.total / b.runs - a.total / a.runs).slice(0, 5);
        html += `<h4>Your best paying passenger routes (last ${JOURNAL_FILES_TO_SCAN} journal files)</h4>`;
        if (!top.length) html += infoBox('No completed passenger missions in the scanned journal files yet.');
        html += top.map((r, i) => accordionItem(active.length + i, {
            title: `${esc(r.from)} ➔ ${esc(r.to)}`,
            meta: `${r.runs} completed mission${r.runs > 1 ? 's' : ''} · Ø ${fmtInt(r.pax / r.runs)} pax`,
            stat: formatCR(r.total / r.runs),
            statLabel: 'Average reward / mission',
            body: `<ul class="detail-list">
                        <li>◈ Start station: ${esc(r.station || 'unknown')}</li>
                        <li>◈ Best single reward: ${formatCR(r.best)}</li>
                        <li>◈ Total earned on this route: ${formatCR(r.total)}</li>
                   </ul>
                   <div class="action-row">${copyButton(r.from, 'Copy Start System')}${copyButton(r.to, 'Copy Destination System', 'btn-cyan')}</div>`
        })).join('');
        return html;
    });
}

// ==========================================
// 3. MINING HOTSPOTS (Spansh) & SELL STATIONS (Ardent)
// ==========================================
function normalizeSignals(signals) {
    if (Array.isArray(signals)) return signals.map(s => ({ name: s.name, count: s.count || 1 }));
    const obj = (signals && signals.signals) || signals || {};
    return Object.entries(obj).filter(([, v]) => typeof v === 'number').map(([name, count]) => ({ name, count }));
}

function searchMiningHotspots(btn) {
    return runSearch('mining', btn, async progress => {
        const sys = requireSystem();
        const resource = $('mine-resource').value;
        const radius = numInput('mine-radius', 50, 1, 500);
        progress('QUERYING SPANSH RING DATABASE...');
        const data = await spanshSearch('bodies', {
            filters: {
                distance: { min: 0, max: radius },
                ring_signals: [{ comparison: '<=>', count: [1, 9999], name: [resource] }]
            },
            reference_system: sys,
            sort: [{ distance: { direction: 'asc' } }],
            size: 10,
            page: 0
        });

        const rings = [];
        for (const body of (data && data.results) || []) {
            for (const ring of body.rings || []) {
                const signals = normalizeSignals(ring.signals);
                const hit = signals.find(s => String(s.name).toLowerCase() === resource.toLowerCase());
                if (hit) rings.push({ body, ring, count: hit.count, others: signals.filter(s => s !== hit) });
            }
        }
        if (!rings.length) {
            return infoBox(`No ring with a mapped <strong>${esc(resource)}</strong> hotspot within ${fmtInt(radius)} LY of ${esc(sys)} in the Spansh database. Increase the radius – hotspots are only known where commanders have mapped the ring.`);
        }

        return rings.map(({ body, ring, count, others }, i) => {
            const targetId = `mining-station-${i}`;
            const details = [
                `<li>◈ Ring type: ${esc(ring.type || 'unknown')}</li>`,
                body.reserve_level ? `<li>◈ Reserve level: ${esc(body.reserve_level)}</li>` : '',
                others.length ? `<li>◈ Other hotspots in this ring: ${others.map(o => `${esc(o.name)} ×${o.count}`).join(', ')}</li>` : ''
            ].join('');
            return accordionItem(i, {
                title: esc(ring.name || body.name),
                meta: `${esc(body.system_name)} | ${fmtLy(body.distance)} LY${jumpsText(body.distance)}${body.distance_to_arrival ? ` | ${fmtInt(body.distance_to_arrival)} Ls` : ''}`,
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

// ==========================================
// 4. EXOBIOLOGY (Spansh body search)
// ==========================================
function searchExoRoutes(btn) {
    return runSearch('exobio', btn, async progress => {
        const sys = requireSystem();
        const [genus, species] = $('exo-target').value.split('|');
        const target = `${genus} ${species}`;
        const radius = numInput('exo-radius', 100, 1, 1000);
        progress('QUERYING SPANSH BODY DATABASE...');
        const data = await spanshSearch('bodies', {
            filters: {
                distance: { min: 0, max: radius },
                landmarks: [{ type: genus, subtype: [target] }]
            },
            reference_system: sys,
            sort: [{ distance: { direction: 'asc' } }],
            size: 10,
            page: 0
        });
        const bodies = (data && data.results) || [];
        if (!bodies.length) {
            return infoBox(`No body with a logged <strong>${esc(target)}</strong> within ${fmtInt(radius)} LY of ${esc(sys)}. Increase the radius or choose another species.`);
        }

        return bodies.map((b, i) => {
            const speciesHere = [...new Set((b.landmarks || []).map(l => l.subtype).filter(Boolean))];
            const bodyTotal = speciesHere.reduce((sum, s) => sum + (EXO_VALUE[s] || 0), 0);
            const gravity = Number(b.gravity);
            const gravWarning = gravity > 1.4 ? ' <span style="color: var(--ed-red); font-weight:bold;">[HIGH-G WARNING!]</span>' : '';
            const range = COLONY_RANGE_M[genus];
            return accordionItem(i, {
                title: esc(b.name),
                meta: `${esc(b.system_name)} | ${fmtLy(b.distance)} LY${jumpsText(b.distance)}${b.distance_to_arrival ? ` | ${fmtInt(b.distance_to_arrival)} Ls` : ''}`,
                stat: formatCR(EXO_VALUE[target]),
                statLabel: 'Base value (Vista Genomics)',
                body: `
                <div class="sell-station-box">
                    <ul class="detail-list">
                        <li>◈ Body type: ${esc(b.subtype || 'unknown')}</li>
                        <li>◈ Atmosphere: ${esc(b.atmosphere || 'unknown')}</li>
                        <li>◈ Surface gravity: ${Number.isFinite(gravity) ? gravity.toFixed(2) + ' G' : 'unknown'}${gravWarning}</li>
                        ${b.surface_temperature ? `<li>◈ Surface temperature: ${fmtInt(b.surface_temperature)} K</li>` : ''}
                        <li>◈ Species logged on this body: ${speciesHere.map(s => esc(s) + (EXO_VALUE[s] ? ` (${formatCR(EXO_VALUE[s])})` : '')).join(', ') || esc(target)}</li>
                        ${bodyTotal > EXO_VALUE[target] ? `<li style="color: var(--ed-green);">◈ Value of the listed species: ${formatCR(bodyTotal)}</li>` : ''}
                        ${range ? `<li style="color: var(--ed-orange); font-weight: bold;">◈ Artemis Genetic Sampler: minimum distance between ${esc(genus)} samples = ${range} m</li>` : ''}
                    </ul>
                    <div class="action-row">${copyButton(b.system_name, 'Copy System Name for Galaxy Map', 'btn-cyan')}</div>
                </div>`
            });
        }).join('');
    });
}

// ==========================================
// OUTFITTING
// ==========================================
// Module list from outfitting-data.js (EDCD FDevIDs). Spansh uses the same names, classes and ratings.
const MODULES = OUTFITTING_MODULES.map(([symbol, category, name, cls, rating, mount, guidance, ship]) => ({
    symbol: symbol.toLowerCase(), category, name, cls, rating, mount, guidance, ship,
    armour: /_armour_/i.test(symbol),
    size: (/_size(\d)/i.exec(symbol) || [])[1] || cls     // the source lists the size 6 Mk II cabins as class 5
}));
const MODULE_BY_SYMBOL = new Map(MODULES.map(m => [m.symbol, m]));
const MODULE_GROUPS = [
    ['Core internal', m => m.category === 'standard' && !m.armour],
    ['Optional internal', m => m.category === 'internal'],
    ['Hardpoints', m => m.category === 'hardpoint'],
    ['Utility mounts', m => m.category === 'utility'],
    ['Armour', m => m.armour]
];
const HARDPOINT_SIZE = { 1: 'Small', 2: 'Medium', 3: 'Large', 4: 'Huge' };
const RATING_ORDER = 'ABCDEFGHI';
// Spansh station type -> Ardent station type (STATION_TYPES). Source: EDDiscovery Spansh interface.
const SPANSH_STATION_TYPES = {
    'Asteroid Base': 'AsteroidBase', 'Coriolis Starport': 'Coriolis', 'Drake-Class Carrier': 'FleetCarrier', 'Mega Ship': 'MegaShip',
    'Ocellus Starport': 'Ocellus', 'Orbis Starport': 'Orbis', 'Outpost': 'Outpost', 'Planetary Outpost': 'SurfaceStation',
    'Planetary Port': 'CraterPort', 'Settlement': 'OnFootSettlement', 'Space Construction Depot': 'SpaceConstructionDepot',
    'Planetary Construction Depot': 'PlanetaryConstructionDepot', 'Dockable Planet Station': 'DockablePlanetStation', 'Dodec Starport': 'Dodec'
};
const OUTFIT_PAGE_SIZE = 30;
const OUTFIT_MAX_PAGES = 5;
const OUTFIT_RESULTS = 5;
const OUTFIT_MAX_PARTS = 12;

let outfitParts = [];           // symbols of the modules the station has to sell
let outfitShipChosen = false;   // until the user picks a ship, the list follows the active ship

const isArmourFor = (m, type) => m.armour && !!type && m.symbol.startsWith(type + '_armour_');
const mountText = m => [HARDPOINT_SIZE[m.cls], m.mount, m.guidance].filter(Boolean).join(' ');
const variantLabel = m => m.armour ? `For ${m.ship}` : `${m.size}${m.rating}${m.category === 'hardpoint' ? ' · ' + mountText(m) : ''}`;
const partLabel = m => m.armour ? `${m.name} (${m.ship})` : `${m.size}${m.rating} ${m.name}${m.category === 'hardpoint' ? ` (${mountText(m)})` : ''}`;

// Selected ship: "fleet:<ShipID>" or "type:<journal ship type>".
function outfitShip() {
    const value = $('outfit-ship').value || '';
    const kind = value.slice(0, value.indexOf(':'));
    const id = value.slice(value.indexOf(':') + 1);
    const ship = kind === 'fleet' ? fleet[id] : null;
    return { type: String(ship ? ship.type : kind === 'type' ? id : '').toLowerCase(), ship };
}

function refreshOutfitShips() {
    const select = $('outfit-ship');
    const previous = select.value;
    const ships = Object.values(fleet).filter(ship => ship.type);
    let html = '';
    if (ships.length) {
        html += '<optgroup label="Your fleet (journal)">' + ships.map(ship => {
            const prefix = String(ship.id) === String(activeShipId) ? '[ACTIVE] ' : '';
            return `<option value="fleet:${esc(ship.id)}">${esc(prefix + shipTitle(ship))}</option>`;
        }).join('') + '</optgroup>';
    }
    html += '<optgroup label="All ships">' + Object.entries(SHIPS).sort((a, b) => a[1][0].localeCompare(b[1][0]))
        .map(([type, [label]]) => `<option value="type:${esc(type)}">${esc(label)}</option>`).join('') + '</optgroup>';
    select.innerHTML = html;
    const has = value => [...select.options].some(o => o.value === value);
    const active = `fleet:${activeShipId}`;
    select.value = outfitShipChosen && has(previous) ? previous : has(active) ? active : has(previous) ? previous : select.options[0].value;
    refreshOutfitModules();
}

// Core slot of each core part type: index into SHIP_SLOTS[...].core (ship-slots.js)
const CORE_SLOT = {
    'Power Plant': 0, 'Guardian Hybrid Power Plant': 0,
    'Thrusters': 1, 'Enhanced Performance Thrusters': 1, 'Mk II Agile Boost Thrusters': 1, 'Mk II Gravity Optimised Thrusters': 1,
    'Frame Shift Drive': 2, 'Frame Shift Drive (SCO)': 2, 'Mk II Supercharge Optimised Frame Shift Drive (SCO)': 2,
    'Life Support': 3, 'Power Distributor': 4, 'Guardian Hybrid Power Distributor': 4, 'Sensors': 5, 'Fuel Tank': 6
};
// Words commanders search for besides the part names
const PART_ALIASES = {
    'Frame Shift Drive': 'fsd', 'Frame Shift Drive (SCO)': 'fsd sco overcharge', 'Mk II Supercharge Optimised Frame Shift Drive (SCO)': 'fsd sco mk2',
    'Power Plant': 'pp', 'Power Distributor': 'pd distro', 'Shield Generator': 'sg shields', 'Bi-Weave Shield Generator': 'biweave shields',
    'Prismatic Shield Generator': 'prismatic shields', 'Shield Cell Bank': 'scb', 'Hull Reinforcement Package': 'hrp',
    'Module Reinforcement Package': 'mrp', 'Auto Field-Maintenance Unit': 'afmu repair', 'Detailed Surface Scanner': 'dss',
    'Electronic Countermeasure': 'ecm', 'Kill Warrant Scanner': 'kws', 'Frame Shift Wake Scanner': 'wake', 'Planetary Vehicle Hangar': 'srv',
    'Large Planetary Vehicle Hangar': 'srv', 'Vessel Hangar': 'fighter', 'Mk II Vessel Hangar': 'fighter', 'Guardian FSD Booster': 'gfsd booster',
    'Enhanced Performance Thrusters': 'ept', 'Experimental Weapon Stabiliser': 'ews', 'Multi-Cannon': 'mc multicannon',
    'Advanced Docking Computer': 'adc', 'Standard Docking Computer': 'docking computer', 'Supercruise Assist': 'sca',
    'Heat Sink Launcher': 'heatsink', 'Point Defence': 'pd'
};

// The A-rated core package: one entry on the list that stands for these core parts in A,
// each in the slot size of whichever ship is chosen.
const CORE_PACKAGE = 'package:core-a';
const CORE_PACKAGE_PARTS = ['Thrusters', 'Power Plant', 'Frame Shift Drive (SCO)', 'Power Distributor'];

let outfitModule = null;    // part type chosen in the search field
let suggestHits = [];       // part types shown in the suggestion list
let suggestIndex = -1;      // highlighted suggestion
let suggestVariant = null;  // "6a" typed with the part: preselected size and rating

const shipSlots = type => SHIP_SLOTS[type] || null;

// Does the module fit any slot of the ship? Without slot data for the ship everything counts.
function fitsShip(m, slots) {
    if (!slots || m.armour) return true;
    const size = Number(m.size);
    if (m.category === 'hardpoint') return slots.hardpoints.some(h => h >= size);   // a small weapon also fits a larger hardpoint
    if (m.category === 'utility') return slots.utility > 0;
    const core = CORE_SLOT[m.name];
    if (core !== undefined) {
        if (size <= slots.core[core]) return true;                                    // smaller core parts fit too
        if (m.name !== 'Fuel Tank') return false;                                     // only fuel tanks also go into optional slots
    } else if (m.category === 'standard') {
        return true;
    }
    return slots.internal.some(s => (Array.isArray(s) ? size <= s[0] && SLOT_RESTRICTIONS[s[1]].includes(m.name) : size <= s));
}

// Part types that fit the chosen ship: { name, group, min, max, modules }
function partTypes() {
    const { type } = outfitShip();
    const slots = shipSlots(type);
    const types = new Map();
    for (const m of MODULES) {
        if ((m.armour && !isArmourFor(m, type)) || !fitsShip(m, slots)) continue;
        if (!types.has(m.name)) types.set(m.name, { name: m.name, group: (MODULE_GROUPS.find(([, inGroup]) => inGroup(m)) || ['Other'])[0], sizes: [], modules: [] });
        const part = types.get(m.name);
        part.sizes.push(Number(m.size));
        part.modules.push(m);
    }
    return [...types.values()];
}

// Every word has to match the name, a search word or the group; "6a" or "6" picks the size (and rating) as well.
function searchParts(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const variant = words.find(w => /^[0-8][a-i]?$/.test(w)) || null;
    const terms = words.filter(w => w !== variant);
    const hits = [];
    for (const part of partTypes()) {
        const aliases = PART_ALIASES[part.name] || '';
        const text = `${part.name} ${aliases} ${part.group}`.toLowerCase();
        if (!terms.every(t => text.includes(t))) continue;
        if (variant && !part.modules.some(m => `${m.size}${m.rating}`.toLowerCase().startsWith(variant))) continue;
        const name = part.name.toLowerCase(), first = terms[0] || '';
        const rank = !first ? 2 : name.startsWith(first) || aliases.split(' ').includes(first) ? 0 : ` ${name}`.includes(` ${first}`) ? 1 : 2;
        hits.push({ part, rank });
    }
    hits.sort((a, b) => a.rank - b.rank || a.part.name.localeCompare(b.part.name));
    return { variant, parts: hits.map(h => h.part) };
}

function sizeRange(part) {
    const min = Math.min(...part.sizes), max = Math.max(...part.sizes);
    if (part.modules[0].armour) return part.modules[0].ship;
    return min === max ? `size ${min}` : `sizes ${min}–${max}`;
}

function renderSuggestions() {
    const input = $('outfit-search'), list = $('outfit-suggest');
    const { variant, parts } = searchParts(input.value);
    suggestHits = parts.slice(0, 60);
    suggestVariant = variant;
    if (suggestIndex >= suggestHits.length) suggestIndex = suggestHits.length - 1;
    list.innerHTML = suggestHits.length
        ? suggestHits.map((p, i) => `<li role="option" id="outfit-option-${i}" data-part="${esc(p.name)}" aria-selected="${i === suggestIndex}">`
            + `<span>${esc(p.name)}</span><span class="combo-meta">${esc(p.group)} · ${esc(sizeRange(p))}</span></li>`).join('')
        : '<li class="combo-empty">No matching part fits this ship</li>';
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (suggestIndex >= 0) {
        input.setAttribute('aria-activedescendant', `outfit-option-${suggestIndex}`);
        const active = $(`outfit-option-${suggestIndex}`);
        if (active) active.scrollIntoView({ block: 'nearest' });
    } else {
        input.removeAttribute('aria-activedescendant');
    }
}

function closeSuggestions() {
    $('outfit-suggest').hidden = true;
    $('outfit-search').setAttribute('aria-expanded', 'false');
    $('outfit-search').removeAttribute('aria-activedescendant');
}

function choosePart(name, variant) {
    outfitModule = name;
    $('outfit-search').value = name;
    suggestIndex = -1;
    closeSuggestions();
    refreshOutfitVariants(variant);
}

// The chosen ship changed: ship info, which sizes fit, and the list's fit marks.
function refreshOutfitModules() {
    const { type, ship } = outfitShip();
    const known = !ship ? '' : !ship.modules ? ' · board this ship once to read its modules'
        : ` · fitted modules from the journal${ship.loadoutAt ? ` (${timeAgo(ship.loadoutAt)})` : ''}`;
    const slots = shipSlots(type) ? '' : ' · slot sizes unknown for this ship, all sizes shown';
    $('outfit-ship-info').textContent = `Landing pad ${PAD_LABEL[shipPad(type)] || '?'}${known}${slots}`;
    refreshOutfitVariants();
    renderOutfitParts();
}

function refreshOutfitVariants(wanted) {
    const name = outfitModule;
    const { type, ship } = outfitShip();
    const ofType = MODULES.filter(m => m.name === name && (!m.armour || isArmourFor(m, type)));
    const variants = ofType.filter(m => fitsShip(m, shipSlots(type)))
        .sort((a, b) => a.size - b.size || RATING_ORDER.indexOf(a.rating) - RATING_ORDER.indexOf(b.rating)
            || a.mount.localeCompare(b.mount) || a.guidance.localeCompare(b.guidance));
    const fittedNow = new Set(ship && ship.modules || []);
    const fitted = ofType.filter(m => fittedNow.has(m.symbol));
    const select = $('outfit-variant');
    select.innerHTML = variants.length
        ? variants.map(m => `<option value="${esc(m.symbol)}">${esc(variantLabel(m))}${fittedNow.has(m.symbol) ? ' ✓ fitted' : ''}</option>`).join('')
        : `<option value="">${name ? `Does not fit the ${esc(shipLabel(type))}` : 'Choose a part first'}</option>`;
    select.disabled = !variants.length;
    // "6a scoop" picks 6A; otherwise the best rating in the size that is fitted now (the usual upgrade),
    // or the largest size that fits the ship.
    const now = fitted[0];
    const largest = Math.max(...variants.map(m => Number(m.size)));
    const pick = (wanted && variants.find(m => `${m.size}${m.rating}`.toLowerCase().startsWith(wanted)))
        || (now && variants.find(m => m.size === now.size && m.mount === now.mount && m.guidance === now.guidance))
        || variants.find(m => Number(m.size) === largest);
    if (pick) select.value = pick.symbol;
    $('outfit-fitted').textContent = fitted.length ? `Fitted on ${ship.name || shipLabel(ship.type)}: ${fitted.map(partLabel).join(', ')}` : '';
}

// The package's modules for the chosen ship. Slot sizes come from ship-slots.js, for a fleet ship without
// slot data from the parts fitted now (journal); null when neither is known.
function corePackage() {
    const { type, ship } = outfitShip();
    const slots = shipSlots(type);
    const fitted = (ship && ship.modules || []).map(symbol => MODULE_BY_SYMBOL.get(symbol)).filter(Boolean);
    const parts = CORE_PACKAGE_PARTS.map(name => {
        const slot = CORE_SLOT[name];
        const size = slots ? slots.core[slot] : (fitted.find(m => CORE_SLOT[m.name] === slot) || {}).size;
        return size && MODULES.find(m => m.name === name && Number(m.size) === Number(size) && m.rating === 'A');
    });
    return parts.every(Boolean) ? parts : null;
}

// Everything on the list as modules, the package resolved for the chosen ship, each module once.
function outfitPartModules() {
    const modules = [];
    for (const entry of outfitParts) {
        const list = entry === CORE_PACKAGE ? corePackage() || [] : [MODULE_BY_SYMBOL.get(entry)];
        for (const m of list) if (m && !modules.includes(m)) modules.push(m);
    }
    return modules;
}

function addCorePackage() {
    if (outfitParts.includes(CORE_PACKAGE)) return showToast('The core package is already on the list', true);
    if (!corePackage()) return showToast(`Slot sizes of the ${shipLabel(outfitShip().type)} are unknown: add the core parts one by one`, true);
    if (outfitPartModules().length + CORE_PACKAGE_PARTS.length > OUTFIT_MAX_PARTS) return showToast(`At most ${OUTFIT_MAX_PARTS} parts per search`, true);
    outfitParts.push(CORE_PACKAGE);
    saveOutfitParts();
    renderOutfitParts();
    playTone('success');
}

const shortPartLabel = m => partLabel(m).replace('Frame Shift Drive', 'FSD');

function renderOutfitParts() {
    const { type } = outfitShip();
    const slots = shipSlots(type);
    $('outfit-parts').innerHTML = outfitParts.length
        ? outfitParts.map(symbol => {
            if (symbol === CORE_PACKAGE) {
                const parts = corePackage();
                const label = esc(`Core package A: ${parts ? parts.map(shortPartLabel).join(' · ') : 'slot sizes of this ship unknown'}`);
                const warning = parts ? '' : `<span class="part-warn" title="Slot sizes of the ${esc(shipLabel(type))} are unknown">⚠</span>`;
                return `<span class="part-chip part-package${parts ? '' : ' no-fit'}">${warning}${label}<button type="button" data-remove-part="${CORE_PACKAGE}" aria-label="Remove the core package">×</button></span>`;
            }
            const m = MODULE_BY_SYMBOL.get(symbol);
            const label = esc(partLabel(m));
            const fits = fitsShip(m, slots) && (!m.armour || isArmourFor(m, type));
            const warning = fits ? '' : `<span class="part-warn" title="Does not fit the ${esc(shipLabel(type))}">⚠</span>`;
            return `<span class="part-chip${fits ? '' : ' no-fit'}">${warning}${label}<button type="button" data-remove-part="${esc(symbol)}" aria-label="Remove ${label}">×</button></span>`;
        }).join('')
        : '<span class="muted">No parts on the list yet: search a part above and add it.</span>';
}

function saveOutfitParts() {
    try { localStorage.setItem('alopex_outfit_parts', JSON.stringify(outfitParts)); } catch (e) {}
}

function loadOutfitParts() {
    try {
        const saved = JSON.parse(localStorage.getItem('alopex_outfit_parts') || '[]');
        if (Array.isArray(saved)) outfitParts = saved.filter(entry => MODULE_BY_SYMBOL.has(entry) || entry === CORE_PACKAGE).slice(0, OUTFIT_MAX_PARTS);
    } catch (e) {}
    renderOutfitParts();
}

function addOutfitPart() {
    const symbol = $('outfit-variant').value;
    if (!MODULE_BY_SYMBOL.has(symbol)) return showToast('Search a part and pick it from the list first', true);
    if (outfitParts.includes(symbol)) return showToast('This part is already on the list', true);
    if (outfitPartModules().length >= OUTFIT_MAX_PARTS) return showToast(`At most ${OUTFIT_MAX_PARTS} parts per search`, true);
    outfitParts.push(symbol);
    saveOutfitParts();
    renderOutfitParts();
    playTone('success');
}

function removeOutfitPart(symbol) {
    outfitParts = outfitParts.filter(s => s !== symbol);
    saveOutfitParts();
    renderOutfitParts();
    playTone('click');
}

// Spansh filters by one module; the app then checks the full module list of every station found.
// Ask for the part that is probably rarest: not armour, large, well rated.
function anchorPart(parts) {
    const score = m => (m.armour ? 0 : 100) + Number(m.cls) * 10 + Math.max(0, 5 - RATING_ORDER.indexOf(m.rating));
    return parts.reduce((best, m) => (score(m) > score(best) ? m : best));
}

function outfittingQuery({ anchor, shipNames }, system, radius, pad, page) {
    const filters = { distance: { min: 0, max: radius } };
    if (anchor) {
        filters.modules = { name: [anchor.name] };
        if (!anchor.armour) {   // with class/rating filters Spansh finds no armour (EDDiscovery note)
            filters.modules.class = [String(anchor.cls)];
            if (/^[A-G]$/.test(anchor.rating)) filters.modules.rating = [anchor.rating];
        }
    }
    if (shipNames.length) filters.ships = { value: shipNames };
    if (pad >= 3) filters.has_large_pad = { value: true };
    const allowed = Object.keys(SPANSH_STATION_TYPES).filter(name => stationTypeAllowed(SPANSH_STATION_TYPES[name]));
    if (allowed.length < Object.keys(SPANSH_STATION_TYPES).length) filters.type = { value: allowed };
    return { filters, sort: [{ distance: { direction: 'asc' } }], reference_system: system, size: OUTFIT_PAGE_SIZE, page };
}

// EDCD writes "Cobra MkIII" but "Kestrel Mk II", EDDiscovery "Kestrel MkII": ask Spansh for both spellings
// and compare shipyard entries without spaces and dashes.
const shipNameKey = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function spanshShipNames(type) {
    const name = SHIPS[type] && SHIPS[type][0];
    return name ? [...new Set([name, name.replace(/ Mk /g, ' Mk')])] : [];
}

function spanshStationRow(st) {
    const pad = st.large_pads > 0 || st.has_large_pad ? 3 : st.medium_pads > 0 ? 2 : st.small_pads > 0 ? 1 : null;
    return {
        stationName: st.name, systemName: st.system_name, distanceToArrival: st.distance_to_arrival, bodyName: st.body_name,
        maxLandingPadSize: pad, stationType: SPANSH_STATION_TYPES[st.type] || (st.is_planetary ? 'DockablePlanetStation' : st.type)
    };
}

// What the station sells of the wanted ship and parts: have [{ label, price }], missing [{ label }].
function checkStation(st, parts, ship) {
    const have = [], missing = [];
    if (ship) {
        const offer = (st.ships || []).find(s => shipNameKey(s.name) === ship.key);
        if (offer) have.push({ label: ship.label, price: Number(offer.price) });
        else missing.push({ label: ship.label });
    }
    const modules = st.modules || [];
    const sold = new Map(modules.map(m => [String(m.ed_symbol || '').toLowerCase(), m]));
    for (const part of parts) {
        const exact = sold.get(part.symbol);
        // A station that sells an armour grade sells it for every ship, so another ship's entry counts (its price does not).
        const anyShip = !exact && part.armour && modules.find(m => m.name === part.name && /_armour_/i.test(m.ed_symbol || ''));
        if (exact || anyShip) have.push({ label: partLabel(part), price: exact ? Number(exact.price) : NaN });
        else missing.push({ label: partLabel(part) });
    }
    return { have, missing };
}

function outfitItem(i, { st, row, have, missing }, count, allLabel) {
    const total = have.reduce((sum, h) => sum + (h.price > 0 ? h.price : 0), 0);
    const priceGaps = have.some(h => !(h.price > 0));
    const list = [
        ...have.map(h => `<li>✓ ${esc(h.label)}: ${h.price > 0 ? formatCR(h.price) : 'price unknown'}</li>`),
        ...missing.map(m => `<li class="part-missing">✗ ${esc(m.label)}: not sold here</li>`)
    ].join('');
    const updated = [st.outfitting_updated_at && `outfitting ${timeAgo(st.outfitting_updated_at)}`, st.shipyard_updated_at && `shipyard ${timeAgo(st.shipyard_updated_at)}`]
        .filter(Boolean).join(', ') || timeAgo(st.updated_at);
    return accordionItem(i, {
        title: esc(st.name),
        meta: `${esc(st.system_name)} | ${fmtLy(st.distance)} LY${jumpsText(st.distance)}${st.distance_to_arrival ? ` | ${fmtInt(st.distance_to_arrival)} Ls` : ''}`,
        stat: missing.length ? `${have.length} / ${count}` : formatCR(total),
        statLabel: missing.length ? 'items sold here' : priceGaps ? 'known prices' : allLabel,
        body: `
        <div class="sell-station-box">
            <strong>Station:</strong> ${stationLine(row)}
            <ul class="detail-list">${list}</ul>
            <span class="muted">Data updated: ${updated}</span>
            <div class="action-row">${copyButton(st.system_name, 'Copy System Name', 'btn-cyan')}</div>
        </div>`
    });
}

function searchOutfitting(btn) {
    return runSearch('outfit', btn, async progress => {
        const sys = requireSystem();
        if (outfitParts.includes(CORE_PACKAGE) && !corePackage()) {
            return infoBox(`The core package needs the slot sizes of the ${esc(shipLabel(outfitShip().type))}, and they are unknown. Add the core parts one by one.`);
        }
        const parts = outfitPartModules();
        const { type } = outfitShip();
        const buyShip = $('outfit-buy-ship').checked;
        const shipNames = buyShip ? spanshShipNames(type) : [];
        if (buyShip && !shipNames.length) return infoBox('Choose the ship type to buy first.');
        if (!parts.length && !buyShip) return infoBox('Add the parts you need to the list first, or tick "Station also sells this ship type".');
        const ship = buyShip ? { name: shipLabel(type), label: `${shipLabel(type)} (ship)`, key: shipNameKey(shipNames[0]) } : null;
        const pad = shipPad(type) || requiredPad();
        const radius = Math.round(numInput('outfit-radius', 100, 1, 500));
        const anchor = parts.length ? anchorPart(parts) : null;
        const count = parts.length + (ship ? 1 : 0);
        const allLabel = !ship ? 'all parts' : parts.length ? 'ship + parts' : 'ship price';

        const complete = [], partial = [];
        let checked = 0;
        for (let page = 0; page < OUTFIT_MAX_PAGES && complete.length < OUTFIT_RESULTS; page++) {
            progress(`CHECKING ${ship ? 'SHIPYARD AND ' : ''}OUTFITTING DATA... ${checked} STATIONS`);
            const data = await spanshSearch('stations', outfittingQuery({ anchor, shipNames }, sys, radius, pad, page));
            const stations = (data && data.results) || [];
            for (const st of stations) {
                const row = spanshStationRow(st);
                if ((row.maxLandingPadSize != null && row.maxLandingPadSize < pad) || !stationTypeAllowed(row.stationType)) continue;
                checked++;
                const result = { st, row, ...checkStation(st, parts, ship) };
                (result.missing.length ? partial : complete).push(result);
            }
            if (stations.length < OUTFIT_PAGE_SIZE || (Number.isFinite(data.count) && (page + 1) * OUTFIT_PAGE_SIZE >= data.count)) break;
        }

        if (complete.length) return complete.slice(0, OUTFIT_RESULTS).map((r, i) => outfitItem(i, r, count, allLabel)).join('');
        const closest = partial.sort((a, b) => b.have.length - a.have.length || a.st.distance - b.st.distance).slice(0, 3);
        const wanted = [ship && `the ${esc(ship.name)}`, parts.length && `all ${parts.length} part${parts.length > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
        const asked = [ship && `the ${ship.name}`, anchor && partLabel(anchor)].filter(Boolean).join(' together with ');
        const message = `No station within ${fmtInt(radius)} LY of <strong>${esc(sys)}</strong> (pad ${PAD_LABEL[pad]}) sells ${wanted}`
            + (closest.length ? '. These come closest, the rest needs a second stop:' : `. No station there sells ${esc(asked)} at all. Increase the distance.`);
        return infoBox(message + planetaryHint()) + closest.map((r, i) => outfitItem(i, r, count, allLabel)).join('');
    });
}

// ==========================================
// INTRO: the arctic fox and the ship computer
// ==========================================
// Runs while the journal loads, at least INTRO_MIN_MS and with the journal still loading at most INTRO_MAX_MS,
// then shows the welcome line and fades out. A click or any key skips it; "Show intro" turns it off.
const INTRO_MIN_MS = 2600;
const INTRO_MAX_MS = 4000;
const INTRO_WELCOME_MS = 900;
// Frame shift (ms): the drive charges, the stars stretch into a tunnel, the fox drops out of the jump with a flash.
const WARP = { charge: 650, flash: 1300, settle: 2300 };
// Alopex lagopus, front view in triangles: [points, fill opacity, kind]
const FOX_SHARDS = [
    ['38,14 78,62 30,78', 0.85], ['162,14 122,62 170,78', 0.75],
    ['43,32 68,60 38,70', 0.9, 'inner'], ['157,32 132,60 162,70', 0.9, 'inner'],
    ['78,62 100,58 100,96', 0.55], ['122,62 100,58 100,96', 0.45],
    ['30,78 78,62 62,100', 0.7], ['170,78 122,62 138,100', 0.6],
    ['78,62 100,96 62,100', 0.38], ['122,62 100,96 138,100', 0.32],
    ['30,78 62,100 14,112', 0.8], ['170,78 138,100 186,112', 0.7],
    ['14,112 62,100 52,138', 0.6], ['186,112 138,100 148,138', 0.5],
    ['62,100 100,96 80,140', 0.26, 'alt'], ['138,100 100,96 120,140', 0.2, 'alt'],
    ['100,96 80,140 120,140', 0.38, 'alt'],
    ['52,138 62,100 80,140', 0.45], ['148,138 138,100 120,140', 0.4],
    ['52,138 80,140 100,176', 0.65], ['148,138 120,140 100,176', 0.55],
    ['80,140 120,140 100,176', 0.3, 'alt'],
    ['91,160 109,160 100,171', 1, 'nose'],
    ['58,102 82,107 66,113', 1, 'eye'], ['142,102 118,107 134,113', 1, 'eye']
];

function buildFox(svg) {
    FOX_SHARDS.forEach(([points, opacity, kind]) => {
        const shard = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        shard.setAttribute('points', points);
        if (kind) shard.setAttribute('class', kind);
        // Each shard starts at the vanishing point in the middle of the face; the outer ones arrive last.
        const [x, y] = points.split(' ').map(p => p.split(',').map(Number))
            .reduce(([sx, sy], [px, py]) => [sx + px / 3, sy + py / 3], [0, 0]);
        const delay = WARP.charge - 50 + Math.hypot(x - 100, y - 100) * 2;
        shard.style.cssText = `--fo:${opacity};--wx:${Math.round(100 - x)}px;--wy:${Math.round(100 - y)}px;--d:${Math.round(delay)}`;
        svg.appendChild(shard);
    });
}

// Stars stream past, stretch into a hyperspace tunnel around the fox and slow down after the flash.
// Returns a function that stops the animation.
function startWarp(intro) {
    const canvas = $('intro-stars');
    const ctx = canvas.getContext('2d');
    const box = intro.getBoundingClientRect(), fox = $('intro-fox').getBoundingClientRect();
    const w = box.width, h = box.height, dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = fox.left + fox.width / 2 - box.left, cy = fox.top + fox.height / 2 - box.top;
    intro.style.setProperty('--fx', `${Math.round(cx)}px`);
    intro.style.setProperty('--fy', `${Math.round(cy)}px`);

    const css = getComputedStyle(intro);
    const rgb = name => {
        const v = css.getPropertyValue(name).trim();
        if (v[0] === '#') {
            const hex = v.length === 4 ? [...v.slice(1)].map(c => c + c).join('') : v.slice(1);
            return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
        }
        return (v.match(/\d+/g) || [255, 255, 255]).slice(0, 3).map(Number);
    };
    const bg = css.getPropertyValue('--ed-bg').trim() || '#000';
    const accent = rgb('--ed-orange'), light = rgb('--ed-cyan');
    const spawn = (s, far) => {
        s.x = (Math.random() * 2 - 1) * 1.6; s.y = (Math.random() * 2 - 1) * 1.1;
        s.z = far ? 1 : 0.05 + Math.random() * 0.95; s.pz = s.z; s.c = Math.random();
        return s;
    };
    const stars = Array.from({ length: 420 }, () => spawn({}, false));
    // depth units per second
    const speed = t => t < WARP.charge ? 0.04 + 0.08 * t / WARP.charge
        : t < WARP.flash ? 0.12 + 4.4 * ((t - WARP.charge) / (WARP.flash - WARP.charge)) ** 3
        : 0.03 + 1.2 * Math.max(0, 1 - (t - WARP.flash) / 700) ** 2;
    const f = Math.max(w, h) * 0.45;
    let raf = 0, start = 0, last = 0;

    function frame(now) {
        if (!start) start = last = now;
        const t = now - start, dt = Math.min(48, now - last);
        last = now;
        const v = speed(t), streak = Math.min(1, Math.max(0, (v - 0.12) / 2));
        ctx.globalAlpha = streak > 0.02 ? 0.4 : 1;   // let the streaks smear while jumping
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.lineCap = 'round';
        for (const s of stars) {
            s.pz = s.z;
            s.z -= v * dt / 1000;
            if (s.z <= 0.03) { spawn(s, true); continue; }
            const x = cx + s.x / s.z * f, y = cy + s.y / s.z * f;
            if (x < -40 || x > w + 40 || y < -40 || y > h + 40) { spawn(s, true); continue; }
            const near = 1 - s.z, c = s.c < 0.25 ? accent : s.c < 0.4 ? light : [255, 255, 255];
            ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, 0.15 + near * 0.9)})`;
            ctx.lineWidth = Math.max(0.6, near * (1.2 + streak * 2));
            ctx.beginPath();
            ctx.moveTo(cx + s.x / s.pz * f, cy + s.y / s.pz * f);
            ctx.lineTo(x + 0.01, y + 0.01);
            ctx.stroke();
        }
        if (streak > 0.02) {
            const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.5);
            glow.addColorStop(0, `rgba(${light[0]},${light[1]},${light[2]},${0.3 * streak})`);
            glow.addColorStop(0.35, `rgba(${accent[0]},${accent[1]},${accent[2]},${0.14 * streak})`);
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, w, h);
        }
        raf = t < WARP.settle ? requestAnimationFrame(frame) : 0;
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
}

function setIntroValue(id, text, kind) {
    const el = $(id);
    el.textContent = text;
    el.className = `${kind} resolved`;
}

function fillIntroStatus() {
    const ships = Object.values(fleet).filter(ship => ship.type);
    const active = fleet[activeShipId];
    setIntroValue('intro-journal', journalFolder ? 'ONLINE' : 'NOT FOUND', journalFolder ? 'ok' : 'bad');
    setIntroValue('intro-cmdr', commanderName ? `CMDR ${commanderName}` : 'UNKNOWN', commanderName ? 'val' : 'sb');
    setIntroValue('intro-loc', journalSystem || $('current-system').value || 'UNKNOWN', journalSystem ? 'val' : 'sb');
    setIntroValue('intro-fleet', ships.length
        ? `${ships.length} SHIP${ships.length > 1 ? 'S' : ''}${active ? ` · ${shipLabel(active.type)} ACTIVE` : ''}` : 'NO DATA',
        ships.length ? 'val' : 'sb');
    $('intro-welcome').textContent = commanderName ? `WELCOME BACK, CMDR ${commanderName}` : 'WELCOME, COMMANDER';
}

function playIntro(loading) {
    const intro = $('intro');
    if (!$('intro-enabled').checked) {
        intro.remove();
        return;
    }
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    buildFox($('intro-fox'));
    intro.classList.add(calm ? 'calm' : 'run');
    const bar = $('intro-bar');
    const started = Date.now();
    const timers = [];
    const stopWarp = calm ? () => {} : startWarp(intro);
    let settled = false, closed = false;

    const close = () => {
        if (closed) return;
        closed = true;
        timers.forEach(clearTimeout);
        stopWarp();
        document.removeEventListener('keydown', skip, true);
        intro.classList.add('leaving');
        setTimeout(() => intro.remove(), calm ? 0 : 450);
    };
    const skip = e => {   // the key only skips the intro, it does not reach the app
        e.preventDefault();
        e.stopPropagation();
        close();
    };
    const settle = () => {
        if (settled || closed) return;
        settled = true;
        fillIntroStatus();
        bar.style.transition = 'width 0.35s ease-out';
        bar.style.width = '100%';
        timers.push(setTimeout(() => {
            intro.classList.add('welcome');
            timers.push(setTimeout(close, INTRO_WELCOME_MS));
        }, Math.max(350, (calm ? 1000 : INTRO_MIN_MS) - (Date.now() - started))));
    };

    document.addEventListener('keydown', skip, true);
    intro.addEventListener('click', close);
    requestAnimationFrame(() => { bar.style.width = '85%'; });
    if (!calm) timers.push(setTimeout(() => intro.classList.add('flash'), WARP.flash));
    loading.then(settle, settle);
    timers.push(setTimeout(settle, INTRO_MAX_MS));
}

// ==========================================
// UPDATES (app core: lib/updates.mjs)
// ==========================================
let updateState = null;

function renderUpdates(state) {
    const previous = updateState;
    updateState = state;
    const v = state.latest ? `v${state.latest}` : '';
    // [status line, button in the settings, button in the header]
    const views = {
        disabled: ['Updates only in the installed app', null, null],
        idle: [`v${state.current}`, 'Check now', null],
        checking: ['Checking for updates…', null, null],
        none: [`Up to date (v${state.current})`, 'Check now', null],
        available: [`${v} is available`, state.portable ? 'Download' : 'Update now', state.portable ? `⬆ Download ${v}` : `⬆ Update to ${v}`],
        downloading: [`Downloading ${v} … ${state.progress} %`, null, `⬇ ${state.progress} %`],
        ready: [state.auto ? `${v} installs when you close ALOPEX` : `${v} is ready`, 'Restart & install', '⟳ Restart to update'],
        installing: [`Installing ${v}…`, null, null],
        error: [`Update check failed: ${state.error}`, 'Try again', null]
    };
    const [text, action, header] = views[state.status] || views.idle;
    $('update-status').textContent = text;
    $('update-action').hidden = !action;
    if (action) $('update-action').textContent = action;
    $('btn-update').hidden = !header;
    if (header) $('btn-update').textContent = header;
    $('btn-update').disabled = state.status === 'downloading';
    $('update-auto').checked = state.auto;
    $('update-auto').disabled = state.status === 'disabled' || state.portable;
    if (state.status === 'available' && (!previous || previous.status !== 'available') && !state.auto) {
        showToast(`ALOPEX OS ${v} is available`);
    }
}

function updateAction() {
    const status = updateState && updateState.status;
    if (status === 'available') return alopex.updates.download();
    if (status === 'ready') return alopex.updates.install();
    return alopex.updates.check();
}

// After an update: version and release notes, until closed.
function showUpdatedNotice({ to, notes }) {
    $('update-notice-title').textContent = `✓ ALOPEX OS was updated to v${to}`;
    $('update-notice-notes').textContent = notes || '';
    $('update-notice-details').hidden = !notes;
    $('update-notice').hidden = false;
}

async function initUpdates() {
    alopex.updates.onChange(renderUpdates);
    $('update-auto').addEventListener('change', e => alopex.updates.setAuto(e.target.checked));
    try {
        const state = await unwrap(alopex.updates.state());
        renderUpdates(state);
        if (state.justUpdated) showUpdatedNotice(state.justUpdated);
    } catch (e) {
        $('update-status').textContent = 'Update check not available';
    }
}

// ==========================================
// INIT
// ==========================================
$('exo-target').innerHTML = EXO_SPECIES
    .map(([g, s, v]) => `<option value="${g}|${s}">${g} ${s} — ${(v / 1e6).toFixed(1)}M CR</option>`).join('');
$('exo-target').value = 'Stratum|Tectonicas';
$('mine-resource').innerHTML = Object.keys(MINING_RESOURCES).map(r => `<option value="${r}">${r}</option>`).join('');
refreshOutfitShips();
loadOutfitParts();

window.addEventListener('DOMContentLoaded', () => {
    loadPrefs();
    loadAudioPref();
    playIntro(startJournal());
    initUpdates();
});
