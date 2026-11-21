<div align="center">

# 🧭 Browsemux

**A simpler, safer way for AI agents to control a browser.**

One small bridge between your agent, a decision model, and the browser tool it
already uses.

[![Tests](https://img.shields.io/github/actions/workflow/status/xenstar/browsemux/test.yml?branch=main&label=tests&style=flat-square&labelColor=black)](https://github.com/xenstar/browsemux/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/browsemux?style=flat-square&labelColor=black)](https://www.npmjs.com/package/browsemux)
[![License](https://img.shields.io/github/license/xenstar/browsemux?style=flat-square&labelColor=black)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white&labelColor=black)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-early%20release-2563eb?style=flat-square&labelColor=black)](#project-status)

[What it does](#what-browsemux-does) · [Why use it](#why-use-it) ·
[Quick start](#quick-start) · [How it works](#how-it-works) ·
[Benchmarks](#benchmarks) · [Documentation](#documentation)

</div>

## 💡 What Browsemux Does

AI agents can read a page, but deciding what to click next is difficult. Every
click has to be correct, pages change quickly, and sending the whole browser
state to a large model can be slow and expensive.

Browsemux gives the agent a smaller, safer browser loop:

1. Your agent gives Browsemux a goal.
2. Browsemux takes a compact snapshot of the page.
3. A decision model proposes one action, such as "click this link".
4. Local code checks that the action is valid and safe.
5. The browser performs it.
6. Browsemux observes the result and returns a short handoff.

```text
Your agent
  -> Browsemux
     -> decision model proposes one action
     -> local validation checks it
     -> agent-browser or BSK performs it
     -> Browsemux observes the result
  <- verified result, timings, usage, and next-step handoff
```

Browsemux does not imagine what is on the page. The model only gets references
from the latest snapshot. If a button disappears or a reference becomes stale,
Browsemux rejects the action before touching the browser.

## 🎯 Why Use It

### For agent users

- Keep browser tasks bounded instead of letting an agent click indefinitely.
- Use exact success checks instead of trusting a model that says "done".
- Get one consistent result format across browser tools.
- Keep API keys away from browser subprocesses.
- Review what happened through action history, timings, token usage, and a
  compact handoff.

### For agent builders

- Add browser control without giving the model a browser handle or code
  execution.
- Switch decision models through TypeSafe/JEV, OpenRouter, or an
  OpenAI-compatible provider.
- Switch between `agent-browser` and BSK without rebuilding the whole loop.
- Reject stale targets, invalid roles, unsafe URLs, repeated actions, and
  premature completion.
- Use the same package from Codex, Claude Code, Cursor, OpenCode, Hermes, or any
  harness that can run shell commands.

### Use Browsemux when you need

- Safer, model-driven browser actions.
- A smaller browser context for your agent.
- A provider-neutral decision layer.
- Explicit success, failure, and handoff states.
- Repeatable browser workflows with a bounded number of steps.

### Do not use Browsemux as

- A replacement for Chrome, Edge, Playwright, or a browser automation tool.
- A CAPTCHA solver or anti-bot bypass.
- Permission to make payments or destructive account changes without human
  approval.
- A guarantee of lower latency. Model and network latency can dominate short
  tasks.

## 🚀 Quick Start

### Requirements

- Node.js 20 or newer
- One browser backend: `agent-browser` or BSK
- One API key for the model that chooses actions

### 1. Install Browsemux

```bash
npm install -g browsemux
browsemux --version
```

The npm package includes a portable harness skill, but installing npm packages
does not modify another app's skill directory. Install that skill separately
after setup:

```bash
browsemux skill install --harness all
```

Start a new harness session afterward so skill discovery refreshes.

### 2. Install a browser backend

For most first-time users:

```bash
npm install -g agent-browser
agent-browser install
agent-browser doctor
```

For BSK on Windows:

```powershell
irm https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.ps1 | iex
bsk --version
bsk doctor
```

For BSK on macOS or Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.sh | sh
export PATH="${BSK_INSTALL_DIR:-$HOME/.local/bin}:$PATH"
bsk --version
bsk doctor
```

BSK also needs its browser extension and a connected Chromium browser. See
Tencent's
[agent install guide](https://github.com/Tencent/BrowserSkill/blob/main/AGENT_INSTALL.md).

### 3. Add a decision-provider key

PowerShell:

```powershell
$env:TYPESAFE_API_KEY = "<YOUR_TYPESAFE_API_KEY>"
```

macOS or Linux:

```bash
export TYPESAFE_API_KEY="<YOUR_TYPESAFE_API_KEY>"
```

You can also use OpenRouter or an OpenAI-compatible provider. See
[Providers](docs/providers.md).

### 4. Check the setup

```bash
browsemux doctor
```

The result should show `"ready": true`.

### 5. Run your first browser task

```bash
browsemux run \
  --backend agent-browser \
  --provider typesafe \
  --url https://example.com \
  --goal "Open the Learn more documentation link" \
  --success-url-contains iana.org \
  --max-steps 4
```

PowerShell users can put the full command on one line:

```powershell
browsemux run --backend agent-browser --provider typesafe --url https://example.com --goal "Open the Learn more documentation link" --success-url-contains iana.org --max-steps 4
```

A verified result contains `"status": "success"` and the final page evidence.

## 🧩 Supported Tools

### Browser backends

| Backend | Best for | Notes |
| --- | --- | --- |
| `agent-browser` | A clean automated browser session | Recommended first choice |
| BSK / Tencent Agent Window | Controlling a Chromium window used by an agent | Requires the BSK extension |

### Decision providers

| Provider | Use it when |
| --- | --- |
| TypeSafe / JEV | You want a compact decision-focused model |
| OpenRouter Decisions | You want to choose a supported OpenRouter model |
| OpenAI-compatible | You have another compatible endpoint and JSON output |

The decision model does not control the browser directly. It returns typed
data. Browsemux validates that data before any browser command runs.

## 🧠 How It Works

### The model proposes, local code decides

The decision model returns a small proposal:

```json
{
  "operation": "CLICK",
  "target": "@e4",
  "confidence": 0.93
}
```

Browsemux then checks:

- Does the target exist in the latest snapshot?
- Does the target have a compatible role?
- Is the operation supported?
- Is a navigation URL safe?
- Is this action repeating without progress?
- Do the configured success checks actually pass?

Only then does Browsemux send the action to `agent-browser` or BSK.

### Statuses are explicit

| Status | Meaning |
| --- | --- |
| `success` | The deterministic success check passed |
| `completed-unverified` | A model claimed completion without proof |
| `blocked` | A human decision or blocker is required |
| `effect-unknown` | A write may have happened; do not blindly retry |
| `limit` | The step or recovery budget ended |
| `error` | Setup, provider, browser, or proposal failure |

Exit codes are `0` success, `2` completed-unverified, `3` blocked, `4`
effect-unknown, `5` limit, and `1` error.

## 📊 Benchmarks

Latest controlled three-repeat run on 2026-11-21:

| Backend | Workflow | Verified | Median wall time | Cost per verified task |
| --- | --- | ---: | ---: | ---: |
| `agent-browser` | Direct agent control | 12/12 | 12,500 ms | $0.000331 |
| `agent-browser` | Through Browsemux | 11/12 | 11,558 ms | $0.000294 |
| BSK | Direct agent control | 11/12 | 15,532 ms | $0.000404 |
| BSK | Through Browsemux | 11/12 | 13,200 ms | $0.000401 |

In this fixture run, Browsemux was faster and cheaper for `agent-browser`.
The BSK result was mixed: faster, but not more reliable or meaningfully cheaper.
These are engineering measurements, not universal claims.

- [Full methodology and raw results](docs/benchmarks.md)
- [Reproduce the benchmark](bench/README.md)

## 📦 Output

By default, Browsemux returns one JSON result. Add `--jsonl` to stream events:

```text
start
observation
decision
validation
action
result
```

The result includes:

- Status and reason
- Browser backend and decision provider
- Action and step counts
- Observation, decision, and action timings
- Provider usage and cost when available
- Bounded action history
- A compact handoff for the parent agent

## 🔐 Safety

- The model never receives a browser handle.
- The model cannot execute JavaScript or shell commands.
- Actions must reference the latest page snapshot.
- Only HTTP and HTTPS navigation is accepted.
- Repeated actions are bounded.
- Provider API keys are removed from browser subprocess environments.
- Secret input values are redacted from provider metadata.

Human approval is still required for payments, uploads, MFA, CAPTCHA, account
deletion, and other destructive actions.

See [SECURITY.md](SECURITY.md) for the full trust model.

## 📚 Documentation

| Guide | What it covers |
| --- | --- |
| [Installation](docs/installation.md) | Complete setup, updates, and troubleshooting |
| [Harness skills](docs/harness-skills.md) | Codex, Claude Code, Cursor, OpenCode, and Hermes routing |
| [Backends](docs/backends.md) | `agent-browser` and BSK behavior |
| [Providers](docs/providers.md) | TypeSafe, OpenRouter, and compatible endpoints |
| [Architecture](docs/architecture.md) | Control flow and trust boundaries |
| [Validation](docs/validation.md) | Tested environments and live smoke evidence |
| [Benchmarks](docs/benchmarks.md) | Method, measurements, and limitations |

## 🛠️ Development

```bash
npm test
npm run check
npm run bench:smoke
```

The project uses no runtime dependencies. Browser adapters must fail closed,
providers must return typed proposals, and public performance claims must stay
within the benchmark evidence.

## 🤝 Contributing

Contributions are welcome through
[issues](https://github.com/xenstar/browsemux/issues) and focused pull requests.
For behavior changes, include tests and update the relevant public claim.

[![Contributors](https://contrib.rocks/image?repo=xenstar/browsemux)](https://github.com/xenstar/browsemux/graphs/contributors)

## 🔗 Policies

- [MIT License](LICENSE)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security](SECURITY.md)
- [Privacy](PRIVACY.md)
- [Changelog](CHANGELOG.md)

## 🧱 Library Use

The CLI covers normal use. Advanced users can embed the same loop:

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
  model: '<OPENROUTER_DECISION_MODEL_SLUG>',
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

<a id="project-status"></a>
## 🚦 Project Status

Browsemux is an early public release. The current support boundary is:

- `agent-browser`
- BSK / Tencent Agent Window
- TypeSafe/JEV
- OpenRouter Decisions
- OpenAI-compatible JSON output

Playwright, Browser Use, Stagehand, Skyvern, and other backends are not part of
the current release.
