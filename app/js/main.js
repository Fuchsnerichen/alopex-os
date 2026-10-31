'use strict';

// ==========================================
// EVENTS
// ==========================================
// Buttons declare their action with data-action / data-tab (no inline handlers, so a strict CSP is possible).
const ACTIONS = {
    toggleAudio: () => toggleAudio(),
    connectJournal: () => chooseJournalFolder(),
    rescanJournal: btn => manualSync(btn),
    openShipManager: () => openShipManager(),
    closeShipManager: () => closeShipManager(),
    searchTrade: btn => searchTradeRoutes(btn),
    searchPassenger: btn => searchPassengerRoutes(btn),
    searchMining: btn => searchMiningHotspots(btn),
    searchExo: btn => searchExoRoutes(btn),
    addOutfitPart: () => addOutfitPart(),
    addCorePackage: () => addCorePackage(),
    updateAction: () => updateAction(),
    closeUpdateNotice: () => { $('update-notice').hidden = true; },
    searchOutfit: btn => searchOutfitting(btn)
};

document.addEventListener('click', e => {
    const action = e.target.closest('[data-action]');
    if (action) return ACTIONS[action.dataset.action](action);
    const tab = e.target.closest('[data-tab]');
    if (tab) return openTab(tab.dataset.tab, tab);
    if (e.target.id === 'ship-manager-modal') return closeShipManager();
    const copy = e.target.closest('[data-copy]');
    if (copy) return copyToClipboard(copy.dataset.copy);
    const sell = e.target.closest('[data-sell-system]');
    if (sell) return findSellStation(sell);
    const apply = e.target.closest('[data-apply-ship]');
    if (apply) return loadLiveShip(apply.dataset.applyShip);
    const removePart = e.target.closest('[data-remove-part]');
    if (removePart) return removeOutfitPart(removePart.dataset.removePart);
    const header = e.target.closest('.accordion-header');
    if (header) toggleAccordion(header);
});

document.addEventListener('mousedown', e => {
    if (e.target.closest('[data-sound]')) playTone('click');
});
$('theme-selector').addEventListener('change', () => changeTheme());
$('ship-preset').addEventListener('change', () => { applyPreset(); playTone('success'); });

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('ship-manager-modal').classList.contains('show')) closeShipManager();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('accordion-header')) {
        e.preventDefault();
        toggleAccordion(e.target);
    }
});

// ==========================================
// INIT
// ==========================================
$('exo-target').innerHTML = EXO_SPECIES
    .map(([g, s, v]) => `<option value="${g}|${s}">${g} ${s} — ${(v / 1e6).toFixed(1)}M CR</option>`).join('');
$('exo-target').value = 'Stratum|Tectonicas';
$('mine-resource').innerHTML = Object.keys(MINING_RESOURCES).map(r => `<option value="${r}">${r}</option>`).join('');
refreshOutfitShips();
readOutfitParts();

window.addEventListener('DOMContentLoaded', () => {
    loadPrefs();
    loadAudioPref();
    playIntro(startJournal());
    initUpdates();
});
