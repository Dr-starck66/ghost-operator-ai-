// ASTRA Nemotron Omega — permanent server-side NVIDIA adapter. No browser-side secret.
export const NEMOTRON_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';
const ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

export function validateNemotronInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid payload');
  const prompt = raw.prompt;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 6000)
    throw new Error('Prompt required (max 6000 characters)');
  let imageUrl = null;
  if (raw.imageUrl != null && raw.imageUrl !== '') {
    if (typeof raw.imageUrl !== 'string' || raw.imageUrl.length > 1600)
      throw new Error('Invalid image URL');
    let url;
    try { url = new URL(raw.imageUrl); } catch { throw new Error('Invalid image URL'); }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !host.includes('.') || host.includes(':') || host === 'localhost' ||
        /^\\d+(\\.\\d+){3}$/.test(host) ||
        /\\.(local|internal|localhost|onion|test|invalid|example)$/.test(host)) {
      throw new Error('Public HTTPS image URL required');
    }
    imageUrl = url.toString();
  }
  if (Object.keys(raw).some(k => !['prompt', 'imageUrl'].includes(k)))
    throw new Error('Unsupported parameter');
  return { prompt: prompt.trim(), imageUrl };
}

export async function invokeNemotron(raw, options = {}) {
  const { apiKey, fetchImpl = fetch, timeoutMs = 45000 } = options;
  const input = validateNemotronInput(raw);
  if (!apiKey) throw Object.assign(new Error('NVIDIA_NOT_CONFIGURED'), { code: 'CONFIG_MISSING' });
  const content = input.imageUrl
    ? [{ type: 'text', text: input.prompt }, { type: 'image_url', image_url: { url: input.imageUrl } }]
    : input.prompt;
  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: NEMOTRON_MODEL, messages: [{ role: 'user', content }],
        max_tokens: 384, temperature: 1, top_p: 0.95, stream: false,
        chat_template_kwargs: { enable_thinking: false }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw Object.assign(new Error('NVIDIA_NETWORK_OR_TIMEOUT'), { code: 'PROVIDER_NETWORK' });
  }
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    // Never echo provider details: they may include submitted content or API identifiers.
    throw Object.assign(new Error('NVIDIA_HTTP_' + response.status), {
      code: 'PROVIDER_HTTP', httpStatus: response.status
    });
  }
  const value = payload?.choices?.[0]?.message?.content;
  const answer = typeof value === 'string' ? value.trim() : '';
  if (!answer) throw Object.assign(new Error('NVIDIA_EMPTY_OR_INVALID_RESULT'), { code: 'PROVIDER_CONTENT' });
  return {
    status: 'PASS', provider: 'NVIDIA', model: NEMOTRON_MODEL,
    answer: answer.slice(0, 9000),
    responseId: String(payload.id || '').slice(0, 100),
    usage: {
      promptTokens: Number(payload.usage?.prompt_tokens || 0),
      completionTokens: Number(payload.usage?.completion_tokens || 0)
    },
    modality: input.imageUrl ? 'text_image' : 'text',
    verifiedAt: new Date().toISOString()
  };
}
