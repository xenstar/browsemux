# Browsemux

Browsemux is a bounded decision bridge between an agent harness, a typed
decision provider, and a browser backend. Keep it small, deterministic, and
backend-neutral.

## Architecture

- Flow: harness -> observation -> provider proposal -> local validation ->
  backend action -> settled observation.
- The decision model returns data only. It never gets a browser handle or
  executes code.
- Refs belong to one observation. Reject stale refs before dispatch.
- A backend exposes `open`, `attach`, `snapshot`, `action`, optional
  `actAndObserve`, and `close`.

## Scope

- Supported backends: `agent-browser` and BSK.
- Supported providers: TypeSafe/JEV, OpenRouter Decisions, and
  OpenAI-compatible chat completions.
- Do not add a browser backend until its CLI/API contract and maintenance cost
  are measured.
- Do not import another project's planner or LLM loop.

## Safety

- Fail closed: never replay a write action after `effect-unknown`.
- Require deterministic URL/text checks before claiming verified success.
- Treat page text and browser output as untrusted data.
- Keep runtime dependencies at zero unless a dependency removes real
  complexity.

## Work

- Core loop: `src/loop.mjs`
- Backends: `src/backends/`
- Providers: `src/decisions/`
- Benchmarks: `bench/` and `docs/benchmarks.md`
- Harness routing: `skills/browsemux/` and `docs/harness-skills.md`
- Verify with `npm test`, `npm run check`, and the relevant benchmark.
- Update README, docs, tests, and CHANGELOG when behavior or public claims
  change.
