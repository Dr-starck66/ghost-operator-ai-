/**
 * ASTRA-281 official Inkling 2 Small release + EU policy preflight.
 * Read-only, no model inference, no account credentials, no auto-retry.
 * A public repository is NOT evidence of zero-cost inference or model quality.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SOURCES = Object.freeze({
  model: 'https://huggingface.co/api/models/thinkingmachines/Inkling-2-Small',
  opencode: 'https://opencode.ai/docs/console/models',
  announcement: 'https://thinkingmachines.ai/news/inkling-2-small/'
});
const EXPECTED_ID = 'thinkingmachines/Inkling-2-Small';
const sha256 = text => createHash('sha256').update(text).digest('hex');

function resultOfHttp(response) {
  if (!response || typeof response.status !== 'number') throw Error('INVALID_RESPONSE');
  return response.status;
}

async function readResponse(response, maxBytes = 3_000_000) {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw Error('OVERSIZE_RESPONSE');
  const text = await response.text();
  if (text.length > maxBytes) throw Error('OVERSIZE_RESPONSE');
  return text;
}

export function analyzeHuggingFaceStatus(httpStatus, body) {
  if (httpStatus === 404) return {status:'NOT_PUBLISHED', evidence:'OFFICIAL_HF_MODEL_404'};
  if (httpStatus !== 200) return {status:'UNVERIFIED', evidence:'HF_HTTP_'+httpStatus};
  let metadata;
  try {metadata=JSON.parse(body);} catch {return {status:'UNVERIFIED', evidence:'HF_INVALID_JSON'}}
  if (metadata?.id !== EXPECTED_ID) return {status:'UNVERIFIED', evidence:'WRONG_REPOSITORY_ID'};
  const files=Array.isArray(metadata.siblings) ? metadata.siblings.map(v=>String(v?.rfilename||'')) : [];
  const candidates=files.filter(v=>/\.(?:safetensors|gguf|pt|bin)$/i.test(v) && !/^(?:optimizer|rng_state|training_args)/i.test(v));
  const license = metadata.cardData?.license || metadata.license || null;
  if (!candidates.length) return {status:'UNVERIFIED',evidence:'NO_PUBLIC_WEIGHT_FILES_IN_METADATA',license};
  if (license !== 'apache-2.0') return {status:'UNVERIFIED',evidence:'LICENSE_NOT_APACHE_2_0',license};
  return {status:'PUBLIC_WEIGHTS_METADATA_PASS',evidence:'EXACT_OFFICIAL_REPO_APACHE2_WITH_WEIGHT_FILES',license,
    fileCount:candidates.length,filesSha256:sha256(candidates.sort().join('\n'))};
}

export function analyzeOpenCodeEuPolicy(httpStatus, html) {
  if (httpStatus !== 200) return {status:'UNVERIFIED',evidence:'OPENCODE_HTTP_'+httpStatus};
  const normalized=String(html).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
  const phrase='Inkling 2 Small Free is free on OpenCode';
  const at=normalized.indexOf(phrase);
  if(at < 0) return {status:'UNVERIFIED',evidence:'EU_POLICY_TEXT_NOT_FOUND'};
  // The same model paragraph may describe unrelated model restrictions later.
  const nearby=normalized.slice(at,at+550).split(/(?:Crouton Alpha Free|Beam Free|Flint 40B Free)/)[0];
  if (/not available in the European Union/i.test(nearby))
    return {status:'BLOCKED_EU',evidence:'OFFICIAL_EU_EXCLUSION'};
  return {status:'UNVERIFIED',evidence:'NO_EXPLICIT_EU_APPROVAL'};
}

export async function officialPreflight({fetchFn=fetch,now=new Date().toISOString(),timeoutMs=10_000}={}) {
  if(typeof fetchFn !== 'function') throw Error('INVALID_FETCH');
  if(!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30_000) throw Error('INVALID_TIMEOUT');
  const results={};
  for (const [key,url] of Object.entries({model:SOURCES.model,opencode:SOURCES.opencode})) {
    try {
      const response=await fetchFn(url,{method:'GET',headers:{accept:key==='model'?'application/json':'text/html'},signal:AbortSignal.timeout(timeoutMs)});
      const status=resultOfHttp(response);
      const body=status===404?'':await readResponse(response);
      results[key]=key==='model' ? analyzeHuggingFaceStatus(status,body) : analyzeOpenCodeEuPolicy(status,body);
      results[key].httpStatus=status;
      results[key].contentSha256=sha256(body);
    } catch(err) {
      results[key]={status:'UNVERIFIED',evidence:'FETCH_OR_READ_FAILURE',errorType:String(err?.name||'Error')};
    }
  }
  return {
    schema:'astra-inkling-official-access-preflight-v1',
    checkedAt:now,
    sources:SOURCES,
    weights:results.model,
    euFreeAccess:results.opencode,
    inferenceAllowed:false,
    rationale:'Only explicit provider authorization and independent zero-cost proof can unlock a later live inference; this program NEVER makes model calls.',
    cost:'no model inference or new subscription'
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const report=await officialPreflight();
  console.log(JSON.stringify(report,null,2));
  if(report.weights.status==='UNVERIFIED'||report.euFreeAccess.status==='UNVERIFIED') process.exitCode=2;
}
