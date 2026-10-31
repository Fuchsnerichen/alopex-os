'use strict';

// ==========================================
// OUTFITTING
// ==========================================
// Module list from outfitting-data.js (EDCD FDevIDs). Spansh uses the same names, classes and ratings.
const MODULES = OUTFITTING_MODULES.map(([symbol, category, name, cls, rating, mount, guidance, ship]) => ({
    symbol: symbol.toLowerCase(), category, name, cls, rating, mount, guidance, ship,
    armour: /_armour_/i.test(symbol),
    ships: SHIP_MODULES[symbol.toLowerCase()] || null,      // made for these ships only (ship-slots.js), e.g. the Type-11's mining tools
    size: (/_size(\d)/i.exec(symbol) || [])[1] || cls     // the source lists the size 6 Mk II cabins as class 5
}));
const MODULE_BY_SYMBOL = new Map(MODULES.map(m => [m.symbol, m]));
// Part categories, slot groups in the order of the outfitting screen in the game. The first category whose
// test matches a module wins; a module none of them knows (new in the data) goes to "Other" of its slot group.
const SLOT_GROUPS = [
    ['Hardpoints', m => m.category === 'hardpoint', [
        ['Anti-Xeno & Guardian', /^(Enhanced )?AX |Enzyme|Guardian|Remote Release/],
        ['Mining tools', /Mining|Abrasion|Seismic|Sub-Surface/],
        ['Lasers', /Laser/],
        ['Missiles, torpedoes & mines', /Missile|Torpedo|Mine Launcher|FSD Disruptor/],
        ['Cannons & kinetic', /Cannon|Rail Gun|Plasma/]
    ]],
    ['Utility mounts', m => m.category === 'utility', [
        ['Defence', /Shield Booster|Point Defence|Chaff|Heat Sink|Countermeasure/],
        ['Scanners', /Cargo Scanner|Warrant|Wake|Pulse Wave Analyser/],
        ['Anti-Xeno', /Xeno|Shutdown Field/]
    ]],
    // FDevIDs lists the Guardian hybrid power plant and distributor as optional internals, but they go into core slots
    ['Core internal', m => m.category === 'standard' || /^Guardian Hybrid Power/.test(m.name), [
        ['Bulkheads', m => m.armour],
        ['Power & drives', /Power Plant|Thrusters|Frame Shift Drive|Power Distributor/],
        ['Life support, sensors & fuel', /Life Support|Sensors|Fuel Tank/]
    ]],
    ['Optional internal', m => m.category === 'internal', [
        ['Shields & hull', /Shield Generator|Shield Cell Bank|Reinforcement/],
        ['Mining & refining', /Refinery|Collector|Prospector|Mining/],
        ['Limpets', /Limpet/],
        ['Cargo & passengers', /Cargo Rack|Passenger Cabin/],
        ['Exploration & travel', /Fuel Scoop|FSD Booster|Surface Scanner|Field-Maintenance/],
        ['Docking & flight', /Docking Computer|Supercruise Assist|Approach Suite/],
        ['Hangars', /Hangar/],
        ['Combat', /Interdictor|Weapon Stabiliser/]
    ]]
];
// In display order, "Other" last in each slot group: { key: "Hardpoints/Lasers", slot, name, label }
const PART_CATEGORIES = SLOT_GROUPS.flatMap(([slot, inSlot, categories]) => [...categories, ['Other', () => true]].map(([name, rule]) => ({
    key: `${slot}/${name}`, slot, name, label: `${slot} · ${name}`,
    test: m => inSlot(m) && (rule instanceof RegExp ? rule.test(m.name) : rule(m))
})));
PART_CATEGORIES.forEach((c, i) => { c.order = i; });
for (const m of MODULES) m.cat = PART_CATEGORIES.find(c => c.test(m)) || PART_CATEGORIES[PART_CATEGORIES.length - 1];
const categoryRank = m => m.cat.order;
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

// a star behind ships with special slots or parts of their own
const specialMark = type => (hasSpecials(type) ? ' ★' : '');

