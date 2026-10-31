'use strict';

// ==========================================
// 5. STATION SERVICES (Spansh station search)
// ==========================================
// The names Spansh uses for a station's services (source: EDDiscovery's Spansh interface, as for the
// station types). The station search takes the same names as a filter and gives them back per station.
const SERVICES = [
    ['svc-material-trader', 'Material Trader'],
    ['svc-tech-broker', 'Technology Broker'],
    ['svc-interstellar-factors', 'Interstellar Factors Contact'],
    ['svc-cartographics', 'Universal Cartographics'],
    ['svc-vista-genomics', 'Vista Genomics'],
    ['svc-black-market', 'Black Market'],
    ['svc-search-rescue', 'Search And Rescue']
];
// Worth naming when a station has them as well; the rest (Dock, Contacts, Station Menu …) says nothing.
const EXTRA_SERVICES = ['Market', 'Outfitting', 'Shipyard', 'Repair', 'Refuel', 'Restock', ...SERVICES.map(([, name]) => name)];
const SERVICE_PAGE_SIZE = 30;
const SERVICE_MAX_PAGES = 3;
const SERVICE_RESULTS = 5;

const chosenServices = () => SERVICES.filter(([id]) => $(id).checked).map(([, name]) => name);
const listText = names => (names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

function servicesQuery(wanted, system, radius, pad, page) {
    const filters = { services: { value: wanted }, distance: { min: 0, max: radius } };
    if (pad >= 3) filters.has_large_pad = { value: true };
    const allowed = Object.keys(SPANSH_STATION_TYPES).filter(name => stationTypeAllowed(SPANSH_STATION_TYPES[name]));
    if (allowed.length < Object.keys(SPANSH_STATION_TYPES).length) filters.type = { value: allowed };
    return { filters, sort: [{ distance: { direction: 'asc' } }], reference_system: system, size: SERVICE_PAGE_SIZE, page };
}

function serviceItem(i, { st, row, has }, wanted) {
    const extra = (has || []).filter(s => EXTRA_SERVICES.includes(s) && !wanted.includes(s));
    return accordionItem(i, {
        title: esc(st.name),
        meta: `${esc(st.system_name)} | ${fmtLy(st.distance)} LY${jumpsText(st.distance)}${st.distance_to_arrival ? ` | ${fmtInt(st.distance_to_arrival)} Ls` : ''}`,
        stat: st.distance_to_arrival ? `${fmtInt(st.distance_to_arrival)} Ls` : '—',
        statLabel: 'from the arrival point',
        body: `
        <div class="sell-station-box">
            <strong>Station:</strong> ${stationLine(row)}
            <ul class="detail-list">
                ${wanted.map(s => `<li>✓ ${esc(s)}</li>`).join('')}
                ${extra.length ? `<li class="muted">Also here: ${esc(extra.join(', '))}</li>` : ''}
                ${has ? '' : '<li class="muted">Spansh lists no services for this station, so this is what its search says.</li>'}
            </ul>
            <span class="muted">Data updated: ${timeAgo(st.updated_at)}</span>
            <div class="action-row">${copyButton(st.system_name, 'Copy System Name', 'btn-cyan')}</div>
        </div>`
    });
}

function searchServices(btn) {
    return runSearch('services', btn, async progress => {
        const sys = requireSystem();
        const wanted = chosenServices();
        if (!wanted.length) return infoBox('Tick at least one service above.');
        const pad = requiredPad();
        const radius = Math.round(numInput('svc-radius', 50, 1, 500));

        const found = [];
        let checked = 0;
        for (let page = 0; page < SERVICE_MAX_PAGES && found.length < SERVICE_RESULTS; page++) {
            progress(`CHECKING STATION SERVICES... ${checked} STATIONS`);
            const data = await spanshSearch('stations', servicesQuery(wanted, sys, radius, pad, page));
            const stations = (data && data.results) || [];
            for (const st of stations) {
                const row = spanshStationRow(st);
                if ((row.maxLandingPadSize != null && row.maxLandingPadSize < pad) || !stationTypeAllowed(row.stationType)) continue;
                checked++;
                // Spansh filters by the services too; its own list is checked again here, and a station
                // it carries no list for is taken as the search returned it.
                const has = Array.isArray(st.services) ? st.services : null;
                if (has && wanted.some(service => !has.includes(service))) continue;
                found.push({ st, row, has });
                if (found.length >= SERVICE_RESULTS) break;
            }
            if (stations.length < SERVICE_PAGE_SIZE || (Number.isFinite(data.count) && (page + 1) * SERVICE_PAGE_SIZE >= data.count)) break;
        }

        if (!found.length) {
            return infoBox(`No station within ${fmtInt(radius)} LY of <strong>${esc(sys)}</strong> (pad ${PAD_LABEL[pad]}) has ${esc(listText(wanted))}.`
                + ` Increase the distance, or untick a service and search for it on its own.${planetaryHint()}`);
        }
        return found.map((f, i) => serviceItem(i, f, wanted)).join('');
    });
}
