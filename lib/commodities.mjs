// Commodity display names from the EDCD FDevIDs list, cached on disk for a week.
import { promises as fs } from 'node:fs';
import { fetchText } from './http.mjs';

const DEFAULT_URL = 'https://raw.githubusercontent.com/EDCD/FDevIDs/master/commodity.csv';
const MAX_AGE_MS = 7 * 86400000;

// commodity.csv: id,symbol,category,name -> { lowercase symbol: name } (Ardent uses lowercase symbols)
export function parseCommodityCsv(text) {
    const names = {};
    for (const line of text.split(/\r?\n/).slice(1)) {
        const parts = line.split(',');
        if (parts.length >= 4 && parts[1]) names[parts[1].toLowerCase()] = parts.slice(3).join(',').replace(/^"|"$/g, '');
    }
    return names;
}

export async function loadCommodityNames({ fetch, cacheFile, url = DEFAULT_URL, now = Date.now }) {
    let cached = null;
    try { cached = JSON.parse(await fs.readFile(cacheFile, 'utf8')); } catch (e) {}
    if (cached && now() - cached.time < MAX_AGE_MS) return cached.names;
    try {
        const res = await fetchText(fetch, url || DEFAULT_URL, { maxBytes: 2 * 1024 * 1024 });
        const names = res.ok ? parseCommodityCsv(res.text) : {};
        if (!Object.keys(names).length) throw new Error('empty list');
        await fs.writeFile(cacheFile, JSON.stringify({ time: now(), names })).catch(() => {});
        return names;
    } catch (e) {
        if (cached) return cached.names;   // offline: an old list is better than none
        throw e;
    }
}
