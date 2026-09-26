# FAULTLINE

FAULTLINE is a public workbench for testing bounded AI decisions with OpenServ SERV Reasoning v2. A visitor defines one decision question, 2–5 allowed answers, and an input; FAULTLINE forces the model to select within that answer set, validates the response on the server, and tests how the decision behaves under controlled challenges.

## What it shows

- The validated answer selected by SERV
- The model reported by the API
- The upstream provider when the API returns one (otherwise explicitly “Not returned by API”)
- Server-measured request latency
- The complete raw API response
- Five SERV-proposed challenge types: irrelevant context, reordered evidence, ambiguity, conflicting evidence, and an embedded instruction
- An editable challenge input and an exact text diff with measured additions/removals
- Side-by-side original and challenged results, including each raw API response
- Human review before a changed answer can become a verified failure
- Private labeled and held-out cases that can be rerun against candidate revisions
- Explicit label mapping when a revision removes or renames an answer choice
- Every measured regression; a candidate is never described as fixed or safe merely because one case improves

The product has three honest operating modes:

1. **SAMPLE** — no SERV key. The editable controls are read-only and every illustrative result is labeled as a sample; no API request is implied.
2. **ONE-OFF LIVE** — SERV is configured but persistence is unavailable. Visitors can edit every decision field and make a genuine `/api/decision` request. Challenge comparison, saved cases, and revision evaluation remain disabled.
3. **FULL WORKBENCH** — SERV and a reachable database are available. Decision, challenge, review, save, and revision workflows are enabled.

Configuration and observed health are shown separately. A configured database is not presented as healthy until `/api/workspace` succeeds, and failed calls surface a sanitized, actionable category without returning credentials or private text.

The decision-path scene is driven by the real comparison state. Its silent 1280×720 source is web-optimized without claiming an artificial resolution increase and lazy-loaded on capable devices, including mobile. Data-saver, reduced-motion, slow-loading, and playback-failure environments retain a sharp poster and CSS path treatment. The workbench remains the primary interaction and never waits for the scene.

## The 60-second path

1. Edit the prefilled question, 2–5 allowed answers, or synthetic input.
2. Select **Test a decision** for a one-off answer, or choose a controlled challenge in the full workbench.
3. Inspect both actual answers and the exact input diff.
4. Mark the expected answer and whether the changed input still describes the same underlying case.
5. Save the reviewed case and evaluate a candidate revision against the **first 12 saved cases**.

An answer change is a finding for human review, not automatically an error. A passing test set is evidence about those cases, never a universal safety guarantee.

## Local setup

Requirements: Node.js 20.9 or newer. An OpenServ SERV API key enables live decisions; a Postgres database additionally enables the persistent workbench. Neon’s serverless Postgres driver is used so the same setup works locally and on Vercel.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Set `SERV_API_KEY` and, optionally, `DATABASE_URL` in `.env.local`. Create a key in the [OpenServ console](https://console.openserv.ai). The key and database URL are read only by server modules and are never sent to the browser.

The app creates its schema on the first database-backed request. The authoritative schema is also available at [`db/001_initial.sql`](db/001_initial.sql). On Vercel, install the Neon Marketplace integration on the project and connect its injected `DATABASE_URL` to Production and Preview.

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SERV_API_KEY` | For live runs | — | Server-only bearer token for SERV |
| `DATABASE_URL` | For live persistence | — | Server-only Postgres connection string |
| `SERV_MODEL` | No | `gpt-5.4-mini` | SERV catalog model ID |
| `SERV_TIMEOUT_MS` | No | `30000` | Request timeout, clamped to 5–60 seconds |

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## API design

The decision, challenge, and revision routes validate all public input, then call the documented SERV v2 OpenAI-compatible endpoint:

```text
POST https://inference-api.openserv.ai/v1/chat/completions
```

The adapter includes the required system message and uses documented OpenAI-format `tools` plus forced `tool_choice`. The function schema constrains `answer` to the visitor’s 2–5 choices. The server still validates the returned tool arguments and rejects malformed or out-of-set results. No probabilities, hidden traces, or provider identities are invented.

`POST /api/compare` persists the original and challenged runs. Its immutable response snapshot drives the visible results and diff. `POST /api/cases` accepts only the run identifiers and human labels, then reloads the exact server-owned input pair and answers before saving; later draft edits cannot corrupt a measured case. Duplicate run-pair submissions are idempotent through a deterministic case identifier, without deleting or rewriting existing cases. `POST /api/revision/evaluate` considers at most the first 12 saved cases and reports regressions, improvements, unchanged outcomes, cases needing relabeling, and reviewer-marked non-comparable cases that were skipped. Held-out cases are excluded from SERV revision prompts. Anonymous ownership is enforced with a random, HTTP-only cookie whose SHA-256 hash is stored in the database. There is no public case-listing endpoint, and submitted text is not published by default.

The SERV request contract was rechecked against the official documentation on 2026-09-26. Reference: [OpenServ API overview](https://docs.openserv.ai/serv-reasoning/api) and [chat completions](https://docs.openserv.ai/serv-reasoning/api/chat-completions).

## Deployment

Deploy as a standard Next.js application and configure `SERV_API_KEY` and `DATABASE_URL` as server-side secrets in the hosting provider. Do not expose either value through a `NEXT_PUBLIC_` variable.

Without a SERV key, the app switches to a clearly labeled, read-only sample. With a SERV key but no usable database, genuine one-off decisions remain available. Sample output is never represented as a live run.
