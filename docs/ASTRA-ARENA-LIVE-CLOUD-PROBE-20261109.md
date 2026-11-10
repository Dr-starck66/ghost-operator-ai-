# ASTRA ARENA Ω — Live Cloud Probe 2026-11-09 (UTC)

Status: **PARTIAL (executor PASS, Inkling inference FAIL GEO, Nemotron inference UNVERIFIED)**.

## Authorization, isolation, and cost policy

- Existing connected Vercel team: `ced-starcks-projects` / `team_60CqvoYOQADnfTKgIkLWrLDW`.
- Existing **test** project: `freehotels-info-test` / `prj_qSZKxZMk6OfMoLShRS3K79n0GPF3`. Production projects were not changed.
- Ephemeral sandbox name: `astra-inkling-probe-20261109`.
- Session: `sbx_0IvdOTKuZ02VN6Quq5lG1Ol2U6TS`, region `fra1`, 1 vCPU / 2 GiB, 180 s hard timeout, `persistent: false`.
- Network allowlist: `opencode.ai`, `*.opencode.ai`, `registry.npmjs.org`, `github.com`, `*.github.com`, `*.githubusercontent.com`.
- No API keys supplied, no paid-model selection, no cron, no DNS/build/deployment edits, no generated code execution on any production service.
- **Vercel Hobby includes an advertised no-charge Sandbox allowance; exact account billing/remaining quota was not verified.** No payment or new subscription was authorized. Workload terminated explicitly.

## Observed execution, tool evidence

1. 2026-11-09T22:21:20Z: VM responded to `node -v` (`v24.22.1`), `npm -v` (`11.19.1`), `command -v opencode` (`/usr/local/bin/opencode`). HTTPS HEAD to `opencode.ai` and `registry.npmjs.org`: **HTTP 200**. Command `cmd_48e2f407e11a405b8c4e8d3ad541` exit 0.
2. `opencode --version`: **1.19.5**. `opencode models opencode` listed free models including `opencode/nemotron-3.5-super-vl-free`; **Inkling missing from current CLI's listing**. Command `cmd_a9feea2b9ad24e9fb824a8380ee7` exit 0.
3. 2026-11-09T22:21:57Z — 22:22:00Z: explicit `opencode run -m opencode/inkling-2-small-free` of a PUBLIC JSON smoke prompt. CLI output:
   ```text
   > build · inkling-2-small-free
   Error: This model is not available in your country
   ```
   Command `cmd_9fbd6ae4470247ca90fb06f7ef70` shell exit 0, nested CLI exit **1**. **FAIL GEO**; no inference answer. No reroute, VPN, region switch, workaround or bypass.
4. 2026-11-09T22:22:25Z — 22:23:20Z: free baseline `opencode/nemotron-3.5-super-vl-free`, one PUBLIC SEO prompt, command `cmd_807d44ee8d9a47abb8bc5f7bf047`. `timeout 55s` exit **124**, no answer text. **UNVERIFIED**, not a model success.
5. At 2026-11-09T22:23:36Z approximately, Vercel `stop_session` API confirmed **status: stopped**, `stoppedAt: 1794263016053`. Sandbox telemetry: `totalDurationMs: 149296`, `totalActiveCpuDurationMs: 20172`, egress `212510` bytes, ingress `24848916` bytes.

## Conclusion

- **PASS:** existing authorized free-tier-capable Vercel Linux runtime and OpenCode command execution verified; sandbox stopped.
- **FAIL:** official Inkling free provider rejected call with a geographic eligibility error.
- **UNVERIFIED:** actual Inkling/Nemotron output, model comparison accuracy, and final Vercel billing.
- **Next authorized action:** seek availability through an official, geographically permitted free offering (or a provider eligibility change); never attempt to evade location restrictions and never silently fall back to billed API calls.
