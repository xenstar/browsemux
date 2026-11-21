<div align="center">

# 🧭 Browsemux

### Give your AI agent a safer, cheaper way to use a browser.

Browsemux sits between your AI agent and the browser tool it already uses. It
handles the repetitive page reading, click decisions, validation, and success
checks, then gives your agent one small result.

[![Tests](https://img.shields.io/github/actions/workflow/status/xenstar/browsemux/test.yml?branch=main&label=tests&style=flat-square&labelColor=black)](https://github.com/xenstar/browsemux/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/browsemux?style=flat-square&labelColor=black)](https://www.npmjs.com/package/browsemux)
[![License](https://img.shields.io/github/license/xenstar/browsemux?style=flat-square&labelColor=black)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white&labelColor=black)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-early%20release-2563eb?style=flat-square&labelColor=black)](#project-status)

[How it works](#-how-it-works) · [Quick start](#-quick-start) ·
[Benchmarks](#-benchmarks) · [Documentation](#-documentation)

</div>

## ⚡ What Browsemux Does

An AI agent can say, **"Find the documentation link and open it."** The hard
part is doing that reliably without making a large model inspect the whole page
after every click.

Browsemux turns that into a small, repeatable loop:

```text
Your AI agent
  -> gives Browsemux a goal
  -> Browsemux takes a small snapshot of the page
  -> a decision model suggests one action
  -> Browsemux checks the action
  -> agent-browser or BSK performs it
  -> Browsemux checks the result and returns a short report
```

**The main AI still manages the task. Browsemux only handles the browser work.**

## ❓ Why Do I Need It?

Browser agents often do this:

1. Send the page to a large AI model.
2. Ask it what to click.
3. Click.
4. Send the new page back.
5. Repeat.

That works, but it can use many tokens, become slow, repeat the same action, or
trust the model when it says "done" without proof.

Browsemux improves the workflow in five practical ways:

- **Less context:** the decision model sees a compact page snapshot, not the
  entire conversation and page history.
- **Fewer wasted steps:** repeated actions and stale page references are
  rejected before they reach the browser.
- **Clear completion:** a task is successful only when a URL or text check
  passes, not because a model claims it finished.
- **Safer execution:** the model returns structured data; it never gets a
  browser handle, shell access, or permission to run code directly.
- **Easy switching:** you can change the decision model or browser tool without
  rewriting your agent workflow.

In simple terms, Browsemux is a supervisor. The main AI decides **what outcome
it wants**. A smaller decision model suggests **the next click**. Browsemux
checks whether that click makes sense before the browser performs it.

> Efficiency is a measured claim, not a promise. Model and network latency can
> dominate a very short task. See the [benchmark results](#-benchmarks).

## 👥 Who Is It For?

Browsemux is useful if you want to:

- give Codex, Claude Code, Cursor, OpenCode, Hermes, or another shell-capable
  agent a safer browser workflow;
- use BSK or `agent-browser` without sending every browser step to your main
  model;
- try different decision models, including JEV and OpenRouter models;
- get one consistent output format for successes, failures, and handoffs;
- keep browser actions inside a clear step limit.

It is **not** a replacement for Chrome, Edge, Playwright, or the browser tool
you already use. It is the decision and safety layer between your agent and
that tool.

## 🧩 Four Words You Will See

| Word | Plain meaning |
| --- | --- |
| **Agent / harness** | The AI program you are already using, such as Codex or Claude Code. |
| **Browser backend** | The tool that actually moves the browser, such as `agent-browser` or BSK. |
| **Decision provider** | The model that chooses the next browser action. |
| **Proposal** | A small data object such as "click `@e4`"; it is not permission to act. |

## 🚀 Quick Start

### Requirements

- Node.js 20 or newer
- `agent-browser` or BSK
- A TypeSafe/JEV, OpenRouter, or OpenAI-compatible API key

### 1. Install Browsemux

```bash
npm install -g browsemux
browsemux --version
```

### 2. Add the Browsemux skill to your agents

```bash
browsemux skill install --harness all
```

This teaches compatible agents to use Browsemux for bounded browser tasks. Start
a new agent session afterward so the skill is discovered.

### 3. Install one browser backend

For most first-time users, `agent-browser` is the easiest option:

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

BSK also needs its browser extension and a connected Chrome or Edge window. See
Tencent's
[agent install guide](https://github.com/Tencent/BrowserSkill/blob/main/AGENT_INSTALL.md).

### 4. Add a decision-provider key

PowerShell:

```powershell
$env:TYPESAFE_API_KEY = "<YOUR_TYPESAFE_API_KEY>"
```

macOS or Linux:

```bash
export TYPESAFE_API_KEY="<YOUR_TYPESAFE_API_KEY>"
```

Prefer another model? See [Providers](docs/providers.md).

### 5. Check everything

```bash
browsemux doctor
```

The result should include `"ready": true`.

### 6. Run a browser task

macOS or Linux:

```bash
browsemux run \
  --backend agent-browser \
  --provider typesafe \
  --url https://example.com \
  --goal "Open the Learn more documentation link" \
  --success-url-contains iana.org \
  --max-steps 4
```

Windows PowerShell:

```powershell
browsemux run --backend agent-browser --provider typesafe --url https://example.com --goal "Open the Learn more documentation link" --success-url-contains iana.org --max-steps 4
```

You should receive one JSON result. A real success includes
`"status": "success"` plus evidence from the final page.

## 🧯 If Something Fails

Run this:

```bash
browsemux doctor
```

It tells you which part of the setup is missing and prints the exact command or
environment variable that fixes it. The usual first-run causes are no browser
backend, a missing API key in the shell that runs Browsemux, or Node.js older
than 20. See [Installation](docs/installation.md#-troubleshooting) for the
full symptom table and exit codes.

## 🧠 How It Works

Here is the complete flow:

1. Your agent gives Browsemux a goal and success rule.
2. Browsemux takes a compact snapshot of the current page.
3. The decision model receives the goal and snapshot.
4. The model returns a small proposal, such as:

   ```json
   {
     "operation": "CLICK",
     "target": "@e4",
     "confidence": 0.93
   }
   ```

5. Browsemux checks the proposal against local rules.
6. Only a valid action reaches `agent-browser` or BSK.
7. Browsemux observes the result and repeats until success, a blocker, or the
   step limit.

### Why doesn't the model control the browser directly?

Because a model can be wrong, and page content can contain misleading
instructions. Letting it control the browser directly would turn a mistaken
prediction into a real click.

Browsemux treats the model output as untrusted data. It checks that the target
exists in the latest snapshot, has the correct role, uses a supported
operation, does not repeat without progress, and passes the configured success
criteria.

This is also why the decision model does not need a browser handle or the
ability to execute JavaScript.

## 🌐 Supported Tools

### Browser backends

| Backend | Best for | Notes |
| --- | --- | --- |
| `agent-browser` | Isolated browser tasks and a simple first setup | Recommended first choice |
| BSK / Tencent Agent Window | Using a connected Chrome or Edge window | Requires the BSK extension |

### Decision providers

| Provider | Use it when |
| --- | --- |
| TypeSafe / JEV | You want a compact JEV-based decision model |
| OpenRouter Decisions | You want to choose a supported OpenRouter decision model |
| OpenAI-compatible | You have another compatible endpoint that returns JSON |

You can change the provider or backend without changing the task goal. See
[Providers](docs/providers.md) and [Backends](docs/backends.md).

## 📊 Benchmarks

The repo includes a repeatable A/B test that compares **direct agent control**
with **the same browser behind Browsemux**.

Latest controlled run on 2026-11-21. Each backend and workflow was recorded
three times:

| Browser | Path | Verified | Median time | Input tokens | Cost per verified task |
| --- | --- | ---: | ---: | ---: | ---: |
| `agent-browser` | Direct agent | 12/12 | 12,500 ms | 910.5 | $0.000331 |
| `agent-browser` | Through Browsemux | 11/12 | 11,558 ms | 832.5 | $0.000294 |
| BSK | Direct agent | 11/12 | 15,532 ms | 993.5 | $0.000404 |
| BSK | Through Browsemux | 11/12 | 13,200 ms | 902.5 | $0.000401 |

What this run showed:

- **agent-browser:** Browsemux was 7.5% faster, used 8.6% fewer input tokens, and
  cost 10.9% less per verified task. One Browsemux run failed during browser
  startup before a model call, so verified success was 11/12 instead of 12/12.
- **BSK:** Browsemux was 15.0% faster, used 9.2% fewer input tokens, and had
  approximately the same cost per verified task. Both paths verified 11/12.
- **Overall:** the efficiency signal is positive, but the reliability result is
  mixed. These fixture results are evidence, not a universal guarantee.

- [Read the method and all results](docs/benchmarks.md)
- [Reproduce the benchmark](bench/README.md)

## ✅ What a Result Looks Like

Browsemux returns one JSON result by default. Add `--jsonl` to stream events:

```text
start
observation
decision
validation
action
result
```

The result contains the status, browser and provider, action history, step
count, timings, token usage, cost when available, and a compact handoff for the
parent agent.

| Status | What it means |
| --- | --- |
| `success` | The configured URL or text check passed |
| `completed-unverified` | The model claimed completion, but evidence is missing |
| `blocked` | A human decision or external blocker is required |
| `effect-unknown` | A write may have happened; do not blindly retry |
| `limit` | The step or recovery budget ended |
| `error` | Setup, provider, browser, or proposal failure |

Exit codes are `0` for success, `2` for completed-unverified, `3` for blocked,
`4` for effect-unknown, `5` for limit, and `1` for error.

## 🔐 Safety and Limits

- The decision model never receives a browser handle.
- The model cannot execute JavaScript or shell commands.
- Actions must reference the latest page snapshot.
- Only HTTP and HTTPS navigation is accepted.
- Repeated actions are bounded.
- Provider API keys are removed from browser subprocess environments.
- Secret input values are redacted from provider metadata.

Human approval is still required for payments, uploads, MFA, CAPTCHA, account
deletion, and other destructive actions. Browsemux is also not designed to
bypass anti-bot systems.

See [SECURITY.md](SECURITY.md) for the full trust model.

## 📚 Documentation

| Guide | What it covers |
| --- | --- |
| [Installation](docs/installation.md) | Complete setup, updates, and troubleshooting |
| [Harness skills](docs/harness-skills.md) | Codex, Claude Code, Cursor, OpenCode, and Hermes |
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

The project has no runtime dependencies. Browser adapters fail closed,
providers return structured proposals, and public performance claims must stay
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

<details>
<summary><strong>Use Browsemux from JavaScript</strong></summary>

The CLI covers normal use. Advanced users can embed the same bounded loop:

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

</details>

<a id="project-status"></a>
## 🚦 Project Status

Browsemux is an early public release. The supported release includes:

- `agent-browser`
- BSK / Tencent Agent Window
- TypeSafe/JEV
- OpenRouter Decisions
- OpenAI-compatible JSON output

Playwright, Browser Use, Stagehand, Skyvern, and other backends are not part of
the current release.
