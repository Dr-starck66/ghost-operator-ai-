import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImageRequest, analyzeNvidiaDemoImage, NVIDIA_CHAT_URL, NVIDIA_DEMO_IMAGE_URL, readNvidiaSSE } from '../nemotron-vision-stream.mjs';

function responseFromChunks(chunks) {
  return { ok:true, status:200, body:new ReadableStream({start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  }}) };
}
function events(...payloads) {return payloads.map(p => 'data: ' + (typeof p==='string'?p:JSON.stringify(p)) + '\r\n\r\n').join('');}
const response = events(
  {choices:[{delta:{reasoning_content:'Looking at '},finish_reason:null}]},
  {choices:[{delta:{reasoning_content:'the sign.'},finish_reason:null}]},
  {choices:[{delta:{content:'The sign '},finish_reason:null}]},
  {choices:[{delta:{content:'is red.'},finish_reason:null}]},
  {choices:[{delta:{},finish_reason:'stop'}]}, '[DONE]');

test('official multimodal streamed request keeps image and thinking enabled, without tools', () => {
  const r = makeImageRequest();
  assert.equal(r.model, 'nvidia/nemotron-3.5-super-vl-120b-a12b');
  assert.equal(r.messages[0].content[1].image_url.url, NVIDIA_DEMO_IMAGE_URL);
  assert.equal(r.chat_template_kwargs.enable_thinking, true);
  assert.equal(r.stream, true);
  assert.equal(r.max_tokens, 16384);
  assert.equal('tools' in r, false);
  assert.throws(() => makeImageRequest('http://169.254.169.254/latest/meta-data'),/fixture/);
});

test('streaming and fragmented SSE preserve reasoning and final image answer separately', async () => {
  const seen=[];
  const chunks = [response.slice(0,5),response.slice(5,19),response.slice(19,51),response.slice(51,72),response.slice(72)];
  const result = await analyzeNvidiaDemoImage({apiKey:'TEST_SECRET_NOT_REAL', fetchImpl: async (url, args) => {
    assert.equal(url,NVIDIA_CHAT_URL);
    assert.equal(args.headers.Authorization,'Bearer TEST_SECRET_NOT_REAL');
    assert.equal(JSON.parse(args.body).messages[0].content[1].type,'image_url');
    return responseFromChunks(chunks);
  }, onDelta: (d) => seen.push(d)});
  assert.equal(result.answer,'The sign is red.');
  assert.equal(result.reasoning_present,true);
  assert.equal(result.finish_reason,'stop');
  assert.equal(result.status,'MODEL_OUTPUT_UNVERIFIED');
  assert.equal(seen.filter(d=>d.kind==='answer').length,2);
  assert.ok(!JSON.stringify(result).includes('TEST_SECRET_NOT_REAL'));
});

test('no key rejects before network call', async () => {
  let n=0;
  await assert.rejects(() => analyzeNvidiaDemoImage({fetchImpl:()=>{n++;}}),/NVIDIA_API_KEY/);
  assert.equal(n,0);
});

test('provider errors never relay secret or response body', async () => {
  await assert.rejects(() => analyzeNvidiaDemoImage({apiKey:'TEST_SECRET',fetchImpl:async()=>({ok:false,status:429,text:async()=> 'sensitive provider details'})}),/HTTP 429/);
  await assert.rejects(() => analyzeNvidiaDemoImage({apiKey:'TEST_SECRET',fetchImpl:async()=>{throw new Error('MY_PRIVATE_SECRET');}}),/network error/);
});

test('truncation and empty final answer cannot become PASS', async () => {
  const truncated=events({choices:[{delta:{reasoning_content:'reasoning'},finish_reason:'length'}]},'[DONE]');
  await assert.rejects(()=>readNvidiaSSE(responseFromChunks([truncated])),/truncated/);
  const empty=events({choices:[{delta:{},finish_reason:'stop'}]},'[DONE]');
  await assert.rejects(()=>readNvidiaSSE(responseFromChunks([empty])),/no final answer/);
  const incomplete=events({choices:[{delta:{content:'partial'},finish_reason:'stop'}]});
  await assert.rejects(()=>readNvidiaSSE(responseFromChunks([incomplete])),/without \[DONE\]/);
});

test('rejects malformed or overlarge stream rather than saving forged results', async () => {
  await assert.rejects(()=>readNvidiaSSE(responseFromChunks(['data: {bad json}\n\n'])),/Malformed/);
  await assert.rejects(()=>readNvidiaSSE(responseFromChunks(['x'.repeat(250)]),{maxBytes:200}),/limit/);
});

test('a streamed answer is never PASS without the provider stop marker', async () => {
  for (const reason of [null, 'content_filter', 'tool_calls']) {
    const invalid=events(
      {choices:[{delta:{content:'Looks like an answer'},finish_reason:reason}]}, '[DONE]');
    await assert.rejects(() => readNvidiaSSE(responseFromChunks([invalid])), /no successful stop/);
  }
});

test('processing preserves lines split in UTF-8 byte chunks', async () => {
  const text='Le panneau indique ARRÊT.';
  const wire=events({choices:[{delta:{content:text},finish_reason:null}]},
    {choices:[{delta:{},finish_reason:'stop'}]},'[DONE]');
  const bytes=new TextEncoder().encode(wire);
  const chunks=Array.from(bytes,b=>Uint8Array.of(b));
  const response={body:new ReadableStream({start(controller){for(const c of chunks)controller.enqueue(c);controller.close();}})};
  const r=await readNvidiaSSE(response);
  assert.equal(r.answer,text);
});
