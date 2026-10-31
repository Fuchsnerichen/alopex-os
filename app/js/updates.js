'use strict';

// ==========================================
// UPDATES (app core: lib/updates.mjs)
// ==========================================
let updateState = null;

function renderUpdates(state) {
    const previous = updateState;
    updateState = state;
    const v = state.latest ? `v${state.latest}` : '';
    // [status line, button in the settings, button in the header]
    const views = {
        disabled: ['Updates only in the installed app', null, null],
        idle: [`v${state.current}`, 'Check now', null],
        checking: ['Checking for updates…', null, null],
        none: [`Up to date (v${state.current})`, 'Check now', null],
        available: [`${v} is available`, state.portable ? 'Download' : 'Update now', state.portable ? `⬆ Download ${v}` : `⬆ Update to ${v}`],
        downloading: [`Downloading ${v} … ${state.progress} %`, null, `⬇ ${state.progress} %`],
        ready: [state.auto ? `${v} installs when you close ALOPEX` : `${v} is ready`, 'Restart & install', '⟳ Restart to update'],
        installing: [`Installing ${v}…`, null, null],
        error: [`Update check failed: ${state.error}`, 'Try again', null]
    };
    const [text, action, header] = views[state.status] || views.idle;
    $('update-status').textContent = text;
    $('update-action').hidden = !action;
    if (action) $('update-action').textContent = action;
    $('btn-update').hidden = !header;
    if (header) $('btn-update').textContent = header;
    $('btn-update').disabled = state.status === 'downloading';
    $('update-auto').checked = state.auto;
    $('update-auto').disabled = state.status === 'disabled' || state.portable;
    if (state.status === 'available' && (!previous || previous.status !== 'available') && !state.auto) {
        showToast(`ALOPEX OS ${v} is available`);
    }
}

function updateAction() {
    const status = updateState && updateState.status;
    if (status === 'available') return alopex.updates.download();
    if (status === 'ready') return alopex.updates.install();
    return alopex.updates.check();
}

// After an update: version and release notes, until closed.
function showUpdatedNotice({ to, notes }) {
    $('update-notice-title').textContent = `✓ ALOPEX OS was updated to v${to}`;
    $('update-notice-notes').textContent = notes || '';
    $('update-notice-details').hidden = !notes;
    $('update-notice').hidden = false;
}

async function initUpdates() {
    alopex.updates.onChange(renderUpdates);
    $('update-auto').addEventListener('change', e => alopex.updates.setAuto(e.target.checked));
    try {
        const state = await unwrap(alopex.updates.state());
        renderUpdates(state);
        if (state.justUpdated) showUpdatedNotice(state.justUpdated);
    } catch (e) {
        $('update-status').textContent = 'Update check not available';
    }
}
