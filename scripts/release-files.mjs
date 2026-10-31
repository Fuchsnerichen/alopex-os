// Checks a finished build in dist/ and writes the two files that go with the downloads:
// SHA256SUMS.txt and the Kurzanleitung (from build/kurzanleitung.txt, version and checksums filled in).
//   node scripts/release-files.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = file => path.join(root, 'dist', file);
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const SETUP = `ALOPEX-OS-${version}-Setup.exe`;
const PORTABLE = `ALOPEX-OS-${version}-portable.exe`;
const RELEASE_FILES = [SETUP, `${SETUP}.blockmap`, 'latest.yml', PORTABLE];
const GUIDE = 'ALOPEX OS - Kurzanleitung.txt';

const read = file => {
    try {
        return readFileSync(dist(file));
    } catch (e) {
        throw new Error(`dist/${file} is missing: build it first with "npm run dist"`);
    }
};
const digest = (algorithm, data, encoding) => createHash(algorithm).update(data).digest(encoding);

const setup = read(SETUP);
const portable = read(PORTABLE);

// The app only installs an update whose SHA-512 matches latest.yml, so a mismatch here would
// be a release that no installed ALOPEX can update to.
const latest = read('latest.yml').toString('utf8');
const sha512 = digest('sha512', setup, 'base64');
if (!latest.includes(`version: ${version}`)) throw new Error(`dist/latest.yml is not for version ${version}`);
if (!latest.includes(sha512)) throw new Error(`dist/latest.yml does not match ${SETUP} (SHA-512)`);
if (!latest.includes(SETUP)) throw new Error(`dist/latest.yml does not name ${SETUP}`);

const sha256 = Object.fromEntries(RELEASE_FILES.map(file => [file, digest('sha256', read(file), 'hex')]));
writeFileSync(dist('SHA256SUMS.txt'), RELEASE_FILES.map(file => `${sha256[file]}  ${file}\n`).join(''));


// The guide is read in Notepad on Windows: keep the byte order mark, and write Windows line
// endings whichever way git checked the template out.
const guide = readFileSync(path.join(root, 'build', 'kurzanleitung.txt'), 'utf8')
    .replaceAll('%VERSION%', version)
    .replaceAll('%SETUP_SHA256%', sha256[SETUP].toUpperCase())
    .replaceAll('%PORTABLE_SHA256%', digest('sha256', portable, 'hex').toUpperCase());
const leftover = guide.match(/%[A-Z_]+%/);
if (leftover) throw new Error(`build/kurzanleitung.txt still has a placeholder: ${leftover[0]}`);
writeFileSync(dist(GUIDE), guide.replace(/\r?\n/g, '\r\n'), 'utf8');

// Everything that belongs on the release, for the workflow to hand to "gh release upload".
const uploads = [...RELEASE_FILES, 'SHA256SUMS.txt', GUIDE];
writeFileSync(dist('release-files.txt'), uploads.map(file => `dist/${file}\n`).join(''));

console.log([`latest.yml matches ${SETUP}`, ...RELEASE_FILES.map(f => `${sha256[f].slice(0, 16)}… ${f}`),
    `-> dist/SHA256SUMS.txt, dist/${GUIDE} and dist/release-files.txt (${uploads.length} files for the release)`].join('\n'));
