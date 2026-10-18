import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOsintHttp, sealOsintProof } from '../server/astra-osint-livecheck.mjs';

const ok = (status, data = {}) => ({ status, json: async () => data });
function fakeHttp({ dnsObserved = true, catalogReady = true, rejectWrongToken = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: opts.method, credentialPresent: Boolean(opts.headers['x-ghost-token']) });
    const token = opts.headers['x-ghost-token'];
    if (token !== 'supersecret') {
      return ok(rejectWrongToken ? 401 : 200, {});
    }
    if (path.endsWith('/status')) return ok(200, { mode: 'passive_read_only', trackingLinksEnabled: false });
    if (path.endsWith('/domain')) {
      const body = JSON.parse(opts.body);
      if (body.domain !== 'example.com') return ok(400, { error: 'INVALID_DOMAIN' });
      return ok(200, { domain: 'example.com', proofSha256: 'a'.repeat(64),
        checks: ['A','MX','NS','CAA'].map((recordType,i)=>({
          recordType, status: dnsObserved && i===0 ? 'OBSERVED' : 'UNVERIFIED'
        })) });
    }
    if (path.endsWith('/catalog')) return ok(catalogReady ? 200 : 503,
      catalogReady ? {category:'business',total:1,tools:[{pricing:'free',interaction:'external_link_only'}]} : {});
    throw Error('UNKNOWN_PATH');
  };
  return {fetchImpl,calls};
}

test('unauthenticated, wrong-token and forbidden-domain negative controls with real HTTP shapes', async () => {
  const mock = fakeHttp();
  const result = await verifyOsintHttp({baseUrl:'http://127.0.0.1:8080',token:'supersecret',fetchImpl:mock.fetchImpl});
  assert.equal(result.status,'PASS');
  assert.equal(result.httpVerified,true);
  assert.equal(result.checks.noToken,true);
  assert.equal(result.checks.wrongToken,true);
  assert.equal(result.checks.unsafeTargetRejected,true);
  assert.equal(result.dnsRecordTypesObserved[0],'A');
  assert.equal(result.catalogMatchCount,1);
  assert.equal(mock.calls.length,6);
  assert.equal(JSON.stringify(result).includes('supersecret'),false);
  assert.match(sealOsintProof(result).proofSha256,/^[0-9a-f]{64}$/);
});

test('wrong-token acceptance fails closed; no further DNS/catalog calls', async () => {
  const mock=fakeHttp({rejectWrongToken:false});
  const res=await verifyOsintHttp({baseUrl:'http://127.0.0.1:3000',token:'supersecret',fetchImpl:mock.fetchImpl});
  assert.equal(res.status,'FAIL');
  assert.equal(mock.calls.length,4);
});

test('DNS network missing stays PARTIAL, not PASS', async () => {
  const mock=fakeHttp({dnsObserved:false});
  const res=await verifyOsintHttp({baseUrl:'http://localhost:3000',token:'supersecret',fetchImpl:mock.fetchImpl});
  assert.equal(res.status,'PARTIAL');
  assert.equal(res.externalDnsObserved,false);
});

test('catalog failure stays PARTIAL, missing token UNVERIFIED and non-local URL blocked',async()=>{
  const mock=fakeHttp({catalogReady:false});
  const res=await verifyOsintHttp({baseUrl:'http://127.0.0.1:8080',token:'supersecret',fetchImpl:mock.fetchImpl});
  assert.equal(res.status,'PARTIAL');
  const none=await verifyOsintHttp({baseUrl:'http://127.0.0.1:8080',token:''});
  assert.equal(none.status,'UNVERIFIED');
  await assert.rejects(()=>verifyOsintHttp({baseUrl:'https://example.com',token:'supersecret'}),/LOCAL_LOOPBACK_ONLY/);
});
