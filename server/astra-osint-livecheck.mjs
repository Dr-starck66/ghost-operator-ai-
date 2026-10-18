/**
 * ASTRA OSINT Ω production HTTP audit.
 * Makes REAL localhost HTTP requests through Express' existing auth middleware.
 * No credential is logged, sent outside the container or persisted.
 */
import { createHash } from 'node:crypto';

export async function verifyOsintHttp({
  baseUrl, token, fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString()
}) {
  const observations = {};
  const startedAt = now();
  const result = {
    source: 'localhost_http_e2e', startedAt, status: 'UNVERIFIED',
    checks: observations, httpVerified: false, externalDnsObserved: false,
    upstreamCatalogVerified: false
  };
  if (!token || typeof token !== 'string') {
    result.reason = 'GHOST_ADMIN_TOKEN_UNAVAILABLE';
    return result;
  }
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(baseUrl))
    throw new Error('LOCAL_LOOPBACK_ONLY');
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_UNAVAILABLE');
  const request = async (path, { method = 'GET', body, credential = 'valid' } = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    timeout.unref?.();
    try {
      const headers = { accept: 'application/json' };
      if (body) headers['content-type'] = 'application/json';
      if (credential === 'valid') headers['x-ghost-token'] = token;
      if (credential === 'wrong') headers['x-ghost-token'] = 'ASTRA_OSINT_NEGATIVE_CONTROL_INVALID_TOKEN';
      const response = await fetchImpl(baseUrl + path, {
        method, headers, signal: controller.signal, redirect: 'error',
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      let data;
      try { data = await response.json(); } catch { data = {}; }
      return { status: response.status, data };
    } finally { clearTimeout(timeout); }
  };
  try {
    const unauth = await request('/api/astra/osint/status', { credential: 'missing' });
    const wrong = await request('/api/astra/osint/status', { credential: 'wrong' });
    const auth = await request('/api/astra/osint/status');
    const badInput = await request('/api/astra/osint/domain', {
      method: 'POST', body: { domain: 'localhost' }
    });
    observations.noToken = unauth.status === 401;
    observations.wrongToken = wrong.status === 401;
    observations.validToken = auth.status === 200 &&
      auth.data?.mode === 'passive_read_only' &&
      auth.data?.trackingLinksEnabled === false;
    observations.unsafeTargetRejected = badInput.status === 400;
    const securityPass = observations.noToken && observations.wrongToken &&
      observations.validToken && observations.unsafeTargetRejected;
    if (!securityPass) {
      result.status = 'FAIL';
      result.reason = 'HTTP_AUTH_OR_VALIDATION_CONTROL_FAILED';
      return result;
    }
    result.httpVerified = true;
    const dns = await request('/api/astra/osint/domain', {
      method: 'POST', body: { domain: 'example.com' }
    });
    observations.dnsEndpoint = dns.status === 200 &&
      dns.data?.domain === 'example.com' &&
      /^[a-f0-9]{64}$/.test(dns.data?.proofSha256 || '') &&
      Array.isArray(dns.data?.checks) && dns.data.checks.length === 4;
    result.externalDnsObserved = observations.dnsEndpoint &&
      dns.data?.checks?.some(c => c.status === 'OBSERVED');
    result.dnsRecordTypesObserved = observations.dnsEndpoint ?
      dns.data.checks.filter(c => c.status === 'OBSERVED').map(c => c.recordType) : [];
    const catalog = await request('/api/astra/osint/catalog?category=business&limit=5');
    observations.catalogEndpoint = catalog.status === 200 &&
      catalog.data?.category === 'business' &&
      Array.isArray(catalog.data.tools) && catalog.data.total > 0 &&
      catalog.data.tools.every(t => t.pricing === 'free' &&
        t.interaction === 'external_link_only');
    result.upstreamCatalogVerified = observations.catalogEndpoint;
    result.catalogMatchCount = observations.catalogEndpoint ? catalog.data.total : 0;
    result.status = observations.dnsEndpoint && result.externalDnsObserved &&
      observations.catalogEndpoint ? 'PASS' : 'PARTIAL';
    if (result.status !== 'PASS') result.reason = 'EXTERNAL_SOURCE_OR_DNS_INCOMPLETE';
  } catch (error) {
    result.status = result.httpVerified ? 'PARTIAL' : 'FAIL';
    result.reason = /AbortError/.test(String(error?.name)) ? 'TIMEOUT' :
      String(error?.code || error?.name || 'HTTP_PROBE_FAILED').slice(0, 80);
  }
  return result;
}

export function sealOsintProof(record) {
  const proof = { ...record, checkedAt: new Date().toISOString() };
  return { ...proof, proofSha256: createHash('sha256')
    .update(JSON.stringify(proof)).digest('hex') };
}
