'use strict';

// ==========================================
// UI HELPERS
// ==========================================
function showToast(message, isWarning = false) {
    if (!isWarning && $('intro')) return;   // the intro already shows the start-up status
    const toast = document.createElement('div');
    toast.className = 'toast' + (isWarning ? ' toast-warning' : '');
    const icon = document.createElement('span');
    icon.textContent = '◈';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);
    $('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function copyToClipboard(text) {
    playTone('click');
    alopex.copy(text);
    showToast(`"${text}" copied!`);
}

function openTab(tabId, buttonElement) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => { btn.classList.remove('active'); btn.setAttribute('aria-selected', 'false'); });
    $(tabId).classList.add('active');
    buttonElement.classList.add('active');
    buttonElement.setAttribute('aria-selected', 'true');
}

function toggleAccordion(header) {
    playTone('click');
    const item = header.closest('.accordion-item');
    const open = item.classList.toggle('open');
    header.setAttribute('aria-expanded', String(open));
}

const warningBox = html => `<div class="warning-box">${html}</div>`;
const infoBox = html => `<div class="info-box">${html}</div>`;
const errorBox = message => warningBox(`<strong>⚠️ Query failed:</strong> ${esc(message)}`);
const copyButton = (text, label, cls = '') => `<button class="${cls}" data-copy="${esc(text)}">${esc(label)}</button>`;

function accordionItem(idx, { title, meta, stat, statLabel, body }) {
    return `
    <div class="accordion-item stagger-item" style="animation-delay: ${(idx * 0.12).toFixed(2)}s">
        <div class="accordion-header" role="button" tabindex="0" aria-expanded="false">
            <div class="header-main"><span class="chevron" aria-hidden="true">▼</span><div class="title-block">
                <div class="accordion-title">${title}</div>
                <div class="accordion-meta">${meta}</div>
            </div></div>
            <div class="header-stat"><div class="stat-value">${stat}</div><div class="stat-label">${statLabel}</div></div>
        </div>
        <div class="accordion-body-wrapper"><div class="accordion-body-inner"><div class="accordion-content">${body}</div></div></div>
    </div>`;
}

function stationKind(row) {
    const label = STATION_TYPES[row.stationType];
    if (!label) return '<span class="station-kind">❔ Type unknown</span>';
    if (!PLANETARY_TYPES.has(row.stationType)) return `<span class="station-kind">🛰️ Orbital · ${label}</span>`;
    const body = row.bodyName && row.bodyName !== row.stationName ? ` · on ${esc(row.bodyName)}` : '';
    return `<span class="station-kind planetary">🪐 Planetary · ${label}${body}</span>`;
}

function stationLine(row) {
    const parts = [esc(row.systemName), `Pad ${PAD_LABEL[row.maxLandingPadSize] || '?'}`];
    if (row.distanceToArrival) parts.push(`${fmtInt(row.distanceToArrival)} Ls`);
    return `${esc(row.stationName)} <span class="muted">(${parts.join(' · ')})</span> ${stationKind(row)}`;
}

// Shared wrapper: loading bar, disabled button, error display.
async function runSearch(tab, button, task) {
    if (button.disabled) return;
    const results = $(`${tab}-results`);
    const loading = $(`${tab}-loading`);
    const label = loading.querySelector('.loading-text');
    label.dataset.default = label.dataset.default || label.textContent;
    label.textContent = label.dataset.default;
    button.disabled = true;
    results.innerHTML = '';
    loading.style.display = 'block';
    try {
        results.innerHTML = await task(msg => { label.textContent = msg; });
        playTone('success');
    } catch (e) {
        results.innerHTML = errorBox(e.message);
        playTone('alert');
    } finally {
        loading.style.display = 'none';
        button.disabled = false;
    }
}
