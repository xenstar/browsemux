# Browsemux Routing Reference

## Provider selection

Use the provider already configured for the harness:

| Provider | Flag | Key variable |
| --- | --- | --- |
| TypeSafe System One / JEV | `--provider typesafe` | `TYPESAFE_API_KEY` |
| OpenRouter Decisions | `--provider openrouter --model <SLUG>` | `OPENROUTER_API_KEY` |
| OpenAI-compatible endpoint | `--provider openai --model <SLUG>` | configured with `--api-key-env` |

If no provider is configured, fix provider setup rather than silently replacing
Browsemux with a general-purpose harness loop.

## Backend selection

Use `agent-browser` for isolated public-site work.

Use BSK when the task needs:

- the user's existing Chrome or Edge login state
- an existing BSK Agent Window scope
- an existing BSK session that the user explicitly requested
- visible human takeover through `--keep-open`

Do not infer permission to use personal accounts merely because BSK can attach
to them.

## Success criteria

Add at least one deterministic check when possible:

```text
--success-url-contains <TEXT>
--success-text-contains <TEXT>
```

Keep checks specific enough to prove the goal. A generic page header may appear
before the desired action has completed.

## Failure handling

### Setup failures

Run:

```bash
browsemux doctor
agent-browser doctor
bsk doctor
```

Only run the relevant backend doctor. Correct the reported prerequisite, then
retry Browsemux once.

### Validation failures

`INVALID_PROPOSAL`, `STALE_TARGET`, and `NO_OBSERVED_PROGRESS` mean local
validation rejected the model proposal. Let Browsemux recover within its step
budget. Do not manually execute the rejected action.

### Blocked

Stop for CAPTCHA, authentication, MFA, consent, payment, destructive actions, or
required human choice. Do not work around the blocker.

### Effect unknown

Do not repeat the action. Use a read-only backend observation to determine
whether the action took effect. Report the uncertainty if state cannot be
verified.

### Step limit

Do not loop the same goal. Split the workflow into a smaller bounded goal,
provide deterministic success criteria, or ask the user which branch to take.

## Parent harness handoff

Pass these fields back to the parent model:

- `status`
- `reason`
- `handoff`
- `finalObservation.url`
- `finalObservation.title`
- `timings`
- `usage`

Do not send the entire raw snapshot to the parent model unless the compact
handoff is insufficient for the user's request.

## Installation

Install the skill into detected harness roots:

```bash
browsemux skill install --harness all
```

Install into selected harnesses:

```bash
browsemux skill install --harness codex,claude,cursor,opencode,hermes
```

Install a project-local copy:

```bash
browsemux skill install --harness opencode --scope project
```

Use `--force` only to replace an existing Browsemux skill copy. Start a new
harness session after installation so its skill discovery refreshes.
