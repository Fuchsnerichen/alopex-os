'use strict';

// ==========================================
// INTRO: the arctic fox and the ship computer
// ==========================================
// Runs while the journal loads, at least INTRO_MIN_MS and with the journal still loading at most INTRO_MAX_MS,
// then shows the welcome line and fades out. A click or any key skips it; "Show intro" turns it off.
const INTRO_MIN_MS = 2600;
const INTRO_MAX_MS = 4000;
const INTRO_WELCOME_MS = 900;
// Frame shift (ms): the drive charges, the stars stretch into a tunnel, the fox drops out of the jump with a flash.
const WARP = { charge: 650, flash: 1300, settle: 2300 };
// Alopex lagopus, front view in triangles: [points, fill opacity, kind]
const FOX_SHARDS = [
    ['38,14 78,62 30,78', 0.85], ['162,14 122,62 170,78', 0.75],
    ['43,32 68,60 38,70', 0.9, 'inner'], ['157,32 132,60 162,70', 0.9, 'inner'],
    ['78,62 100,58 100,96', 0.55], ['122,62 100,58 100,96', 0.45],
    ['30,78 78,62 62,100', 0.7], ['170,78 122,62 138,100', 0.6],
    ['78,62 100,96 62,100', 0.38], ['122,62 100,96 138,100', 0.32],
    ['30,78 62,100 14,112', 0.8], ['170,78 138,100 186,112', 0.7],
    ['14,112 62,100 52,138', 0.6], ['186,112 138,100 148,138', 0.5],
    ['62,100 100,96 80,140', 0.26, 'alt'], ['138,100 100,96 120,140', 0.2, 'alt'],
    ['100,96 80,140 120,140', 0.38, 'alt'],
    ['52,138 62,100 80,140', 0.45], ['148,138 138,100 120,140', 0.4],
    ['52,138 80,140 100,176', 0.65], ['148,138 120,140 100,176', 0.55],
    ['80,140 120,140 100,176', 0.3, 'alt'],
    ['91,160 109,160 100,171', 1, 'nose'],
    ['58,102 82,107 66,113', 1, 'eye'], ['142,102 118,107 134,113', 1, 'eye']
];

function buildFox(svg) {
    FOX_SHARDS.forEach(([points, opacity, kind]) => {
        const shard = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        shard.setAttribute('points', points);
        if (kind) shard.setAttribute('class', kind);
        // Each shard starts at the vanishing point in the middle of the face; the outer ones arrive last.
        const [x, y] = points.split(' ').map(p => p.split(',').map(Number))
            .reduce(([sx, sy], [px, py]) => [sx + px / 3, sy + py / 3], [0, 0]);
        const delay = WARP.charge - 50 + Math.hypot(x - 100, y - 100) * 2;
        shard.style.cssText = `--fo:${opacity};--wx:${Math.round(100 - x)}px;--wy:${Math.round(100 - y)}px;--d:${Math.round(delay)}`;
        svg.appendChild(shard);
    });
}

