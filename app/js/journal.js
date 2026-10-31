'use strict';

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
                    // slot -> module, for ships the game data has no slot sizes for (see journalSlots)
                    slots: Object.fromEntries((ev.Modules || []).filter(m => m.Slot && m.Item)
                        .map(m => [String(m.Slot).toLowerCase(), String(m.Item).toLowerCase()])),
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
