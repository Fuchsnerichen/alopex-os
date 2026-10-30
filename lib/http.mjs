// Network helper for the app core: every request has a timeout and a size limit.

export class RequestError extends Error {}

export async function fetchText(fetch, url, { method = 'GET', headers = {}, body, timeoutMs = 30000, maxBytes = 25 * 1024 * 1024 } = {}) {
    const host = new URL(url).host;
    let res, buffer;
    try {
        res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
        if (Number(res.headers.get('content-length')) > maxBytes) throw new RequestError(`${host}: answer too large`);
        buffer = await res.arrayBuffer();
    } catch (e) {
        if (e instanceof RequestError) throw e;
        if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new RequestError(`${host} did not answer in time`);
        throw new RequestError(`${host} not reachable – are you online?`);
    }
    if (buffer.byteLength > maxBytes) throw new RequestError(`${host}: answer too large`);
    return { status: res.status, ok: res.ok, text: Buffer.from(buffer).toString('utf8') };
}

export function parseJson(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
}

export const fail = error => ({ ok: false, error });
