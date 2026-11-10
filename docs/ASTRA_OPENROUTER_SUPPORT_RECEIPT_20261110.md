# ASTRA-281 — OpenRouter Support diagnostic + local retest — 2026-11-10

Status: **PARTIAL**. No authorized EU Inkling 2 Small generation was obtained. No geographic or credential security bypass was attempted.

## OpenRouter support reply

Original user inquiry: Gmail thread `1a1c2c9261b19c74`, sent message `1a1c2c9261b19c74` on 2026-11-10 00:08:45 UTC.

Reply received on Gmail: message `1a1c2cb36edba245`, timestamp `2026-11-10 00:10:59` (as provided by Gmail; timezone field not furnished), unread, important, inbox. The support response says that the EU in-region notice **does not confirm** whether the model is available to this EU account. It asks for incident UTC time, endpoint, HTTP status, redacted body, request ID.

## Diagnostic reply SENT — confirmed Gmail receipt

Gmail message `1a1c2dcffa77e83a` within same thread, label `SENT` on `2026-11-10T00:30:25`.

Evidence submitted:
- Date: `2026-11-09 22:21:57–22:22:00 UTC`.
- Test location: `Vercel Sandbox fra1`, Germany.
- Client: OpenCode CLI `1.19.5`; model `opencode/inkling-2-small-free`.
- OpenCode CLI error exit code `1`, literal `Error: This model is not available in your country`.
- Vercel session `sbx_0IvdOTKuZ02VN6Quq5lG1Ol2U6TS`, command `cmd_9fbd6ae4470247ca90fb06f7ef70`.
- **HTTP endpoint, HTTP status, OpenRouter request ID unavailable.** The test was against OpenCode, not OpenRouter; no invented request ID.
- Vercel `list_session_commands` still returns historical command and timestamps after stop. `get_session_command_logs` returns HTTP `410 sandbox_stopped`; the earlier CLI response was recorded in prior receipts, but the raw transient log can no longer be fetched.
- OpenRouter public catalog separately HTTP 200: exact `thinkingmachines/inkling-2-small:free`, `pricing.prompt="0"`, `pricing.completion="0"`. A public catalog response is **not inference**.

The diagnostic reply requested explicit eligibility clarification for the **global standard endpoint** `https://openrouter.ai/api/v1/chat/completions` from an EU-resident account using public synthetic agent-harness prompts.

## Reproducible local retest

Existing artifact exact path in current local environment: `/mnt/data/astra-inkling-openrouter-20261110`.

Executed:

```bash
cd /mnt/data/astra-inkling-openrouter-20261110
node --test tests/*.test.mjs
```

Result: exit code `0`, **33 tests, 33 pass, 0 fail**, duration approximately `128 ms`. All provider generation response assertions are **mocked**, not real Inkling output. This successful test does not prove entitlement, availability or a deployed service.

## Official public documents

- `https://openrouter.ai/thinkingmachines/inkling-2-small:free` — free agentic-harness endpoint (0 $ per input/output token), no confidential or personal data; prompts and outputs logged for TML research. The model is **not currently available through EU in-region routing**.
- `https://openrouter.ai/business/eu` — *in-region* endpoints require different processing guarantees and availability; a missing in-region endpoint is not definitive proof of globally routed account eligibility.
- `https://thinkingmachines.ai/news/inkling-2-small/` — provider initially announced closed weights on Tinker with intended Apache-2.0 release later, subject to external safety testing.
- Connected Hugging Face model lookup for `thinkingmachines/Inkling-2-Small` still reports model not found. Model release not confirmed.
- The public OpenRouter catalog lists the model, but **its usage from this specific account** and the applicability of restrictions remain unverified.

## Data handling and costs

Earlier cross-connector transport of a historical OpenRouter API key from Gmail to Vercel was **blocked by platform security**. Do not retry this or route the secret via messages, files, email, logs or alternate services. Existing infrastructure surveyed had no accessible pre-connected OpenRouter credential by name. No automatic paid fallback, subscription, VPN, proxy, region fakery, DNS changes, or new cron.

**PASS**: provider replied; precise diagnostic sent; tests retested; evidence documented.
**UNVERIFIED**: account EU permissions, key validity, actual model answer, service eligibility and provider delivery of the follow-up.
