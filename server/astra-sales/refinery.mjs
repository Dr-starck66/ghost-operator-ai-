/** ASTRA LEAD REFINERY Ω — offline, deterministic, no network/paid API, Node >=20. */
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, mkdir, rename, rm, readFile, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

const ALIASES = {
  email:['email','emailaddress','e-mail','e_mail','contactemail','businessemail','workemail','mail'],
  company:['company','companyname','business','businessname','organisation','organization','organisationname','firm'],
  name:['name','contactname','fullname','personname'],
  role:['role','jobtitle','title','position','designation'],
  industry:['industry','sector','category','businesscategory','vertical','businesssector'],
  sic:['sic','siccode','uksic','sic2007'],
  country:['country','countrycode','nation','locationcountry'],
  website:['website','web','domain','companywebsite','url'],
  sourceUrl:['sourceurl','source','recordsource','datasource','provenanceurl'],
  consentAt:['consentat','optinat','permissionat'],
  noticeAt:['noticeat','firstnoticeat'],
};
const key = s => String(s||'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const DICTIONARY = Object.fromEntries(Object.entries(ALIASES).flatMap(([target,names])=>names.map(n=>[key(n),target])));
const DISPOSABLE = new Set(['mailinator.com','10minutemail.com','guerrillamail.com','tempmail.com','yopmail.com','trashmail.com']);
const ROLE_MAILBOX = /^(info|contact|sales|support|admin|office|hello|enquiries|enquiry|reception|service|marketing|accounts|team|bookings)([._+-].*)?$/i;
const INDUSTRIES = {
  manufacturing: /manufactur|industr|factory|factories|fabricat|engineering|production|automotive|metalwork|food process/i,
  logistics: /logistic|transport|warehouse|distribution|freight|haulage|courier|supply chain|storage/i,
  hospitality: /hotel|hospitality|restaurant|catering|pub|bar|tourism|accommodation/i,
  healthcare: /health|medical|clinic|hospital|care home|dentist|pharmac/i,
  construction: /construct|building|contractor|civil engineering|roof|plumb|electrical install/i,
  cleaning: /cleaning|janitorial|facility management|facilities services|commercial hygiene/i,
  it: /information technology|software|cloud|cyber|computer|telecom|managed it|web develop/i,
  retail: /retail|shop|e-commerce|ecommerce|supermarket|store/i,
  wholesale: /wholesal|merchant|trade distributor/i,
  professional: /accountan|legal services|solicitor|consult|professional services|architecture/i,
  agriculture: /agricultur|farming|farmer|horticultur|crop|livestock/i,
  energy: /renewable|solar|energy supply|electric power|power generation/i,
  real_estate: /real estate|property management|estate agent/i,
};
const SIC = [[1,3,'agriculture'],[10,33,'manufacturing'],[35,35,'energy'],[41,43,'construction'],[46,46,'wholesale'],[47,47,'retail'],[49,53,'logistics'],[55,56,'hospitality'],[62,63,'it'],[68,68,'real_estate'],[69,75,'professional'],[81,81,'cleaning'],[86,88,'healthcare']];

export function normalizeEmail(value) {
  const s=String(value??'').trim().toLowerCase().normalize('NFKC');
  if(s.length>254 || s.length<6 || /\s|\.\.|[<>(),;:\\"\[\]]/.test(s))return '';
  const m=/^([a-z0-9!#$%&'*+/=?^_`{|}~.-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/.exec(s);
  if(!m||m[1].length>64||m[1].startsWith('.')||m[1].endsWith('.')||m[2].split('.').some(p=>p.startsWith('-')||p.endsWith('-')||p.length>63))return '';
  return s;
}
export function segment(row) {
  const code=String(row.sic??'').replace(/\D/g,'').slice(0,2);
  if(code.length===2){const group=SIC.find(([start,end])=>Number(code)>=start&&Number(code)<=end);if(group)return {industry:group[2],confidence:'high',reason:'sic'};}
  const explicit=String(row.industry||'').trim();
  const matches=Object.entries(INDUSTRIES).filter(([,pattern])=>pattern.test(explicit)).map(([name])=>name);
  if(matches.length===1)return {industry:matches[0],confidence:'medium',reason:'industry-field'};
  return {industry:'unknown',confidence:'unknown',reason:matches.length?'ambiguous-industry':'insufficient-industry-data'};
}
export function normalizeRecord(input) {
  const row={};for(const [k,v] of Object.entries(input)) { const target=DICTIONARY[key(k)];if(target && !(target in row))row[target]=String(v??'').trim().slice(0,500); }
  const email=normalizeEmail(row.email);
  if(!email)return {error:'invalid_email'};
  const domain=email.split('@')[1];
  if(DISPOSABLE.has(domain))return {error:'disposable_domain'};
  const company=(row.company||'').replace(/\s+/g,' ').trim();
  if(!company)return {error:'missing_company'};
  const provenance=row.sourceUrl||'';
  return {email,company,name:row.name||'',role:row.role||'',country:row.country||'',website:row.website||'',
    sourceUrl:provenance,consentAt:row.consentAt||'',noticeAt:row.noticeAt||'',
    mailboxType:ROLE_MAILBOX.test(email.split('@')[0])?'role':'individual',
    emailDomain:domain, ...segment(row)};
}
export function matchOffers(record,offers=[]) {
  return offers.filter(offer=>Array.isArray(offer.industries)&&offer.industries.includes(record.industry))
    .map(offer=>({id:String(offer.id||''),score:Math.min(100,40+(record.confidence==='high'?25:record.confidence==='medium'?15:0)
      +(record.role&&new RegExp('director|owner|head|manager|procurement|operations|facilities|ceo|founder','i').test(record.role)?20:0)
      +(record.website?5:0)+(record.mailboxType==='individual'?5:0)),reason:'sector-fit-only'}))
    .filter(x=>x.id).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
function separatorFrom(header) {const counts={',':0,';':0,'\t':0,'|':0};let quoted=false;for(let i=0;i<header.length;i++){const c=header[i];if(c==='"'){if(quoted&&header[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted&&c in counts)counts[c]++;else if(!quoted&&(c==='\n'||c==='\r'))break;}return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];}
/** Streaming RFC4180-style reader: BOM, quoted commas/newlines, CRLF and UTF-8 boundaries. */
export async function* csvRows(path,{maxField=8192,maxColumns=200}={}) {
  const stream=createReadStream(path,{encoding:'utf8',highWaterMark:65536});
  let row=[],field='',quoted=false,afterQuote=false,skipLF=false,delim=null,sample='',seenAny=false;
  for await (const chunk of stream){
    let s=chunk;
    if(!seenAny){seenAny=true;if(s[0]==='\uFEFF')s=s.slice(1);}
    if(delim===null){sample+=s;if(!/\r|\n/.test(sample) && sample.length<65536)continue;delim=separatorFrom(sample);s=sample;sample='';}
    for(let i=0;i<s.length;i++){
      const c=s[i];
      if(skipLF){skipLF=false;if(c==='\n')continue;}
      if(c==='"'){
        if(quoted){quoted=false;afterQuote=true;}
        else if(afterQuote){field+='"';afterQuote=false;quoted=true;}
        else if(field===''){quoted=true;afterQuote=false;}
        else throw new Error('Invalid CSV quote');
      } else if(!quoted && (c===delim || c==='\n' || c==='\r')){
        row.push(field);field='';afterQuote=false;
        if(row.length>maxColumns)throw new Error('CSV has too many columns');
        if(c===delim)continue;
        if(row.some(v=>v.trim()))yield row;
        row=[];if(c==='\r')skipLF=true;
      } else {
        if(!quoted&&afterQuote&&!/\s/.test(c))throw new Error('Unexpected text after CSV quote');
        field+=c;if(field.length>maxField)throw new Error('CSV field exceeds limit');
      }
    }
  }
  if(delim===null && sample){delim=separatorFrom(sample); /* a header-only file is not useful */ throw new Error('CSV requires header and data rows');}
  if(quoted)throw new Error('Unclosed CSV quote');
  row.push(field);if(row.some(v=>v.trim()))yield row;
}
const csvCell=value=>{const s=String(value??'');const safe=/^[=+\-@\t\r]/.test(s)?"'"+s:s;return '"'+safe.replace(/"/g,'""')+'"';};
const outRow=fields=>fields.map(csvCell).join(',')+'\n';
async function write(stream,data){if(!stream.write(data))await once(stream,'drain');}
async function close(stream){stream.end();await once(stream,'finish');}
async function loadSuppressions(file){const blocked=new Set();if(!file)return blocked;const body=await readFile(file,'utf8');for(const line of body.split(/\r?\n/)){for(const token of line.split(/[,;\t]/)){const email=normalizeEmail(token.replace(/^"|"$/g,''));if(email)blocked.add(email);}}return blocked;}
export async function processFile({input,output,sourceUrl='',suppressionFile='',offers=[],maxRows=2000000,overwrite=false}={}) {
  if(!input||!output)throw new Error('input and output required');
  const src=resolve(input),out=resolve(output);
  if(src===out||out.startsWith(src+'/'))throw new Error('Unsafe output location');
  if((await stat(src)).size>1024*1024*1024)throw new Error('Input exceeds 1 GiB limit');
  const blocked=await loadSuppressions(suppressionFile),seen=new Set(),counters={total:0,accepted:0,duplicates:0,suppressed:0,rejected:0,unverifiedPermission:0,roleMailboxes:0,unknownIndustry:0};
  const segments={},matches={};
  await mkdir(out,{recursive:true});
  if(!overwrite){for(const name of ['clean.csv','quarantine.csv','report.json']){try{const handle=await open(join(out,name),'r');await handle.close();throw new Error('Output already exists; choose an empty directory or --overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}}}
  const tmp=join(out,'.tmp-'+process.pid+'-'+Date.now());await mkdir(tmp);
  const clean=createWriteStream(join(tmp,'clean.csv'),{mode:0o600});const quarantine=createWriteStream(join(tmp,'quarantine.csv'),{mode:0o600});
  const cleanFields=['email','company','name','role','country','website','sourceUrl','mailboxType','emailDomain','industry','confidence','industryReason','offerIds','bestOfferScore','marketingPermission','evidenceStatus'];
  try{
    await write(clean,outRow(cleanFields));await write(quarantine,outRow(['row','email','reason']));
    let headers=null;
    for await(const cells of csvRows(src)){
      if(!headers){headers=cells.map(x=>x.trim());if(!headers.some(h=>DICTIONARY[key(h)]==='email'))throw new Error('Input CSV missing an email column');continue;}
      counters.total++;if(counters.total>maxRows)throw new Error('Row limit exceeded');
      const raw=Object.fromEntries(headers.map((h,i)=>[h,cells[i]||'']));
      const normalized=normalizeRecord(raw);const source=normalized.error?normalized:{...normalized,sourceUrl:normalized.sourceUrl||sourceUrl};
      let reason=source.error||'';
      if(!reason&&seen.has(source.email)){reason='duplicate_email';counters.duplicates++;}
      if(!reason&&blocked.has(source.email)){reason='suppressed';counters.suppressed++;}
      if(!reason&&!source.sourceUrl){reason='missing_provenance';}
      if(!reason&&!/^https?:\/\/[^\s]+$/i.test(source.sourceUrl)){reason='invalid_provenance_url';}
      if(reason){counters.rejected++;await write(quarantine,outRow([counters.total+1,source.email||String(raw.email||'').slice(0,254),reason]));continue;}
      seen.add(source.email);counters.accepted++;counters.unverifiedPermission++;
      if(source.mailboxType==='role')counters.roleMailboxes++;
      if(source.industry==='unknown')counters.unknownIndustry++;
      segments[source.industry]=(segments[source.industry]||0)+1;
      const offersFor=matchOffers(source,offers);
      for(const offer of offersFor)matches[offer.id]=(matches[offer.id]||0)+1;
      await write(clean,outRow([source.email,source.company,source.name,source.role,source.country,source.website,source.sourceUrl,source.mailboxType,source.emailDomain,source.industry,source.confidence,source.reason,offersFor.map(x=>x.id).join(';'),offersFor[0]?.score||'',
        'UNVERIFIED','REVIEW_REQUIRED']));
    }
    if(!headers)throw new Error('Empty CSV');
    await close(clean);await close(quarantine);
    const report={schema:'astra-lead-refinery/report-v1',generatedAt:new Date().toISOString(),status:'PARTIAL',inputRows:counters.total,
      counts:counters,segments,offerMatches:matches,guarantees:{syntaxChecked:true,uniquenessInInput:true,verifiedMailboxes:false,mxVerified:false,legalPermissionVerified:false,liveSending:false,offerPayoutsVerified:false},
      notes:['Format and heuristics only, not deliverability verification','Purchased provenance is not original collection evidence','All contacts require review before any campaigns']};
    const handle=await open(join(tmp,'report.json'),'w',0o600);try{await handle.writeFile(JSON.stringify(report,null,2)+'\n');}finally{await handle.close();}
    for(const file of ['clean.csv','quarantine.csv','report.json'])await rename(join(tmp,file),join(out,file));
    await rm(tmp,{recursive:true,force:true});return report;
  }catch(e){clean.destroy();quarantine.destroy();await rm(tmp,{recursive:true,force:true});throw e;}
}