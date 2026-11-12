/**
 * ASTRA ARENA Ω / Inkling 2 Small vs existing Nemotron — zero-cost, fail-closed.
 * Reuses the Nemotron adapter already deployed in this repository.
 * No new cron, provider account, browser automation or generated-code execution.
 * Only a confirmed NO-COST entitlement for BOTH competitors unlocks live calls.
 * The test suite verifies structured answers, not code execution capability.
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { invokeNemotron, NEMOTRON_MODEL } from './nemotron.mjs';

export const MODELS = Object.freeze({
  nemotron: NEMOTRON_MODEL,
  inkling: 'Inkling 2 Small (Thinking Machines / Tinker)',
});

const instruction = 'Réponds UNIQUEMENT avec un objet JSON valide, sans Markdown ni explication. Respecte exactement les clés demandées.';

export const TASKS = Object.freeze([
  {
    id: 'seo-indexability-01', domain: 'SEO',
    prompt: `Tu dois soumettre les URL HTML indexables uniquement. Données: [{"url":"/fr/paris","status":200,"noindex":false,"canonical":"/fr/paris"},{"url":"/fr/lyon","status":404,"noindex":false,"canonical":"/fr/lyon"},{"url":"/fr/nice","status":200,"noindex":true,"canonical":"/fr/nice"},{"url":"/fr/lille","status":200,"noindex":false,"canonical":"/fr/paris"}]. Format exact {"submit":[chemins]}.`,
    expected: {submit:['/fr/paris']},
  },
  {
    id: 'seo-preserve-routes-02', domain: 'SEO',
    prompt: 'Migration: URL historique /fr/old-hotel doit aboutir à /fr/nice/hotel-pas-cher (HTTP 200). Réponds {"redirect_status":entier,"source":texte,"destination":texte}. Choisis une redirection SEO permanente, sans changer la destination.',
    expected: {redirect_status:301,source:'/fr/old-hotel',destination:'/fr/nice/hotel-pas-cher'},
  },
  {
    id: 'agent-incidents-03', domain: 'Agents',
    prompt: 'Une CI GitHub échoue avant toute étape: runner_id=0, journal inaccessible. Aucun build n’a été exécuté. Réponds {"build_passed":booléen,"proof":texte}. proof doit être exactement "UNVERIFIED" quand aucun test de build n’est prouvé.',
    expected: {build_passed:false,proof:'UNVERIFIED'},
  },
  {
    id: 'agent-dedup-04', domain: 'Agents',
    prompt: 'Deux incidents actifs ont le même identifiant stable "deploy-42". Une relance de la même opération risque de coûter des appels. Donne le nombre de nouvelles exécutions autorisées par défaut sans preuve de non-doublon, sous forme {"new_calls":entier}.',
    expected: {new_calls:0},
  },
  {
    id: 'science-controls-05', domain: 'Science',
    prompt: 'Une expérience omet les contrôles négatifs et n’a que deux cellules d’un seul donneur. Peut-on conclure à une découverte reproductible chez l’humain ? Réponds {"reproducible_claim":booléen,"needs_independent_donors":booléen}.',
    expected: {reproducible_claim:false,needs_independent_donors:true},
  },
  {
    id: 'science-causality-06', domain: 'Science',
    prompt: 'Un biomarqueur X est corrélé à Y (r=0,9), sans randomisation ni contrôle des facteurs confondants. Réponds {"causality_proven":booléen,"correlation_reported":booléen}.',
    expected: {causality_proven:false,correlation_reported:true},
  },
  {
    id: 'logic-even-sum-07', domain: 'Calcul',
    prompt: 'Calculer la somme des entiers pairs parmi [2, -4, 7, 0, true, 8, -3, 6]. Les booléens ne sont pas des entiers. Réponds {"even_sum":entier}.',
    expected: {even_sum:12},
  },
  {
    id: 'logic-unique-08', domain: 'Calcul',
    prompt: 'Dans cet ordre: ["URL-2","URL-1","URL-2","URL-3","URL-1"], garder la première occurrence de chaque ID. Réponds {"ids":[chaînes]} avec l’ordre préservé.',
    expected: {ids:['URL-2','URL-1','URL-3']},
  },
]);

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const promptFor = task => `${instruction}\n\nTâche ${task.id}: ${task.prompt}`;
export const taskFingerprint = task => sha256(promptFor(task));

function sameValue(a,b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v,i)=>sameValue(v,b[i]));
  if (typeof a !== 'object') return false;
  const ak=Object.keys(a).sort(), bk=Object.keys(b).sort();
  return ak.length === bk.length && ak.every((k,i)=>k===bk[i] && sameValue(a[k],b[k]));
}

function parseAnswer(output) {
  if (typeof output !== 'string' || !output.trim()) return {valid:false,reason:'EMPTY_OUTPUT'};
  let parsed;
  try {parsed=JSON.parse(output);} catch {return {valid:false,reason:'INVALID_JSON'}}
  if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) return {valid:false,reason:'NOT_OBJECT'};
  return {valid:true,value:parsed};
}

/** Scores actual submitted outputs; never evaluates or executes their contents. */
export function scoreTranscript(attempts, tasks=TASKS) {
  if (!Array.isArray(attempts)) throw new TypeError('attempts must be an array');
  const ids=new Set(tasks.map(t=>t.id));
  if (ids.size!==tasks.length) throw new Error('DUPLICATE_BENCHMARK_TASK_ID');
  const duplicates=new Set(), seen=new Set();
  for (const item of attempts) {
    if (!ids.has(item?.taskId)) throw new Error('UNKNOWN_TASK_ID');
    if (seen.has(item.taskId)) duplicates.add(item.taskId);
    seen.add(item.taskId);
  }
  if (duplicates.size) throw new Error('DUPLICATE_ATTEMPT');
  const byId=new Map(attempts.map(x=>[x.taskId,x]));
  const rows=tasks.map(task=>{
    const attempt=byId.get(task.id);
    if (!attempt) return {taskId:task.id,domain:task.domain,status:'MISSING',correct:false,promptSha256:taskFingerprint(task)};
    if (attempt.promptSha256 !== taskFingerprint(task))
      return {taskId:task.id,domain:task.domain,status:'PROMPT_MISMATCH',correct:false,promptSha256:taskFingerprint(task)};
    const answer=parseAnswer(attempt.output);
    const correct=answer.valid && sameValue(answer.value,task.expected);
    return {taskId:task.id,domain:task.domain,status: !answer.valid?answer.reason:(correct?'CORRECT':'INCORRECT'),correct,promptSha256:taskFingerprint(task),responseSha256: typeof attempt.output==='string'?sha256(attempt.output):null};
  });
  const correct=rows.filter(x=>x.correct).length;
  return {schema:'astra-arena-v1',total:tasks.length,correct,coverage:seen.size,accuracyPct: Math.round(10000*correct/tasks.length)/100,rows};
}

