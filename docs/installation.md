# 🛠️ Installing Browsemux

This guide installs Browsemux, one supported browser backend, and one decision
provider. Commands are shown for Windows PowerShell and for macOS or Linux.

> Replace values in `<ANGLE_BRACKETS>` before running an example. Never commit
> API keys or real account credentials.

## ✅ Prerequisites

| Component | Requirement | Verification |
| --- | --- | --- |
| Node.js | 20 or newer | `node --version` |
| Browsemux | Latest release from npm | `browsemux --version` |
| Browser backend | `agent-browser` or BSK | `agent-browser --version` or `bsk --version` |
| Decision provider | TypeSafe, OpenRouter, or OpenAI-compatible key | `browsemux doctor` |

For the easiest first run, use `agent-browser` with TypeSafe System One / JEV.

## 📥 Install Browsemux

### Recommended: global install from npm

Install the published package:

```bash
npm install -g browsemux
browsemux --version
```

Upgrade later by running the same command again.

### Alternative: install from a local clone

```bash
git clone https://github.com/xenstar/browsemux.git
cd browsemux
npm install
npm link
browsemux --version
```

Run the verification suite:

```bash
npm test
npm run check
```

### Uninstall

For a global GitHub install:

```bash
npm uninstall -g browsemux
```

For a local linked install:

```bash
npm unlink -g browsemux
```

## 🧠 Install the Harness Skill

Install the portable routing skill after Browsemux itself:

```bash
browsemux skill install --harness all
```

The skill directs compatible harness agents to use `browsemux run` for bounded
browser tasks rather than issuing raw `agent-browser` or `bsk` commands one at a
time.

Install selected harnesses:

```bash
browsemux skill install --harness codex,claude,cursor,opencode,hermes
```

Install only into the current project:

```bash
browsemux skill install --harness opencode --scope project
```

Start a new harness session after installing. See
[Harness skills](harness-skills.md) for paths, updates, exceptions, and
verification.

## 🌐 Install a Browser Backend

Choose one backend. Browsemux can switch later without changing the harness
integration.

### agent-browser

Official project:
[vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)

```bash
npm install -g agent-browser
agent-browser install
agent-browser doctor
```

`agent-browser install` downloads Chrome for Testing on first use. On Linux,
use `agent-browser install --with-deps` when the required system libraries are
missing.

Update later:

```bash
agent-browser upgrade
```

### BSK / Tencent Agent Window

