# Contributing

Browsemux is intentionally narrow. The initial backend scope is:

- `agent-browser`
- BSK / Tencent Agent Window

The initial decision-provider scope is:

- OpenRouter Decisions or TypeSafe System One
- OpenAI-compatible chat completions with structured JSON

## Development

```bash
npm test
npm run check
```

No runtime dependencies are currently accepted without a concrete need.
Browser backends must fail closed when a target is stale or an action has an
unknown effect.

## Pull requests

- Keep provider and backend contracts separate.
- Add deterministic tests with fake browser and provider implementations.
- Do not add a full browser-agent loop behind the connector.
- Do not let a decision provider execute browser commands directly.
- Document any new action with its validation and failure behavior.
