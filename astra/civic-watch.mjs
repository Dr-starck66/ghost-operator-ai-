/** ASTRA CIVIC WATCH Ω: institutional aggregate statements only.
 * No identification, tracking, location mapping, surveillance or automated accusations.
 * Integrity SHA-256 does not verify the truth of source claims.
 * Reuses the already existing Ghost Operator mission ledger.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { recordMission } from './mission-ledger.mjs';

const hosts=new Set(['gendarmerie.interieur.gouv.fr','www.gendarmerie.interieur.gouv.fr','interieur.gouv.fr','www.interieur.gouv.fr','masecurite.interieur.gouv.fr','service-public.fr','www.service-public.fr','justice.gouv.fr','www.justice.gouv.fr']);
const metrics=new Set(['interpellations','mises_en_examen','saisies_eur']);
const fields=['eventId','eventDate','title','sourceUrl','sourceDate','sourceSegment','metric','value'];
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const date=x=>typeof x==='string' && /^\d{4}-\d\d-\d\d$/.test(x) && !Number.isNaN(Date.parse(x+'T00:00:00Z')) && new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const text=(s,max)=>typeof s==='string' && s.length>0 && s.length<=max && !/[<>\u0000-\u001f]/.test(s) && !/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(s) && !/\b(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}\b/.test(s);

export function normalizePublicObservation(x) {
  if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==fields.length||Object.keys(x).some(k=>!fields.includes(k))) throw Error('UNSUPPORTED_FIELDS');
  if(!text(x.eventId,80)||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x.eventId)) throw Error('INVALID_EVENT_ID');
  if(!date(x.eventDate)||!date(x.sourceDate)) throw Error('INVALID_DATE');
  if(!text(x.title,180)||!text(x.sourceSegment,80)) throw Error('INVALID_PUBLIC_TEXT');
  if(!metrics.has(x.metric)||!Number.isSafeInteger(x.value)||x.value<0) throw Error('INVALID_AGGREGATE_METRIC');
  if(typeof x.sourceUrl!=='string'||x.sourceUrl.length>1100) throw Error('INVALID_SOURCE');
  let u;try{u=new URL(x.sourceUrl)}catch{throw Error('INVALID_SOURCE')}
  if(u.protocol!=='https:'||!hosts.has(u.hostname)||u.username||u.password||u.port||u.search||u.hash) throw Error('SOURCE_NOT_ALLOWLISTED');
  return {eventId:x.eventId,eventDate:x.eventDate,title:x.title,sourceUrl:u.href,sourceDate:x.sourceDate,sourceSegment:x.sourceSegment,metric:x.metric,value:x.value,attribution:'DECLARED_OFFICIAL_PUBLIC_SOURCE',independentlyReverifiedByRuntime:false};
}
export async function recordPublicObservation(file,x) {
  const result=normalizePublicObservation(x);
  return recordMission(file,{id:'civic_'+sha(result),idea:'Aggregated official public statement; attribution not judicial proof',result});
}
export async function buildCivicBrief(file) {
  const log=await readFile(file,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {schema:1,missions:[]};throw e});
  if(log.schema!==1||!Array.isArray(log.missions)) throw Error('LEDGER_FORMAT_FAIL');
  const seen=new Set(),groups=new Map();
  for(const m of log.missions){
    if(seen.has(m.id)) throw Error('LEDGER_DUPLICATE_FAIL'); seen.add(m.id);
    if(sha(m.result)!==m.proofSha256) throw Error('LEDGER_TAMPER_FAIL');
    const only=Object.fromEntries(Object.entries(m.result).filter(([k])=>fields.includes(k)));
    const n=normalizePublicObservation(only);
    if(Object.keys(m.result).length!==fields.length+2||m.id!=='civic_'+sha(n)||m.result.attribution!==n.attribution||m.result.independentlyReverifiedByRuntime!==false) throw Error('LEDGER_INTEGRITY_FAIL');
    const key=n.eventId+'/'+n.metric;
    if(!groups.has(key))groups.set(key,{eventId:n.eventId,date:n.eventDate,title:n.title,metric:n.metric,claims:[]});
    groups.get(key).claims.push({value:n.value,sourceUrl:n.sourceUrl,sourceDate:n.sourceDate,sourceSegment:n.sourceSegment,proofSha256:m.proofSha256});
  }
  const aggregates=[...groups.values()].map(g=>({
    eventId:g.eventId,date:g.date,title:g.title,metric:g.metric,claims:g.claims,
    sourcesCount:new Set(g.claims.map(c=>c.sourceUrl)).size,
    reportedValues:[...new Set(g.claims.map(c=>c.value))].sort((a,b)=>a-b)
  }));
  for(const a of aggregates)a.hasContradiction=a.reportedValues.length>1;
  aggregates.sort((a,b)=>a.date.localeCompare(b.date)||a.metric.localeCompare(b.metric));
  const contradictions=aggregates.filter(a=>a.hasContradiction).map(a=>({eventId:a.eventId,metric:a.metric,values:a.reportedValues,action:'HUMAN_REVIEW_REQUIRED'}));
  const brief={
    project:'ASTRA_CIVIC_WATCH_OMEGA',version:1,mode:'official_aggregate_sources_only',
    status:contradictions.length?'PARTIAL':'ATTRIBUTED_UNVERIFIED',
    observations:log.missions.length,aggregates,contradictions,
    reporting:{drugTrafficking:'https://www.masecurite.interieur.gouv.fr/fr/demarches-en-ligne/signaler-trafic-stupefiants-stup',
      internetContent:'https://www.masecurite.interieur.gouv.fr/fr/demarches-en-ligne/portail-officiel-signalement-contenus-illicites-internet-pharos',
      emergency:'17 / 112'},
    limitations:['No personal data, suspect lists or coordinates','No automated reporting or confrontation','Public-source attribution is not fact verification']
  };
  return {...brief,reportSha256:sha(brief)};
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderCivicHtml(b){
  const lines=b.aggregates.map(a=>'<tr><td>'+esc(a.date)+'</td><td>'+esc(a.title)+'</td><td>'+esc(a.metric)+'</td><td>'+esc(a.reportedValues.join(' / '))+'</td><td>'+(a.hasContradiction?'Contradiction à examiner':'Déclaration attribuée')+'</td><td>'+a.claims.map(c=>'<a rel="noopener noreferrer" target="_blank" href="'+esc(c.sourceUrl)+'">Source officielle ('+esc(c.sourceSegment)+')</a>').join('<br>')+'</td></tr>').join('');
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; form-action &#39;none&#39;"><title>ASTRA CIVIC WATCH Ω</title><style>body{background:#121d29;color:#eaf2f8;font:16px/1.5 system-ui;max-width:1100px;margin:auto;padding:2rem}a{color:#79cefa}td,th{border:1px solid #567;padding:0.7rem}table{border-collapse:collapse;display:block;overflow-x:auto}aside{border-left:4px solid #e9b65a;padding:1rem}</style></head><body><h1>ASTRA CIVIC WATCH Ω</h1><p>Observatoire civique des déclarations publiques agrégées.</p><aside>Chiffres attribués à des publications officielles, à vérifier. Aucune accusation ni donnée privée. SHA-256 = intégrité locale, pas vérification des faits.</aside><h2>Chronologie documentaire</h2><table><thead><tr><th>Date</th><th>Événement</th><th>Indicateur</th><th>Valeurs publiées</th><th>Examen</th><th>Sources</th></tr></thead><tbody>'+lines+'</tbody></table><h2>Canaux officiels</h2><p><a href="'+esc(b.reporting.drugTrafficking)+'">Signaler un trafic (tchat anonyme)</a> | <a href="'+esc(b.reporting.internetContent)+'">PHAROS</a>. Danger immédiat : <b>17 ou 112</b>. Ne confrontez jamais quiconque.</p><p>Statut : '+esc(b.status)+' — Empreinte du rapport : '+esc(b.reportSha256)+'</p></body></html>';
}
