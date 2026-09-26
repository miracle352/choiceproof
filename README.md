# Choiceproof

Choiceproof is a public workbench for testing bounded AI decisions with OpenServ SERV Reasoning v2. A visitor defines one decision question, 2–5 allowed answers, and an input; Choiceproof forces the model to select within that answer set, validates the response on the server, and tests how the decision behaves under controlled challenges.

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

When no API key is configured, the app is deliberately read-only and labels all displayed output as sample data.

## Local setup

Requirements: Node.js 20.9 or newer, an OpenServ SERV API key, and a Postgres database. Neon’s serverless Postgres driver is used so the same setup works locally and on Vercel.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Set `SERV_API_KEY` and `DATABASE_URL` in `.env.local`. Create a key in the [OpenServ console](https://console.openserv.ai). The key and database URL are read only by server modules and are never sent to the browser.

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

`POST /api/compare` persists the original and challenged runs. `POST /api/cases` accepts the reviewer’s expected label and meaning-preservation judgment. `POST /api/revision/evaluate` reruns labeled and held-out cases and reports regressions, improvements, unchanged outcomes, and cases needing relabeling. Anonymous ownership is enforced with a random, HTTP-only cookie whose SHA-256 hash is stored in the database. There is no public case-listing endpoint, and submitted text is not published by default.

Reference: [OpenServ API overview](https://docs.openserv.ai/serv-reasoning/api) and [chat completions](https://docs.openserv.ai/serv-reasoning/api/chat-completions).

## Deployment

Deploy as a standard Next.js application and configure `SERV_API_KEY` and `DATABASE_URL` as server-side secrets in the hosting provider. Do not expose either value through a `NEXT_PUBLIC_` variable.

Without both values, the app deliberately switches to a clearly labeled, read-only sample. Sample output is never represented as a live run.
