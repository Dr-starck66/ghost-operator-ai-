/** Offline demo: node astra/civic-watch-demo.mjs [output-dir]. No live crawling. */
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recordPublicObservation, buildCivicBrief, renderCivicHtml } from './civic-watch.mjs';
const out=process.argv[2]||await mkdtemp(join(tmpdir(),'astra-civic-'));
await mkdir(out,{recursive:true});
const file=join(out,'civic-ledger.json');
const a='https://www.gendarmerie.interieur.gouv.fr/gendinfo/criminalite-organisee-et-enquetes/2026/operation-octopus-nouveau-coup-de-filet-contre-la-dz-mafia';
const b='https://www.gendarmerie.interieur.gouv.fr/gendinfo/actualites/2026/le-succes-est-collectif-l-adieu-aux-armes-du-general-de-corps-d-armee-arnaud-browaeys';
const common={eventId:'operation-octopus-2026',eventDate:'2026-03-09',title:'Opération Octopus : bilan public',metric:'interpellations'};
for(const statement of [
  {...common,sourceUrl:a,sourceDate:'2026-03-14',sourceSegment:'paragraphe introductif',value:43},
  {...common,sourceUrl:a,sourceDate:'2026-03-14',sourceSegment:'bilan detaille',value:42},
  {...common,sourceUrl:b,sourceDate:'2026-07-17',sourceSegment:'bilan retrospectif',value:42}
]) await recordPublicObservation(file,statement);
const brief=await buildCivicBrief(file);
await writeFile(join(out,'civic-brief.json'),JSON.stringify(brief,null,2));
await writeFile(join(out,'civic-dashboard.html'),renderCivicHtml(brief));
console.log(JSON.stringify({status:brief.status,observations:brief.observations,contradictions:brief.contradictions.length,reportSha256:brief.reportSha256,output:out}));
