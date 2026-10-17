import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMission, selectWorkflow } from '../server/mission-agent.mjs';

const seed = { pagesVisited: 2, pageEvidence: [
  { url: 'https://directory.example/', title: 'Wine import', metaDescription: '', h1Count: 2,
    canonical: null, lang: 'en', jsonLdCount: 0, headings: ['Wine importers'] }],
  externalLinks: [{ url: 'https://merchant.example/', source: 'https://directory.example/' }],
  errors: [] };
const candidate = { pagesVisited: 1, pageEvidence: [
  { url: 'https://merchant.example/', title: 'French wine company', metaDescription: 'Occitanie wines',
    headings: ['Wine importer', 'Occitanie selections'] } ], externalLinks: [], errors: [] };
test('workflows reject unsupported inputs', () => {
  assert.equal(selectWorkflow(), 'web_research');
  assert.throws(() => selectWorkflow('send_emails'), /Unsupported/);
});
test('SEO mission produces evidenced issues and integrity hash', async () => {
  const result = await executeMission({url: 'https://directory.example/', goal: 'SEO', workflow: 'site_audit'}, () => {}, async () => seed);
  assert.equal(result.status, 'completed');
  assert.equal(result.report.pages[0].issueCount, 3);
  assert.equal(result.evidenceSha256.length, 64);
  assert.equal(result.steps.at(-1).name, 'verify');
});
test('lead research uses actual candidate fetch, keeps rejected and unverified separate', async () => {
  const visited = [];
  const result = await executeMission({url: 'https://directory.example/', goal: 'wine Occitanie', workflow: 'lead_research'},
    () => {}, async task => { visited.push(task.url); return task.url.includes('merchant.') ? candidate : seed; });
  assert.deepEqual(visited, ['https://directory.example/', 'https://merchant.example/']);
  assert.equal(result.report.potentialMatches, 1);
  assert.equal(result.report.prospects[0].evidence[0].url, 'https://merchant.example/');
});
test('no seed HTTP observation means no false success', async () => {
  await assert.rejects(executeMission({url: 'https://empty.example/', goal: 'research'}, () => {}, async () => ({pagesVisited: 0})), /No verified/);
});
test('candidate error is retained as unverified without abandoning other evidence', async () => {
  const result = await executeMission({url: 'https://directory.example/', goal: 'wine', workflow: 'lead_research'}, () => {},
    async task => { if (task.url.includes('merchant.')) throw Error('DNS refused'); return seed; });
  assert.equal(result.report.unverified, 1);
  assert.match(result.report.prospects[0].errors[0], /DNS refused/);
});
