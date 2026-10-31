'use strict';

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