// Stars stream past, stretch into a hyperspace tunnel around the fox and slow down after the flash.
// Returns a function that stops the animation.
function startWarp(intro) {
    const canvas = $('intro-stars');
    const ctx = canvas.getContext('2d');
    const box = intro.getBoundingClientRect(), fox = $('intro-fox').getBoundingClientRect();
    const w = box.width, h = box.height, dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = fox.left + fox.width / 2 - box.left, cy = fox.top + fox.height / 2 - box.top;
    intro.style.setProperty('--fx', `${Math.round(cx)}px`);
    intro.style.setProperty('--fy', `${Math.round(cy)}px`);

    const css = getComputedStyle(intro);
    const rgb = name => {
        const v = css.getPropertyValue(name).trim();
        if (v[0] === '#') {
            const hex = v.length === 4 ? [...v.slice(1)].map(c => c + c).join('') : v.slice(1);
            return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
        }
        return (v.match(/\d+/g) || [255, 255, 255]).slice(0, 3).map(Number);
    };
    const bg = css.getPropertyValue('--ed-bg').trim() || '#000';
    const accent = rgb('--ed-orange'), light = rgb('--ed-cyan');
    const spawn = (s, far) => {
        s.x = (Math.random() * 2 - 1) * 1.6; s.y = (Math.random() * 2 - 1) * 1.1;
        s.z = far ? 1 : 0.05 + Math.random() * 0.95; s.pz = s.z; s.c = Math.random();
        return s;
    };
    const stars = Array.from({ length: 420 }, () => spawn({}, false));
    // depth units per second
    const speed = t => t < WARP.charge ? 0.04 + 0.08 * t / WARP.charge
        : t < WARP.flash ? 0.12 + 4.4 * ((t - WARP.charge) / (WARP.flash - WARP.charge)) ** 3
        : 0.03 + 1.2 * Math.max(0, 1 - (t - WARP.flash) / 700) ** 2;
    const f = Math.max(w, h) * 0.45;
    let raf = 0, start = 0, last = 0;

    function frame(now) {
        if (!start) start = last = now;
        const t = now - start, dt = Math.min(48, now - last);
        last = now;
        const v = speed(t), streak = Math.min(1, Math.max(0, (v - 0.12) / 2));
        ctx.globalAlpha = streak > 0.02 ? 0.4 : 1;   // let the streaks smear while jumping
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.lineCap = 'round';
        for (const s of stars) {
            s.pz = s.z;
            s.z -= v * dt / 1000;
            if (s.z <= 0.03) { spawn(s, true); continue; }
            const x = cx + s.x / s.z * f, y = cy + s.y / s.z * f;
            if (x < -40 || x > w + 40 || y < -40 || y > h + 40) { spawn(s, true); continue; }
            const near = 1 - s.z, c = s.c < 0.25 ? accent : s.c < 0.4 ? light : [255, 255, 255];
            ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, 0.15 + near * 0.9)})`;
            ctx.lineWidth = Math.max(0.6, near * (1.2 + streak * 2));
            ctx.beginPath();
            ctx.moveTo(cx + s.x / s.pz * f, cy + s.y / s.pz * f);
            ctx.lineTo(x + 0.01, y + 0.01);
            ctx.stroke();
        }
        if (streak > 0.02) {
            const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.5);
            glow.addColorStop(0, `rgba(${light[0]},${light[1]},${light[2]},${0.3 * streak})`);
            glow.addColorStop(0.35, `rgba(${accent[0]},${accent[1]},${accent[2]},${0.14 * streak})`);
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, w, h);
        }
        raf = t < WARP.settle ? requestAnimationFrame(frame) : 0;
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
}

function setIntroValue(id, text, kind) {
    const el = $(id);
    el.textContent = text;
    el.className = `${kind} resolved`;
}

function fillIntroStatus() {
    const ships = Object.values(fleet).filter(ship => ship.type);
    const active = fleet[activeShipId];
    setIntroValue('intro-journal', journalFolder ? 'ONLINE' : 'NOT FOUND', journalFolder ? 'ok' : 'bad');
    setIntroValue('intro-cmdr', commanderName ? `CMDR ${commanderName}` : 'UNKNOWN', commanderName ? 'val' : 'sb');
    setIntroValue('intro-loc', journalSystem || $('current-system').value || 'UNKNOWN', journalSystem ? 'val' : 'sb');
    setIntroValue('intro-fleet', ships.length
        ? `${ships.length} SHIP${ships.length > 1 ? 'S' : ''}${active ? ` · ${shipLabel(active.type)} ACTIVE` : ''}` : 'NO DATA',
        ships.length ? 'val' : 'sb');
    $('intro-welcome').textContent = commanderName ? `WELCOME BACK, CMDR ${commanderName}` : 'WELCOME, COMMANDER';
}

function playIntro(loading) {
    const intro = $('intro');
    if (!$('intro-enabled').checked) {
        intro.remove();
        return;
    }
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    buildFox($('intro-fox'));
    intro.classList.add(calm ? 'calm' : 'run');
    const bar = $('intro-bar');
    const started = Date.now();
    const timers = [];
    const stopWarp = calm ? () => {} : startWarp(intro);
    let settled = false, closed = false;

    const close = () => {
        if (closed) return;
        closed = true;
        timers.forEach(clearTimeout);
        stopWarp();
        document.removeEventListener('keydown', skip, true);
        intro.classList.add('leaving');
        setTimeout(() => intro.remove(), calm ? 0 : 450);
    };
    const skip = e => {   // the key only skips the intro, it does not reach the app
        e.preventDefault();
        e.stopPropagation();
        close();
    };
    const settle = () => {
        if (settled || closed) return;
        settled = true;
        fillIntroStatus();
        bar.style.transition = 'width 0.35s ease-out';
        bar.style.width = '100%';
        timers.push(setTimeout(() => {
            intro.classList.add('welcome');
            timers.push(setTimeout(close, INTRO_WELCOME_MS));
        }, Math.max(350, (calm ? 1000 : INTRO_MIN_MS) - (Date.now() - started))));
    };

    document.addEventListener('keydown', skip, true);
    intro.addEventListener('click', close);
    requestAnimationFrame(() => { bar.style.width = '85%'; });
    if (!calm) timers.push(setTimeout(() => intro.classList.add('flash'), WARP.flash));
    loading.then(settle, settle);
    timers.push(setTimeout(settle, INTRO_MAX_MS));
}
