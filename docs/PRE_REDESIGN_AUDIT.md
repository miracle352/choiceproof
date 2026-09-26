# Pre-redesign audit — 27 September 2026

This document records the state inspected before the information-architecture redesign.

## Repository and deployment

- Repository checkout: `miracle352/choiceproof`, clean at `a9b78ac` (`Keep failed runs isolated from prior evidence`).
- Framework: Next.js 16.3.6, React 19, TypeScript, Neon/PostgreSQL.
- Production: `https://choiceproof.vercel.app`.
- A direct production probe returned `SERV_API_KEY` configured, database configured and available, and Jev configured.
- A separate fresh-owner request to `/api/workspace` returned HTTP 200 with an empty, persistence-enabled workspace and a new secure, HttpOnly, SameSite=Strict owner cookie.
- Those probes establish configuration and database access only. They do not establish a successful SERV comparison, Jev analysis, save, publication, refresh recovery, or revision evaluation; those flows require separate end-to-end verification after the change.

## Current information architecture

- `/` renders the entire client workbench: sample comparison, service status, decision setup, challenge controls, case shelf, and revision bench.
- `/share/[id]` is the only separate product page. There is no `/chamber` or `/evidence` route.
- The desktop navigation points to anchors in the already-visible dashboard (`#workbench`, `#cases`, `#revision`).
- The first viewport exposes operational state and configuration alongside the proposition and sample, so the product story and the primary action compete with the full tool.

## Decision and experiment behavior

- `/api/decision` supports a standalone bounded SERV request without persistence.
- `/api/compare` requires persistence, performs two SERV calls, stores both runs, and returns an immutable snapshot of the submitted question, answers, and inputs.
- `lib/serv.ts` forces a single answer through a tool schema and validates the returned label against the configured answer set. Missing, malformed, timed-out, or out-of-bound responses fail rather than producing a fallback answer.
- `/api/analysis` reloads the owner-scoped measured pair and calls Jev independently. Jev failure is represented separately and does not invalidate a successful SERV comparison.
- The UI prevents stale requests from overwriting newer results and isolates a failed attempt from earlier results and Jev analysis.
- The current sample changes multiple facts at once (package condition, carrier evidence, and request date), so it is not a controlled one-variable example.

## Persistence and evaluation

- Anonymous ownership uses a random secure HttpOnly cookie; only its hash is stored.
- PostgreSQL stores nodes, versions, exact runs/raw responses, reviewed cases, rate-limit buckets, and published payloads.
- Saving a case reloads the exact owner-scoped run pair on the server. Later draft edits therefore cannot change the saved evidence.
- Human review requires an expected answer from the allowed set plus explicit challenge intent. A changed answer alone remains a review finding.
- Revision prompts use labeled cases only. Held-out cases are excluded from candidate generation and included in evaluation. Evaluation is capped at the first 12 saved cases and reports regressions, improvements, unchanged outcomes, relabeling requirements, and non-comparable cases.

## Publication boundary

- Publication currently requires an owner-scoped saved case, a checked consent value, and an explicit POST to `/api/publish`.
- A published result is copied into a separate sanitized JSON payload with a random 24-character public id and a 30-day expiry. Raw provider responses and owner identifiers are omitted.
- There is no public collection endpoint or evidence index.
- Held-out cases are not currently rejected by the publication query.
- Published payloads currently omit recorded run timestamps, case timestamp, publication schema version, and Jev analysis.
- The share detail shows the diff and verdict pair but not both full inputs, both model identities, both run timestamps, or a reproducible rerun surface.
- No fixed public owner hash is present in the inspected code.

## Assets and presentation

- The current visual system is a single large navy dashboard stylesheet.
- Available owned media: `faultline-paths-720p.mp4` (3.33 MB), `faultline-poster.webp` (47.9 KB), and `favicon.svg`.
- `components/decision-path-scene.tsx` provides a lazy video/poster treatment with reduced-motion and data-saver fallbacks, but it is not part of the current page render.
- The current hero sample contains invented latency and raw-response-shaped illustrative data. It is labeled SAMPLE, but the redesign should make the illustrative boundary even clearer and avoid presenting unmeasured metadata.

## Change constraints

The redesign must retain the bounded SERV adapter, server validation, owner-scoped persistence, immutable comparison snapshots, optional Jev isolation, human confirmation, held-out evaluation behavior, rate limiting, 30-day share expiry, and failed-run isolation. Public evidence must be a separate explicit publication surface and must never enumerate private workspace rows.
