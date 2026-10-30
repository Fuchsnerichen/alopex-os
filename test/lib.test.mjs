// Unit tests for the app core modules (no Electron needed).
//   node --test test/lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createArdentClient } from '../lib/ardent.mjs';
import { createSpanshClient } from '../lib/spansh.mjs';
import { loadCommodityNames, parseCommodityCsv } from '../lib/commodities.mjs';
import { listJournals, readJournal, defaultJournalFolder } from '../lib/journal.mjs';

// Fake fetch that records requests and answers with the given function.
function fakeFetch(answer) {
    const calls = [];
    const fetch = async (url, init = {}) => {
        calls.push({ url, init });
        const { status = 200, body = '' } = await answer(url, init);
        const text = typeof body === 'string' ? body : JSON.stringify(body);
        return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
    };
    return { fetch, calls };
}

test('Ardent: builds URLs from allowed paths and parameters only', async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: [{ commodityName: 'gold' }] }));
    const get = createArdentClient({ fetch, baseUrl: 'https://ardent.test/v2' });
    const res = await get("/system/name/Barnard's%20Star/commodities/exports", { minVolume: 1, maxDaysAgo: 7, fleetCarriers: false, unused: undefined });
    assert.equal(res.ok, true);
    assert.equal(calls[0].url, "https://ardent.test/v2/system/name/Barnard's%20Star/commodities/exports?minVolume=1&maxDaysAgo=7&fleetCarriers=false");
    assert.equal(calls[0].init.method, 'GET');

    for (const bad of ['https://evil.test/x', '/system/../../admin', '/system/name/%2e%2e/x', '/admin', 'system/name/Sol', '/system/name/a b', '/system/name/%zz']) {
        assert.equal((await get(bad)).ok, false, bad);
    }
    assert.equal((await get('/commodities', { 'a-b': 1 })).ok, false, 'bad parameter name');
    assert.equal((await get('/commodities', { x: { nested: 1 } })).ok, false, 'object parameter');
    assert.equal(calls.length, 1, 'rejected requests never reach the network');
});

test('Ardent: passes the API error message on', async () => {
    const { fetch } = fakeFetch(() => ({ status: 404, body: { error: 'Not Found', message: 'System not found' } }));
    const res = await createArdentClient({ fetch })('/system/name/Nowhere');
    assert.deepEqual(res, { ok: false, error: 'System not found' });
});

test('Spansh: fixed endpoints, clamped pages, cache and rate limit', async () => {
    let time = 0;
    const { fetch, calls } = fakeFetch((url, init) => ({ body: JSON.parse(init.body).filters?.fail ? { error: 'Invalid request' } : { count: 1, results: [{ name: 'X' }] } }));
    const search = createSpanshClient({ fetch, baseUrl: 'https://spansh.test/api', now: () => time });

    const first = await search('bodies', { filters: {}, size: 500, page: 99 });
    assert.equal(first.ok, true);
    assert.equal(calls[0].url, 'https://spansh.test/api/bodies/search');
    assert.equal(calls[0].init.method, 'POST');
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.size, 50);
    assert.equal(sent.page, 20);
    assert.deepEqual(sent.filters, {}, 'empty objects stay objects');

    assert.equal((await search('bodies', { filters: {}, size: 500, page: 99 })).cached, true);
    assert.equal(calls.length, 1, 'cache hit');

    assert.equal((await search('trade', {})).ok, false);
    assert.equal((await search('bodies/../route', {})).ok, false);
    assert.equal((await search('bodies', [1])).ok, false);
    assert.equal((await search('bodies', { pad: 'x'.repeat(20000) })).ok, false);

    const err = await search('bodies', { filters: { fail: 1 } });
    assert.deepEqual(err, { ok: false, error: 'Spansh: Invalid request' });
    assert.equal((await search('bodies', { filters: { fail: 1 } })).cached, undefined, 'errors are not cached');

    let last;
    for (let i = 0; i < 40; i++) last = await search('systems', { n: i });
    assert.match(last.error, /Too many/);
    time += 61000;
    assert.equal((await search('systems', { n: 'later' })).ok, true, 'limit resets after a minute');
});

