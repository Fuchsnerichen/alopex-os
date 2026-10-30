// Ardent Insight market data (read-only GET requests to a fixed host).
import { fetchText, parseJson, fail, RequestError } from './http.mjs';

const DEFAULT_BASE = 'https://api.ardent-insight.com/v2';
// Paths like /system/name/Barnard's%20Star/commodities/exports – built by the page with encodeURIComponent.
const PATH_RE = /^\/(system|commodity|commodities|market)(\/[A-Za-z0-9\-._~%'()!*]+)*$/;
const PARAM_RE = /^[A-Za-z]{1,30}$/;

export function createArdentClient({ fetch, baseUrl = DEFAULT_BASE, userAgent = 'ALOPEX-OS' }) {
    return async function get(pathname, params = {}) {
        if (typeof pathname !== 'string' || !PATH_RE.test(pathname) || hasDotSegment(pathname)) return fail('Invalid Ardent request');
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params || {})) {
            if (!PARAM_RE.test(key)) return fail('Invalid Ardent request');
            if (value === undefined || value === null || value === '') continue;
            if (!['string', 'number', 'boolean'].includes(typeof value)) return fail('Invalid Ardent request');
            query.set(key, String(value));
        }
        const qs = query.toString();
        try {
            const res = await fetchText(fetch, (baseUrl || DEFAULT_BASE) + pathname + (qs ? '?' + qs : ''),
                { headers: { Accept: 'application/json', 'User-Agent': userAgent } });
            const data = parseJson(res.text);
            if (!res.ok) return fail(data?.message || data?.error || `Ardent: HTTP ${res.status}`);
            if (data === null) return fail('Ardent: invalid answer');
            return { ok: true, data };
        } catch (e) {
            if (e instanceof RequestError) return fail(e.message);
            throw e;
        }
    };
}

function hasDotSegment(pathname) {
    return pathname.split('/').some(segment => {
        try { return ['.', '..'].includes(decodeURIComponent(segment)); } catch (e) { return true; }
    });
}
