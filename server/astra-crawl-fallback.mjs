// ASTRA CRAWL Ω: deterministic fallback to the existing independent crawler.
// Fail closed: no fabricated page observations.
export const DEFAULT_ASTRA_CRAWLER_URL = 'https://astra-crawler-omega-prod-production.up.railway.app';

export async function crawlWithAstra(task, log = () => {}, fetchImpl = globalThis.fetch) {
  const base = (process.env.ASTRA_CRAWLER_OMEGA_URL || DEFAULT_ASTRA_CRAWLER_URL).replace(/\/+$/, '');
  if (!base.startsWith('https://') || !/^https:\/\/[^/?#]+$/.test(base)) throw new Error('ASTRA crawler endpoint must be an HTTPS origin');
  const target = new URL(task.url);
  if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) throw new Error('ASTRA crawler: unsafe URL');
  const maxPages = Math.max(1, Math.min(5, Number(task.maxPages) || 3));
  const response = await fetchImpl(base + '/api/crawl', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({ url: target.href, maxPages, maxDepth: 1 }),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('ASTRA crawler HTTP ' + response.status);
  const data = await response.json();
  if (data?.schema !== 'astra-crawler-omega/v1' || !Array.isArray(data.results)) throw new Error('ASTRA crawler: invalid response schema');
  const pages = data.results.filter(p =>
    p && Number.isInteger(p.status) && p.status >= 200 && p.status < 300 &&
    typeof p.finalUrl === 'string' && /^https?:\/\//.test(p.finalUrl) &&
    (p.title || p.metaDescription || (Array.isArray(p.h1s) && p.h1s.length))
  ).slice(0, maxPages);
  if (!pages.length) throw new Error('ASTRA crawler: no verified HTML page evidence');
  const external = [];
  const seen = new Set();
  const origin = target.origin;
  for (const page of pages) {
    for (const href of (Array.isArray(page.links) ? page.links : [])) {
      try {
        const u = new URL(href);
        if (!['http:', 'https:'].includes(u.protocol) || u.origin === origin || seen.has(u.href)) continue;
        seen.add(u.href);
        external.push({ url: u.href, source: page.url, anchor: '' });
      } catch { /* Invalid URLs never enter evidence. */ }
    }
  }
  const pageEvidence = pages.map(page => ({
    url: page.finalUrl, title: page.title || '',
    headings: Array.isArray(page.h1s) ? page.h1s : [],
    metaDescription: page.metaDescription || '', canonical: page.canonical || null,
    robots: page.robotsMeta || null, lang: null,
    h1Count: Array.isArray(page.h1s) ? page.h1s.length : 0,
    jsonLdCount: null
  }));
  log('ASTRA CRAWLER OMEGA fallback: ' + pages.length + ' HTTP page(s) with observed SEO evidence');
  return {
    status: 'completed', mode: 'astra_crawler_omega_remote_fallback', goal: task.goal,
    pagesVisited: pages.length, uniqueExternalLinks: external.length,
    results: pageEvidence.flatMap(page => page.headings.map(title => ({ title, source_url: page.url }))),
    pages: pageEvidence.map(p => ({ url: p.url, title: p.title, headings: p.headings })),
    pageEvidence, externalLinks: external.slice(0, 150),
    errors: ['Primary local HTTP extraction failed; ASTRA remote crawl used. Some fields (lang, JSON-LD count, body text) were not supplied by crawler.']
  };
}
