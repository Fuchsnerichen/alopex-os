// ALOPEX OS – desktop app (Electron main process)
//
// The window shows the ALOPEX page from the app's own files (app://alopex/). The page itself has no
// internet or file access: market data, Spansh searches, commodity names and the journal go through
// the small bridge in preload.cjs to the functions below, which check every request.

import { app, BrowserWindow, ipcMain, protocol, net, session, dialog, clipboard, Menu } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArdentClient } from './lib/ardent.mjs';
import { createSpanshClient } from './lib/spansh.mjs';
import { loadCommodityNames } from './lib/commodities.mjs';
import { defaultJournalFolder, isFolder, listJournals, readJournal } from './lib/journal.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(ROOT, 'app');
const APP_ORIGIN = 'app://alopex';
const PARTITION = 'persist:alopex';
const CSP = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",   // style="" attributes in generated markup; scripts stay locked down
    "font-src 'self'",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'"
].join('; ');
const FILE_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.woff2': 'font/woff2'
};

// Test hooks: only honoured when running from source, never in the packaged app.
const testEnv = name => (app.isPackaged ? undefined : process.env[name]);
if (testEnv('ALOPEX_USER_DATA')) app.setPath('userData', testEnv('ALOPEX_USER_DATA'));

const userAgent = `ALOPEX-OS/${app.getVersion()}`;
const webFetch = (url, init) => net.fetch(url, init);
const ardent = createArdentClient({ fetch: webFetch, baseUrl: testEnv('ALOPEX_ARDENT_API'), userAgent });
const spansh = createSpanshClient({ fetch: webFetch, baseUrl: testEnv('ALOPEX_SPANSH_API'), userAgent });

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true } }]);

if (!app.requestSingleInstanceLock()) {
    app.quit();   // ALOPEX is already open: the running instance brings its window to the front
} else {
    app.on('second-instance', () => {
        const [win] = BrowserWindow.getAllWindows();
        if (!win) return;
        if (win.isMinimized()) win.restore();
        win.focus();
    });
    app.on('window-all-closed', () => app.quit());
    app.on('web-contents-created', (event, contents) => {
        // The page never navigates, opens windows or embeds other content.
        contents.on('will-navigate', e => e.preventDefault());
        contents.on('will-redirect', e => e.preventDefault());
        contents.on('will-attach-webview', e => e.preventDefault());
        contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    });
    app.whenReady().then(() => {
        Menu.setApplicationMenu(null);
        hardenSession(session.fromPartition(PARTITION));
        registerBridge();
        createWindow();
    });
}

function hardenSession(ses) {
    ses.protocol.handle('app', serveAppFile);
    ses.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    // Second line of defence next to the CSP: the window may only load the app's own files.
    ses.webRequest.onBeforeRequest((details, callback) => {
        callback({ cancel: !details.url.startsWith(APP_ORIGIN + '/') && !details.url.startsWith('devtools://') });
    });
}

async function serveAppFile(request) {
    try {
        const url = new URL(request.url);
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
        const file = path.resolve(APP_DIR, relative);
        const type = FILE_TYPES[path.extname(file)];
        if (url.host !== 'alopex' || !type || !file.startsWith(APP_DIR + path.sep)) return notFound();
        let body = await fs.readFile(file);
        if (path.basename(file) === 'index.html') {
            body = body.toString('utf8')
                .replaceAll('%APP_VERSION%', escapeHtml(app.getVersion()))
                .replaceAll('%APP_AUTHOR%', escapeHtml(await appAuthor()));
        }
        return new Response(body, {
            headers: { 'Content-Type': type, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' }
        });
    } catch (e) {
        return notFound();
    }
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

let authorName = null;
async function appAuthor() {
    if (authorName === null) {
        try { authorName = String(JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')).author || ''); } catch (e) { authorName = ''; }
    }
    return authorName;
}

const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function createWindow() {
    const win = new BrowserWindow({
        width: 1320,
        height: 920,
        minWidth: 420,
        minHeight: 480,
        title: 'ALOPEX OS',
        backgroundColor: '#050b14',   // --ed-bg of the default theme, shown before the first paint
        show: false,
        webPreferences: {
            preload: path.join(ROOT, 'preload.cjs'),
            partition: PARTITION,
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webSecurity: true,
            spellcheck: false,
            devTools: !app.isPackaged
        }
    });
    win.once('ready-to-show', () => win.show());
    win.loadURL(`${APP_ORIGIN}/index.html`);
}

// ---------- Bridge (see preload.cjs) ----------

let journalFolder = null;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

async function readSettings() {
    try { return JSON.parse(await fs.readFile(settingsFile(), 'utf8')); } catch (e) { return {}; }
}

async function findJournalFolder() {
    const candidates = [testEnv('ALOPEX_JOURNAL_DIR'), (await readSettings()).journalFolder, defaultJournalFolder()];
    for (const dir of candidates) if (dir && await isFolder(dir)) return dir;
    return null;
}

async function chooseJournalFolder(event) {
    let folder = testEnv('ALOPEX_TEST_CHOOSE_DIR');
    if (!folder) {
        const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
            title: 'Elite Dangerous journal folder',
            defaultPath: journalFolder || defaultJournalFolder(),
            properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths.length) return null;
        folder = result.filePaths[0];
    }
    if (!await isFolder(folder)) throw new Error('Not a folder');
    journalFolder = folder;
    await fs.writeFile(settingsFile(), JSON.stringify({ ...(await readSettings()), journalFolder: folder })).catch(() => {});
    return folder;
}

function requireJournalFolder() {
    if (!journalFolder) throw new Error('No journal folder selected');
    return journalFolder;
}

const ok = data => ({ ok: true, data });

function registerBridge() {
    // Only the ALOPEX page itself may call the app core.
    const fromApp = event => Boolean(event.senderFrame && event.senderFrame.url.startsWith(APP_ORIGIN + '/'));
    const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
        if (!fromApp(event)) return { ok: false, error: 'Forbidden' };
        try {
            return await fn(event, ...args);
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    handle('ardent:get', (event, pathname, params) => ardent(pathname, params));
    handle('spansh:search', (event, type, body) => spansh(type, body));
    handle('commodities:names', async () => ok(await loadCommodityNames({
        fetch: webFetch,
        url: testEnv('ALOPEX_COMMODITY_CSV'),
        cacheFile: path.join(app.getPath('userData'), 'commodity-names.json')
    })));
    handle('journal:folder', async () => ok(journalFolder = await findJournalFolder()));
    handle('journal:choose', async event => ok(await chooseJournalFolder(event)));
    handle('journal:list', async () => ok((await listJournals(requireJournalFolder())).map(name => ({ name }))));
    handle('journal:read', async (event, name, offset) => ok(await readJournal(requireJournalFolder(), name, offset)));
    ipcMain.on('clipboard:write', (event, text) => {
        if (fromApp(event)) clipboard.writeText(String(text).slice(0, 500));
    });
}
