// End-to-end test of the desktop app with Playwright against fake Ardent/Spansh servers and a temp journal folder.
//   xvfb-run -a node --test test/app.test.mjs      (Linux without display)
//   node --test test/app.test.mjs                  (Windows/macOS)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const ELECTRON = require('electron');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PKG = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const JOURNAL_DIR = mkdtempSync(path.join(tmpdir(), 'alopex-journal-'));
const USER_DATA = mkdtempSync(path.join(tmpdir(), 'alopex-userdata-'));
const JOURNAL_FILE = path.join(JOURNAL_DIR, 'Journal.2026-10-26T100000.01.log');
// Chromium refuses its sandbox when running as root (CI containers); normal users keep it.
const ARGS = process.getuid && process.getuid() === 0 ? ['--no-sandbox', ROOT] : [ROOT];

let server, app, win, env;
const stderr = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- fake services ----------
const row = o => ({ commodityName: 'gold', marketId: 1, stationName: 'X', stationType: 'Coriolis', distanceToArrival: 500, maxLandingPadSize: 3,
    systemAddress: 1, systemName: 'A', buyPrice: 0, demand: 0, meanPrice: 0, sellPrice: 0, stock: 0,
    updatedAt: new Date(Date.now() - 3600e3).toISOString(), ...o });
const SYSTEMS = { sol: { systemAddress: 10477373803, systemName: 'Sol', systemX: 0, systemY: 0, systemZ: 0 },
    'lhs 20': { systemAddress: 3307124605658, systemName: 'LHS 20', systemX: 11.19, systemY: -37.38, systemZ: -31.84 } };

function ardent(p) {
    let m;
    if (p === '/v2/commodities') return [{ commodityName: 'gold', maxSellPrice: 70000 }];
    if ((m = p.match(/^\/v2\/system\/name\/([^/]+)$/))) return SYSTEMS[m[1].toLowerCase()] || { status: 404, body: { error: 'Not Found', message: 'System not found' } };
    if (/\/commodities\/exports$/.test(p) && p.includes('/name/')) return [row({ stationName: 'Abraham Lincoln', systemName: 'Sol', buyPrice: 45000, stock: 5000 })];
    if (/\/commodities\/imports$/.test(p)) return [row({ commodityName: 'tritium', stationName: 'Home Port', systemName: 'Sol', sellPrice: 52000, demand: 10000 })];
    if (/\/system\/address\/\d+\/commodities\/exports$/.test(p)) return [row({ commodityName: 'tritium', stationName: 'Far Dock', stationType: null, systemName: 'LHS 20', buyPrice: 41000, stock: 3000 })];
    if ((m = p.match(/\/commodity\/name\/([^/]+)\/nearby\/imports$/))) {
        if (m[1] === 'gold') return [row({ stationName: 'Ohm City', stationType: 'CraterPort', bodyName: 'LHS 20 c 1', systemName: 'LHS 20', systemAddress: 3307124605658, sellPrice: 62000, demand: 90000, distance: 51 })];
        return [row({ commodityName: m[1], stationName: 'Diamond Exchange', stationType: 'SurfaceStation', bodyName: 'Near 2 <b>a</b>', systemName: 'Near', sellPrice: 200000, demand: 1000, distance: 12 }),
            row({ commodityName: m[1], stationName: 'Orbital Market', stationType: 'Orbis', systemName: 'Near', sellPrice: 150000, demand: 1000, distance: 12 })];
    }
    if (/\/commodity\/name\/[^/]+$/.test(p)) return [];
    return { status: 404, body: { error: 'Not Found', message: 'no mock for ' + p } };
}

// Spansh station search: one page with stations that sell the asked module plus a different mix of the others.
const stationQueries = [];
const mod = (ed_symbol, name, cls, rating, price) => ({ ed_symbol, name, class: cls, rating, price, category: 'standard', ed_id: 1 });
const FSD_6A = mod('Int_Hyperdrive_Size6_Class5', 'Frame Shift Drive', 6, 'A', 16179531);
const SCOOP_6A = mod('Int_FuelScoop_Size6_Class5', 'Fuel Scoop', 6, 'A', 28763610);
const MGC_ANACONDA = mod('Anaconda_Armour_Grade3', 'Military Grade Composite', 1, 'I', 147827070);
const MGC_SIDEWINDER = mod('SideWinder_Armour_Grade3', 'Military Grade Composite', 1, 'I', 80320);
const ANACONDA = { name: 'Anaconda', price: 146969451 };
const COBRA = { name: 'Cobra MkIII', price: 205800 };   // EDCD spelling, the app writes "Cobra Mk III"
const station = o => ({ type: 'Coriolis Starport', system_name: 'Near', distance_to_arrival: 300, large_pads: 4, medium_pads: 6, small_pads: 2,
    is_planetary: false, outfitting_updated_at: new Date(Date.now() - 2 * 3600e3).toISOString(), market: [{ name: 'Gold' }], ...o });
function stations(query) {
    stationQueries.push(query);
    const all = [
        station({ name: 'Small Outpost', type: 'Outpost', large_pads: 0, distance: 3, modules: [FSD_6A, SCOOP_6A, MGC_ANACONDA], ships: [] }),
        station({ name: 'Near Dock', distance: 5, modules: [FSD_6A, MGC_SIDEWINDER], ships: [ANACONDA, COBRA] }),
        station({ name: 'Crater Works', type: 'Planetary Port', is_planetary: true, body_name: 'Near 1', distance: 7,
            modules: [FSD_6A, SCOOP_6A, MGC_ANACONDA], ships: [ANACONDA], shipyard_updated_at: new Date(Date.now() - 3 * 86400e3).toISOString() }),
        station({ name: 'Far Station', system_name: 'Further', distance: 9, modules: [FSD_6A, SCOOP_6A, MGC_SIDEWINDER], ships: [COBRA] }),
        station({ name: 'Core Yard', system_name: 'Further', distance: 11, ships: [], modules: [
            mod('Int_Engine_Size7_Class5', 'Thrusters', 7, 'A', 51289890), mod('Int_Powerplant_Size8_Class5', 'Power Plant', 8, 'A', 162586486),
            mod('Int_Hyperdrive_Overcharge_Size6_Class5', 'Frame Shift Drive (SCO)', 6, 'A', 16179531), mod('Int_PowerDistributor_Size8_Class5', 'Power Distributor', 8, 'A', 25828146)] })
    ];
    return { count: all.length, size: query.size, page: query.page, results: query.page === 0 ? all : [] };
}