function refreshOutfitShips() {
    const select = $('outfit-ship');
    const previous = select.value;
    const ships = Object.values(fleet).filter(ship => ship.type);
    let html = '';
    if (ships.length) {
        html += '<optgroup label="Your fleet (journal)">' + ships.map(ship => {
            const prefix = String(ship.id) === String(activeShipId) ? '[ACTIVE] ' : '';
            return `<option value="fleet:${esc(ship.id)}">${esc(prefix + shipTitle(ship) + specialMark(String(ship.type).toLowerCase()))}</option>`;
        }).join('') + '</optgroup>';
    }
    html += '<optgroup label="All ships">' + Object.entries(SHIPS).sort((a, b) => a[1][0].localeCompare(b[1][0]))
        .map(([type, [label]]) => `<option value="type:${esc(type)}">${esc(label + specialMark(type))}</option>`).join('') + '</optgroup>';
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
    'Heat Sink Launcher': 'heatsink', 'Point Defence': 'pd', 'Mining Volley Repeater': 'laser mk ii mvr'
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

// A slot takes the module when it is large enough and, for a slot that takes only some modules
// ([size, restriction], e.g. the mining hardpoints of the Type-11), the module is on its list.
const slotTakes = (slot, m, size) => (Array.isArray(slot) ? size <= slot[0] && SLOT_RESTRICTIONS[slot[1]].includes(m.name) : size <= slot);

// Does the module fit any slot of the ship? Without slot data for the ship everything counts.
function fitsShip(m, slots) {
    if (!slots || m.armour) return true;
    const size = Number(m.size);
    if (m.category === 'hardpoint') return slots.hardpoints.some(h => slotTakes(h, m, size));   // a small weapon also fits a larger hardpoint
    if (m.category === 'utility') return slots.utility > 0;
    const core = CORE_SLOT[m.name];
    if (core !== undefined) {
        if (size <= slots.core[core]) return true;                                    // smaller core parts fit too
        if (m.name !== 'Fuel Tank') return false;                                     // only fuel tanks also go into optional slots
    } else if (m.category === 'standard') {
        return true;
    }
    return slots.internal.some(s => slotTakes(s, m, size));
}

// Can a ship of this type fit the module: its own armour only, parts made for other ships not, and a slot that takes it.
const fitsType = (m, type) => (!m.armour || isArmourFor(m, type)) && (!m.ships || m.ships.includes(type)) && fitsShip(m, shipSlots(type));

// Slots that take only some modules: the restriction in ship-slots.js without its number, and how the app names
// one and several. Every ship has a planetary approach suite slot, so that one is not special.
const SPECIAL_SLOTS = {
    mining: ['mining hardpoint', 'mining hardpoints'],
    military: ['military slot', 'military slots'],
    cargo: ['cargo slot', 'cargo slots'],
    limpets: ['limpet controller slot', 'limpet controller slots'],
    fighter: ['hangar slot', 'hangar slots']
};
const SPECIAL = 'special';    // the ★ Special categories: key "special" for all, "special/<kind>" for one kind
const OWN_PARTS = 'own';      // the kind for parts made for this ship only
const SHIPS_WITH_OWN_PARTS = new Set(Object.values(SHIP_MODULES).flat());
const slotKind = restriction => restriction.replace(/\d+$/, '');
const specialSlotName = (kind, count) => (SPECIAL_SLOTS[kind] || [`${kind} slot`, `${kind} slots`])[count === 1 ? 0 : 1];
const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

// The ship's special slots by kind, in the order of SPECIAL_SLOTS: [{ kind, slots: [{ size, restriction, hardpoint }] }]
function specialSlots(type) {
    const slots = shipSlots(type);
    if (!slots) return [];
    const restricted = [...slots.hardpoints.map(s => [s, true]), ...slots.internal.map(s => [s, false])]
        .filter(([s]) => Array.isArray(s) && slotKind(s[1]) !== 'approach')
        .map(([[size, restriction], hardpoint]) => ({ size, restriction, hardpoint, kind: slotKind(restriction) }));
    const order = kind => (kind in SPECIAL_SLOTS ? Object.keys(SPECIAL_SLOTS).indexOf(kind) : 99);
    return [...new Set(restricted.map(s => s.kind))].sort((a, b) => order(a) - order(b))
        .map(kind => ({ kind, slots: restricted.filter(s => s.kind === kind) }));
}
const hasSpecials = type => SHIPS_WITH_OWN_PARTS.has(type) || specialSlots(type).length > 0;

// "4 mining hardpoints (sizes 3, 2, 1), 1 limpet controller slot (size 5)"
const specialSlotsText = type => specialSlots(type).map(({ kind, slots }) => {
    const sizes = [...new Set(slots.map(s => s.size))].sort((a, b) => b - a);
    return `${slots.length} ${specialSlotName(kind, slots.length)} (size${sizes.length > 1 ? 's' : ''} ${sizes.join(', ')})`;
}).join(', ');

// Does a special slot take the module? Hardpoint slots take hardpoints, optional slots internal modules (and fuel tanks).
const specialTakes = (slot, m, size) => slot.hardpoint === (m.category === 'hardpoint') && m.category !== 'utility'
    && slotTakes([slot.size, slot.restriction], m, size);

// Part types that fit the chosen ship: { name, cat, home (its own category), special (kinds: OWN_PARTS and the
// special slots it fits), specialSizes (sizes per kind), sizes, modules }
function partTypes() {
    const { type } = outfitShip();
    const special = specialSlots(type);
    const types = new Map();
    for (const m of MODULES) {
        if (!fitsType(m, type)) continue;
        if (!types.has(m.name)) types.set(m.name, { name: m.name, cat: m.cat, home: m.cat, special: [], specialSizes: {}, sizes: [], modules: [] });
        const part = types.get(m.name);
        const size = Number(m.size);
        part.sizes.push(size);
        part.modules.push(m);
        const kinds = special.filter(k => !m.armour && k.slots.some(slot => specialTakes(slot, m, size))).map(k => k.kind);
        for (const kind of m.ships ? [OWN_PARTS, ...kinds] : kinds) {
            if (!part.special.includes(kind)) part.special.push(kind);
            (part.specialSizes[kind] = part.specialSizes[kind] || []).push(size);
        }
    }
    return [...types.values()];
}

// The ★ Special categories of the ship, ahead of all others: its own parts first, then one per kind of special slot.
function specialCategories(type) {
    const kinds = specialSlots(type).map(({ kind, slots }) => [kind, capitalize(specialSlotName(kind, slots.length))]);
    if (SHIPS_WITH_OWN_PARTS.has(type)) kinds.unshift([OWN_PARTS, `Only for the ${shipLabel(type)}`]);
    return Object.fromEntries(kinds.map(([kind, name], i) => [kind, { key: `${SPECIAL}/${kind}`, slot: SPECIAL, name, label: `★ Special · ${name}`, order: i - 100 }]));
}

// Every part in its own category, and once more in each ★ Special category it belongs to.
function partEntries() {
    const special = specialCategories(outfitShip().type);
    return partTypes().flatMap(part => [part, ...part.special.map(kind => ({ ...part, cat: special[kind], sizes: part.specialSizes[kind] }))]);
}

// "only this ship, mining hardpoint"; starred on a special part shown in its own category
const specialReasons = part => part.special.map(kind => (kind === OWN_PARTS ? 'only this ship' : specialSlotName(kind, 1))).join(', ');
const specialNote = part => (part.cat === part.home && part.special.length ? `★ ${specialReasons(part)}` : '');

// Does the entry belong to the category chosen above the search ("" = all, SPECIAL, a slot group, or "group/category")?
const inCategory = (entry, key) => !key || entry.cat.key === key || entry.cat.slot === key;

// Every word has to match the name, a search word, the category or a special slot; "6a" or "6" picks the size (and
// rating) as well. Hits come grouped by category, the ★ Special ones always first; then while browsing in the order
// of the game, while searching the category with the best match first ("frame shift": the drive before the wake
// scanner). Parts found only through the category name ("mining", "lasers", "military") come last in their category.
function searchParts(query, category = '') {
    const words = query.toLowerCase().replace(/\bmk\s*(ii|2)\b/g, 'mk ii').split(/\s+/).filter(Boolean);   // "mk2", "mkii" = "Mk II"
    const variant = words.find(w => /^[0-8][a-i]?$/.test(w)) || null;
    const terms = words.filter(w => w !== variant);
    const hits = [];
    for (const part of partEntries()) {
        if (!inCategory(part, category)) continue;
        const aliases = PART_ALIASES[part.name] || '';
        const own = `${part.name} ${aliases}`.toLowerCase();
        const text = `${own} ${part.home.label} ${part.cat.label} ${specialReasons(part)}`.toLowerCase();
        if (!terms.every(t => text.includes(t))) continue;
        if (variant && !part.modules.some(m => `${m.size}${m.rating}`.toLowerCase().startsWith(variant))) continue;
        const name = part.name.toLowerCase(), first = terms[0] || '';
        const rank = !first ? 2 : !terms.every(t => own.includes(t)) ? 3
            : name.startsWith(first) || aliases.split(' ').includes(first) ? 0 : ` ${name}`.includes(` ${first}`) ? 1 : 2;
        hits.push({ part, rank });
    }
    const groupAt = new Map();
    if (terms.length) {
        [...hits].sort((a, b) => a.rank - b.rank || a.part.name.length - b.part.name.length || a.part.cat.order - b.part.cat.order)
            .forEach(({ part }, i) => { if (!groupAt.has(part.cat)) groupAt.set(part.cat, i); });
    } else {
        hits.forEach(({ part }) => groupAt.set(part.cat, part.cat.order));
    }
    const slotOrder = name => (name in CORE_SLOT ? CORE_SLOT[name] : 9);   // core parts in the order of their slots
    const normal = part => (part.cat.slot === SPECIAL ? 0 : 1);
    hits.sort((a, b) => normal(a.part) - normal(b.part) || groupAt.get(a.part.cat) - groupAt.get(b.part.cat)
        || a.rank - b.rank || slotOrder(a.part.name) - slotOrder(b.part.name) || a.part.name.localeCompare(b.part.name));
    return { variant, parts: hits.map(h => h.part) };
}

function categoryName(key) {
    if (key === SPECIAL) return 'Special';
    const all = [...PART_CATEGORIES, ...Object.values(specialCategories(outfitShip().type))];
    return (all.find(c => c.key === key) || { label: key }).label;
}
const SLOT_ALL = { 'Hardpoints': 'All hardpoints', 'Utility mounts': 'All utility mounts', 'Core internal': 'All core internals', 'Optional internal': 'All optional internals' };

// The category list next to the search: how many part types of each fit the chosen ship; empty categories are left
// out. The ship's ★ Special categories come first.
function refreshOutfitCategories() {
    const select = $('outfit-category');
    const previous = select.value;
    const entries = partEntries();
    const option = (key, label) => {
        const n = new Set(entries.filter(e => inCategory(e, key)).map(e => e.name)).size;
        return n || key === previous ? `<option value="${esc(key)}">${esc(label)} (${n})</option>` : '';
    };
    const group = (label, options) => (options ? `<optgroup label="${esc(label)}">${options}</optgroup>` : '');
    const special = Object.values(specialCategories(outfitShip().type)).map(c => option(c.key, `★ ${c.name}`)).join('');
    select.innerHTML = option('', 'All parts')
        + group('★ Special', special && option(SPECIAL, '★ All special parts') + special)
        + SLOT_GROUPS.map(([slot]) => {
            const options = PART_CATEGORIES.filter(c => c.slot === slot).map(c => option(c.key, c.name)).join('');
            return group(slot, options && option(slot, SLOT_ALL[slot]) + options);
        }).join('');
    select.value = previous;
    if (select.value !== previous) select.value = '';
}

function sizeRange(part) {
    const min = Math.min(...part.sizes), max = Math.max(...part.sizes);
    if (part.modules[0].armour) return part.modules[0].ship;
    return min === max ? `size ${min}` : `sizes ${min}–${max}`;
}

function renderSuggestions() {
    const input = $('outfit-search'), list = $('outfit-suggest');
    const category = $('outfit-category').value;
    // the field shows the part chosen before: list the whole category instead of that one part
    const { variant, parts } = searchParts(input.value === outfitModule ? '' : input.value, category);
    suggestHits = parts;
    suggestVariant = variant;
    if (suggestIndex >= suggestHits.length) suggestIndex = suggestHits.length - 1;
    const empty = `No matching part${category ? ` in ${categoryName(category)}` : ''} fits this ship`;
    // a heading above the first part of each category; special parts are starred in their own category
    list.innerHTML = suggestHits.length
        ? suggestHits.map((p, i) => (i && suggestHits[i - 1].cat === p.cat ? '' : `<li class="combo-group" role="presentation">${esc(p.cat.label)}</li>`)
            + `<li role="option" id="outfit-option-${i}" data-part="${esc(p.name)}" aria-selected="${i === suggestIndex}" aria-description="${esc(p.cat.label)}">`
            + `<span>${esc(p.name)}</span><span class="combo-meta">${specialNote(p) ? `<span class="part-special">${esc(specialNote(p))}</span> · ` : ''}${esc(sizeRange(p))}</span></li>`).join('')
        : `<li class="combo-empty">${esc(empty)}</li>`;
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
    const special = specialSlotsText(type);
    const ownParts = partTypes().filter(p => p.special.includes(OWN_PARTS)).map(p => p.name);
    const notes = (special ? ` · ★ Special slots: ${special}` : '') + (ownParts.length ? ` · ★ Only for this ship: ${ownParts.join(', ')}` : '');
    $('outfit-ship-info').textContent = `Landing pad ${PAD_LABEL[shipPad(type)] || '?'}${known}${slots}${notes}`;
    refreshOutfitCategories();
    refreshOutfitVariants();
    renderOutfitParts();
}

function refreshOutfitVariants(wanted) {
    const name = outfitModule;
    const { type, ship } = outfitShip();
    const ofType = MODULES.filter(m => m.name === name && (!m.armour || isArmourFor(m, type)));
    const variants = ofType.filter(m => fitsType(m, type))
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

// Everything on the list as modules, the package resolved for the chosen ship, each module once, by category.
function outfitPartModules() {
    const modules = [];
    for (const entry of outfitParts) {
        const list = entry === CORE_PACKAGE ? corePackage() || [] : [MODULE_BY_SYMBOL.get(entry)];
        for (const m of list) if (m && !modules.includes(m)) modules.push(m);
    }
    return modules.sort((a, b) => categoryRank(a) - categoryRank(b));
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

// The list grouped by slot type, in the order of the game; the package counts as core internal.
function renderOutfitParts() {
    const { type } = outfitShip();
    const chip = symbol => {
        if (symbol === CORE_PACKAGE) {
            const parts = corePackage();
            const label = esc(`Core package A: ${parts ? parts.map(shortPartLabel).join(' · ') : 'slot sizes of this ship unknown'}`);
            const warning = parts ? '' : `<span class="part-warn" title="Slot sizes of the ${esc(shipLabel(type))} are unknown">⚠</span>`;
            return `<span class="part-chip part-package${parts ? '' : ' no-fit'}">${warning}${label}<button type="button" data-remove-part="${CORE_PACKAGE}" aria-label="Remove the core package">×</button></span>`;
        }
        const m = MODULE_BY_SYMBOL.get(symbol);
        const label = esc(partLabel(m));
        const fits = fitsType(m, type);
        const warning = fits ? '' : `<span class="part-warn" title="Does not fit the ${esc(shipLabel(type))}">⚠</span>`;
        return `<span class="part-chip${fits ? '' : ' no-fit'}">${warning}${label}<button type="button" data-remove-part="${esc(symbol)}" aria-label="Remove ${label}">×</button></span>`;
    };
    const packageRank = PART_CATEGORIES.findIndex(c => c.key === 'Core internal/Power & drives');
    const rank = entry => (entry === CORE_PACKAGE ? packageRank : categoryRank(MODULE_BY_SYMBOL.get(entry)));
    const groups = new Map();
    for (const entry of [...outfitParts].sort((a, b) => rank(a) - rank(b))) {
        const slot = PART_CATEGORIES[rank(entry)].slot;
        if (!groups.has(slot)) groups.set(slot, []);
        groups.get(slot).push(entry);
    }
    $('outfit-parts').innerHTML = outfitParts.length
        ? [...groups].map(([slot, entries]) => `<div class="part-group"><span class="part-group-label">${esc(slot)}</span>${entries.map(chip).join('')}</div>`).join('')
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


// Ship, category list, search field and suggestions
$('outfit-ship').addEventListener('change', () => { outfitShipChosen = true; refreshOutfitModules(); });
// a category opens the list of its parts
$('outfit-category').addEventListener('change', () => {
    suggestIndex = -1;
    if (document.activeElement === $('outfit-search')) renderSuggestions();
    else $('outfit-search').focus();
});
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
        if (suggestIndex < 0 && $('outfit-search').value === outfitModule) return closeSuggestions();   // keep the chosen part
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