Official project:
[Tencent/BrowserSkill](https://github.com/Tencent/BrowserSkill)

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.ps1 | iex
bsk --version
bsk doctor
```

macOS or Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.sh | sh
export PATH="${BSK_INSTALL_DIR:-$HOME/.local/bin}:$PATH"
bsk --version
bsk doctor
```

BSK requires its Chrome or Edge extension and a connected Chromium browser.
The extension opens an isolated Agent Window and preserves the user's normal
browser windows. Follow Tencent's
[agent install guide](https://github.com/Tencent/BrowserSkill/blob/main/AGENT_INSTALL.md)
for extension, harness, remote, and MCP setup.

Install the appropriate BSK skill for each harness when that harness needs the
native `bsk` workflow:

```bash
bsk install-skill --list --json
bsk install-skill --harness "<HARNESS_ID>" --json
```

This is separate from Browsemux. Browsemux invokes the `bsk` CLI directly.

## 🔑 Configure a Decision Provider

### TypeSafe System One / JEV

PowerShell:

```powershell
$env:TYPESAFE_API_KEY = "<YOUR_TYPESAFE_API_KEY>"
```

macOS or Linux:

```bash
export TYPESAFE_API_KEY="<YOUR_TYPESAFE_API_KEY>"
```

Use `--provider typesafe`. The current default model is `jev-latest`.

### OpenRouter Decisions

PowerShell:

```powershell
$env:OPENROUTER_API_KEY = "<YOUR_OPENROUTER_API_KEY>"
```

macOS or Linux:

```bash
export OPENROUTER_API_KEY="<YOUR_OPENROUTER_API_KEY>"
```

Use `--provider openrouter` and pin `--model "<OPENROUTER_DECISION_MODEL_SLUG>"`.
OpenRouter Decisions is currently an alpha API.

### OpenAI-Compatible Endpoint

Use this mode for a provider that follows JSON instructions and supports a
chat-completions endpoint:

```bash
export CUSTOM_PROVIDER_API_KEY="<YOUR_PROVIDER_API_KEY>"

browsemux run \
  --provider openai \
  --endpoint "https://<YOUR_OPENAI_COMPATIBLE_ENDPOINT>" \
  --api-key-env CUSTOM_PROVIDER_API_KEY \
  --model "<YOUR_MODEL_SLUG>" \
  --url https://example.com \
  --goal "Open the documentation link"
```

The model's confidence value is not automatically comparable to a calibrated
decision-model probability.

## 🧪 Verify the Installation

Run Browsemux's local checks:

```bash
browsemux doctor
```

`doctor` exits `0` only when at least one browser backend and one provider key
are available. Otherwise it returns `ready: false`, lists the missing setup, and
exits `1`.

If an OpenAI-compatible provider uses a custom key variable, pass the same
variable to `doctor`:

```bash
browsemux doctor --api-key-env CUSTOM_PROVIDER_API_KEY
```

The output reports:

- Node.js version
- overall readiness and setup issues
- `nextSteps`, the command or environment variable that fixes each issue
- `agent-browser` availability and version
- `bsk` availability and version
- whether supported API-key environment variables are present

`doctor` does not call the provider, validate credits, or inspect the BSK
extension connection. Run a small task afterward.

Override backend commands when they are outside `PATH`:

```bash
browsemux doctor \
  --browser-command "/path/to/agent-browser" \
  --bsk-command "/path/to/bsk"
```

### agent-browser smoke test

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

### BSK smoke test

```bash
browsemux run \
  --backend bsk \
  --attach \
  --bsk-scope "<YOUR_AGENT_WINDOW_SCOPE>" \
  --provider openrouter \
  --model "<OPENROUTER_DECISION_MODEL_SLUG>" \
  --goal "Open the documentation link"
```

Use `--keep-open` only when a human needs to take over the browser session.

## 🧯 Troubleshooting

| Symptom | Check | Fix |
| --- | --- | --- |
| `browsemux` not found | `npm prefix -g` | Add the npm global bin directory to `PATH`, then open a new shell |
| `agent-browser` not found | `agent-browser --version` | Reinstall with `npm install -g agent-browser` |
| `bsk` not found | `bsk --version` | Re-run Tencent's installer and confirm `~/.local/bin` is on `PATH` |
| Missing API key | `browsemux doctor` | Set the provider variable in the same shell running Browsemux |
| BSK cannot connect | `bsk doctor` | Confirm the extension is installed, enabled, and connected in Chrome or Edge |
| Stale page ref | Read the result diagnostics | Rerun with a fresh observation; refs must come from the latest snapshot |
| Repeated action rejected | Review `reason: "NO_OBSERVED_PROGRESS"` | Supply a different target or correct the task goal |

Exit codes are `0` success, `2` completed-unverified, `3` blocked, `4`
effect-unknown, `5` limit, and `1` error. Treat `2` as a verification failure,
not success.

BSK errors can differ between local, remote, and harness-managed daemon
environments. Follow the exact hint printed by `bsk doctor` rather than
restarting or reinstalling repeatedly.

## 🔄 Updates

Update Browsemux:

```bash
npm install -g browsemux
```

Update `agent-browser`:

```bash
agent-browser upgrade
```

Update BSK by rerunning Tencent's current installer, then verify:

```bash
bsk --version
bsk doctor
```

After any update, run `browsemux doctor` and one deterministic smoke task.
