/**
 * ASTRA WORK FREE Ω v0.1.0 — hosted read-only execution adapter.
 * Never runs arbitrary code or arbitrary URLs; source, authorization,
 * persistence and background scheduling are distinct capabilities.
 */
import { createHash } from 'node:crypto';

export const SCHEMA = 'astra-work-free-omega/1';
export const VERSION = '0.1.0';
export const LIMIT_BYTES = 131072;
export const TARGETS = Object.freeze({
  freehotels: Object.freeze([
    {id:'homepage',url:'https://freehotels.info/',kind:'html'},
    {id:'robots',url:'https://freehotels.info/robots.txt',kind:'robots'},
    {id:'sitemap',url:'https://freehotels.info/sitemap.xml',kind:'sitemap'}
  ]),
  avocat: Object.freeze([
    {id:'homepage',url:'https://avocat-belgique.com/',kind:'html'},
    {id:'robots',url:'https://avocat-belgique.com/robots.txt',kind:'robots'},
    {id:'sitemap',url:'https://avocat-belgique.com/sitemap.xml',kind:'sitemap'}
  ]),
  gamicnews: Object.freeze([
    {id:'homepage',url:'https://gamicnews.com/',kind:'html'},
    {id:'robots',url:'https://gamicnews.com/robots.txt',kind:'robots'},
    {id:'sitemap',url:'https://gamicnews.com/sitemap.xml',kind:'sitemap'}
  ]),
  wineelse: Object.freeze([
    {id:'homepage',url:'https://else.wine/',kind:'html'},
    {id:'robots',url:'https://else.wine/robots.txt',kind:'robots'},
    {id:'sitemap',url:'https://else.wine/sitemap.xml',kind:'sitemap'}
  ])
});

const hash = s => createHash('sha256').update(s).digest('hex');
const safeCode = error => {
  const code = String(error?.name || 'NETWORK_ERROR').toUpperCase().replace(/[^A-Z_]/g,'');
  return code.slice(0,35) || 'NETWORK_ERROR';
};
export const listProjects = () => Object.keys(TARGETS);

async function readBounded(response) {
  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (declared > LIMIT_BYTES) return {tooLarge:true,body:''};
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    return {tooLarge:Buffer.byteLength(text,'utf8') > LIMIT_BYTES,body:text};
  }
  let total=0; const chunks=[];
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMIT_BYTES) {
        await reader.cancel().catch(()=>{});
        return {tooLarge:true,body:''};
      }
      chunks.push(value);
    }
  } finally {reader.releaseLock?.();}
  return {tooLarge:false,body:Buffer.concat(chunks.map(c=>Buffer.from(c))).toString('utf8')};
}

export async function inspectTarget(target, {fetcher=fetch, now=()=>new Date()}={}) {
  if (!Object.values(TARGETS).some(a=>a.includes(target))) {
    return {status:'FAIL',reason:'TARGET_NOT_PREAPPROVED',proofScope:'NO_NETWORK_REQUEST'};
  }
  const observedAt=now().toISOString();
  try {
    const response = await fetcher(target.url,{
      method:'GET',redirect:'manual',
      signal:AbortSignal.timeout(7500),
      headers:{'user-agent':'ASTRA-Work-Free/0.1 (+read-only-site-audit)','accept':'text/html,application/xml,text/plain;q=0.9'}
    });
    const statusCode = Number(response.status);
    if (statusCode!==200) {
      return {id:target.id,url:target.url,status:statusCode>=400?'FAIL':'PARTIAL',
        httpStatus:statusCode,reason:'HTTP_NOT_200_OR_REDIRECT',observedAt,proofScope:'PUBLIC_HTTP_RESPONSE_ONLY'};
    }
    const {tooLarge,body} = await readBounded(response);
    if (tooLarge) return {id:target.id,url:target.url,httpStatus:200,status:'PARTIAL',
      reason:'BODY_EXCEEDS_128_KIB',observedAt,proofScope:'BODY_NOT_AUTHENTICATED'};
    const present = target.kind==='html'
      ? /<!doctype\s+html|<html\b/i.test(body) && /<(?:title|h1)\b/i.test(body)
      : target.kind==='robots'
      ? /(?:^|\n)\s*(?:user-agent|sitemap)\s*:/i.test(body)
      : /<(?:urlset|sitemapindex)\b/i.test(body);
    const noindex = target.kind==='html' && /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex|<meta\b[^>]*content=["'][^"']*noindex[^>]*name=["']robots["']/i.test(body);
    const headerNoindex = /(?:^|,)\s*noindex(?:,|$)/i.test(response.headers?.get?.('x-robots-tag')||'');
    const status = present && !noindex && !headerNoindex ? 'PASS' : 'PARTIAL';
    return {id:target.id,url:target.url,httpStatus:200,status,
      reason:!present?'EXPECTED_FORMAT_NOT_FOUND':noindex||headerNoindex?'NOINDEX_OBSERVED':'HTTP_200_EXPECTED_FORMAT',
      bodySha256:hash(body),bodyBytes:Buffer.byteLength(body),noindex:!!(noindex||headerNoindex),
      observedAt,proofScope:'PUBLIC_HTTP_FORMAT_ONLY_NOT_DEPLOY_OR_SEO_SUCCESS'};
  } catch(error) {
    return {id:target.id,url:target.url,status:'UNVERIFIED',reason:'NETWORK_PROBE_ERROR',
      errorClass:safeCode(error),observedAt,proofScope:'NETWORK_UNVERIFIED'};
  }
}

export async function runProject(project,{fetcher=fetch,now=()=>new Date()}={}) {
  if(typeof project!=='string' || !Object.hasOwn(TARGETS,project)){
    return {schema:SCHEMA,status:'FAIL',reason:'UNKNOWN_PROJECT',available:listProjects(),
      scope:'NO_NETWORK_REQUEST'};
  }
  const runAt=now().toISOString();
  const results=await Promise.all(TARGETS[project].map(target=>inspectTarget(target,{fetcher,now})));
  const statuses=results.map(r=>r.status);
  const status=statuses.every(s=>s==='PASS')?'PASS':'PARTIAL';
  const fingerprint=hash(JSON.stringify({project,results:results.map(r=>({id:r.id,status:r.status,hash:r.bodySha256||null,code:r.httpStatus||null}))}));
  return {schema:SCHEMA,version:VERSION,project,runAt,status,scope:'PUBLIC_HTTP_READ_ONLY',
    fingerprintSha256:fingerprint,results,
    boundaries:{gitWrite:'NOT_CONNECTED',browserInteractive:'NOT_CONNECTED',outreach:'APPROVAL_REQUIRED',
      storage:'NO_HOSTED_PERSISTENCE',background:'NOT_INSTALLED',desktopControl:'NOT_AVAILABLE'}};
}