const ringQueries = [];
function spansh(type, query) {
    if (type === 'stations') return stations(query);
    if (query.filters?.ring_signals) {
        ringQueries.push(query);
        return { count: 2, results: [
            { name: 'HIP 21991 3', system_name: 'HIP 21991', distance: 23.4, distance_to_arrival: 1200, reserve_level: 'Pristine',
                rings: [{ name: 'HIP 21991 3 A Ring', type: 'Icy', signals: [{ name: 'Low Temperature Diamonds', count: 2 }] }] },
            { name: 'Col 285 2', system_name: 'Col 285', distance: 30.1, distance_to_arrival: 800, reserve_level: 'LowResources',
                rings: [{ name: 'Col 285 2 A Ring', type: 'Icy', signals: [{ name: 'Low Temperature Diamonds', count: 1 }] }] }] };
    }
    return { count: 1, results: [{ name: 'Synuefe AB 1 a', system_name: 'Synuefe AB', distance: 80.2, gravity: 0.3,
        landmarks: [{ type: 'Stratum', subtype: 'Stratum Tectonicas' }] }] };
}

const J = o => JSON.stringify({ timestamp: '2026-10-26T10:00:00Z', ...o });
const JOURNAL = [
    J({ event: 'Fileheader' }),
    // flown earlier: a Cobra with known loadout
    J({ event: 'Commander', FID: 'F4242', Name: 'Fuxy' }),
    J({ event: 'Loadout', Ship: 'CobraMkIII', ShipID: 9, ShipName: 'Digger', MaxJumpRange: 22.5, CargoCapacity: 36,
        Modules: [{ Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size4_class2' }] }),
    J({ event: 'Loadout', Ship: 'Hauler', ShipID: 11, ShipName: 'Old Bus', MaxJumpRange: 18, CargoCapacity: 22, Modules: [] }),
    J({ event: 'LoadGame', FID: 'F4242', Commander: 'Fuxy', Ship: 'Anaconda', ShipID: 7, ShipName: 'Alopex', ShipIdent: 'AL-01' }),
    J({ event: 'Loadout', Ship: 'anaconda', ShipID: 7, ShipName: 'Alopex', ShipIdent: 'AL-01', MaxJumpRange: 41.237, CargoCapacity: 400,
        Modules: [{ Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size6_class3' },
            { Item: 'int_passengercabin_size6_class1' }, { Item: 'int_passengercabin_size5_class4' }] }),
    J({ event: 'Location', StarSystem: 'Sol', Docked: true, StationName: 'Abraham Lincoln' }),
    J({ event: 'Cargo', Vessel: 'Ship', Count: 64 })
].join('\r\n') + '\r\n';

before(async () => {
    server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            const url = new URL(req.url, 'http://x');
            let result;
            if (url.pathname === '/fdev/commodity.csv') {
                res.setHeader('Content-Type', 'text/csv');
                return res.end('id,symbol,category,name\n1,Gold,Metals,Gold\n2,Tritium,Chemicals,Tritium\n');
            } else if (url.pathname.startsWith('/ardent')) {
                result = ardent(decodeURIComponent(url.pathname.slice('/ardent'.length)));
            } else {
                result = spansh(url.pathname.split('/')[3], JSON.parse(body || '{}'));
            }
            res.statusCode = result.status || 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.status ? result.body : result));
        });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(JOURNAL_FILE, JOURNAL);
    // the app last ran as 1.0.0 and had downloaded this version: the update notice must show
    writeFileSync(path.join(USER_DATA, 'settings.json'), JSON.stringify({ lastVersion: '1.0.0', updateNotes: { version: PKG.version, notes: 'Frame shift intro' } }));

    env = { ...process.env, ELECTRON_ENABLE_LOGGING: '1', ALOPEX_USER_DATA: USER_DATA, ALOPEX_JOURNAL_DIR: JOURNAL_DIR, ALOPEX_TEST_CHOOSE_DIR: JOURNAL_DIR,
        ALOPEX_ARDENT_API: `${base}/ardent/v2`, ALOPEX_SPANSH_API: `${base}/spansh/api`, ALOPEX_COMMODITY_CSV: `${base}/fdev/commodity.csv`, ALOPEX_TEST_UPDATE: '9.9.9' };
    delete env.NODE_OPTIONS;
    app = await _electron.launch({ executablePath: ELECTRON, args: ARGS, env });
    app.process().stderr.on('data', d => stderr.push(String(d)));
    win = await app.firstWindow();
    await win.waitForSelector('#journal-status.active', { timeout: 15000 });
});

after(async () => {
    if (app) await app.close().catch(() => {});
    server?.close();
});

test('the intro reports what the journal says, and a click skips it', async () => {
    await win.waitForFunction(() => document.getElementById('intro-cmdr')?.classList.contains('resolved'));
    assert.equal(await win.textContent('#intro-journal'), 'ONLINE');
    assert.equal(await win.textContent('#intro-cmdr'), 'CMDR Fuxy');
    assert.equal(await win.textContent('#intro-loc'), 'Sol');
    assert.equal(await win.textContent('#intro-fleet'), '3 SHIPS · Anaconda ACTIVE');
    assert.equal(await win.textContent('#intro-welcome'), 'WELCOME BACK, CMDR Fuxy');
    assert.equal(await win.$$eval('#intro-fox polygon', shards => shards.length), 25);
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(await win.textContent('.intro-ver'), `v${pkg.version} · by ${pkg.author}`);

    // frame shift: stars on the canvas, then the flash as the fox arrives
    await win.waitForSelector('#intro.flash', { timeout: 3000 });
    const litPixels = await win.evaluate(() => {
        const canvas = document.getElementById('intro-stars');
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 300) lit++;
        return lit;
    });
    assert.ok(litPixels > 100, `stars drawn (${litPixels} bright pixels)`);

    // clicked in the DOM directly: the intro may be about to end on its own
    const skipped = await win.evaluate(() => {
        const intro = document.getElementById('intro');
        if (!intro) return 'already gone';
        intro.click();
        return intro.classList.contains('leaving');
    });
    assert.equal(skipped, true);
    await win.waitForSelector('#intro', { state: 'detached', timeout: 2000 });

    // switched off for the restart test at the end
    assert.equal(await win.isChecked('#intro-enabled'), true);
    await win.uncheck('#intro-enabled');
    assert.equal(await win.evaluate(() => localStorage.getItem('ed_nav_intro-enabled')), 'false');
});

