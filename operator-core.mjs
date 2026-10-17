import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isIP } from 'node:net';

export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function validateTarget(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('A public HTTPS URL is required.');
  let url;
  try { url = new URL(input); } catch { throw new Error('Invalid URL.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(host) ||
      host === 'localhost' || host.includes(':') || host.endsWith('.') || !host.includes('.') ||
      /\.(localhost|local|internal|test|invalid|example|onion)$/.test(host)) {
    throw new Error('Only public HTTPS domain names without credentials or custom ports are accepted.');
  }
  url.hash = '';
  return url.href;
}

export function createStore(filename) {
  let tasks = {};
  try {
    const parsed = JSON.parse(readFileSync(filename, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid task store');
    tasks = parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error; // Never silently overwrite damaged history.
  }
  function persist() {
    mkdirSync(dirname(filename), { recursive: true });
    const temp = filename + '.' + process.pid + '.tmp';
    writeFileSync(temp, JSON.stringify(tasks, null, 2), { mode: 0o600 });
    renameSync(temp, filename);
  }
  function patch(id, delta, log) {
    const task = tasks[id];
    if (!task) throw new Error('Task not found.');
    Object.assign(task, delta, { updatedAt: Date.now() });
    if (log) task.logs = [...(task.logs || []), new Date().toISOString() + ' - ' + log].slice(-200);
    persist();
    return task;
  }
  return {
    add(url, goal) {
      if (Object.keys(tasks).length >= 1000) throw new Error('Task history limit reached; archive history before adding more.');
      const id = 'task_' + randomUUID();
      const task = { id, url: validateTarget(url), goal, status: 'pending', createdAt: Date.now(),
        updatedAt: Date.now(), logs: ['Task registered for server execution.'] };
      tasks[id] = task;
      persist();
      return task;
    },
    get: id => tasks[id] || null,
    list: () => Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt),
    patch,
    recover() {
      for (const task of Object.values(tasks)) {
        if (task.status === 'running') {
          task.status = 'pending';
          task.logs = [...(task.logs || []), new Date().toISOString() + ' - [RECOVERY] Interrupted task requeued.'].slice(-200);
        }
      }
      persist();
    },
  };
}

export async function extractSite(task, fetchPage, onProgress = (_message) => {}) {
  const seed = validateTarget(task.url);
  const originHost = new URL(seed).hostname;
  const queue = [seed];
  const visited = new Set();
  const pages = [];
  const external = new Map();
  const errors = [];
  while (queue.length && visited.size < 5) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    onProgress('[OBSERVE] Fetching ' + url);
    try {
      const data = await fetchPage(url);
      const rawLinks = Array.isArray(data.links) ? data.links.slice(0, 500) : [];
      pages.push({ url, title: String(data.title || '').slice(0, 250), excerpt: String(data.textContent || '').slice(0, 3500) });
      for (const href of rawLinks) {
        let link;
        try { link = validateTarget(new URL(href, url).href); } catch { continue; }
        if (new URL(link).hostname === originHost) {
          if (!visited.has(link) && !queue.includes(link) && queue.length < 25) queue.push(link);
        } else if (external.size < 300) {
          const record = external.get(link) || { url: link, domain: new URL(link).hostname, found_on: [] };
          if (!record.found_on.includes(url)) record.found_on.push(url);
          external.set(link, record);
        }
      }
    } catch (error) {
      errors.push({ url, error: String(error.message || error).slice(0, 250) });
      onProgress('[WARNING] ' + url + ': ' + String(error.message || error).slice(0, 120));
    }
  }
  if (!pages.length) throw new Error('No public HTML page could be extracted.');
  const requestedLinks = /liens?|links?|affiliate|affili|backlinks?/i.test(task.goal);
  return {
    extraction_mode: 'deterministic_no_paid_AI',
    goal: task.goal,
    goal_coverage: requestedLinks ? 'links_extracted_not_AI_classified' : 'metadata_only_not_full_goal_validation',
    pages_fetched: pages.length,
    pages,
    external_links: [...external.values()],
    total_unique_external_links: external.size,
    warnings: [
      'Only public HTML and HTTPS URLs are processed; no actions on target sites are performed.',
      'Results are evidence for review, not a claim that the natural-language goal was fully completed.',
    ],
    errors,
  };
}
