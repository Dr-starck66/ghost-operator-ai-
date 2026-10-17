// ASTRA Ω — opt-in streamed NVIDIA Nemotron 3.5 Super VL visual smoke test.
// No site automation and no billed call from the default test suite.
export const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const NVIDIA_VL_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';
export const NVIDIA_DEMO_IMAGE_URL = 'https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg';

export function makeImageRequest(imageUrl = NVIDIA_DEMO_IMAGE_URL) {
  // Fixed provider-owned public fixture. Never forward arbitrary user URLs or secrets.
  if (imageUrl !== NVIDIA_DEMO_IMAGE_URL) throw new Error('Only the NVIDIA public image fixture is allowed.');
  return {
    model: NVIDIA_VL_MODEL,
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Read the traffic sign in this image. What does it say, and what color is the sign?' },
      { type: 'image_url', image_url: { url: imageUrl } },
    ] }],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384, // Reasoning consumes completion budget.
    seed: 42,
    // With no callable tools, parallel_tool_calls has no effect; do not enable tools.
    chat_template_kwargs: { enable_thinking: true },
    stream: true,
  };
}

export async function readNvidiaSSE(response, { onDelta = () => {}, maxBytes = 2_000_000 } = {}) {
  if (!response?.body) throw new Error('NVIDIA response has no stream.');
  const decoder = new TextDecoder();
  let buffered = '';
  let frame = [];
  let bytesRead = 0;
  let finished = false;
  let answer = '';
  let reasoningChars = 0;
  let finishReason = null;
  function processFrame() {
    if (!frame.length) return;
    const lines = frame;
    frame = [];
    const data = lines.join('\n');
    if (data === '[DONE]') { finished = true; return; }
    let parsed;
    try { parsed = JSON.parse(data); } catch { throw new Error('Malformed NVIDIA stream event.'); }
    const choice = parsed?.choices?.[0];
    if (!choice) return; // e.g., optional usage-only event.
    if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason;
    const delta = choice.delta || {};
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoning === 'string' && reasoning) {
      reasoningChars += reasoning.length;
      onDelta({ kind: 'reasoning', text: reasoning });
    }
    if (typeof delta.content === 'string' && delta.content) {
      answer += delta.content;
      if (answer.length > 40_000) throw new Error('NVIDIA answer exceeds the maximum allowed length.');
      onDelta({ kind: 'answer', text: delta.content });
    }
  }
  const consume = (value) => {
    buffered += value;
    if (buffered.length > maxBytes) throw new Error('NVIDIA stream frame exceeds the limit.');
    let pos;
    while ((pos = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, pos).replace(/\r$/, '');
      buffered = buffered.slice(pos + 1);
      if (!line) { processFrame(); continue; }
      if (line.startsWith('data:')) frame.push(line.slice(5).trimStart());
    }
  };
  for await (const chunk of response.body) {
    bytesRead += chunk.byteLength;
    if (bytesRead > maxBytes) throw new Error('NVIDIA stream exceeds the limit.');
    consume(decoder.decode(chunk, { stream: true }));
    if (finished) break;
  }
  consume(decoder.decode());
  if (!finished) throw new Error('NVIDIA stream terminated without [DONE].');
  if (finishReason === 'length') throw new Error('NVIDIA reasoning or answer was truncated by max_tokens.');
  if (!answer.trim()) throw new Error('NVIDIA returned no final answer.');
  return {
    model: NVIDIA_VL_MODEL,
    answer: answer.trim(),
    reasoning_present: reasoningChars > 0,
    reasoning_char_count: reasoningChars,
    finish_reason: finishReason,
    status: 'MODEL_OUTPUT_UNVERIFIED',
  };
}

export async function analyzeNvidiaDemoImage({ apiKey, fetchImpl = fetch, onDelta, timeoutMs = 90_000 } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('NVIDIA_API_KEY unavailable.');
  let response;
  try {
    response = await fetchImpl(NVIDIA_CHAT_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(makeImageRequest()),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch { throw new Error('NVIDIA network error or timeout.'); }
  if (!response.ok) throw new Error('NVIDIA endpoint returned HTTP ' + response.status + '.');
  return readNvidiaSSE(response, { onDelta });
}