test('opens its own window with the app page and without errors', async () => {
    assert.equal(win.url(), 'app://alopex/index.html');
    assert.equal(await win.title(), 'ALOPEX OS // E.D. Master Navigator');
    assert.equal(await win.evaluate(() => typeof require + '/' + typeof process), 'undefined/undefined', 'no Node.js in the page');
    assert.deepEqual(await win.evaluate(() => Object.keys(window.alopex)), ['ardent', 'spansh', 'commodityNames', 'journal', 'copy', 'updates']);
    assert.equal(stderr.join('').match(/Uncaught.*/)?.[0], undefined, 'no script errors');
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(await win.$eval('.app-footer', e => e.textContent.trim()), `ALOPEX OS v${pkg.version} · by ${pkg.author}`);

    // default HUD is Imperial (ice blue); the original orange is "Classic"
    const accent = () => win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ed-orange').trim().toLowerCase());
    assert.equal(await win.inputValue('#theme-selector'), 'default');
    assert.equal(await accent(), '#00d0ff');
    await win.selectOption('#theme-selector', 'classic');
    assert.equal(await accent(), '#ff8c00');
    await win.selectOption('#theme-selector', 'default');
    assert.equal(await win.evaluate(() => document.documentElement.hasAttribute('data-theme')), false);
});

test('after an update the app says so; update check, download and install from the header button', async () => {
    assert.equal(await win.isVisible('#update-notice'), true);
    assert.equal(await win.textContent('#update-notice-title'), `✓ ALOPEX OS was updated to v${PKG.version}`);
    assert.equal(await win.textContent('#update-notice-notes'), 'Frame shift intro');
    await win.click('[data-action="closeUpdateNotice"]');
    assert.equal(await win.isVisible('#update-notice'), false);
    assert.equal(JSON.parse(readFileSync(path.join(USER_DATA, 'settings.json'), 'utf8')).lastVersion, PKG.version);

    assert.equal(await win.textContent('#update-status'), `v${PKG.version}`);
    assert.equal(await win.isVisible('#btn-update'), false, 'no header button while nothing is waiting');
    await win.click('#update-action');   // Check now
    await win.waitForSelector('#btn-update:not([hidden])');
    assert.equal(await win.textContent('#btn-update'), '⬆ Update to v9.9.9');
    assert.equal(await win.textContent('#update-status'), 'v9.9.9 is available');
    await win.click('#btn-update');
    await win.waitForFunction(() => document.getElementById('btn-update').textContent === '⟳ Restart to update');
    assert.equal(await win.textContent('#update-status'), 'v9.9.9 is ready');
    assert.deepEqual(JSON.parse(readFileSync(path.join(USER_DATA, 'settings.json'), 'utf8')).updateNotes, { version: '9.9.9', notes: 'Test release notes' });
    await win.click('#btn-update');
    await win.waitForFunction(() => document.getElementById('update-status').textContent === 'Installing v9.9.9…');
    assert.equal(await win.isVisible('#btn-update'), false);

    // the auto-update switch is kept by the app core
    await win.check('#update-auto');
    await win.waitForFunction(() => document.getElementById('update-status').textContent === 'Installing v9.9.9…' && document.getElementById('update-auto').checked);
    await sleep(300);
    assert.equal(JSON.parse(readFileSync(path.join(USER_DATA, 'settings.json'), 'utf8')).autoUpdate, true);
});

test('finds the journal folder by itself and loads the fleet', async () => {
    await win.waitForFunction(() => document.getElementById('current-system').value === 'Sol');
    const values = await win.evaluate(() => ['jump-range', 'cargo-space', 'passenger-space', 'pad-size'].map(id => document.getElementById(id).value));
    assert.deepEqual(values, ['41.24', '400', '36', '3']);
    assert.ok((await win.$$eval('#ship-preset option', o => o.map(x => x.textContent))).some(t => t.includes('[ACTIVE] Alopex (Anaconda)')));
    assert.equal(await win.inputValue('#current-cargo'), '64', 'mining cargo = current load of the ship being flown');
});

test('choosing another ship updates cargo, also for mining', async () => {
    await win.selectOption('#ship-preset', '9');
    const cobra = await win.evaluate(() => ['jump-range', 'cargo-space', 'current-cargo', 'pad-size'].map(id => document.getElementById(id).value));
    assert.deepEqual(cobra, ['22.5', '36', '36', '1'], 'other ship: full hold as planning value');

    appendFileSync(JOURNAL_FILE, J({ event: 'Cargo', Vessel: 'Ship', Count: 120 }) + '\r\n');
    await sleep(4000);
    assert.equal(await win.inputValue('#current-cargo'), '36', 'load of the Anaconda does not overwrite the selected Cobra');

    await win.selectOption('#ship-preset', '7');
    assert.equal(await win.inputValue('#current-cargo'), '120', 'back to the flown ship: its live load');
    appendFileSync(JOURNAL_FILE, J({ event: 'Cargo', Vessel: 'Ship', Count: 150 }) + '\r\n');
    await win.waitForFunction(() => document.getElementById('current-cargo').value === '150', null, { timeout: 8000 });
});

test('follows the journal live', async () => {
    appendFileSync(JOURNAL_FILE, J({ event: 'FSDJump', StarSystem: 'LHS 20' }) + '\r\n');
    await win.waitForFunction(() => document.getElementById('current-system').value === 'LHS 20', null, { timeout: 8000 });
    await win.fill('#current-system', 'Sol');
});

