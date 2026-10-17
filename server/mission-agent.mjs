import { createHash } from 'node:crypto';
import { executeExtraction } from './executor.mjs';

export const WORKFLOWS = ['site_audit', 'lead_research', 'web_research'];
export function selectWorkflow(input) {
  if (input == null || input === '') return 'web_research';
  if (!WORKFLOWS.includes(input)) throw new Error('Unsupported workflow');
  return input;
}
function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function domains(links, maxCandidates = 3) {
  const seen = new Set();
  const excluded = /(?:google|facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|pinterest|wikipedia|github|cloudflare|wordpress|mozilla|apple|microsoft|amazon)\./i;
  return (links || []).filter(link => {
    try {
      const url = new URL(link.url);
      if (excluded.test(url.hostname) || seen.has(url.hostname)) return false;
      seen.add(url.hostname);
      return true;
    } catch { return false; }
  }).slice(0, Math.max(1, Math.min(25, maxCandidates)));
}
function auditPage(page) {
  const issues = [];
  if (!page.title) issues.push('Missing title element');
  if (!page.metaDescription) issues.push('Missing meta description');
  if (page.h1Count !== 1) issues.push('Expected one H1, observed ' + page.h1Count);
  if (!page.canonical) issues.push('Missing canonical URL');
  if (!page.lang) issues.push('Missing HTML language');
  return { url: page.url, title: page.title || '', description: page.metaDescription || '', h1Count: page.h1Count ?? 0,
    canonical: page.canonical || null, lang: page.lang || null, robots: page.robots || null,
    jsonLdCount: page.jsonLdCount || 0, issueCount: issues.length, issues, evidence: 'observed_http_html' };
}
function qualify(link, extracted, goal) {
  const first = extracted.pageEvidence?.[0];
  if (!first) return { website: link.url, source: link.source || null, verdict: 'unverified', score: 0,
    evidence: [], errors: extracted.errors || ['No HTML returned'] };
  const corpus = [first.title, first.metaDescription, ...(first.headings || [])].join(' ').toLowerCase();
  const tokens = [...new Set((goal.toLowerCase().match(/[\p{L}]{4,}/gu) || []))]
    .filter(x => !['find','search','research','prospect','prospects','companies','entreprises','pour','avec','dans','from','with','the','and','importers','exporters'].includes(x)).slice(0, 12);
  const matches = tokens.filter(x => corpus.includes(x));
  // No company status is asserted without independent evidence.
  return { website: first.url, source: link.source || null, title: first.title, verdict: matches.length ? 'potential_match' : 'unverified',
    score: matches.length, matchedTerms: matches, evidence: [{ url: first.url, title: first.title, headings: (first.headings || []).slice(0, 8) }],
    errors: extracted.errors || [] };
}
export async function executeMission(task, log = () => {}, crawl = executeExtraction) {
  const workflow = selectWorkflow(task.workflow);
  const steps = [];
  const step = (name, status, detail) => {
    steps.push({ name, status, detail });
    log(name + ': ' + status + ' — ' + detail);
  };
  step('plan', 'PASS', 'Workflow ' + workflow + ', read-only HTTP, bounded crawl, no messages sent');
  const seed = await crawl({ ...task, maxPages: workflow === 'lead_research' ? 3 : 5 }, log);
  if (!seed?.pagesVisited) throw new Error('No verified HTTP evidence available for mission');
  step('collect', 'PASS', seed.pagesVisited + ' pages fetched from seed URL');
  let report;
  if (workflow === 'site_audit') {
    const pages = (seed.pageEvidence || []).map(auditPage);
    report = { pages, totalIssues: pages.reduce((n, page) => n + page.issueCount, 0),
      coverage: pages.length, disclaimer: 'HTML-only technical signals; indexing/ranking are not verified' };
    step('audit', pages.length ? 'PASS' : 'FAIL', report.totalIssues + ' technical observations across ' + pages.length + ' pages');
  } else if (workflow === 'lead_research') {
    const candidates = domains(seed.externalLinks || [], task.maxCandidates || 3);
    const prospects = [];
    for (const candidate of candidates) {
      try {
        log('qualify: fetching candidate ' + candidate.url);
        const evidence = await crawl({ ...task, url: candidate.url, goal: 'observe public company title and headings', maxPages: 1 }, log);
        prospects.push(qualify(candidate, evidence, task.goal));
      } catch (error) {
        prospects.push({ website: candidate.url, source: candidate.source || null, verdict: 'unverified', score: 0,
          evidence: [], errors: [String(error?.message || error)] });
      }
    }
    report = { seed: task.url, prospects, discoveredCandidates: candidates.length,
      potentialMatches: prospects.filter(p => p.verdict === 'potential_match').length,
      unverified: prospects.filter(p => p.verdict === 'unverified').length,
      disclaimer: 'Candidates are not confirmed customers or importers; no contact details invented and no emails sent' };
    step('qualify', 'PASS', prospects.length + ' candidate websites individually checked; negative/unverified retained');
  } else {
    report = { sources: (seed.pageEvidence || []).map(page => ({
      url: page.url, title: page.title, headings: page.headings || [], description: page.metaDescription || '' })),
      outboundEvidence: (seed.externalLinks || []).slice(0, 50),
      errors: seed.errors || [], disclaimer: 'Observed HTML only; no generated unsupported assertions' };
    step('research', 'PASS', report.sources.length + ' first-party source pages recorded');
  }
  step('verify', 'PASS', 'SHA-256 over mission evidence and report');
  const evidenceSha256 = digest({ workflow, seed: seed.pageEvidence, report });
  return { status: 'completed', workflow, goal: task.goal, target: task.url,
    mode: 'deterministic_agent_no_paid_ai', steps, report, evidenceSha256,
    pagesVisited: seed.pagesVisited, completedAt: new Date().toISOString() };
}
