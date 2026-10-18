/**
 * ASTRA OSINT Ω — passive, zero-cost intelligence adapter for Ghost Operator.
 * Catalog attribution: OSINT Framework (Justin Nordine, MIT),
 * https://github.com/lockfale/OSINT-Framework/blob/master/LICENSE
 * No tracking links, face recognition, e-mail harvesting, active scans or outbound messaging.
 */
import { createHash } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { domainToASCII } from 'node:url';

export const OSINT_CATALOG_SOURCE =
  'https://raw.githubusercontent.com/lockfale/OSINT-Framework/master/public/arf.json';
const SOURCE_CATEGORIES = Object.freeze({
  domain: ['Domain Name'],
  business: ['Business Records'],
  infrastructure: ['Cloud Infrastructure', 'Domain Name']
});
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export function validateOsintDomain(value) {
  if (typeof value !== 'string' || value.length > 253) throw new Error('INVALID_DOMAIN');
  const raw = value.trim().replace(/\.$/, '').toLowerCase();
  if (raw !== value.trim().toLowerCase().replace(/\.$/, '') || /[\s\/@:#?\\]/.test(raw))
    throw new Error('INVALID_DOMAIN');
  const domain = domainToASCII(raw);
  if (!domain || domain.length > 253 || !domain.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(domain))
    throw new Error('INVALID_DOMAIN');
  const labels = domain.split('.');
  if (labels.some(s => !s || s.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s)))
    throw new Error('INVALID_DOMAIN');
  const tld = labels.at(-1);
  if (tld.length < 2 || ['local', 'localhost', 'internal', 'invalid', 'test', 'example', 'onion', 'home', 'lan'].includes(tld))
    throw new Error('NON_PUBLIC_DOMAIN');
  return domain;
}

function normalizeCategory(category) {
  const key = String(category || 'domain');
  if (!(key in SOURCE_CATEGORIES)) throw new Error('INVALID_CATEGORY');
  return key;
}

/** Never execute the tools returned by the directory. This is metadata only. */
export function searchOsintCatalog(root, { category = 'domain', query = '', limit = 15 } = {}) {
  const key = normalizeCategory(category);
  if (typeof query !== 'string' || query.length > 120) throw new Error('INVALID_QUERY');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('INVALID_LIMIT');
  if (!root || !Array.isArray(root.children)) throw new Error('INVALID_CATALOG');
  const text = query.trim().toLowerCase();
  const accepted = new Set(SOURCE_CATEGORIES[key]);
  const all = [];
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'folder') {
      for (const child of node.children || []) walk(child, [...path, String(node.name || '')]);
      return;
    }
    if (node.type !== 'url' || node.status !== 'live' || node.pricing !== 'free' ||
        node.opsec !== 'passive' || node.deprecated || node.registration ||
        node.localInstall || node.invitationOnly) return;
    if (!path.some(v => accepted.has(v))) return;
    let url;
    try { url = new URL(node.url); } catch { return; }
    if (url.protocol !== 'https:' || url.username || url.password) return;
    const name = String(node.name || '').slice(0, 140);
    const description = String(node.description || '').slice(0, 400);
    if (text && ![name, description, ...path].join(' ').toLowerCase().includes(text)) return;
    all.push({ name, url: url.href, description, category: path.slice(1).join(' > '),
      pricing: 'free', interaction: 'external_link_only', metadataStatus: 'upstream_unverified' });
  };
  walk(root, []);
  return { category: key, query: text, total: all.length, tools: all.slice(0, limit),
    caveat: 'Catalog metadata is not independent proof of tool uptime, price or accuracy.' };
}

const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const recordError = e => String(e?.code || e?.message || 'DNS_FAILED').slice(0, 80);
function dnsProof(name, status, values = [], error = null) {
  return { recordType: name, status, values, ...(error ? { error } : {}) };
}

export function createOsintService({
  fetchImpl = globalThis.fetch,
  resolverFactory = () => new Resolver({ timeout: 1800, tries: 1 }),
  clock = () => Date.now(),
  ttlMs = DEFAULT_TTL_MS
} = {}) {
  let cached = null;
  let cacheAt = 0;
  let inflight = null;
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_UNAVAILABLE');
  async function loadCatalog() {
    if (cached && clock() - cacheAt < ttlMs) return cached;
    if (inflight) return inflight;
    inflight = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      timeout.unref?.();
      try {
        const response = await fetchImpl(OSINT_CATALOG_SOURCE, { method: 'GET', redirect: 'error',
          signal: controller.signal, headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error('CATALOG_HTTP_' + response.status);
        const length = Number(response.headers?.get?.('content-length') || 0);
        if (length > 2500000) throw new Error('CATALOG_TOO_LARGE');
        const body = await response.text();
        if (body.length > 2500000) throw new Error('CATALOG_TOO_LARGE');
        const json = JSON.parse(body);
        if (!json || !Array.isArray(json.children)) throw new Error('INVALID_CATALOG');
        cached = json;
        cacheAt = clock();
        return cached;
      } finally { clearTimeout(timeout); }
    })().finally(() => { inflight = null; });
    try { return await inflight; }
    catch (e) { if (cached) return cached; throw e; }
  }
  async function catalog(opts = {}) {
    const root = await loadCatalog();
    return { ...searchOsintCatalog(root, opts), source: OSINT_CATALOG_SOURCE,
      cacheAgeMs: Math.max(0, clock() - cacheAt) };
  }
  async function domainReport(input) {
    const domain = validateOsintDomain(input);
    const resolver = resolverFactory();
    const methods = [['A', 'resolve4'], ['MX', 'resolveMx'], ['NS', 'resolveNs'], ['CAA', 'resolveCaa']];
    const checks = await Promise.all(methods.map(async ([type, method]) => {
      try {
        const data = await resolver[method](domain);
        if (!Array.isArray(data) || !data.length) return dnsProof(type, 'NO_DATA');
        const values = data.slice(0, 30).map(v => typeof v === 'string' ? v : v);
        return dnsProof(type, 'OBSERVED', values);
      } catch (e) { return dnsProof(type, 'UNVERIFIED', [], recordError(e)); }
    }));
    const checkedAt = new Date(clock()).toISOString();
    const report = {
      project: 'ASTRA_OSINT_OMEGA', domain, mode: 'passive_dns_read_only',
      checkedAt, checks,
      checkedCount: checks.filter(x => x.status === 'OBSERVED').length,
      status: checks.some(x => x.status === 'OBSERVED') ? 'PARTIAL' : 'UNVERIFIED',
      manualResearch: [
        { name: 'ICANN Lookup', url: 'https://lookup.icann.org/en/lookup' },
        { name: 'Certificate Transparency', url: `https://crt.sh/?q=%25.${encodeURIComponent(domain)}` },
        { name: 'Internet Archive', url: `https://web.archive.org/web/*/https://${domain}/` },
        { name: 'RDAP', url: `https://rdap.org/domain/${domain}` }
      ],
      qualifications: ['DNS answers are time-dependent and do not prove business identity, safety, ranking or ownership.',
        'Research links are suggested destinations, not verified observations. No unsolicited outreach or tracking.']
    };
    return { ...report, proofSha256: sha256(report) };
  }
  return { catalog, domainReport,
    status: () => ({ mode: 'passive_read_only', cost: 'no_paid_api',
      catalogLoaded: Boolean(cached), catalogSource: OSINT_CATALOG_SOURCE,
      cacheAgeMs: cached ? Math.max(0, clock() - cacheAt) : null,
      trackingLinksEnabled: false, faceRecognitionEnabled: false, activeScansEnabled: false }) };
}