test('trade loop with market data from the app core', async () => {
    await win.click('[data-action="searchTrade"]');
    await win.waitForSelector('#trade-results .accordion-item, #trade-results .warning-box, #trade-results .info-box');
    const text = await win.$eval('#trade-results', e => e.innerText);
    assert.match(text, /Gold ⇄ Tritium/i);
    // cargo 400 t from the journal: 400 × (62,000 − 45,000) + 400 × (52,000 − 41,000)
    assert.match(text, /11,200,000 CR/);
    // station type from Ardent: planetary or orbital, with the body for planetary stations
    assert.match(text, /Abraham Lincoln \(Sol · Pad L · 500 Ls\) 🛰️ Orbital · Coriolis starport/i);
    assert.match(text, /Ohm City \(LHS 20 · Pad L · 500 Ls\) 🪐 Planetary · Port · on LHS 20 c 1/i);
    assert.match(text, /Far Dock \(LHS 20 · Pad L · 500 Ls\) ❔ Type unknown/i);
});

test('mining hotspots via Spansh and the best sell station via Ardent', async () => {
    await win.click('[data-tab="mining"]');
    await win.selectOption('#mine-resource', 'Low Temperature Diamonds');
    await win.click('[data-action="searchMining"]');
    await win.waitForSelector('#mining-results .accordion-item, #mining-results .warning-box');
    assert.match(await win.$eval('#mining-results', e => e.innerText), /HIP 21991 3 A Ring/i);
    await win.click('#mining-results .accordion-header');
    await win.click('text=Find Highest Price Sell Station');
    await win.waitForSelector('#mining-station-0 .sell-station-box');
    const station = await win.$eval('#mining-station-0', e => e.innerText);
    assert.match(station, /Diamond Exchange \(Near · Pad L · 500 Ls\) 🪐 Planetary · Surface station · on Near 2 <b>a<\/b>/i);
    assert.equal(await win.$eval('#mining-station-0', e => e.querySelector('.station-kind b')), null, 'body name is shown as text, not markup');
});

test('"Include planetary stations" hides planetary markets and is remembered', async () => {
    assert.equal(await win.isChecked('#include-planetary'), true, 'planetary stations are included by default');
    await win.uncheck('#include-planetary');
    assert.equal(await win.evaluate(() => localStorage.getItem('ed_nav_include-planetary')), 'false');

    // mining: the planetary top buyer drops out, the orbital station moves up
    await win.click('text=Find Highest Price Sell Station');
    await win.waitForFunction(() => !document.querySelector('#mining-station-0').innerText.includes('Diamond Exchange'));
    await win.waitForSelector('#mining-station-0 .sell-station-box');
    const station = await win.$eval('#mining-station-0', e => e.innerText);
    assert.match(station, /Top Buyer\s+Station: Orbital Market \(Near · Pad L · 500 Ls\) 🛰️ Orbital · Orbis starport/i);
    assert.doesNotMatch(station, /Planetary ·/i);

    // trade loop: the only gold buyer (Ohm City) is planetary, so no route, and the message says why
    await win.click('[data-tab="trade"]');
    await win.click('[data-action="searchTrade"]');
    await win.waitForFunction(() => document.querySelector('#trade-results').innerText.includes('PLANETARY STATIONS ARE HIDDEN'));
    assert.equal(await win.$('#trade-results .accordion-item'), null);

    await win.check('#include-planetary');
    assert.equal(await win.evaluate(() => localStorage.getItem('ed_nav_include-planetary')), 'true');
    await win.click('[data-action="searchTrade"]');
    await win.waitForSelector('#trade-results .accordion-item');
    assert.match(await win.$eval('#trade-results', e => e.innerText), /Ohm City/i);
});

test('mining: only rings with the chosen reserve levels', async () => {
    await win.click('[data-tab="mining"]');
    const results = () => win.$eval('#mining-results', e => e.innerText);
    assert.match(await results(), /Col 285 2 A Ring[\s\S]*\| Low/i, 'all levels: both rings, with their reserve level');

    await win.uncheck('#reserve-low');
    await win.click('[data-action="searchMining"]');
    await win.waitForFunction(() => document.querySelector('#mining-results .accordion-item') && !document.querySelector('#mining-results').textContent.includes('Col 285'));
    assert.match(await results(), /HIP 21991 3 A Ring[\s\S]*\| Pristine/i);
    assert.equal(ringQueries.at(-1).size, 50, 'more bodies from Spansh while filtering');

    for (const level of ['pristine', 'major', 'common']) await win.uncheck(`#reserve-${level}`);
    await win.click('[data-action="searchMining"]');
    await win.waitForFunction(() => document.querySelector('#mining-results').textContent.includes('reserve level Depleted'));

    for (const level of ['pristine', 'major', 'common', 'low']) await win.check(`#reserve-${level}`);
    assert.equal(await win.evaluate(() => localStorage.getItem('ed_nav_reserve-low')), 'true');
    await win.click('[data-action="searchMining"]');
    // the same query as the first mining search: answered from the app core's cache
    await win.waitForFunction(() => document.querySelector('#mining-results').textContent.includes('Col 285'));
    assert.match(await results(), /HIP 21991 3 A Ring[\s\S]*Col 285 2 A Ring/i);
});

test('exobiology via Spansh', async () => {
    await win.click('[data-tab="exobio"]');
    await win.click('[data-action="searchExo"]');
    await win.waitForSelector('#exobio-results .accordion-item, #exobio-results .warning-box');
    assert.match(await win.$eval('#exobio-results', e => e.innerText), /Synuefe AB 1 a/i);
});

// Outfitting: type into the part search and click the suggestion
async function pickPart(query, name) {
    await win.fill('#outfit-search', query);
    await win.click(`#outfit-suggest [data-part="${name}"]`);
    assert.equal(await win.inputValue('#outfit-search'), name);
}
const variantLabels = () => win.$$eval('#outfit-variant option', options => options.map(o => o.textContent));

