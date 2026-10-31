'use strict';

// ==========================================
// 2. PASSENGER MISSIONS (own journal)
// ==========================================
const firstDestination = m => String(m.destSystem || '').split('$MISSIONUTIL_MULTIPLE_INNER_SEPARATOR;')[0];
const destinationLabel = m => String(m.destSystem || '').split('$MISSIONUTIL_MULTIPLE_INNER_SEPARATOR;').filter(Boolean).join(' → ');

function searchPassengerRoutes(btn) {
    return runSearch('passenger', btn, async progress => {
        if (!journalFolder) {
            return infoBox('Connect your journal folder first (top right: <strong>Select Folder</strong>). Passenger mission boards are not available through any public API, so this view analyses the missions recorded in your own journal.');
        }
        const filter = $('passenger-type').value;
        const matches = m => filter === 'all' || m.partial || (filter === 'vip') === !!m.vip;
        const all = [...missions.values()].filter(matches);
        const now = Date.now();
        const active = all.filter(m => m.status === 'active' && !(Date.parse(m.expiry) <= now))
            .sort((a, b) => (Date.parse(a.expiry) || 0) - (Date.parse(b.expiry) || 0));
        const completed = all.filter(m => m.status === 'completed' && m.originSystem && m.destSystem);

        progress('RESOLVING DESTINATION COORDINATES...');
        const here = journalSystem || $('current-system').value.trim();
        const coords = {};
        const names = [...new Set([here, ...active.map(firstDestination)].filter(Boolean))];
        await mapLimit(names, 3, async name => { coords[name] = await getSystem(name); }).catch(() => {});

        let html = '';
        const seats = active.reduce((sum, m) => sum + (m.pax || 0), 0);
        const cabins = numInput('passenger-space', 0, 0, 10000);
        const totalReward = active.reduce((sum, m) => sum + (m.reward || 0), 0);
        html += `<h4>Active passenger missions: ${active.length} · Seats ${fmtInt(seats)} / ${fmtInt(cabins)} · Total ${formatCR(totalReward)}</h4>`;
        if (!active.length) html += infoBox('No active passenger missions in your journal. Accept missions at a station, then press the button again.');

        html += active.map((m, i) => {
            const dest = firstDestination(m);
            const dist = coords[here] && coords[dest] ? distance3d(coords[here], coords[dest]) : null;
            const warn = m.wanted ? warningBox('<strong>⚠️ Wanted passengers:</strong> expect security scans.') : '';
            const body = m.partial
                ? infoBox('Accepted before the scanned journal files – details are in an older journal file.')
                : `<ul class="detail-list">
                        <li>◈ Mission: ${esc(m.name)}</li>
                        <li>◈ Passengers: ${fmtInt(m.pax)} ${m.type ? '(' + esc(m.type) + ')' : ''} · ${m.vip ? 'VIP' : 'Bulk'}</li>
                        <li>◈ Destination: ${esc(destinationLabel(m))}${m.destStation ? ' / ' + esc(m.destStation) : ''}</li>
                        <li>◈ Accepted at: ${esc(m.originSystem || 'unknown')}${m.originStation ? ' / ' + esc(m.originStation) : ''}</li>
                        <li>◈ Expires in: ${timeLeft(m.expiry)}</li>
                   </ul>${warn}
                   <div class="action-row">${dest ? copyButton(dest, 'Copy Destination System', 'btn-cyan') : ''}</div>`;
            return accordionItem(i, {
                title: esc(m.partial ? m.name : destinationLabel(m) || 'Unknown destination'),
                meta: m.partial ? 'Details not in scanned files' : `${fmtInt(m.pax)} pax · ${m.vip ? 'VIP' : 'Bulk'}${dist !== null ? ` | ${fmtLy(dist)} LY${jumpsText(dist)}` : ''} | expires in ${timeLeft(m.expiry)}`,
                stat: m.partial ? '—' : formatCR(m.reward),
                statLabel: 'Reward',
                body
            });
        }).join('');

        const routes = {};
        for (const m of completed) {
            const key = `${m.originSystem}|${firstDestination(m)}`;
            const r = routes[key] || (routes[key] = { from: m.originSystem, station: m.originStation, to: firstDestination(m), runs: 0, total: 0, pax: 0, best: 0 });
            r.runs++; r.total += m.reward || 0; r.pax += m.pax || 0; r.best = Math.max(r.best, m.reward || 0);
        }
        const top = Object.values(routes).sort((a, b) => b.total / b.runs - a.total / a.runs).slice(0, 5);
        html += `<h4>Your best paying passenger routes (last ${JOURNAL_FILES_TO_SCAN} journal files)</h4>`;
        if (!top.length) html += infoBox('No completed passenger missions in the scanned journal files yet.');
        html += top.map((r, i) => accordionItem(active.length + i, {
            title: `${esc(r.from)} ➔ ${esc(r.to)}`,
            meta: `${r.runs} completed mission${r.runs > 1 ? 's' : ''} · Ø ${fmtInt(r.pax / r.runs)} pax`,
            stat: formatCR(r.total / r.runs),
            statLabel: 'Average reward / mission',
            body: `<ul class="detail-list">
                        <li>◈ Start station: ${esc(r.station || 'unknown')}</li>
                        <li>◈ Best single reward: ${formatCR(r.best)}</li>
                        <li>◈ Total earned on this route: ${formatCR(r.total)}</li>
                   </ul>
                   <div class="action-row">${copyButton(r.from, 'Copy Start System')}${copyButton(r.to, 'Copy Destination System', 'btn-cyan')}</div>`
        })).join('');
        return html;
    });
}
