// Updates from the GitHub releases of Fuchsnerichen/alopex-os, through electron-updater:
// check, download (verified against the SHA-512 in the release's latest.yml), install on restart or on quit.
// The page only sees the state object below and can ask to check, download, install or switch auto-update.
import { EventEmitter } from 'node:events';

export const RELEASES_URL = 'https://github.com/Fuchsnerichen/alopex-os/releases/latest';
const BUSY = new Set(['checking', 'downloading', 'ready', 'installing']);

/**
 * updater   electron-updater's autoUpdater (or createFakeUpdater for tests); null = updates not possible here
 * settings  { read(): Promise<object>, write(patch): Promise } on the app's settings.json
 * portable  the portable exe cannot replace itself: "download" opens the release page instead
 */
export function createUpdates({ updater, version, portable = false, settings, openExternal, onChange = () => {} }) {
    const state = {
        status: updater ? 'idle' : 'disabled', current: version, latest: null, progress: 0, notes: '', error: '',
        auto: false, portable, justUpdated: null
    };
    const set = patch => {
        Object.assign(state, patch);
        onChange({ ...state });
    };

    if (updater) {
        updater.autoDownload = false;          // the app decides, see "auto"
        updater.autoInstallOnAppQuit = true;   // a downloaded update installs when ALOPEX is closed
        updater.on('checking-for-update', () => set({ status: 'checking', error: '' }));
        updater.on('update-not-available', () => set({ status: 'none' }));
        updater.on('update-available', info => {
            set({ status: 'available', latest: info.version, notes: plainText(info.releaseNotes) });
            if (state.auto && !portable) download();
        });
        updater.on('download-progress', progress => set({ status: 'downloading', progress: Math.floor(progress.percent || 0) }));
        updater.on('update-downloaded', info => {
            const notes = plainText(info.releaseNotes) || state.notes;
            settings.write({ updateNotes: { version: info.version, notes } }).catch(() => {});
            set({ status: 'ready', progress: 100, latest: info.version, notes });
        });
        updater.on('error', error => set(errorState(error)));
    }

    // Reads the auto-update switch and notices whether this start follows an update.
    const ready = (async () => {
        const saved = await settings.read();
        let justUpdated = null;
        if (saved.lastVersion && isNewer(version, saved.lastVersion)) {
            const notes = saved.updateNotes && saved.updateNotes.version === version ? saved.updateNotes.notes : '';
            justUpdated = { from: saved.lastVersion, to: version, notes };
        }
        if (saved.lastVersion !== version || justUpdated) await settings.write({ lastVersion: version, updateNotes: null });
        set({ auto: saved.autoUpdate === true, justUpdated });
    })().catch(() => {});

    async function check() {
        await ready;
        if (!updater || BUSY.has(state.status)) return { ...state };
        try {
            await updater.checkForUpdates();
        } catch (e) {
            set(errorState(e));
        }
        return { ...state };
    }

    async function download() {
        await ready;
        if (state.status !== 'available') return { ...state };
        if (portable) {
            openExternal(RELEASES_URL);
            return { ...state };
        }
        set({ status: 'downloading', progress: 0 });
        try {
            await updater.downloadUpdate();
        } catch (e) {
            set(errorState(e));
        }
        return { ...state };
    }

    function install() {
        if (state.status !== 'ready') return { ...state };
        set({ status: 'installing' });
        updater.quitAndInstall(true, true);   // silent install, then start the new version
        return { ...state };
    }

    async function setAuto(on) {
        await ready;
        await settings.write({ autoUpdate: Boolean(on) });
        set({ auto: Boolean(on) });
        if (on && !portable && state.status === 'available') download();
        return { ...state };
    }

    // First check shortly after the start, then every few hours while ALOPEX runs.
    function schedule({ firstMs = 8000, everyMs = 6 * 60 * 60 * 1000 } = {}) {
        if (!updater) return () => {};
        const first = setTimeout(check, firstMs);
        const again = setInterval(check, everyMs);
        return () => { clearTimeout(first); clearInterval(again); };
    }

    return { ready, state: async () => { await ready; return { ...state }; }, check, download, install, setAuto, schedule };
}

// Plain words for what went wrong. Only "no release published at all" counts as up to date;
// anything else shows as an error, so a broken release cannot hide behind "Up to date".
function errorState(error) {
    const code = String((error && error.code) || '');
    const message = String((error && error.message) || error || '');
    const fail = text => ({ status: 'error', error: text });
    if (code === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS') return { status: 'none', error: '' };
    if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_INTERNET|ERR_NAME|ERR_NETWORK|net::/i.test(message)) {
        return fail('update server not reachable – are you online?');
    }
    if ([403, 429].includes(error && error.statusCode) || /HttpError: (403|429)\b/.test(message)) {
        return fail('GitHub is limiting requests – please try again later');
    }
    if (code === 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND') return fail('no release found on GitHub');
    if (code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND') return fail('the newest release is missing latest.yml');
    if (code === 'ERR_UPDATER_INVALID_UPDATE_INFO' || code === 'ERR_UPDATER_NO_FILES_PROVIDED') {
        return fail('latest.yml in the newest release is damaged');
    }
    if (code === 'ERR_CHECKSUM_MISMATCH' || /checksum mismatch/i.test(message)) return fail('download damaged, please try again');
    if (error && error.statusCode === 404) return fail('the newest release is missing the setup file');
    return fail(message.split('\n')[0].slice(0, 120));
}

// Release notes arrive as HTML (string) or as a list per version; the page shows them as plain text.
export function plainText(notes) {
    const text = Array.isArray(notes) ? notes.map(n => n && n.note).filter(Boolean).join('\n\n') : String(notes || '');
    return text
        .replace(/<br\s*\/?>|<\/(p|li|h\d)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 2000);
}

export function isNewer(a, b) {
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
}

// Stand-in for electron-updater in the end-to-end tests: always offers `latest`, downloads in two steps.
export function createFakeUpdater(latest) {
    const fake = new EventEmitter();
    fake.installCalls = [];
    fake.checkForUpdates = async () => {
        fake.emit('checking-for-update');
        await tick();
        fake.emit('update-available', { version: latest, releaseNotes: '<p>Test release <b>notes</b></p>' });
    };
    fake.downloadUpdate = async () => {
        await tick();
        fake.emit('download-progress', { percent: 42.5 });
        await tick();
        fake.emit('update-downloaded', { version: latest, releaseNotes: '<p>Test release <b>notes</b></p>' });
    };
    fake.quitAndInstall = (...args) => { fake.installCalls.push(args); };
    return fake;
}

const tick = () => new Promise(resolve => setTimeout(resolve, 150));
