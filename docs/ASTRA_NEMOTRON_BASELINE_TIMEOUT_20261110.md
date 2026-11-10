# ASTRA ARENA Ω — Nemotron public free baseline probe (10 November 2026)

## Negative result — preserve as factual evidence

**Status: FAIL_TIMEOUT / no model output.** This is not an Inkling inference result or proof of Nemotron capability.

- Connected Vercel project: existing test-only `freehotels-info-test`, region `fra1`.
- Sandbox: `astra-arena-nemotron-baseline-20261110`, `persistent:false`, 1 vCPU, 2048 MiB RAM, 80 s sandbox maximum.
- Vercel session ID: `sbx_AG61hMp5IOy1ffIIVbF556Lg1c4M`.
- Command ID: `cmd_2796203fceb74903abdd27594e46`.
- 2026-11-10 00:38:16 UTC: ran via Node child-process spawnSync:
  ```sh
  opencode run --model opencode/nemotron-3.5-lightning-free 'Return only this exact JSON: {"even_sum":12}. This is a synthetic public task.'
  ```
- CLI stderr showed `> build · nemotron-3.5-lightning-free` with **no subsequent model text**.
- 2026-11-10 00:38:49 UTC: `spawnSync` terminated process by SIGTERM due to `ETIMEDOUT` after ~33 seconds; `stdout=""`, `status=null`.
- Vercel execution wrapper exited 0 (it successfully logged the nested timeout), **NOT a successful model generation**.
- Vercel `stop_session` confirmed `status:"stopped"`. Final sandbox telemetry: 59,287 ms wall, 5,793 ms active CPU, 53,774 egress bytes.
- Earlier baseline `opencode/nemotron-3.5-super-vl-free` had also timed out after 55 s. **Both variants UNVERIFIED as sources of model answers**.
- CLI prompts were public and synthetic; no API credential, production deployment, user data, new subscription, proxy, VPN, geographic change, or paid-model fallback. Account billing was not independently audited.
- OpenRouter support thread `1a1c2c9261b19c74` inspected after diagnostic reply; **no new response**, Tinker thread `1a1c2774abb87aca` likewise had no reply at time of check.
- Hugging Face connector still returned `Model 'thinkingmachines/Inkling-2-Small' not found`. Official site announces a future Apache-2.0 weights release but has not confirmed its availability.

## Operational correction

Do not retry the same OpenCode free Nemotron CLI baseline with the same environment, task and model configuration without new proof of provider/model availability or a changed execution path. No fabricated benchmark metrics.

Report **PARTIAL** for the project, **FAIL_TIMEOUT** for this exact command, **PASS** for cleanup and receipt.
