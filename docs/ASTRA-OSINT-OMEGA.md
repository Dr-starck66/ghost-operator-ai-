# ASTRA OSINT Ω — passive intelligence extension

**Host:** existing Ghost Operator server (`Dr-starck66/ghost-operator-ai-`). No new host, API plan, scheduler, GitHub Actions runner or outbound campaign.

## Evidence / provenance
- Metadata source: [OSINT Framework](https://github.com/lockfale/OSINT-Framework), Justin Nordine, MIT license.
- Official upstream catalog: `public/arf.json`, fetched only on demand from the fixed GitHub raw URL, cached in process for 6 hours.
- Strict tool filter: `live` / `free` / `passive` / browser HTTPS / no registration / no local install. **Upstream labels are not independently verified.**
- DNS evidence: Node.js passive DNS resolver A/MX/NS/CAA only; reports include observation time, errors, per-type status and SHA-256 digest.
- Search scope: public domains, company registries and domain/infrastructure directory links. Company identification, domain ownership, lead quality and rankings are not inferred.
- Explicitly disabled: tracking/Grabify links, face identification/PimEyes, scanning, bulk collection, credential lookup, outbound messaging and purchases.
- No independent continuous execution is claimed. On-demand invocation only; DNS checks are actual lookups when the API is called.

## Existing authenticated API

All endpoints require `x-ghost-token: <existing GHOST_ADMIN_TOKEN>`, with `Cache-Control: no-store`.

- `GET /api/astra/osint/status` — capability and cache metadata.
- `GET /api/astra/osint/catalog?category=domain|business|infrastructure&q=&limit=15` — verified-filter *catalog metadata*, no third-party tools executed.
- `POST /api/astra/osint/domain` with JSON `{"domain":"example.com"}` — passive DNS and precomposed external research links (links are not observations).

## Integration rules
This integrates into the already existing Ghost Operator backend, sharing the existing authentication, source repository and deployment. The legacy `/api/tasks`, multi-agent `/api/astra/team`, and prospect consent/approval workflows are unchanged. It does not alter DNS records, campaign approval, search index, domain pricing or GSC properties.

## Test / deployment acceptance
`npm test && npm run build` through existing Railway Railpack build. Test source: `tests/astra-osint.test.mjs`.
Do not mark production PASS until Railway deploy references the exact commit and authenticated API behavior (401 without token / successful DNS with authorized token) is independently checked.
