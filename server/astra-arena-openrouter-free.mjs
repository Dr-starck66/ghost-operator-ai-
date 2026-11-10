/**
 * ASTRA-281 — independent OpenRouter no-cost Inkling 2 Small connector.
 * Fail closed unless the official EU permission, exact $0 catalog and public
 * benchmark task are independently verified. This code never reads Gmail and
 * never transports an API key between services. No paid fallback, no retries.
 *
 * The TML Free Research API logs and trains on prompts and output; send only
 * public, synthetic ASTRA ARENA tasks, never customer data or proprietary code.
 */
import { TASKS, promptFor, taskFingerprint } from './astra-arena-inkling-benchmark.mjs';

export const OPENROUTER_MODEL = 'thinkingmachines/inkling-2-small:free';
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const timeoutSignal = ms => AbortSignal.timeout(ms);
const isStrictZero = value => (typeof value === 'string' && /^0(?:\.0+)?$/.test(value)) || value === 0;

/** Only public metadata, no secret and no inference. */
export async function probeFreeModelCatalog({ fetchImpl = fetch, timeoutMs = 10000, checkedAt = new Date().toISOString() } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw Error('INVALID_TIMEOUT');
  try {
    const response = await fetchImpl(OPENROUTER_MODELS_URL, {
      method: 'GET', headers: { accept: 'application/json' }, signal: timeoutSignal(timeoutMs)
    });
    if (response.status !== 200) return { status: 'UNVERIFIED', reason: 'CATALOG_HTTP_' + response.status, modelId: OPENROUTER_MODEL, inferenceAllowed: false };
    const data = await response.json();
    const model = Array.isArray(data?.data) && data.data.find(item => item?.id === OPENROUTER_MODEL);
    if (!model) return { status: 'UNVERIFIED', reason: 'FREE_MODEL_NOT_IN_CATALOG', modelId: OPENROUTER_MODEL, inferenceAllowed: false };
    if (!isStrictZero(model.pricing?.prompt) || !isStrictZero(model.pricing?.completion)) {
      return { status: 'FAIL', reason: 'NONZERO_OR_UNKNOWN_PRICE', modelId: OPENROUTER_MODEL, inferenceAllowed: false };
    }
    return { status: 'PASS_FREE_CATALOG', reason: 'PUBLIC_EXACT_ID_ZERO_INPUT_OUTPUT', modelId: OPENROUTER_MODEL, checkedAt, prices: { prompt: '0', completion: '0' }, inferenceAllowed: false };
  } catch {
    return { status: 'UNVERIFIED', reason: 'CATALOG_NETWORK_OR_PARSE_FAILURE', modelId: OPENROUTER_MODEL, inferenceAllowed: false };
  }
}

function isFreshZeroProof(proof, now) {
  if (!proof || proof.status !== 'PASS_FREE_CATALOG' || proof.modelId !== OPENROUTER_MODEL || proof.inferenceAllowed !== false) return false;
  if (!isStrictZero(proof.prices?.prompt) || !isStrictZero(proof.prices?.completion)) return false;
  const checked = Date.parse(proof.checkedAt);
  return Number.isFinite(checked) && checked <= now && now - checked <= 3600000; // one hour
}

function authorizedEu(authorization) {
  if (!authorization || authorization.officialProviderConfirmed !== true || authorization.euStandardEndpointPermitted !== true) return false;
  if (typeof authorization.writtenReference !== 'string' || authorization.writtenReference.length < 8) return false;
  return true; // caller must retain proof of the provider's written permission
}

function publicArenaTask({prompt,taskId,promptSha256}) {
  return TASKS.some(t => t.id === taskId && prompt === promptFor(t) && promptSha256 === taskFingerprint(t));
}

/**
 * A runner is injectable into runPairedArena only AFTER explicit permission.
 * It NEVER acquires, loads, logs or transports credentials. Caller passes a key
 * only from the SAME authorized execution environment (e.g. process.env).
 */
export function makeOpenRouterFreeRunner({
  apiKey, authorization, freeCatalogProof, acceptedResearchDataTerms = false,
  fetchImpl = fetch, now = Date.now, timeoutMs = 45000
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) throw Error('INVALID_TIMEOUT');
  return async (task) => {
    if (!authorizedEu(authorization)) throw Error('EU_AUTHORIZATION_NOT_CONFIRMED');
    if (acceptedResearchDataTerms !== true) throw Error('RESEARCH_DATA_TERMS_NOT_ACCEPTED');
    if (!isFreshZeroProof(freeCatalogProof, now())) throw Error('NO_FRESH_FREE_PRICE_PROOF');
    if (!publicArenaTask(task || {})) throw Error('ONLY_SYNTHETIC_ARENA_TASKS_ALLOWED');
    if (typeof apiKey !== 'string' || !/^sk-or-(?:v1-)?[A-Za-z0-9_-]{24,}$/.test(apiKey)) throw Error('RUNTIME_KEY_MISSING');
    let response;
    try {
      response = await fetchImpl(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: { 'authorization': 'Bearer ' + apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [{role: 'system', content: 'You are participating in a public, synthetic evaluation of AI agents. Only respond to the evaluation task.'},
                     {role: 'user', content: task.prompt}],
          max_tokens: 128,
          stream: false,
          provider: { allow_fallbacks: false },
          usage: { include: true }
        }),
        signal: timeoutSignal(timeoutMs)
      });
    } catch { throw Error('OPENROUTER_NETWORK_OR_TIMEOUT_NO_RETRY'); }
    if (!response || response.status !== 200) {
      const reason = response?.status === 403 ? 'OPENROUTER_ACCESS_DENIED_NO_RETRY' : 'OPENROUTER_HTTP_' + (response?.status ?? 'INVALID');
      throw Error(reason);
    }
    let data;
    try {data = await response.json()} catch {throw Error('OPENROUTER_BAD_RESPONSE')}
    const model = data?.model;
    if (model !== OPENROUTER_MODEL && model !== 'thinkingmachines/inkling-2-small') throw Error('OPENROUTER_WRONG_MODEL');
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim() || answer.length > 20000) throw Error('OPENROUTER_EMPTY_OR_UNTRUSTED_RESPONSE');
    const price = data?.usage?.cost;
    if (price !== undefined && price !== null && (!Number.isFinite(Number(price)) || Number(price) !== 0)) throw Error('OPENROUTER_NONZERO_COST_REPORTED');
    return {answer: answer.trim(), responseId: typeof data.id === 'string' ? data.id : null,
      providerModel: model, costVerified: price !== undefined && price !== null && Number(price) === 0};
  };
}

if (process.argv[1]?.endsWith('/astra-arena-openrouter-free.mjs')) {
  const status = await probeFreeModelCatalog();
  console.log(JSON.stringify(status, null, 2));
}