test('outfitting: the nearest station that sells every part on the list', async () => {
    await win.click('[data-tab="outfit"]');
    assert.equal(await win.inputValue('#outfit-ship'), 'fleet:7', 'starts with the active ship');
    assert.match(await win.textContent('#outfit-ship-info'), /Landing pad L/);

    // a ship type without journal data offers its own armour and has no fitted modules
    await win.selectOption('#outfit-ship', 'type:cobramkiii');
    assert.match(await win.textContent('#outfit-ship-info'), /Landing pad S/);
    await pickPart('mil grade', 'Military Grade Composite');
    assert.equal(await win.inputValue('#outfit-variant'), 'cobramkiii_armour_grade3');
    // only what fits the Cobra: hardpoints 2, 2, 1, 1 and a size 4 FSD
    await pickPart('pulse', 'Pulse Laser');
    const lasers = await variantLabels();
    assert.ok(lasers.some(l => /Small/.test(l)) && lasers.some(l => /Medium/.test(l)));
    assert.ok(!lasers.some(l => /Large|Huge/.test(l)), lasers.join());
    await pickPart('fsd', 'Frame Shift Drive');
    assert.equal(Math.max(...(await variantLabels()).map(l => parseInt(l, 10))), 4);
    assert.equal(await win.inputValue('#outfit-variant'), 'int_hyperdrive_size4_class5', 'without a fitted FSD: the largest that fits, A-rated');
    // a ship without slot data shows every size and says so
    await win.selectOption('#outfit-ship', 'type:mediumtransport01');
    assert.match(await win.textContent('#outfit-ship-info'), /slot sizes unknown/);
    assert.equal(Math.max(...(await variantLabels()).map(l => parseInt(l, 10))), 8);
    await win.selectOption('#outfit-ship', 'fleet:7');

    // search by abbreviation: the FSD comes first, before the Guardian FSD Booster
    await win.fill('#outfit-search', 'fsd');
    const suggestions = await win.$$eval('#outfit-suggest [data-part]', items => items.map(i => i.dataset.part));
    assert.equal(suggestions[0], 'Frame Shift Drive');
    assert.ok(suggestions.includes('Guardian FSD Booster'));
    await win.keyboard.press('Enter');
    // fleet ship: the fitted FSD is shown, the A-rated module of that size is suggested, nothing above the size 6 slot
    assert.equal(await win.inputValue('#outfit-search'), 'Frame Shift Drive');
    assert.match(await win.textContent('#outfit-fitted'), /Fitted on Alopex: 6C/);
    assert.equal(await win.inputValue('#outfit-variant'), 'int_hyperdrive_size6_class5');
    assert.equal(Math.max(...(await variantLabels()).map(l => parseInt(l, 10))), 6);
    await win.click('[data-action="addOutfitPart"]');
    // size and rating typed with the part
    await win.fill('#outfit-search', '6a scoop');
    await win.keyboard.press('Enter');
    assert.equal(await win.inputValue('#outfit-search'), 'Fuel Scoop');
    assert.equal(await win.inputValue('#outfit-variant'), 'int_fuelscoop_size6_class5');
    await win.click('[data-action="addOutfitPart"]');
    await pickPart('mil grade', 'Military Grade Composite');
    assert.equal(await win.inputValue('#outfit-variant'), 'anaconda_armour_grade3');
    await win.click('[data-action="addOutfitPart"]');
    // grouped by slot type in the order of the game; bulkheads are core internals
    assert.deepEqual(await win.$$eval('#outfit-parts .part-group-label', els => els.map(e => e.textContent)), ['Core internal', 'Optional internal']);
    assert.match(await win.$eval('#outfit-parts', e => e.innerText), /Core internal\s+Military Grade Composite \(Anaconda\)[\s\S]*6A Frame Shift Drive[\s\S]*Optional internal\s+6A Fuel Scoop/i);
    // parts that do not fit another ship are marked on the list
    await win.selectOption('#outfit-ship', 'type:cobramkiii');
    assert.equal(await win.$$eval('#outfit-parts .no-fit', chips => chips.length), 3);
    await win.selectOption('#outfit-ship', 'fleet:7');
    assert.equal(await win.$$eval('#outfit-parts .no-fit', chips => chips.length), 0);

    await win.click('[data-action="searchOutfit"]');
    await win.waitForSelector('#outfit-results .accordion-item, #outfit-results .info-box, #outfit-results .warning-box');
    const query = stationQueries.at(-1);
    assert.deepEqual(query.filters.modules, { name: ['Frame Shift Drive'], class: ['6'], rating: ['A'] });
    assert.deepEqual(query.filters.has_large_pad, { value: true });
    assert.deepEqual(query.sort, [{ distance: { direction: 'asc' } }]);
    assert.equal(query.reference_system, await win.inputValue('#current-system'));
    assert.ok(!query.filters.type.value.includes('Drake-Class Carrier'), 'Fleet Carriers are off by default');
    assert.ok(query.filters.type.value.includes('Planetary Port'));

    // Small Outpost: no large pad. Near Dock: no fuel scoop. Far Station: armour listed for another ship counts.
    const titles = () => win.$$eval('#outfit-results .accordion-title', els => els.map(e => e.textContent));
    assert.deepEqual(await titles(), ['Crater Works', 'Far Station']);
    const text = await win.$eval('#outfit-results', e => e.innerText);
    assert.match(text, /192,770,211 CR\s+all parts/i);
    assert.match(text, /44,943,141 CR\s+known prices/i);
    assert.match(text, /Crater Works \(Near · Pad L · 300 Ls\) 🪐 Planetary · Port · on Near 1/i);
    assert.match(text, /✓ 6A Fuel Scoop: 28,763,610 CR/i);
    assert.match(text, /✓ Military Grade Composite \(Anaconda\): price unknown/i);

    // the planetary switch applies here as well
    await win.uncheck('#include-planetary');
    await win.click('[data-action="searchOutfit"]');
    await win.waitForFunction(() => document.querySelector('#outfit-results .accordion-item') && !document.querySelector('#outfit-results').textContent.includes('Crater Works'));
    assert.deepEqual(await titles(), ['Far Station']);
    assert.ok(!stationQueries.at(-1).filters.type.value.includes('Planetary Port'));
    await win.check('#include-planetary');

    // a part no station sells: the closest partial matches, with what is missing
    await pickPart('guardian fsd', 'Guardian FSD Booster');
    await win.selectOption('#outfit-variant', 'int_guardianfsdbooster_size5');
    await win.click('[data-action="addOutfitPart"]');
    await win.click('[data-action="searchOutfit"]');
    await win.waitForSelector('#outfit-results .info-box');
    const partial = await win.$eval('#outfit-results', e => e.innerText);
    assert.match(partial, /sells all 4 parts\. These come closest/i);
    assert.deepEqual(await titles(), ['Crater Works', 'Far Station', 'Near Dock']);
    assert.match(partial, /✗ 5H Guardian FSD Booster: not sold here/i);

    await win.click('[data-remove-part="int_guardianfsdbooster_size5"]');
    assert.deepEqual(JSON.parse(await win.evaluate(() => localStorage.getItem('alopex_outfit_parts'))),
        ['int_hyperdrive_size6_class5', 'int_fuelscoop_size6_class5', 'anaconda_armour_grade3']);
});

