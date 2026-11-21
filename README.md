# Browsemux

**A bounded decision bridge between agent harnesses and browser backends.**

Browsemux sits between a harness, a typed decision model, and a browser. The
decision model proposes one operation and one currently observed target. The
connector validates that proposal, executes it through the selected browser
backend, observes the result, and repeats within a strict budget.

The decision model never receives a browser handle and never executes code.

```text
Harness
  -> Browsemux
     -> typed decision provider
     -> local proposal validation
     -> agent-browser or BSK
     -> settled observation
  <- compact evidence, usage, timings, and handoff
```

## Why

Harness language models are useful for planning, but repeatedly sending full
page snapshots through a general model is slow and expensive. Browsemux moves
bounded page-level choices to a decision model while keeping deterministic
control in code.

This is the same broad loop shape as JEV Ultrafast:

- Observe an indexed page.
- Ask for an operation and target in one request.
- Execute one validated action.
- Observe again.
- Stop at a bounded limit or deterministic success condition.

Unlike a full browser-agent framework, Browsemux does not own reasoning about
the entire task. The harness remains the planner and final verifier.

## Current Scope

Browser backends:

- `agent-browser`
- BSK / Tencent Agent Window

Decision providers:

- TypeSafe System One / JEV
- OpenRouter Decisions
- OpenAI-compatible chat completions with JSON output

Browser Use, Playwright, Stagehand, Skyvern, and other frameworks are outside
the initial scope.

## Measured Baseline

The repeatable one-click benchmark on 2026-11-21 completed 3 of 3 runs with
both supported backends. Median end-to-end time was 4,065 ms with
`agent-browser` and 3,401 ms with BSK. The decision call was roughly 2.5
seconds in both cases, so model latency dominated the run.

See [docs/benchmarks.md](docs/benchmarks.md) for commands, ranges, token usage,
cost, and limitations. This is a small public-site benchmark, not a universal
browser-agent ranking.

## Requirements

- Node.js 20 or newer
- One browser backend:
  - `agent-browser` 0.38 or newer
  - Tencent `bsk`
- One decision-provider API key

Check local commands:

```bash
browsemux doctor
```

## Install From Source

```bash
cd browsemux
npm link
browsemux --help
```

No runtime npm dependencies are installed by Browsemux.

## Quick Start

### agent-browser plus JEV

```bash
export TYPESAFE_API_KEY=...
browsemux run \
  --backend agent-browser \
  --provider typesafe \
  --url https://example.com \
  --goal "Open the Learn more documentation link" \
  --success-url-contains iana.org \
  --max-steps 4
```

### agent-browser plus OpenRouter Decisions

```bash
export OPENROUTER_API_KEY=...
browsemux run \
  --provider openrouter \
  --model typesafe/jev-1.14 \
  --url https://example.com \
  --goal "Open the Learn more documentation link" \
  --success-url-contains iana.org
```

### BSK plus OpenRouter Decisions

```bash
export OPENROUTER_API_KEY=...
browsemux run \
  --backend bsk \
  --provider openrouter \
  --model typesafe/jev-1.14 \
  --attach \
  --bsk-scope my-agent-window \
  --goal "Find the latest invoice"
```

BSK sessions close by default. Use `--keep-open` only when a human handoff is
explicitly required.

## Supplied Inputs

Decision models select supplied values; they do not invent credentials or form
content.

```bash
browsemux run \
  --url https://example.com/search \
  --goal "Search for Browsemux" \
  --inputs-json '{"text":{"query":"Browsemux"},"keys":{"submit":"Enter"}}'
```

Input groups:

- `text`: `TYPE`
- `select`: `SELECT`
- `keys`: `PRESS`
- `urls`: `NAVIGATE`

Mark a value as secret when supplying metadata:

```json
{
  "text": {
    "password": {
      "value": "secret-value",
      "label": "Account password",
      "secret": true
    }
  }
}
```

Secret values are redacted from provider metadata.

## Actions

```text
CLICK
TYPE
SELECT
PRESS
SCROLL_UP
SCROLL_DOWN
BACK
WAIT
NAVIGATE
DONE
BLOCKED
```

`CLICK`, `TYPE`, and `SELECT` require a target present in the latest snapshot.
Invalid roles and stale refs are rejected before backend dispatch.

## Completion

`DONE` from a model is not treated as proof. Without deterministic checks, the
result is `completed-unverified`.

Use one or both deterministic checks:

```bash
--success-url-contains /pricing
--success-text-contains "Current plan"
```

Only matching checks produce `status: "success"`.

## Output

Default output is one JSON result. `--jsonl` streams:

```text
start
observation
decision
validation
action
result
```

The result contains:

- final status and reason
- backend and provider
- action count and step count
- observation, decision, and action timings
- provider usage when available
- bounded action history
- compact handoff for the parent harness

## Safety

- Providers cannot execute browser commands or JavaScript.
- Targets must exist in the latest observation.
- Operation-to-role validation happens locally.
- Navigation accepts only HTTP and HTTPS.
- Repeated semantic actions are bounded.
- Sensitive supplied values are redacted from provider metadata.
- Human approval is still required for payments, destructive account actions,
  uploads, MFA, and CAPTCHA.

See [SECURITY.md](SECURITY.md) for the trust boundary.

## Project Policies

- [License](LICENSE): MIT
- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Privacy and data handling](PRIVACY.md)
- [Changelog](CHANGELOG.md)

## Library

```js
import {
  AgentBrowserBackend,
  OpenAICompatibleProvider,
  normalizeInputs,
  runLoop,
} from 'browsemux';

const browser = new AgentBrowserBackend();
const provider = new OpenAICompatibleProvider({
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  apiKey: process.env.OPENROUTER_API_KEY,
  model: 'example/model',
});

const observation = await browser.open('https://example.com');
const result = await runLoop({
  goal: 'Open the Learn more link',
  browser,
  provider,
  inputs: normalizeInputs(),
  initialObservation: observation,
  successCriteria: { urlContains: 'iana.org' },
  maxSteps: 4,
});
```

## Development

```bash
npm test
npm run check
```

The initial release is intentionally small. Backend adapters must fail closed,
and provider adapters must return typed proposals rather than browser commands.

## Name

**Browsemux** means multiplexing one harness workflow across swappable browser
backends and decision providers without giving either one direct authority over
the browser.
