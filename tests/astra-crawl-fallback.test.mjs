import test from 'node:test';
import assert from 'node:assert/strict';
import { crawlWithAstra, DEFAULT_ASTRA_CRAWLER_URL } from '../server/astra-crawl-fallback.mjs';
const task = { url: 'https://example.org/', goal: 'web research', maxPages: 2 };
const data = { schema: 'astra-crawler-omega/v1', results: [
  {url:'https://example.org/',finalUrl:'https://example.org/', status:200,title:'Example',metaDescription:'D',h1s:['Hello'],links:['https://seller.example.net/about','https://example.org/a'],canonical:'https://example.org/', robotsMeta:'index'}
] };
const mock=(status, body)=>async (url,options)=>{assert.equal(url, DEFAULT_ASTRA_CRAWLER_URL + '/api/crawl');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{url:task.url,maxPages:2,maxDepth:1});return{ok:status===200,status,json:async()=>body};};
test('remote ASTRA crawl produces traceable, bounded evidence',async()=>{
 const logs=[];const x=await crawlWithAstra(task,msg=>logs.push(msg),mock(200,data));
 assert.equal(x.mode,'astra_crawler_omega_remote_fallback');assert.equal(x.pagesVisited,1);
 assert.equal(x.pageEvidence[0].title,'Example');assert.equal(x.externalLinks[0].url,'https://seller.example.net/about');
 assert.equal(x.pageEvidence[0].jsonLdCount,null);assert.equal(logs.length,1);
});
test('fails closed on bad status',async()=>{await assert.rejects(crawlWithAstra(task,()=>{},mock(503,data)),/HTTP 503/)});
test('fails closed on bad schema',async()=>{await assert.rejects(crawlWithAstra(task,()=>{},mock(200,{results:[]})),/schema/)});
test('fails closed on empty HTTP evidence',async()=>{await assert.rejects(crawlWithAstra(task,()=>{},mock(200,{schema:data.schema,results:[]})),/no verified/)});
test('fails closed on synthetic HTTP row',async()=>{await assert.rejects(crawlWithAstra(task,()=>{},mock(200,{schema:data.schema,results:[{status:0,title:'Invented',url:task.url}]})),/no verified/)});
