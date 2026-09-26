# Choiceproof

**Test the choice. Keep the proof.** Choiceproof tests bounded AI decisions with OpenServ SERV Reasoning v2. It records exact inputs and actual responses, lets a human label a changed answer, and reruns saved cases against a candidate revision.

## The 60-second path

1. Edit the question, 2–5 distinct answers, or synthetic input.
2. Select **Test a decision**, then **Run a controlled challenge**.
3. Read the exact diff and both actual SERV results.
4. Choose the expected answer and whether both inputs retain the same meaning; save the case.
5. Edit or request a revision candidate and rerun the first 12 saved cases.

A changed answer starts as **ANSWER CHANGED — REVIEW NEEDED**. It is not a verified failure until a human supplies both labels. Passing tests are not a universal safety guarantee.

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

No key gives a labeled read-only sample. `SERV_API_KEY` enables live one-off decisions. `DATABASE_URL` adds comparisons, cases, revisions, and opt-in share links.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `SERV_API_KEY` | Live runs | Server-only OpenServ credential |
| `DATABASE_URL` | Persistent workflow | PostgreSQL/Neon connection string |
| `SERV_MODEL` | No | Defaults to `gpt-5.4-mini` |
| `SERV_TIMEOUT_MS` | No | 5–60 seconds; default 30 seconds |
| `RATE_LIMIT_SALT` | Recommended | Salts forwarded-address hashes |

The demo accepts at most 32 KB/request, 1 MB/SERV response, and 40 weighted run units per anonymous owner/address every five minutes. Decisions and proposals cost 1, comparisons 2, and evaluation 2 per comparable case. Without PostgreSQL, limiting is best-effort per warm instance.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

See [architecture](docs/ARCHITECTURE.md), [deployment](docs/DEPLOYMENT.md), [operator guide](docs/DEMO_OPERATOR_GUIDE.md), [judge script](docs/JUDGE_SCRIPT.md), and [submission drafts](docs/SUBMISSION_DRAFT.md).

## Privacy and limits

- Inputs are private to an anonymous HttpOnly browser workspace by default.
- Publication requires a saved case, an explicit consent checkbox, and a publish action.
- Links expire after 30 days and omit raw provider responses and owner identifiers.
- Evaluation uses the first 12 cases; held-out cases never enter SERV revision prompts.

## Roadmap — not implemented

1. GitHub CI checks for saved labeled cases.
2. Private team workspaces.
3. Scheduled recurring regression runs.

These are future plans, not current capabilities.
