'use strict';

// ==========================================
// 4. EXOBIOLOGY (Spansh body search)
// ==========================================
function searchExoRoutes(btn) {
    return runSearch('exobio', btn, async progress => {
        const sys = requireSystem();
        const [genus, species] = $('exo-target').value.split('|');
        const target = `${genus} ${species}`;
        const radius = numInput('exo-radius', 100, 1, 1000);
        progress('QUERYING SPANSH BODY DATABASE...');
        const data = await spanshSearch('bodies', {
            filters: {
                distance: { min: 0, max: radius },
                landmarks: [{ type: genus, subtype: [target] }]
            },
            reference_system: sys,
            sort: [{ distance: { direction: 'asc' } }],
            size: 10,
            page: 0
        });
        const bodies = (data && data.results) || [];
        if (!bodies.length) {
            return infoBox(`No body with a logged <strong>${esc(target)}</strong> within ${fmtInt(radius)} LY of ${esc(sys)}. Increase the radius or choose another species.`);
        }

        return bodies.map((b, i) => {
            const speciesHere = [...new Set((b.landmarks || []).map(l => l.subtype).filter(Boolean))];
            const bodyTotal = speciesHere.reduce((sum, s) => sum + (EXO_VALUE[s] || 0), 0);
            const gravity = Number(b.gravity);
            const gravWarning = gravity > 1.4 ? ' <span style="color: var(--ed-red); font-weight:bold;">[HIGH-G WARNING!]</span>' : '';
            const range = COLONY_RANGE_M[genus];
            return accordionItem(i, {
                title: esc(b.name),
                meta: `${esc(b.system_name)} | ${fmtLy(b.distance)} LY${jumpsText(b.distance)}${b.distance_to_arrival ? ` | ${fmtInt(b.distance_to_arrival)} Ls` : ''}`,
                stat: formatCR(EXO_VALUE[target]),
                statLabel: 'Base value (Vista Genomics)',
                body: `
                <div class="sell-station-box">
                    <ul class="detail-list">
                        <li>◈ Body type: ${esc(b.subtype || 'unknown')}</li>
                        <li>◈ Atmosphere: ${esc(b.atmosphere || 'unknown')}</li>
                        <li>◈ Surface gravity: ${Number.isFinite(gravity) ? gravity.toFixed(2) + ' G' : 'unknown'}${gravWarning}</li>
                        ${b.surface_temperature ? `<li>◈ Surface temperature: ${fmtInt(b.surface_temperature)} K</li>` : ''}
                        <li>◈ Species logged on this body: ${speciesHere.map(s => esc(s) + (EXO_VALUE[s] ? ` (${formatCR(EXO_VALUE[s])})` : '')).join(', ') || esc(target)}</li>
                        ${bodyTotal > EXO_VALUE[target] ? `<li style="color: var(--ed-green);">◈ Value of the listed species: ${formatCR(bodyTotal)}</li>` : ''}
                        ${range ? `<li style="color: var(--ed-orange); font-weight: bold;">◈ Artemis Genetic Sampler: minimum distance between ${esc(genus)} samples = ${range} m</li>` : ''}
                    </ul>
                    <div class="action-row">${copyButton(b.system_name, 'Copy System Name for Galaxy Map', 'btn-cyan')}</div>
                </div>`
            });
        }).join('');
    });
}
