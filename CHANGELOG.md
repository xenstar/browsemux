# Changelog

## Unreleased

- Optimized BSK click, fill, select, press, and navigate execution through
  `bsk step`, with partial-failure reconciliation and no action replay.
- Preserved nonzero BSK JSON so an executed action is never mistaken for an
  unexecuted one.
- Added immediate deterministic success after atomic action-and-observation.
- Added a dependency-free direct-harness versus Browsemux benchmark with local
  fixtures, deterministic success checks, token/cost accounting, browser-command
  counts, and bounded model retries.
- Rejected identical actions that produce no page change, excluded known
  unproductive refs during recovery, and rejected premature model `DONE`
  proposals when deterministic success criteria are configured.
- Evaluated `agent-browser batch`; retained separate commands because the live
  probe did not improve latency.
- Added reproducible backend and package-footprint benchmark evidence.
- Added privacy, code of conduct, security-reporting, and contribution policies.
- Added package repository metadata and npm publish guards.
- Fixed the documented `doctor --json` flag.

## 0.1.0

- Added a bounded observation, decision, validation, execution, and handoff loop.
- Added `agent-browser` and BSK browser backends.
- Added TypeSafe System One, OpenRouter Decisions, and OpenAI-compatible providers.
- Added stale-ref, role, operation, repeated-action, and navigation validation.
- Added deterministic URL and visible-text success checks.
- Added compact JSON and JSONL output with timing and usage.
- Added 23 focused tests and a real agent-browser smoke path.
