'use strict';

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
