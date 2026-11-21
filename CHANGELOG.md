# Changelog

## 0.1.2 - 2026-11-21

- Fixed Linux CI coverage for Windows skill paths by making the skill resolver
  honor its supplied platform and testing Windows and POSIX behavior
  independently.
- Replaced the unnatural "The Short Version" README heading with a direct
  "What Browsemux Does" section.

## 0.1.1 - 2026-11-21

- Rewrote the README for first-time users, with a plain-language explanation
  of what Browsemux does, why it is useful, how to run it, and what it does not
  replace.
- Removed the pre-release GitHub installation wording in favor of the public
  npm package.

## 0.1.0 - 2026-11-21

- Added a portable `browsemux` harness skill and `browsemux skill install`
  support for Codex, shared agent roots, Claude Code, Cursor, OpenCode, and
  Hermes.
- Added a dependency-free direct-harness versus Browsemux benchmark with local
  fixtures, deterministic success checks, token and cost accounting,
  browser-command counts, and bounded model retries.
- Optimized BSK click, fill, select, press, and navigate execution through
  `bsk step`, with partial-failure reconciliation and no action replay.
- Added immediate deterministic success after atomic action-and-observation.
- Made `doctor` honor custom backend commands, report readiness and missing
  setup, validate custom provider key variables, and exit nonzero when
  Browsemux cannot run.
- Returned exit code `2` for `completed-unverified` instead of treating an
  unverified model claim as success.
- Allowed the same semantic action on different observations, fixing legitimate
  workflows such as clicking `Next` across paginated pages.
- Marked browser process exits and timeouts after write actions as
  `effect-unknown`, preventing unsafe replay.
- Removed provider API keys from browser subprocess environments.
- Tracked BSK tab changes returned by `step` and `sync` before reading the tab
  URL, and kept partially opened browser sessions closeable.
- Rejected identical actions that produce no page change, excluded known
  unproductive refs during recovery, and rejected premature model `DONE`
  proposals when deterministic success criteria are configured.
- Preserved nonzero BSK JSON so an executed action is never mistaken for an
  unexecuted one.
- Added a bounded observation, decision, validation, execution, and handoff loop.
- Added `agent-browser` and BSK browser backends.
- Added TypeSafe System One, OpenRouter Decisions, and OpenAI-compatible providers.
- Added stale-ref, role, operation, repeated-action, and navigation validation.
- Added deterministic URL and visible-text success checks.
- Added compact JSON and JSONL output with timing and usage.
- Added reproducible backend, package-footprint, and direct-versus-mediated
  benchmark evidence.
- Added privacy, security-reporting, contribution, and code-of-conduct policies.
- Added package repository metadata, npm publish guards, and multi-version CI.
- Added 65 focused tests and verified live `agent-browser` and BSK smoke paths.
