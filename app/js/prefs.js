'use strict';

// ==========================================
// PREFS & THEME
// ==========================================
const inputsToSave = ['theme-selector', 'current-system', 'jump-range', 'pad-size', 'include-carriers', 'include-planetary', 'cargo-space', 'max-trade-dist', 'price-age', 'passenger-space', 'passenger-type', 'mine-resource', 'mine-radius', 'reserve-pristine', 'reserve-major', 'reserve-common', 'reserve-low', 'reserve-depleted', 'current-cargo', 'sell-radius', 'exo-target', 'exo-radius', 'outfit-radius', 'outfit-buy-ship',
    'svc-material-trader', 'svc-tech-broker', 'svc-interstellar-factors', 'svc-cartographics', 'svc-vista-genomics',
    'svc-black-market', 'svc-search-rescue', 'svc-radius', 'intro-enabled'];

function savePrefs() {
    try {
        inputsToSave.forEach(id => {
            const el = $(id);
            localStorage.setItem('ed_nav_' + id, el.type === 'checkbox' ? String(el.checked) : el.value);
        });
    } catch (e) {}
}

function loadPrefs() {
    try {
        inputsToSave.forEach(id => {
            const val = localStorage.getItem('ed_nav_' + id);
            if (val === null) return;
            const el = $(id);
            if (el.type === 'checkbox') el.checked = val === 'true';
            else if (el.tagName !== 'SELECT' || [...el.options].some(o => o.value === val)) el.value = val;
        });
    } catch (e) {}
    changeTheme(false);
}

inputsToSave.forEach(id => {
    $(id).addEventListener('change', savePrefs);
    $(id).addEventListener('input', savePrefs);
});

function changeTheme(playSnd = true) {
    const theme = $('theme-selector').value;
    if (theme === 'default') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    if (playSnd) playTone('success');
    savePrefs();
}
