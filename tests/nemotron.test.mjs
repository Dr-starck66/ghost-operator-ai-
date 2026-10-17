import test from 'node:test';
import assert from 'node:assert/strict';
import { NEMOTRON_MODEL, validateNemotronInput, invokeNemotron } from '../server/nemotron.mjs';

test('validates inputs and blocks local, private or malformed image URLs', () => {
  assert.deepEqual(validateNemotronInput({ prompt: ' Test ' }), { prompt: 'Test', imageUrl: null });
  for (const imageUrl of ['http://example.com/a.png', 'https://localhost/a.png',
    'https://127.0.0.1/a.png', 'https://internal.local/a.png',
    'https://user:password@example.com/a.png', 'file:///etc/passwd']) {
    assert.throws(() => validateNemotronInput({ prompt: 'See', imageUrl }));
  }
  assert.throws(() => validateNemotronInput({ prompt: '' }));
  assert.throws(() => validateNemotronInput({ prompt: 'x'.repeat(6001) }));
  assert.throws(() => validateNemotronInput({ prompt: 'hello', max_tokens: 100000 }));
});
test('invokes the real NVIDIA contract with server-only auth and bounds', async () => {
  let called = 0;
  const mock = async (url, options) => {
    called++;
    assert.equal(url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer secret-for-test');
    const body = JSON.parse(options.body);
    assert.equal(body.model, NEMOTRON_MODEL);
    assert.equal(body.max_tokens, 384);
    assert.equal(body.stream, false);
    assert.equal(body.messages[0].content[0].type, 'text');
    assert.equal(body.messages[0].content[1].type, 'image_url');
    assert.ok(!JSON.stringify(body).includes('secret-for-test'));
    return { ok: true, status: 200, json: async () => ({ id: 'resp-123',
      choices: [{ message: { content: 'ASTRA OPÉRATIONNEL' } }],
      usage: { prompt_tokens: 20, completion_tokens: 5 } }) };
  };
  const result = await invokeNemotron({ prompt: 'Inspecte', imageUrl: 'https://images.example.org/a.png' },
    { apiKey: 'secret-for-test', fetchImpl: mock });
  assert.equal(called, 1);
  assert.equal(result.status, 'PASS');
  assert.equal(result.modality, 'text_image');
  assert.equal(result.answer, 'ASTRA OPÉRATIONNEL');
  assert.equal(result.usage.promptTokens, 20);
});
test('missing key and upstream HTTP errors never emit false PASS', async () => {
  await assert.rejects(() => invokeNemotron({ prompt: 'Hi' }, { apiKey: '' }), /NOT_CONFIGURED/);
  await assert.rejects(() => invokeNemotron({ prompt: 'Hi' }, {
    apiKey: 'fake', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({
      error: { message: 'private prompt' } }) })
  }), e => e.code === 'PROVIDER_HTTP' && e.httpStatus === 401 &&
    !e.message.includes('private prompt'));
  await assert.rejects(() => invokeNemotron({ prompt: 'Hi' }, {
    apiKey: 'fake', fetchImpl: async () => ({ ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '' } }] }) })
  }), /EMPTY_OR_INVALID/);
});
test('network timeout is not misreported as success and input rejection prevents outbound calls', async () => {
  await assert.rejects(() => invokeNemotron({ prompt: 'Hi' }, {
    apiKey: 'fake', fetchImpl: async () => { throw new Error('network down secret'); }
  }), e => e.code === 'PROVIDER_NETWORK' && !e.message.includes('secret'));
  let called = false;
  await assert.rejects(() => invokeNemotron({ prompt: 'Hi', imageUrl: 'https://127.0.0.1/admin' },
    { apiKey: 'fake', fetchImpl: async () => { called = true; } }));
  assert.equal(called, false);
});