test('Spansh: station results keep only the fields the app shows', async () => {
    const station = {
        name: 'Jameson Memorial', type: 'Orbis Starport', system_name: 'Shinrarta Dezhra', distance: 0, large_pads: 8, is_planetary: false,
        market: [{ commodity: 'Gold', buy_price: 1 }], ships: [{ name: 'Anaconda', price: 146969451, ship_id: 128049363 }], services: [{ name: 'Outfitting' }],
        modules: [{ ed_symbol: 'Int_Hyperdrive_Size5_Class5', name: 'Frame Shift Drive', class: 5, rating: 'A', price: 5103953, category: 'standard', ed_id: 128064112 }]
    };
    const { fetch } = fakeFetch(() => ({ body: { count: 1, size: 1, results: [station] } }));
    const search = createSpanshClient({ fetch, baseUrl: 'https://spansh.test/api' });

    const { data } = await search('stations', { filters: {} });
    assert.equal(data.count, 1);
    assert.deepEqual(data.results[0], {
        name: 'Jameson Memorial', type: 'Orbis Starport', system_name: 'Shinrarta Dezhra', distance: 0, large_pads: 8, is_planetary: false,
        modules: [{ ed_symbol: 'Int_Hyperdrive_Size5_Class5', name: 'Frame Shift Drive', class: 5, rating: 'A', price: 5103953 }],
        ships: [{ name: 'Anaconda', price: 146969451 }]
    });
    const bodies = await search('bodies', { filters: {} });
    assert.deepEqual(bodies.data.results[0].market, station.market, 'other searches stay untouched');
});

test('Spansh: reports timeouts and unreachable servers in plain words', async () => {
    const down = createSpanshClient({ fetch: async () => { throw new TypeError('fetch failed'); } });
    assert.match((await down('bodies', {})).error, /not reachable/);
    const slow = createSpanshClient({ fetch: async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; } });
    assert.match((await slow('bodies', {})).error, /did not answer in time/);
});

test('Commodity names: parsed, cached for a week, old list used when offline', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'alopex-'));
    const cacheFile = path.join(dir, 'names.json');
    const csv = 'id,symbol,category,name\n1,Opal,Minerals,Void Opal\n2,LowTemperatureDiamond,Minerals,Low Temperature Diamonds\n';
    assert.deepEqual(parseCommodityCsv(csv), { opal: 'Void Opal', lowtemperaturediamond: 'Low Temperature Diamonds' });

    let time = 0;
    const online = fakeFetch(() => ({ body: csv }));
    assert.equal((await loadCommodityNames({ fetch: online.fetch, cacheFile, now: () => time })).opal, 'Void Opal');
    await loadCommodityNames({ fetch: online.fetch, cacheFile, now: () => time });
    assert.equal(online.calls.length, 1, 'second call uses the cache');

    time += 8 * 86400000;
    const offline = async () => { throw new TypeError('offline'); };
    assert.equal((await loadCommodityNames({ fetch: offline, cacheFile, now: () => time })).opal, 'Void Opal');
});

test('Journal: only Journal.*.log files, sorted old to new, read from an offset', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'alopex-journal-'));
    writeFileSync(path.join(dir, 'Journal.2026-10-26T100000.01.log'), 'äb\ncd\n');
    writeFileSync(path.join(dir, 'Journal.2026-10-25T090000.01.log'), 'x\n');
    writeFileSync(path.join(dir, 'Journal.221003101010.01.log'), 'old\n');
    writeFileSync(path.join(dir, 'Status.json'), '{}');
    writeFileSync(path.join(dir, 'secret.txt'), 'nope');
    mkdirSync(path.join(dir, 'Journal.folder.log'));

    assert.deepEqual(await listJournals(dir), ['Journal.221003101010.01.log', 'Journal.2026-10-25T090000.01.log', 'Journal.2026-10-26T100000.01.log']);
    const all = await readJournal(dir, 'Journal.2026-10-26T100000.01.log', 0);
    assert.deepEqual(all, { size: 7, text: 'äb\ncd\n' });
    assert.deepEqual(await readJournal(dir, 'Journal.2026-10-26T100000.01.log', 4), { size: 7, text: 'cd\n' });
    assert.deepEqual(await readJournal(dir, 'Journal.2026-10-26T100000.01.log', 50), { size: 7, text: '' });

    for (const bad of ['secret.txt', 'Status.json', '../Journal.x.log', 'sub/Journal.x.log', 'Journal.x.log/../../secret.txt', '..\\Journal.x.log']) {
        await assert.rejects(readJournal(dir, bad, 0), /Invalid journal file name/, bad);
    }
    assert.match(defaultJournalFolder('C:\\Users\\cmdr'), /Saved Games.Frontier Developments.Elite Dangerous$/);
});
