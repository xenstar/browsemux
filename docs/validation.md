# Validation Log

## 2026-11-21

Environment:

- Node.js `v24.22.3`
- `agent-browser` `0.43.0`
- `bsk` `0.5.0`

Automated tests:

```text
23 passed
0 failed
```

Real smoke test:

```bash
browsemux run \
  --backend agent-browser \
  --provider openrouter \
  --model typesafe/jev-1.14 \
  --url https://example.com \
  --goal "Open the Learn more documentation link" \
  --success-url-contains iana.org \
  --max-steps 4
```

Observed result:

| Metric | Value |
| --- | ---: |
| Status | `success` |
| Planned actions | 1 |
| Executed actions | 1 |
| Total time | 4,633 ms |
| Observation time | 1,828 ms |
| Decision time | 2,656 ms |
| Action time | 147 ms |
| Input tokens | 1,115 |
| Output tokens | 146 |
| Charged cost | $0.00004683 |

The final URL was `https://www.iana.org/help/example-domains`.

This is one smoke run, not a benchmark. It verifies the real
`agent-browser -> OpenRouter Decisions -> validation -> execution -> observation`
path. BSK live execution was not performed during this run; its command mapping,
ref parsing, stale-ref rejection, and settling path are covered by tests.
