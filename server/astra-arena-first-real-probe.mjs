/**
 * ASTRA ARENA Ω: an opt-in, SINGLE free-prototype test of the EXISTING
 * authenticated Ghost /api/astra/nemotron route.
 *
 * Does NOT execute model-generated source, alter production sites or publish.
 * The provider call runs on the already-deployed Ghost service using its existing
 * server-side token and key. Persistent O_EXCL pre-claim prevents replays.
 *
 * IMPORTANT: Only enable for an NVIDIA Free Endpoint prototyping entitlement.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = text => createHash('sha256').update(text).digest('hex');
export const PROBE_FILENAME = 'astra-arena-first-real-probe-v1.json';
export const TASK_ID = 'ASTRA-ARENA-NEMOTRON-PROTOTYPE-20261024-V1';
export const MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';
export const PROMPT = [
  'Write a complete Python 3 program. Return ONLY Python code, no Markdown.',
  'For each nonempty stdin line containing JSON {"values":[integers]}, print',
  'exactly one JSON line {"even_sum": N}, where N is the sum of even integers',
  'in values. Zero and negative integers count; booleans do not count.',
  'Use only sys and json, no external modules, no filesystem or network.',
  'Keep code extremely concise (under 180 tokens).',
].join(' ');

const record = (status, more = {}) => ({schema: 'astra-arena-ghost-probe-v1', taskId:TASK_ID,
  model:MODEL, status, promptSha256:sha(PROMPT), ...more});

async function persistAtomic(filename, data) {
  const tmp = `${filename}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', {mode:0o600, flag:'wx'});
  await fs.rename(tmp, filename);
}

async function defaultTransport({port, token, prompt, timeoutMs}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/astra/nemotron`, {
      method:'POST', signal:ctrl.signal,
      headers:{'content-type':'application/json', 'x-ghost-token':token},
      body:JSON.stringify({prompt}),
    });
    if (res.status !== 201) throw Error(`GHOST_HTTP_${res.status}`);
    const json = await res.json();
    if (json?.status !== 'PASS' || json.model !== MODEL ||
        typeof json.answer !== 'string' || !json.answer.trim() ||
        !/^[a-f0-9]{64}$/.test(json.proofSha256 || '') ||
        !/^nemotron_[0-9a-f]+$/.test(json.missionId || '')) throw Error('INVALID_GHOST_PROOF');
    return json;
  } finally {clearTimeout(timer)}
}

/** Runs AT MOST ONCE for a persistent /data path; never retries timeouts. */
export async function firstRealArenaProbe({dataDir, port, token, configured,
  freePrototypeEnabled, transport=defaultTransport, log=console.log} = {}) {
  if (!freePrototypeEnabled) return {status:'SKIPPED', reason:'FREE_PROTOTYPE_OPT_IN_DISABLED'};
  if (!token || !configured) return {status:'UNVERIFIED', reason:'EXISTING_GHOST_CREDENTIALS_NOT_CONFIGURED'};
  if (!dataDir || !Number.isSafeInteger(port) || port<1 || port>65535)
    return {status:'UNVERIFIED', reason:'INVALID_GHOST_RUNTIME'};
  await fs.mkdir(dataDir,{recursive:true});
  const filename=path.join(dataDir,PROBE_FILENAME);
  let handle;
  try {
    handle=await fs.open(filename,'wx',0o600); // persisted BEFORE outbound call; no retry on crash
    await handle.writeFile(JSON.stringify(record('CLAIMED', {claimedAt:new Date().toISOString()}))+'\n');
    await handle.sync();
  } catch(err) {
    if(err?.code==='EEXIST') {
      const previous=JSON.parse(await fs.readFile(filename,'utf8'));
      return {status:'SKIPPED', reason:'ONESHOT_ALREADY_CLAIMED', previousStatus:previous.status};
    }
    throw err;
  } finally {if(handle) await handle.close()}
  const attemptedAt=new Date().toISOString();
  try {
    const response=await transport({port,token,prompt:PROMPT,timeoutMs:52000});
    // Provider output is untrusted text. Never evaluate it on the app server.
    if (response?.status !== 'PASS' || response.model !== MODEL ||
        typeof response.answer !== 'string' || !response.answer.trim() ||
        !/^[a-f0-9]{64}$/.test(response.proofSha256 || '') ||
        !/^nemotron_[0-9a-f]+$/.test(response.missionId || '')) throw Error('INVALID_GHOST_PROOF');
    const answer=response.answer;
    const proof=record('PASS',{
      attemptedAt, completedAt:new Date().toISOString(),
      ghostMissionId:response.missionId,
      ghostProofSha256:response.proofSha256,
      responseSha256:sha(answer),
      responseUtf8Base64:Buffer.from(answer,'utf8').toString('base64'),
      usage:response.usage || null,
      qualification:'Verified upstream Ghost HTTP receipt only. Code is NOT executed here; isolated test pending.',
    });
    // Durable receipt before logging, safe to recover after restart.
    await persistAtomic(filename,proof);
    log('ASTRA_ARENA_FIRST_REAL '+JSON.stringify(proof));
    return {status:'PASS', receipt:proof};
  } catch(error) {
    const reason=/^GHOST_HTTP_\d{3}$/.test(String(error.message)) ? error.message :
      'PROVIDER_OR_PERSISTENCE_FAILURE';
    const result=record('FAIL',{attemptedAt,failedAt:new Date().toISOString(),reason,
      qualification:'Request may have reached provider. No automatic retry.'});
    try {await persistAtomic(filename,result)} catch { /* preserve CLAIMED if persistence fails */ }
    log('ASTRA_ARENA_FIRST_REAL '+JSON.stringify(result));
    return {status:'FAIL', receipt:result};
  }
}