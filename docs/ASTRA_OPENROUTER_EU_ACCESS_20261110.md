# ASTRA-281 — Official OpenRouter route for Inkling 2 Small (2026-11-10)

**Outcome: PARTIAL.** A genuinely free and explicitly supported third-party API route was identified, but the production authorization for an EU-based account and the authenticated model output are **UNVERIFIED**. No charged provider or inference call was made.

## New independent official evidence

- `https://openrouter.ai/thinkingmachines/inkling-2-small:free`: official OpenRouter model ID, free tokens, agentic-harness-only; public synthetic inputs only (prompts/outputs logged for TML research/training). Released 2026-11-09.
- `https://openrouter.ai/api/v1/models`: GET from authorized Vercel Sandbox in Frankfurt returned **HTTP 200**, listing the exact ID with both `pricing.prompt` and `pricing.completion` equal to `"0"`. Endpoint metadata alone is NOT an inference result.
- `https://thinkingmachines.ai/legal/tml-free-research-api-tier-terms-of-service.pdf`: Official TML Free Research API terms include OpenRouter as an API platform, nominal $0 service pricing, and a worldwide limited access license subject to policies and geographic/provider constraints. It prohibits submitting confidential, sensitive or personally identifying data. The PDF screenshot and extracted text may differ on version metadata; treat precise regional eligibility as **unverified**, not waived.
- `https://openrouter.ai/business/eu`: "Not currently available through EU in-region routing" refers to EU data residency. It does NOT itself establish whether EU users may use the *global standard* endpoint. A provider confirmation was requested; do not bypass OpenCode's separate EU denial or misrepresent geography.
- Existing account: welcome and OpenRouter emails in connected Gmail. Two user-owned messages containing legacy key-shaped text were located, **not exposed, published or transferred**. A platform security control blocked cross-service credential transfer to Vercel; do not retry by an alternate transfer route. An old key's current validity was NOT checked.
- A separate existing Vercel test sandbox `astra-openrouter-inkling-eu-20261110` was stopped after public metadata reads. No inference or paid API calls.
- A question about legal EU use and no-cost testing of the global endpoint was sent through Gmail to `support@openrouter.ai`, Gmail message/thread `1a1c2c9261b19c74` with `SENT`. No delivery/read/acceptance proven.

## Executable integration (branch-only, no deployment)

- `server/astra-arena-openrouter-free.mjs` SHA Git blob `55ad09127de124aea3df9cc66eea2d16a3d1340a`.
- `tests/astra-arena-openrouter-free.test.mjs` SHA Git blob `3b3bbe87a5cd8b80862094d1b9de36485894096a`.
- Full test suite: `node --test tests/*.test.mjs` => **33/33 PASS (local Node 22.16.0)**. New connector adds 11 deterministic, mocked tests. Strictly distinguish mocked provider output from real inference.
- `probeFreeModelCatalog` is GET only and confirms both prices are zero for exact model ID.
- `makeOpenRouterFreeRunner` refuses provider calls absent: explicit written EU permission supplied by runtime, accepted research-data terms, freshly verified $0 catalog (<1 hour), a public synthetic ASTRA task with intact hash, and an API key obtained inside the authorized **same** execution environment. It uses exact `:free` model, 128-token cap, disables provider fallback, does not retry or leak errors, and rejects any reported nonzero cost.
- The existing ASTRA paired runner still demands BOTH candidate entitlements; no comparison result has been produced.

## Status

| Item | Result |
|---|---|
| Real public OpenRouter catalog and exact free model pricing | PASS |
| Existing OpenRouter account signal | PASS (Gmail correspondence), key validity UNVERIFIED |
| Code, local unit suite, exact Git SHAs | PASS |
| Provider's official EU standard endpoint authorization | UNVERIFIED |
| Actual Inkling 2 Small free inference on ASTRA | UNVERIFIED |
| Original OpenCode EU access | FAIL (geo restriction) |
| New account, spend, production deployment, API-key transfer | NONE |

Do not merge until the EU permission and safe, same-executor credential binding are validated. Do not silently change DNS, projects, user payments, routes or model names.
