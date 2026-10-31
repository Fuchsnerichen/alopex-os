// Builds app/ship-slots.js (slot sizes per ship for the Outfitting tab) from EDCD coriolis-data,
// keyed by the journal ship id, with module names as in EDCD FDevIDs (app/outfitting-data.js).
// Also lists the modules only one ship can fit (coriolis "ship" field, e.g. the Type-11's mining tools).
//   node scripts/build-ship-slots.mjs <path/to/coriolis-data> <path/to/FDevIDs> [source note]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [coriolisDir, fdevDir, source = 'EDCD coriolis-data'] = process.argv.slice(2);
if (!coriolisDir || !fdevDir) {
    console.error('Usage: node scripts/build-ship-slots.mjs <path/to/coriolis-data> <path/to/FDevIDs> [source note]');
    process.exit(1);
}

const csv = file => {
    const [header, ...lines] = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    const cols = header.split(',');
    return lines.map(line => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
};
const nameKey = name => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');   // "Cobra Mk III" = "Cobra MkIII"
const jsonFiles = dir => readdirSync(dir).flatMap(f => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? jsonFiles(p) : f.endsWith('.json') ? [p] : [];
});

// FDevIDs: ship ids and module names
const shipyard = csv(path.join(fdevDir, 'shipyard.csv'));
const shipById = new Map(shipyard.map(s => [s.id, s.symbol.toLowerCase()]));
const shipByName = new Map(shipyard.map(s => [nameKey(s.name), s.symbol.toLowerCase()]));
const moduleName = new Map(csv(path.join(fdevDir, 'outfitting.csv')).map(m => [m.symbol.toLowerCase(), m.name]));

// coriolis-data: module groups ("hr", "scb", ...) -> module names. Newer variants that coriolis-data
// does not list yet share the symbol start (int_fighterbay... -> int_fighterbaymk2...).
const groupSymbols = new Map();
for (const file of jsonFiles(path.join(coriolisDir, 'modules'))) {
    const walk = x => {
        if (Array.isArray(x)) return x.forEach(walk);
        if (!x || typeof x !== 'object') return;
        if (x.grp && x.symbol) {
            if (!groupSymbols.has(x.grp)) groupSymbols.set(x.grp, new Set());
            groupSymbols.get(x.grp).add(x.symbol.toLowerCase());
        }
        Object.values(x).forEach(walk);
    };
    walk(JSON.parse(readFileSync(file, 'utf8')));
}
function groupNames(group) {
    const symbols = groupSymbols.get(group);
    if (!symbols) throw new Error(`unknown module group ${group}`);
    const prefixes = [...symbols].map(s => s.replace(/_size\d.*$/, ''));
    const names = new Set();
    for (const [symbol, name] of moduleName) if (symbols.has(symbol) || prefixes.some(p => symbol.startsWith(p))) names.add(name);
    return [...names];
}

// restricted slots, named after the coriolis slot name ("Military", "Cargo", "Mining", ...)
const restrictions = {};
const restrictionKey = slot => {
    const groups = Object.keys(slot.eligible || {}).sort();
    const names = [...new Set(groups.flatMap(groupNames))].sort();
    const base = slot.name.replace(/PlanetaryApproachSuite/, 'Approach').toLowerCase();
    let key = base, n = 2;
    while (restrictions[key] && restrictions[key].join() !== names.join()) key = `${base}${n++}`;
    restrictions[key] = names;
    return key;
};

// a slot: its size, or [size, restriction] when it takes only some modules
const slotEntry = s => (typeof s !== 'object' ? s : s.eligible ? [s.class, restrictionKey(s)] : s.class);
const slotSize = s => (Array.isArray(s) ? s[0] : s);

const ships = {};
const journalId = {};   // coriolis ship key -> journal ship id
for (const file of jsonFiles(path.join(coriolisDir, 'ships'))) {
    for (const [key, ship] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) {
        const id = shipByName.get(nameKey(ship.properties.name)) || shipById.get(String(ship.edID));
        if (!id) { console.warn(`no journal id for ${ship.properties.name}`); continue; }
        journalId[key] = id;
        const { standard, hardpoints, internal } = ship.slots;
        const mounts = hardpoints.map(slotEntry);
        ships[id] = {
            core: standard.map(slotSize),
            hardpoints: mounts.filter(h => slotSize(h) > 0).sort((a, b) => slotSize(b) - slotSize(a)),
            utility: mounts.filter(h => slotSize(h) === 0).length,
            internal: internal.map(slotEntry)
        };
    }
}

// modules for one ship only (symbol as in FDevIDs, lower case) -> journal ship ids
const shipModules = {};
for (const file of jsonFiles(path.join(coriolisDir, 'modules'))) {
    const walk = x => {
        if (Array.isArray(x)) return x.forEach(walk);
        if (!x || typeof x !== 'object') return;
        if (x.symbol && x.ship) {
            const symbol = x.symbol.toLowerCase();
            if (!moduleName.has(symbol)) console.warn(`${x.symbol} (only for ${x.ship}) is not in FDevIDs`);
            else if (!journalId[x.ship]) console.warn(`${x.symbol}: unknown ship ${x.ship}`);
            else shipModules[symbol] = [...new Set([...(shipModules[symbol] || []), journalId[x.ship]])];
        }
        Object.values(x).forEach(walk);
    };
    walk(JSON.parse(readFileSync(file, 'utf8')));
}

const sorted = Object.fromEntries(Object.keys(ships).sort().map(k => [k, ships[k]]));
const target = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'app', 'ship-slots.js');
writeFileSync(target, `// Generated by scripts/build-ship-slots.mjs from ${source}. Do not edit by hand.
// Slot sizes per ship (journal ship id). core: [power plant, thrusters, frame shift drive, life support,
// power distributor, sensors, fuel tank]; hardpoints: sizes 1–4; utility: number of utility mounts;
// internal: optional slots. A hardpoint or optional slot that takes only some modules is [size, restriction].
const SHIP_SLOTS = {
${Object.entries(sorted).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}
};
// The modules a restricted slot takes.
const SLOT_RESTRICTIONS = {
${Object.entries(restrictions).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}
};
// Modules only these ships can fit (FDevIDs symbol in lower case -> journal ship ids).
const SHIP_MODULES = {
${Object.entries(shipModules).sort().map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}
};
`);
console.log(`${Object.keys(sorted).length} ships, restrictions: ${Object.keys(restrictions).join(', ')}, `
    + `${Object.keys(shipModules).length} modules for one ship only -> ${target}`);
