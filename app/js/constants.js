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
