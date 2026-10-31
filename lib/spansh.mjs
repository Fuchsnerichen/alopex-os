// Spansh search (bodies, systems, stations) with the same limits as the web proxies:
// fixed endpoints, small result pages, 1 h cache, 30 searches per minute.
import { fetchText, parseJson, fail, RequestError } from './http.mjs';

const DEFAULT_BASE = 'https://spansh.co.uk/api';
const SEARCH_TYPES = new Set(['bodies', 'systems', 'stations']);
const MAX_QUERY_BYTES = 16 * 1024;
const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 20;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const RATE_LIMIT_PER_MINUTE = 30;

export function createSpanshClient({ fetch, baseUrl = DEFAULT_BASE, userAgent = 'ALOPEX-OS', now = Date.now }) {
    const cache = new Map();       // endpoint + query -> { expires, data }
    const recent = [];             // request timestamps for the rate limit

    return async function search(type, body) {
        if (!SEARCH_TYPES.has(type)) return fail('Unknown Spansh search');
        if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid Spansh query');
        const raw = JSON.stringify(body);
        if (raw.length > MAX_QUERY_BYTES) return fail('Spansh query too large');
        const query = JSON.parse(raw);
        query.size = clampInt(query.size, 10, 1, MAX_PAGE_SIZE);
        query.page = clampInt(query.page, 0, 0, MAX_PAGE);
        const payload = JSON.stringify(query);

        const key = type + '\n' + payload;
        const hit = cache.get(key);
        if (hit && hit.expires > now()) return { ok: true, data: hit.data, cached: true };

        const time = now();
        while (recent.length && recent[0] < time - 60000) recent.shift();
        if (recent.length >= RATE_LIMIT_PER_MINUTE) return fail('Too many Spansh searches – try again in a minute');
        recent.push(time);

        try {
            const res = await fetchText(fetch, `${baseUrl || DEFAULT_BASE}/${type}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': userAgent },
                body: payload,
                timeoutMs: 55000,
                maxBytes: 10 * 1024 * 1024
            });
            let data = parseJson(res.text);
            if (!res.ok || !data || data.error) return fail(`Spansh: ${data?.error || `HTTP ${res.status}`}`);
            if (type === 'stations') data = slimStations(data);
            if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
            cache.set(key, { expires: now() + CACHE_TTL_MS, data });
            return { ok: true, data };
        } catch (e) {
            if (e instanceof RequestError) return fail(e.message);
            throw e;
        }
    };
}

// Station results carry the full market, outfitting and shipyard of every station (megabytes per page).
// Keep what the app shows, so the cache stays small.
const STATION_FIELDS = ['name', 'type', 'system_name', 'system_id64', 'distance', 'distance_to_arrival', 'body_name', 'is_planetary',
    'has_large_pad', 'large_pads', 'medium_pads', 'small_pads', 'market_id', 'updated_at', 'outfitting_updated_at', 'shipyard_updated_at'];
const MODULE_FIELDS = ['ed_symbol', 'name', 'class', 'rating', 'price'];
const SHIP_FIELDS = ['name', 'price'];

export function slimStations(data) {
    if (!Array.isArray(data.results)) return data;
    const pick = (obj, fields) => Object.fromEntries(fields.filter(f => obj[f] !== undefined).map(f => [f, obj[f]]));
    return {
        ...data,
        results: data.results.map(station => {
            const slim = pick(station, STATION_FIELDS);
            if (Array.isArray(station.modules)) slim.modules = station.modules.map(m => pick(m || {}, MODULE_FIELDS));
            if (Array.isArray(station.ships)) slim.ships = station.ships.map(s => pick(s || {}, SHIP_FIELDS));
            // The services come as plain names or as objects with one; the page only ever sees the names.
            if (Array.isArray(station.services)) {
                slim.services = station.services.map(s => (typeof s === 'string' ? s : s && s.name)).filter(Boolean);
            }
            return slim;
        })
    };
}

function clampInt(value, fallback, min, max) {
    const n = Number.parseInt(value, 10);
    return Math.min(max, Math.max(min, Number.isFinite(n) ? n : fallback));
}
