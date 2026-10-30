// Read-only access to the Elite Dangerous journal folder. Only Journal.*.log files directly
// inside the folder can be listed and read – no other files, no subfolders.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JOURNAL_RE = /^Journal\.[0-9A-Za-z.\-]+\.log$/;
const NEW_FORMAT_RE = /^Journal\.\d{4}-\d{2}-\d{2}T\d{6}\.\d{2}\.log$/;
const MAX_READ_BYTES = 64 * 1024 * 1024;

// New-style names (Journal.2024-05-01T120000.01.log) are newer than all old-style ones (Journal.210501120000.01.log).
const sortKey = name => (NEW_FORMAT_RE.test(name) ? '1' : '0') + name;

export function defaultJournalFolder(home = os.homedir()) {
    return path.join(home, 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
}

export async function isFolder(dir) {
    try { return (await fs.stat(dir)).isDirectory(); } catch (e) { return false; }
}

// Journal file names, oldest first.
export async function listJournals(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isFile() && JOURNAL_RE.test(e.name)).map(e => e.name)
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

// Everything from byte `offset` to the current end of the file (at most 64 MB per call).
export async function readJournal(dir, name, offset) {
    if (typeof name !== 'string' || !JOURNAL_RE.test(name) || path.basename(name) !== name) throw new Error('Invalid journal file name');
    const start = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
    const file = await fs.open(path.join(dir, name), 'r');
    try {
        const { size } = await file.stat();
        if (start >= size) return { size, text: '' };
        const length = Math.min(size - start, MAX_READ_BYTES);
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await file.read(buffer, 0, length, start);
        return { size: start + bytesRead, text: buffer.toString('utf8', 0, bytesRead) };
    } finally {
        await file.close();
    }
}
