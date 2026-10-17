// Manually opt in: NVIDIA_API_KEY=... node nemotron-vision-live.mjs
// This is NOT executed by tests or on server startup.
import { analyzeNvidiaDemoImage } from './nemotron-vision-stream.mjs';
if (!process.env.NVIDIA_API_KEY) {
  console.error('UNVERIFIED: NVIDIA_API_KEY not configured. No API request was sent.');
  process.exitCode = 2;
} else {
  const start = Date.now();
  try {
    const result = await analyzeNvidiaDemoImage({
      apiKey: process.env.NVIDIA_API_KEY,
      onDelta: ({kind,text}) => {
        if (kind === 'answer') process.stdout.write(text);
        // Reasoning is parsed to validate streaming, but is not logged by default.
      },
    });
    process.stdout.write('\n');
    console.log(JSON.stringify({ outcome:'PROVIDER_CALL_SUCCEEDED', elapsed_ms:Date.now()-start,
      model:result.model, reasoning_present:result.reasoning_present,
      finish_reason:result.finish_reason, content_requires_human_verification:true }));
  } catch (error) {
    console.error('FAIL: ' + error.message);
    process.exitCode = 1;
  }
}