test('outfitting: the station can also have to sell the ship', async () => {
    // Anaconda from the fleet plus the three parts of the previous test
    await win.check('#outfit-buy-ship');
    await win.click('[data-action="searchOutfit"]');
    await win.waitForFunction(() => document.querySelector('#outfit-results .accordion-item') && !document.querySelector('#outfit-results').textContent.includes('Far Station'));
    let query = stationQueries.at(-1);
    assert.deepEqual(query.filters.ships, { value: ['Anaconda'] });
    assert.deepEqual(query.filters.modules, { name: ['Frame Shift Drive'], class: ['6'], rating: ['A'] });
    const titles = () => win.$$eval('#outfit-results .accordion-title', els => els.map(e => e.textContent));
    assert.deepEqual(await titles(), ['Crater Works'], 'Far Station has every part but no Anaconda');
    let text = await win.$eval('#outfit-results', e => e.innerText);
    assert.match(text, /339,739,662 CR\s+ship \+ parts/i);   // 146,969,451 + 192,770,211
    assert.match(text, /✓ Anaconda \(ship\): 146,969,451 CR/i);
    assert.match(text, /Data updated: outfitting 2 h ago, shipyard 3 d ago/i);

    // just the ship: a new Cobra, no parts; Spansh's "Cobra MkIII" is the app's "Cobra Mk III"
    while (await win.$('#outfit-parts [data-remove-part]')) await win.click('#outfit-parts [data-remove-part]');   // the list redraws after each click
    await win.selectOption('#outfit-ship', 'type:cobramkiii');
    await win.click('[data-action="searchOutfit"]');
    await win.waitForFunction(() => document.querySelector('#outfit-results').textContent.includes('Far Station'));
    query = stationQueries.at(-1);
    assert.deepEqual(query.filters.ships, { value: ['Cobra Mk III', 'Cobra MkIII'] });
    assert.equal(query.filters.modules, undefined);
    assert.equal(query.filters.has_large_pad, undefined, 'a Cobra fits small pads');
    assert.deepEqual(await titles(), ['Near Dock', 'Far Station']);
    text = await win.$eval('#outfit-results', e => e.innerText);
    assert.match(text, /205,800 CR\s+ship price/i);
    assert.match(text, /✓ Cobra Mk III \(ship\): 205,800 CR/i);

    await win.uncheck('#outfit-buy-ship');
    await win.click('[data-action="searchOutfit"]');
    await win.waitForFunction(() => document.querySelector('#outfit-results').textContent.includes('Add the parts you need'));
    await win.selectOption('#outfit-ship', 'fleet:7');
});

test('outfitting: the A-rated core package follows the chosen ship', async () => {
    const chip = () => win.textContent('#outfit-parts .part-package');
    await win.click('[data-action="addCorePackage"]');
    assert.match(await chip(), /Core package A: 7A Thrusters · 8A Power Plant · 6A FSD \(SCO\) · 8A Power Distributor/);
    await win.selectOption('#outfit-ship', 'type:cobramkiii');
    assert.match(await chip(), /Core package A: 4A Thrusters · 4A Power Plant · 4A FSD \(SCO\) · 3A Power Distributor/);
    await win.selectOption('#outfit-ship', 'type:mediumtransport01');
    assert.match(await chip(), /slot sizes of this ship unknown/);
    assert.equal(await win.$$eval('#outfit-parts .no-fit', chips => chips.length), 1);
    await win.selectOption('#outfit-ship', 'fleet:7');
    await win.click('[data-action="addCorePackage"]');
    assert.equal(await win.$$eval('#outfit-parts .part-chip', chips => chips.length), 1, 'the package goes on the list once');

    await win.click('[data-action="searchOutfit"]');
    await win.waitForFunction(() => document.querySelector('#outfit-results').textContent.includes('Core Yard'));
    assert.deepEqual(stationQueries.at(-1).filters.modules, { name: ['Power Plant'], class: ['8'], rating: ['A'] });
    assert.deepEqual(await win.$$eval('#outfit-results .accordion-title', els => els.map(e => e.textContent)), ['Core Yard']);
    const text = await win.$eval('#outfit-results', e => e.innerText);
    assert.match(text, /255,884,053 CR\s+all parts/i);   // 51,289,890 + 162,586,486 + 16,179,531 + 25,828,146
    assert.match(text, /✓ 6A Frame Shift Drive \(SCO\): 16,179,531 CR/i);
    assert.deepEqual(JSON.parse(await win.evaluate(() => localStorage.getItem('alopex_outfit_parts'))), ['package:core-a']);
    await win.click('[data-remove-part="package:core-a"]');
});

