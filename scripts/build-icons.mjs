// Draws the app icon, the arctic fox head of the intro, and writes
//   build/icon.svg  (the drawing)
//   build/icon.png  (512 px)
//   build/icon.ico  (16–256 px; the small sizes use a simpler, high-contrast version)
// Usage: node scripts/build-icons.mjs   (renders with Playwright's Chromium from the dev dependencies)
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { chromium } = createRequire(import.meta.url)('playwright');

// Imperial theme (app/styles.css)
const ICE = '#00d0ff', WHITE = '#ffffff', NAVY = '#050b14', NAVY_TOP = '#0f2240';

// The same triangles as the intro (FOX_SHARDS in app/js/intro.js): [points, fill opacity, kind]
const FOX = [
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

function shard([points, opacity, kind], small) {
    if (kind === 'inner' || kind === 'nose') return `<polygon points="${points}" fill="${NAVY}" stroke="${kind === 'nose' ? WHITE : ICE}" stroke-width="1.2"/>`;
    if (kind === 'eye') return small
        ? `<polygon points="${points}" fill="${NAVY}"/>`
        : `<polygon points="${points}" fill="${WHITE}" filter="url(#glow)"/>`;
    const color = kind === 'alt' ? WHITE : ICE;
    // small sizes: nearly solid, so the head still reads at 16 px
    const fill = small ? (kind === 'alt' ? 0.92 : Math.max(0.78, opacity)) : Math.max(0.3, opacity);
    return `<polygon points="${points}" fill="${color}" fill-opacity="${fill}" stroke="${color}" stroke-opacity="${small ? 0 : 0.9}" stroke-width="1.2" stroke-linejoin="round"/>`;
}

export function iconSvg({ small = false } = {}) {
    // the fox (x 14–186, y 14–176) centred in the 512 square
    const scale = small ? 2.42 : 2.08, cx = 100, cy = 95;
    const fox = `<g transform="translate(${256 - cx * scale} ${256 - cy * scale + (small ? 4 : 8)}) scale(${scale})">${FOX.map(s => shard(s, small)).join('')}</g>`;
    const frame = small
        ? `<rect x="14" y="14" width="484" height="484" rx="110" fill="${NAVY}" stroke="${ICE}" stroke-width="40"/>`
        : `<rect x="22" y="22" width="468" height="468" rx="104" fill="url(#bg)"/>
           <rect x="22" y="22" width="468" height="468" rx="104" fill="url(#scan)"/>
           <circle cx="256" cy="250" r="210" fill="url(#halo)"/>
           <rect x="22" y="22" width="468" height="468" rx="104" fill="none" stroke="${ICE}" stroke-width="26"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NAVY_TOP}"/><stop offset="1" stop-color="${NAVY}"/></linearGradient>
    <pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="1.5" fill="${WHITE}" opacity="0.045"/></pattern>
    <radialGradient id="halo"><stop offset="0" stop-color="${ICE}" stop-opacity="0.28"/><stop offset="1" stop-color="${ICE}" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  ${frame}
  ${fox}
</svg>
`;
}

// An ICO file with PNG images inside (Windows Vista and later).
function ico(images) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
    const dir = Buffer.alloc(16 * images.length);
    let offset = header.length + dir.length;
    images.forEach(({ size, png }, i) => {
        const o = i * 16;
        dir.writeUInt8(size >= 256 ? 0 : size, o);       // 0 means 256
        dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
        dir.writeUInt16LE(1, o + 4);                     // colour planes
        dir.writeUInt16LE(32, o + 6);                    // bits per pixel
        dir.writeUInt32LE(png.length, o + 8);
        dir.writeUInt32LE(offset, o + 12);
        offset += png.length;
    });
    return Buffer.concat([header, dir, ...images.map(i => i.png)]);
}

async function render(page, svg, size) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const full = iconSvg(), small = iconSvg({ small: true });
    writeFileSync(path.join(ROOT, 'build', 'icon.svg'), full);
    writeFileSync(path.join(ROOT, 'build', 'icon.png'), await render(page, full, 512));
    const images = [];
    for (const size of [256, 128, 64, 48, 32, 24, 16]) images.push({ size, png: await render(page, size <= 32 ? small : full, size) });
    writeFileSync(path.join(ROOT, 'build', 'icon.ico'), ico(images));
    await browser.close();
    console.log('build/icon.svg, build/icon.png (512 px), build/icon.ico (' + images.map(i => i.size).join(', ') + ' px)');
}
