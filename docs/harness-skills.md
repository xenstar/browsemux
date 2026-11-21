# 🧠 Harness Skills

Browsemux needs a routing skill because agents do not choose tools from the
README. A harness with the `agent-browser` or `browser-skill` skill loaded may
otherwise drive the browser one command at a time.

The `browsemux` skill adds one rule:

> Use Browsemux for bounded browser execution. Use direct browser CLIs only for
> setup, visual inspection, exploratory debugging, human takeover, or a safe
> fallback.

The vendor skills remain installed. They are still needed for the exceptions
and for debugging the underlying backend.

## Install

Install into every supported harness root:

```bash
browsemux skill install --harness all
```

Install selected harnesses:

```bash
browsemux skill install --harness codex,claude,cursor,opencode,hermes
```

Install a project-local copy:

```bash
browsemux skill install --harness opencode --scope project
```

Replace existing Browsemux skill copies after an update:

```bash
browsemux skill install --harness all --force
```

Print the packaged skill source path:

```bash
browsemux skill path
```

Start a new harness session after installation or replacement. Skill discovery
may be cached for the lifetime of the current session.

## Supported Harnesses

| Harness ID | User skill root | Project skill root |
| --- | --- | --- |
| `codex` | `$CODEX_HOME/skills` or `~/.codex/skills` | `.codex/skills` |
| `agents` | `$AGENTS_HOME/skills` or `~/.agents/skills` | `.agents/skills` |
| `claude` | `$CLAUDE_CONFIG_DIR/skills` or `~/.claude/skills` | `.claude/skills` |
| `cursor` | `$CURSOR_HOME/skills` or `~/.cursor/skills` | `.cursor/skills` |
| `opencode` | `$XDG_CONFIG_HOME/opencode/skills` or `~/.config/opencode/skills` | `.opencode/skills` |
| `hermes` | `$HERMES_HOME/skills`, `%LOCALAPPDATA%/hermes/skills`, or `~/.hermes/skills` | `.hermes/skills` |

The `agents` root is the shared portable convention. Some harnesses discover it
directly; others need their own copy.

## Routing Behavior

The skill prefers Browsemux when all of these are true:

- the task has a bounded outcome
- the harness can execute shell commands
- `agent-browser` or BSK is installed
- a decision provider is configured

It selects `agent-browser` for isolated public-site work and BSK for explicitly
authorized access to an existing logged-in browser context.

The skill deliberately keeps these direct-browser exceptions:

- installing, upgrading, or diagnosing the backend
- screenshots, PDFs, videos, traces, or visual regression checks
- exploratory workflows that are not bounded enough for a goal prompt
- console, network, DOM, or browser-state debugging
- CAPTCHA, MFA, payment, destructive action, or human takeover
- read-only state inspection after uncertain execution effects

## Fallback for Harnesses Without Skills

Some harnesses do not support `SKILL.md` discovery. Add this to their project
instructions instead:

```markdown
For bounded browser automation, use `browsemux run` instead of issuing
`agent-browser` or `bsk` commands one at a time. Use direct browser CLIs only
for setup, visual capture, exploratory debugging, human takeover, or when
Browsemux is unavailable. Never replay a write action whose effect is unknown.
```

The same paragraph can be used as a global rule when the harness supports one.

## Verification

After starting a new session, ask the harness:

```text
Which browser execution path should you use by default, and when should you use
the direct agent-browser or BSK CLIs instead?
```

A correctly loaded skill should answer that Browsemux is the default for bounded
tasks and list the direct-CLI exceptions.

## Limitation

A skill is routing guidance, not a security boundary. A harness may still ignore
it or use a different tool selection policy. Strict enforcement requires a
harness-specific rule or hook that denies raw browser commands outside approved
exceptions.
