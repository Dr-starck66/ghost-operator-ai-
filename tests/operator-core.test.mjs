import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicIPv4, validateTarget, createStore, extractSite } from '../operator-core.mjs';

test('rejects unsafe address spaces', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.20.1.1', '192.168.0.1', '100.64.0.1', '192.0.2.3', '198.51.100.1', '203.0.113.2', '8.8.8.8:443', '::1']) {
    assert.equal(publicIPv4(address), false, address);
  }
  assert.equal(publicIPv4('8.8.8.8'), true);
});

test('validates public HTTPS URLs without credentials, IP literals, or nonstandard ports', () => {
  for (const address of ['http://example.com', 'https://localhost/', 'https://127.0.0.1', 'https://[::ffff:127.0.0.1]/', 'https://user:pass@example.com/', 'https://example.com:444/', 'https://metadata.google.internal/', 'file:///etc/passwd']) {
    assert.throws(() => validateTarget(address), undefined, address);
  }
  assert.equal(validateTarget('https://example.com/a#x'), 'https://example.com/a');
});

test('persisted store survives restart and requeues incomplete tasks', () => {
  const location = join(mkdtempSync(join(tmpdir(), 'ghost-operator-')), 'tasks.json');
  const store = createStore(location);
  const task = store.add('https://example.com', 'Extract external links');
  store.patch(task.id, { status: 'running' }, '[START]');
  const reopened = createStore(location);
  reopened.recover();
  assert.equal(reopened.get(task.id).status, 'pending');
  assert.ok(readFileSync(location, 'utf8').includes('[RECOVERY]'));
  reopened.patch(task.id, { status: 'completed', result: { ok: true } });
  assert.deepEqual(createStore(location).get(task.id).result, { ok: true });
});

test('crawls same hostname only and preserves link provenance', async () => {
  const fake = async url => {
    if (url === 'https://example.com/') return { title: 'Home', textContent: 'Hello', links: ['/about', 'https://outsider.org/path', 'http://outsider.org/insecure', 'https://example.com.evil.org/'] };
    if (url === 'https://example.com/about') return { title: 'About', textContent: 'More', links: ['https://outsider.org/path'] };
    throw new Error('Cannot fetch external domain');
  };
  const result = await extractSite({url:'https://example.com/', goal:'Extract external links'}, fake);
  assert.equal(result.pages_fetched, 2);
  assert.equal(result.total_unique_external_links, 2);
  const link = result.external_links.find(x => x.url === 'https://outsider.org/path');
  assert.equal(link.found_on.length, 2);
  assert.ok(result.external_links.some(x => x.domain === 'example.com.evil.org'));
  assert.ok(!result.pages.some(x => x.url.includes('evil.org')));
});

test('no fake success when every page fetch fails', async () => {
  await assert.rejects(() => extractSite({url:'https://example.com/', goal:'anything'}, async () => { throw new Error('offline'); }), /No public HTML/);
});
