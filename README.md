# Choiceproof

Choiceproof is a public workbench for testing bounded AI decisions with OpenServ SERV Reasoning v2. A visitor defines one decision question, 2–5 allowed answers, and an input; Choiceproof forces the model to select within that answer set, validates the response on the server, and compares consecutive runs.

## What it shows

- The validated answer selected by SERV
- The model reported by the API
- The upstream provider when the API returns one (otherwise explicitly “Not returned by API”)
- Server-measured request latency
- The complete raw API response
- A side-by-side comparison of the latest two inputs and answers

When no API key is configured, the app is deliberately read-only and labels all displayed output as sample data.

## Local setup

Requirements: Node.js 20.9 or newer and an OpenServ SERV API key.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Set `SERV_API_KEY` in `.env.local`. Create a key in the [OpenServ console](https://console.openserv.ai). The key is read only by the server-side route and is never sent to the browser.

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SERV_API_KEY` | For live runs | — | Server-only bearer token for SERV |
| `SERV_MODEL` | No | `gpt-5.4-mini` | SERV catalog model ID |
| `SERV_TIMEOUT_MS` | No | `30000` | Request timeout, clamped to 5–60 seconds |

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

## API design

`POST /api/decision` validates all public input, then calls the documented SERV v2 OpenAI-compatible endpoint:

```text
POST https://inference-api.openserv.ai/v1/chat/completions
```

The adapter includes the required system message and uses documented OpenAI-format `tools` plus forced `tool_choice`. The function schema constrains `answer` to the visitor’s 2–5 choices. The server still validates the returned tool arguments and rejects malformed or out-of-set results. No probabilities, hidden traces, or provider identities are invented.

Reference: [OpenServ API overview](https://docs.openserv.ai/serv-reasoning/api) and [chat completions](https://docs.openserv.ai/serv-reasoning/api/chat-completions).

## Deployment

Deploy as a standard Next.js application and configure `SERV_API_KEY` as a server-side secret in the hosting provider. Do not expose it through a `NEXT_PUBLIC_` variable.
