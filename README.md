<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f2d09ad6-438c-4f60-94c2-6165bc10766c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## ASTRA Ω — optional NVIDIA Nemotron 3.5 Super VL integration

The production extraction queue is unchanged. NVIDIA calls are **OFF by default**. The extra inference analyzes only already-extracted evidence, not raw browsing sessions. The model has **no tools** and cannot execute actions. Its output remains labeled **UNVERIFIED**.

1. On a hosting service that already runs this Express application, set `NVIDIA_API_KEY` using the platform's **secret manager** (never commit or paste it into a public chat). Set `ASTRA_NVIDIA_ENABLED=1` only after confirming that the NVIDIA endpoint's trial limit meets your budget. Missing flag or key results in HTTP 503 and **no API call**.
2. Authenticate using the existing `GHOST_OPERATOR_USER` and `GHOST_OPERATOR_PASSWORD`; create and complete a normal extraction via `POST /api/tasks`.
3. Send `POST /api/tasks/:id/analyze` (Basic auth) to request one opt-in analysis of that completed task. The response is persisted as `aiAnalysis` without changing extraction evidence; repeated calls return the saved analysis without another paid inference.
4. The server's `GET /api/health` field `nemotron_configured_not_verified` only shows configuration, **not** actual model availability.

Independent no-key tests: `node --test tests/nemotron-adapter.test.mjs`. Live provider smoke: `NVIDIA_API_KEY=... node nemotron-live-smoke.mjs` (text), optional `NVIDIA_LIVE_VISION=1` (adds public demonstration image). The smoke is manual and not part of default tests. It reports latency, text, HTTP status and token usage, but never the key. Hosting, e2e production, API credits, vision and video capabilities must each be verified separately.

Provider: https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b

**Security:** HTML excerpts are untrusted; the prompt asks the model to treat them as data, and model output never drives tools or write actions. Prompt-injection resistance is not guaranteed; no financial, privileged, or irreversible steps are authorized by model output.


### NVIDIA Super VL — image, streamed answer and reasoning

This branch also contains an opt-in image smoke test based on the official NVIDIA Build example:

- `nemotron-vision-stream.mjs` composes the visual request (fixed, public NVIDIA traffic-sign image), enables reasoning, handles fragmented SSE events (`reasoning_content` and final `content`) independently and rejects truncated or empty outputs.
- `nemotron-vision-live.mjs` makes one **manual** NVIDIA hosted call using `NVIDIA_API_KEY` from the server environment and prints only the final answer (not raw reasoning or the key). Never run it automatically on startup or in a cron.
- `tests/nemotron-vision-stream.test.mjs` checks the multimodal payload and simulated streaming responses, missing API key, errors, empty/truncated results and malformed streams. No vendor credits are used by these tests.

No direct user-provided URL or credential is passed through the visual test: its image is NVIDIA's fixed public documentation fixture.

Local Node.js reproduction:
```bash
node --test tests/nemotron-adapter.test.mjs tests/nemotron-vision-stream.test.mjs
node --check nemotron-vision-stream.mjs
node --check nemotron-vision-live.mjs
# Only after securely setting the environment variable AND approving a trial request:
node nemotron-vision-live.mjs
```

On 2026-10-17, the **13 local Node.js adapter/vision tests PASSED** (mocked NVIDIA output). The two additional regression tests reject non-`stop` finish reasons and verify UTF-8 SSE framing across single-byte chunks. Reproducibility: Git blob `nemotron-vision-stream.mjs` = `ee37d4d3903093180a7cb2f5636a404bc5ee90be`; blob `tests/nemotron-vision-stream.test.mjs` = `5291fd3d9cac94db9d600f8d0bb170c8e7ded6a0`; both match the locally tested files. The unmodified adapter tests passed too. **This does not verify a live NVIDIA inference, traffic-sign accuracy, a complete Express build, production integration, or deployment.** The local execution environment has no NVIDIA_API_KEY and cannot resolve external domains. The default authenticated Ghost extraction endpoint continues to work without NVIDIA.