/** Actual provider models are represented only by runtime-supplied runners.
 * Refuse ALL outbound calls unless TWO free prototype entitlements are confirmed.
 * A runner can be a test double; its output alone is NOT independent provider proof.
 */
export async function runPairedArena({runners={},freeEntitlements={},tasks=TASKS,liveEnabled=false,emitPublicTranscripts=false}={}) {
  // Public evidence export is opt-in and restricted to the pinned synthetic task objects.
  if (emitPublicTranscripts && !(Array.isArray(tasks) && tasks.length===TASKS.length && tasks.every((task,i)=>task===TASKS[i]))) throw Error('ONLY_REFERENCE_PUBLIC_TASKS_MAY_BE_EXPORTED');
  const names=['nemotron','inkling'];
  const ready=liveEnabled===true && names.every(n=>freeEntitlements[n]===true && typeof runners[n]==='function');
  if (!ready) return {schema:'astra-arena-v1',status:'UNVERIFIED',reason:'LIVE_TWO_MODEL_ZERO_COST_GATE_NOT_SATISFIED',liveCalls:0,
    models:names.map(n=>({name:n,runnerConfigured:typeof runners[n]==='function',freeEntitlementConfirmed:freeEntitlements[n]===true})),
    taskIds:tasks.map(t=>t.id),fingerprints:tasks.map(t=>({taskId:t.id,sha256:taskFingerprint(t)}))};
  const captures={nemotron:[],inkling:[]};
  for (const task of tasks) {
    const prompt=promptFor(task), promptSha256=taskFingerprint(task);
    for(const name of names){
      const started=performance.now();
      try {
        const received=await runners[name]({prompt,taskId:task.id,promptSha256});
        if (typeof received?.answer!=='string') throw new Error('MISSING_PROVIDER_ANSWER');
        captures[name].push({taskId:task.id,promptSha256,output:received.answer,
          providerResponseId: typeof received.responseId==='string'?received.responseId:null,
          elapsedMs:Math.round(performance.now()-started),transport:'CALLER_SUPPLIED_NOT_INDEPENDENTLY_VERIFIED'});
      } catch(error){
        captures[name].push({taskId:task.id,promptSha256,output:'',errorCode:'MODEL_RUNNER_ERROR',elapsedMs:Math.round(performance.now()-started)});
      }
    }
  }
  const result={schema:'astra-arena-v1',status:'PARTIAL',reason:'CALLER_TRANSPORT_RECEIPTS_REQUIRE_INDEPENDENT_PROVIDER_VERIFICATION',
    liveCalls:tasks.length*names.length,models:names.map(name=>({name,model:MODELS[name],score:scoreTranscript(captures[name],tasks)}))};
  if (emitPublicTranscripts) {
    if (names.some(name=>captures[name].some(item=>typeof item.output!=='string'||item.output.length>20000))) throw Error('PUBLIC_TRANSCRIPT_TOO_LARGE');
    result.publicSyntheticTranscripts=Object.fromEntries(names.map(name=>[name,captures[name].map(({taskId,promptSha256,output})=>({taskId,promptSha256,output}))]));
  }
  return result;
}

/** Existing Ghost NVIDIA adapter reused; no keys are stored or logged here. */
export function makeExistingNemotronRunner({apiKey,fetchImpl}={}) {
  return async ({prompt}) => {
    const result=await invokeNemotron({prompt},{apiKey,fetchImpl});
    if(result.status!=='PASS' || result.model!==NEMOTRON_MODEL) throw Error('NEMOTRON_PROOF_INVALID');
    return {answer:result.answer,responseId:result.responseId};
  };
}

/** Default execution: zero external calls, with deterministic proof of why. */
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await runPairedArena();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