test('outfitting: parts sorted into categories', async () => {
    const headings = () => win.$$eval('#outfit-suggest .combo-group', els => els.map(e => e.textContent));
    const listed = () => win.$$eval('#outfit-suggest [data-part]', els => els.map(e => e.dataset.part));
    // the category list: slot groups in the order of the game, with the number of parts that fit the ship
    assert.deepEqual(await win.$$eval('#outfit-category optgroup', groups => groups.map(g => g.label)),
        ['Hardpoints', 'Utility mounts', 'Core internal', 'Optional internal']);
    const options = await win.$$eval('#outfit-category option', els => els.map(e => e.textContent));
    assert.match(options[0], /^All parts \(\d+\)$/);
    assert.ok(options.includes('All hardpoints (44)') && options.some(o => /^Lasers \(\d+\)$/.test(o)), options.join());   // all but the Type-11's mining tool
    assert.ok(!options.some(o => o.startsWith('★')), 'no parts made only for the Anaconda');
    const anaconda = parseInt(options[0].match(/\d+/)[0], 10);
    await win.selectOption('#outfit-ship', 'type:sidewinder');
    const sidewinder = parseInt((await win.textContent('#outfit-category option')).match(/\d+/)[0], 10);
    assert.ok(sidewinder < anaconda, `${sidewinder} parts fit a Sidewinder, ${anaconda} an Anaconda`);
    await win.selectOption('#outfit-ship', 'fleet:7');

    // picking a category opens the list of its parts
    await win.selectOption('#outfit-category', 'Hardpoints/Lasers');
    await win.waitForSelector('#outfit-suggest:not([hidden]) [data-part]');
    assert.deepEqual(await headings(), ['Hardpoints · Lasers']);
    assert.ok((await listed()).every(name => /Laser/.test(name)) && (await listed()).includes('Beam Laser'));
    // within a category the search narrows it down; a part from another category is not found there
    await win.selectOption('#outfit-category', 'Utility mounts');
    await win.fill('#outfit-search', 'pulse');
    assert.deepEqual(await listed(), ['Pulse Wave Analyser', 'Pulse Wave Xeno Scanner']);
    await win.fill('#outfit-search', 'fsd');
    assert.match(await win.textContent('#outfit-suggest'), /No matching part in Utility mounts fits this ship/);
    await win.selectOption('#outfit-category', '');

    // the name of a category finds all its parts, after the parts that carry the word in their name
    await win.fill('#outfit-search', 'mining');
    assert.deepEqual((await headings()).slice(0, 2), ['Hardpoints · Mining tools', 'Optional internal · Mining & refining']);
    const mining = await listed();
    assert.ok(mining.indexOf('Mining Laser') < mining.indexOf('Abrasion Blaster') && mining.includes('Refinery'), mining.join());
    // the category with the best match comes first: the drive, not the wake scanner
    await win.fill('#outfit-search', 'frame shift');
    assert.equal((await headings())[0], 'Core internal · Power & drives');
    await win.keyboard.press('Enter');
    assert.equal(await win.inputValue('#outfit-search'), 'Frame Shift Drive');
    // with a part chosen the list shows everything again, in the order of the game; Enter keeps the part
    await win.click('#outfit-radius');
    await win.click('#outfit-search');
    assert.equal((await headings())[0], 'Hardpoints · Anti-Xeno & Guardian');
    await win.keyboard.press('Enter');
    assert.equal(await win.inputValue('#outfit-search'), 'Frame Shift Drive');
    await win.click('[data-action="addOutfitPart"]');
    await pickPart('beam', 'Beam Laser');
    await win.click('[data-action="addOutfitPart"]');
    assert.deepEqual(await win.$$eval('#outfit-parts .part-group-label', els => els.map(e => e.textContent)), ['Hardpoints', 'Core internal']);
    while (await win.$('#outfit-parts [data-remove-part]')) await win.click('#outfit-parts [data-remove-part]');
});

test('outfitting: parts made for one ship and its special slots (Type-11 Prospector)', async () => {
    const listed = () => win.$$eval('#outfit-suggest [data-part]', els => els.map(e => e.dataset.part));
    await win.selectOption('#outfit-ship', 'type:lakonminer');
    assert.match(await win.textContent('#outfit-ship-info'), /★ only for this ship: Mining Volley Repeater, Mk II Mining Multi-Limpet Controller/);
    // its own entry in the category list, starred in the suggestions
    await win.selectOption('#outfit-category', 'special');
    await win.waitForSelector('#outfit-suggest:not([hidden]) [data-part]');
    assert.deepEqual(await listed(), ['Mining Volley Repeater', 'Mk II Mining Multi-Limpet Controller']);
    assert.match(await win.textContent('#outfit-suggest [data-part="Mining Volley Repeater"]'), /★ Type-11 Prospector only · size 3/);
    await win.selectOption('#outfit-category', '');
    // found as a mining laser and with "mk2"
    await win.fill('#outfit-search', 'mining laser');
    assert.ok((await listed()).includes('Mining Volley Repeater'));
    await win.fill('#outfit-search', 'mk2 limpet');
    assert.deepEqual(await listed(), ['Mk II Mining Multi-Limpet Controller']);
    // the large hardpoint and three more take mining tools only: lasers fit the size 2 and 1 hardpoints
    await pickPart('beam', 'Beam Laser');
    const beams = await variantLabels();
    assert.ok(beams.some(l => /Medium/.test(l)) && !beams.some(l => /Large|Huge/.test(l)), beams.join());
    await pickPart('volley', 'Mining Volley Repeater');
    assert.deepEqual(await variantLabels(), ['3C · Large Fixed']);
    await win.click('[data-action="addOutfitPart"]');
    // no other ship can fit it
    await win.selectOption('#outfit-ship', 'fleet:7');
    assert.equal(await win.$$eval('#outfit-parts .no-fit', chips => chips.length), 1);
    await win.fill('#outfit-search', 'volley');
    assert.match(await win.textContent('#outfit-suggest'), /No matching part fits this ship/);
    await win.click('[data-remove-part="hpt_miningtoolv2_fixed_large"]');
});

test('copy buttons write to the clipboard', async () => {
    await win.click('[data-tab="exobio"]');
    await win.click('#exobio-results .accordion-header');
    await win.click('#exobio-results >> text=Copy System Name for Galaxy Map');
    await sleep(200);
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'Synuefe AB');
});

test('"Select Folder" switches the journal folder and remembers it', async () => {
    await win.click('#btn-journal');
    await win.waitForFunction(() => document.getElementById('journal-status').title !== '');
    assert.equal(await win.$eval('#journal-status', e => e.title), JOURNAL_DIR);
    const settings = JSON.parse(readFileSync(path.join(USER_DATA, 'settings.json'), 'utf8'));
    assert.equal(settings.journalFolder, JOURNAL_DIR);
});

