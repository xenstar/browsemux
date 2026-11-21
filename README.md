<div align="center">

# 🧭 Browsemux

**Route browser decisions. Keep deterministic control.**

A bounded decision bridge between agent harnesses and browser backends.

[![Tests](https://img.shields.io/github/actions/workflow/status/xenstar/browsemux/test.yml?branch=main&label=tests&style=flat-square&labelColor=black)](https://github.com/xenstar/browsemux/actions/workflows/test.yml)
[![License](https://img.shields.io/github/license/xenstar/browsemux?style=flat-square&labelColor=black)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white&labelColor=black)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-pre--release-f59e0b?style=flat-square&labelColor=black)](#project-status)
[![Stars](https://img.shields.io/github/stars/xenstar/browsemux?style=flat-square&labelColor=black)](https://github.com/xenstar/browsemux/stargazers)
[![Forks](https://img.shields.io/github/forks/xenstar/browsemux?style=flat-square&labelColor=black)](https://github.com/xenstar/browsemux/network/members)
[![Issues](https://img.shields.io/github/issues/xenstar/browsemux?style=flat-square&labelColor=black)](https://github.com/xenstar/browsemux/issues)

[Features](#features) · [Install](#quick-install) · [Quick start](#quick-start) ·
[Benchmarks](#benchmarks) · [Documentation](#documentation) ·
[Contributing](#contributing)

</div>

## 📖 Table of Contents

- [✨ Features](#features)
- [🚦 Project Status](#project-status)
- [🚀 Quick Install](#quick-install)
- [⚡ Quick Start](#quick-start)
- [📊 Benchmarks](#benchmarks)
- [🧰 Configuration](#configuration)
- [📦 Output](#output)
- [🔐 Safety](#safety)
- [📚 Documentation](#documentation)
- [🧱 Library](#library)
- [🛠️ Development](#development)
- [🤝 Contributing](#contributing)
- [🔗 Policies](#policies)

<a id="features"></a>
## ✨ Features

- [x] 🧭 **Bounded browser loop**: Observe, decide, validate, act, re-observe, and stop within a strict budget.
- [x] 🛡️ **Deterministic control**: Typed model intent is checked against targets, roles, inputs, URLs, repetition, and completion criteria.
- [x] 🔌 **Swappable browser backends**: Use `agent-browser` for isolated sessions or BSK for an existing Agent Window.
- [x] 🧠 **Swappable decision providers**: Use TypeSafe/JEV, OpenRouter Decisions, or compatible chat-completions providers.
- [x] 🧩 **Harness routing skill**: Install one portable skill for Codex, Claude Code, Cursor, OpenCode, and Hermes.
- [x] 📦 **Dependency-free package**: The runtime uses Node.js APIs without a browser framework or HTTP SDK.
- [x] 📊 **Reproducible benchmarks**: Compare direct control with Browsemux using fixed tasks, one model, deterministic checks, and raw records.
- [x] 🚦 **Explicit failure states**: Distinguish verified success, unverified completion, limits, blockers, and unknown action effects.

```text
Harness
  -> Browsemux
     -> typed decision provider
     -> local proposal validation
     -> agent-browser or BSK
     -> settled observation
  <- compact evidence, usage, timings, and handoff
```

**Core contract:** the model proposes typed intent; code validates and executes
it. The model never receives a browser handle or executes code.

<a id="project-status"></a>
## 🚦 Project Status

Browsemux is a **pre-release** project. The current supported installation path
is directly from GitHub.

Supported browser backends:

- `agent-browser`
- BSK / Tencent Agent Window

Supported decision providers:

- TypeSafe System One / JEV
- OpenRouter Decisions
- OpenAI-compatible chat completions with JSON output

Browser Use, Playwright, Stagehand, Skyvern, and other frameworks remain
outside the initial scope.

<a id="quick-install"></a>
## 🚀 Quick Install

### 1. Install Browsemux

Recommended global install:

```bash
npm install -g browsemux
browsemux --version
```

Install from a local clone:

```bash
git clone https://github.com/xenstar/browsemux.git
cd browsemux
npm install
npm link
browsemux --version
```

The npm package ships the Browsemux skill, but `npm install` does not modify
harness skill directories. Run the skill installation step once after each
install or update.

Requirements:

- Node.js 20 or newer
- One supported browser backend
- One decision-provider API key

### 2. Install a browser backend

Recommended for first-time users:

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

BSK also requires its browser extension and a connected Chromium browser. See
Tencent's official
[agent install guide](https://github.com/Tencent/BrowserSkill/blob/main/AGENT_INSTALL.md).

### 3. Set a provider key

PowerShell:

```powershell
$env:TYPESAFE_API_KEY = "<YOUR_TYPESAFE_API_KEY>"
```

macOS or Linux:

```bash
export TYPESAFE_API_KEY="<YOUR_TYPESAFE_API_KEY>"
```

Verify the local setup:

```bash
browsemux doctor
```

`doctor` checks CLI availability and whether the expected provider environment
variable is present. It does not validate API credit or the BSK extension state.

### 4. Install the harness routing skill

Install the Browsemux skill into the supported harness skill directories:

```bash
browsemux skill install --harness all
```

This is an explicit setup step, not an npm lifecycle side effect. It avoids
writing into another tool's home directory during package installation.

The skill tells harness agents to use Browsemux for bounded browser work instead
of driving `agent-browser` or BSK one command at a time. Direct browser commands
remain reserved for setup, visual inspection, exploratory debugging, and human
takeover.

Start a new harness session after installation so skill discovery refreshes.
See [Harness skills](docs/harness-skills.md) for per-harness paths, project
installation, updates, and limitations.

> Replace every `<ANGLE_BRACKET_VALUE>` before running an example. See
> [Installation](docs/installation.md) for provider, BSK, update, and
> troubleshooting instructions.

<a id="quick-start"></a>
## ⚡ Quick Start

### agent-browser + JEV

PowerShell:

```powershell
$env:TYPESAFE_API_KEY = "<YOUR_TYPESAFE_API_KEY>"

browsemux run `
  --backend agent-browser `
  --provider typesafe `
  --url https://example.com `
  --goal "Open the Learn more documentation link" `
  --success-url-contains iana.org `
  --max-steps 4
```

macOS or Linux:

```bash
export TYPESAFE_API_KEY="<YOUR_TYPESAFE_API_KEY>"

browsemux run \
  --backend agent-browser \
  --provider typesafe \
  --url https://example.com \
  --goal "Open the Learn more documentation link" \
  --success-url-contains iana.org \
  --max-steps 4
```

### agent-browser + OpenRouter Decisions

```bash
export OPENROUTER_API_KEY="<YOUR_OPENROUTER_API_KEY>"

browsemux run \
  --provider openrouter \
  --model "<OPENROUTER_DECISION_MODEL_SLUG>" \
  --url https://example.com \
  --goal "Open the Learn more documentation link" \
  --success-url-contains iana.org
```

### BSK + OpenRouter Decisions

```bash
export OPENROUTER_API_KEY="<YOUR_OPENROUTER_API_KEY>"

browsemux run \
  --backend bsk \
  --provider openrouter \
  --model "<OPENROUTER_DECISION_MODEL_SLUG>" \
  --attach \
  --bsk-scope "<YOUR_AGENT_WINDOW_SCOPE>" \
  --goal "Find the latest invoice"
```

BSK sessions close by default. Use `--keep-open` only when a human handoff is
explicitly required.

<a id="benchmarks"></a>
## 📊 Benchmarks

Latest three-repeat controlled rerun on 2026-11-21:

| Backend | Arm | Verified | Median wall | Median input tokens | Cost / verified task |
| --- | --- | ---: | ---: | ---: | ---: |
| `agent-browser` | direct | 12/12 | 12,500 ms | 910.5 | $0.000331 |
| `agent-browser` | Browsemux | 11/12 | 11,558 ms | 832.5 | $0.000294 |
| BSK | direct | 11/12 | 15,532 ms | 993.5 | $0.000404 |
| BSK | Browsemux | 11/12 | 13,200 ms | 902.5 | $0.000401 |

| Backend | Success delta | Wall change | Input-token change | Cost / verified change |
| --- | ---: | ---: | ---: | ---: |
| `agent-browser` | -8.3 pp | -7.5% | -8.6% | -10.9% |
| BSK | 0.0 pp | -15.0% | -9.2% | -0.7% |

The efficiency gains are real in this fixture run, but the reliability result
is mixed. `agent-browser` recorded one failure: a Browsemux startup failure
before any model call. BSK recorded two failures: one direct and one Browsemux.
The earlier two-repeat BSK regression did not reproduce, so Browsemux does not
currently claim a stable cost advantage on every BSK workflow.

- [Benchmark methodology and results](docs/benchmarks.md)
- [Reproduce the direct-versus-mediated benchmark](bench/README.md)

Decision latency dominates these short tasks. Treat the results as controlled
engineering evidence, not universal browser-agent rankings.

<a id="configuration"></a>
## 🧰 Configuration

### Supplied inputs

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
      "value": "<ACCOUNT_PASSWORD>",
      "label": "Account password",
      "secret": true
    }
  }
}
```

Secret values are redacted from provider metadata.

### Actions

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

### Completion

`DONE` from a model is not treated as proof. Without deterministic checks, the
result is `completed-unverified`.

Use one or both deterministic checks:

```bash
--success-url-contains <URL_FRAGMENT>
--success-text-contains "<VISIBLE_TEXT>"
```

Only matching checks produce `status: "success"`.

<a id="output"></a>
## 📦 Output

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

Exit codes:

| Code | Status | Meaning |
| ---: | --- | --- |
| `0` | `success` | Deterministic success criteria matched. |
| `2` | `completed-unverified` | The model claimed completion, but no success check proved it. |
| `3` | `blocked` | The browser or model reported a required human decision or blocker. |
| `4` | `effect-unknown` | A write action may have executed; do not replay it blindly. |
| `5` | `limit` | The step or recovery budget ended before completion. |
| `1` | `error` | Setup, provider, browser, or proposal failure. |

`completed-unverified` is intentionally nonzero so scripts do not treat an
unverified model claim as success.

<a id="safety"></a>
## 🔐 Safety

- Providers cannot execute browser commands or JavaScript.
- Targets must exist in the latest observation.
- Operation-to-role validation happens locally.
- Navigation accepts only HTTP and HTTPS.
- Repeated semantic actions are bounded.
- Sensitive supplied values are redacted from provider metadata.
- Provider API keys are removed from browser subprocess environments.
- Human approval is still required for payments, destructive account actions,
  uploads, MFA, and CAPTCHA.

See [SECURITY.md](SECURITY.md) for the trust boundary.

<a id="documentation"></a>
## 📚 Documentation

| Guide | Purpose |
| --- | --- |
| [Installation](docs/installation.md) | End-to-end setup, verification, updates, and troubleshooting |
| [Harness skills](docs/harness-skills.md) | Routing guidance for Codex, Claude Code, Cursor, OpenCode, and Hermes |
| [Backends](docs/backends.md) | `agent-browser` and BSK behavior |
| [Providers](docs/providers.md) | TypeSafe, OpenRouter, and OpenAI-compatible configuration |
| [Architecture](docs/architecture.md) | Control flow and trust boundaries |
| [Validation](docs/validation.md) | Tested environments and live smoke evidence |
| [Benchmarks](docs/benchmarks.md) | Method, measurements, and limitations |

<a id="contributing"></a>
## 🤝 Contributing

Contributions are welcome through [issues](https://github.com/xenstar/browsemux/issues)
and focused pull requests. Keep backend adapters fail-closed, keep provider
outputs typed, add tests for behavior changes, and update public claims when the
benchmark evidence changes.

[![Contributors](https://contrib.rocks/image?repo=xenstar/browsemux)](https://github.com/xenstar/browsemux/graphs/contributors)

<a id="policies"></a>
## 🤝 Project Policies

- [License](LICENSE): MIT
- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Privacy and data handling](PRIVACY.md)
- [Changelog](CHANGELOG.md)

<a id="library"></a>
## 🧱 Library

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

<a id="development"></a>
## 🛠️ Development

```bash
npm test
npm run check
npm run bench:smoke
```

The initial release is intentionally small. Backend adapters must fail closed,
and provider adapters must return typed proposals rather than browser commands.

## 🏷️ Name

**Browsemux** means multiplexing one harness workflow across swappable browser
backends and decision providers without giving either one direct authority over
the browser.