test('ships keep their last loadout when their journal files are older than the scan window', async () => {
    // 20 newer sessions in the Anaconda: the Cobra only shows up in a shipyard list, the Hauler is sold
    for (let i = 0; i < 20; i++) {
        const lines = [J({ event: 'Fileheader' }), J({ event: 'Commander', FID: 'F4242', Name: 'Fuxy' }),
            J({ event: 'LoadGame', FID: 'F4242', Commander: 'Fuxy', Ship: 'Anaconda', ShipID: 7, ShipName: 'Alopex', ShipIdent: 'AL-01' })];
        if (i === 5) lines.push(J({ event: 'StoredShips', StarSystem: 'Sol', ShipsHere: [], ShipsRemote: [
            { ShipID: 9, ShipType: 'cobramkiii', Name: 'Digger', StarSystem: 'LHS 20' },
            { ShipID: 11, ShipType: 'hauler', Name: 'Old Bus', StarSystem: 'Sol' }] }));
        if (i === 6) lines.push(J({ event: 'SellShipOnRebuy', ShipType: 'hauler', System: 'Sol', SellShipId: 11, ShipPrice: 1 }));
        writeFileSync(path.join(JOURNAL_DIR, `Journal.2026-10-27T10${String(i).padStart(2, '0')}00.01.log`), lines.join('\r\n') + '\r\n');
    }
    await win.click('#btn-sync');
    await win.waitForFunction(() => !document.getElementById('btn-sync').disabled && document.getElementById('btn-sync').textContent !== 'Syncing...');

    const ships = await win.$$eval('#ship-preset option', options => options.map(o => o.value));
    assert.ok(ships.includes('7') && ships.includes('9'), 'Anaconda and Cobra are still there');
    assert.ok(!ships.includes('11'), 'the sold Hauler does not come back');
    await win.selectOption('#ship-preset', '9');
    assert.equal(await win.inputValue('#jump-range'), '22.5', 'Cobra loadout from before the scan window');
    assert.equal(await win.inputValue('#cargo-space'), '36');
    await win.selectOption('#ship-preset', '7');
    assert.equal(await win.inputValue('#jump-range'), '41.24');

    await win.click('[data-tab="outfit"]');
    await win.selectOption('#outfit-ship', 'fleet:9');
    assert.match(await win.textContent('#outfit-ship-info'), /Landing pad S · fitted modules from the journal \(\d+ d ago\)/);
    await pickPart('frame shift', 'Frame Shift Drive');
    assert.match(await win.textContent('#outfit-fitted'), /Fitted on Digger: 4D Frame Shift Drive/);

    const saved = JSON.parse(await win.evaluate(() => localStorage.getItem('alopex_fleet')));
    assert.deepEqual(Object.keys(saved), ['F4242'], 'saved per commander');
    assert.deepEqual(Object.keys(saved.F4242.ships).sort(), ['7', '9']);
});

test('the page cannot go online, open windows or navigate away', async () => {
    const port = server.address().port;
    const result = await win.evaluate(async port => {
        const tryFetch = url => fetch(url).then(() => 'reached', () => 'blocked');
        const opened = window.open('https://example.com');
        let notification = 'n/a';
        try { notification = await Notification.requestPermission(); } catch (e) {}
        let media = 'blocked';
        try { await navigator.mediaDevices.getUserMedia({ audio: true }); media = 'granted'; } catch (e) {}
        return { internet: await tryFetch('https://example.com/'), localServer: await tryFetch(`http://127.0.0.1:${port}/fdev/commodity.csv`), opened, notification, media };
    }, port);
    assert.deepEqual(result, { internet: 'blocked', localServer: 'blocked', opened: null, notification: 'denied', media: 'blocked' });
    await win.evaluate(() => { location.href = 'https://example.com/'; });
    await sleep(500);
    assert.equal(win.url(), 'app://alopex/index.html', 'navigation blocked');
    assert.equal(app.windows().length, 1, 'no extra windows');
});

test('the bridge rejects invalid requests', async () => {
    const result = await win.evaluate(async () => ({
        ardentPath: (await alopex.ardent('/../../admin', {})).ok,
        ardentUrl: (await alopex.ardent('https://example.com/', {})).ok,
        spanshType: (await alopex.spansh('trade/route', {})).ok,
        journalEscape: (await alopex.journal.read('../package.json', 0)).ok,
        journalOther: (await alopex.journal.read('Status.json', 0)).ok
    }));
    assert.deepEqual(result, { ardentPath: false, ardentUrl: false, spanshType: false, journalEscape: false, journalOther: false });
});

test('a second start only brings the running window to the front', async () => {
    const second = spawn(ELECTRON, ARGS, { env, stdio: 'ignore' });
    const code = await new Promise(resolve => {
        const timer = setTimeout(() => { second.kill(); resolve('still running'); }, 20000);
        second.on('exit', c => { clearTimeout(timer); resolve(c); });
    });
    assert.equal(code, 0, 'second instance quits');
    assert.equal(app.windows().length, 1);
});

test('closing the window ends the app', async () => {
    // a theme name from before 1.0.9, checked after the restart below
    await win.evaluate(() => localStorage.setItem('ed_nav_theme-selector', 'imperial'));
    const exited = new Promise(resolve => app.process().once('exit', resolve));
    await win.close();
    await Promise.race([exited, sleep(10000).then(() => { throw new Error('app still running'); })]);
    app = null;
});

test('with "Show intro" off, the next start goes straight to the app', async () => {
    app = await _electron.launch({ executablePath: ELECTRON, args: ARGS, env });
    win = await app.firstWindow();
    await win.waitForSelector('#journal-status.active', { timeout: 15000 });
    assert.equal(await win.isChecked('#intro-enabled'), false);
    assert.equal(await win.$('#intro'), null);
    assert.equal(await win.isVisible('#update-notice'), false, 'the update notice shows only once');
    assert.equal(await win.isChecked('#update-auto'), true);
    assert.equal(await win.inputValue('#theme-selector'), 'default', 'the old "imperial" is the default now');
    assert.equal(await win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ed-orange').trim()), '#00d0ff');
});
