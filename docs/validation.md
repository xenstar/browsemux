# Validation Log

## 2026-11-21

Environment:

- Node.js `v24.22.3`
- `agent-browser` `0.43.0`
- `bsk` `0.5.0`

Automated tests:

```text
35 passed
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
path.

BSK live execution also passed in an isolated `browsemux-smoke` scope:

| Metric | Value |
| --- | ---: |
| Status | `success` |
| Planned actions | 1 |
| Executed actions | 1 |
| Total time | 4,452 ms |
| Observation time | 0 ms |
| Decision time | 2,577 ms |
| Action time | 1,873 ms |
| Input tokens | 1,121 |
| Output tokens | 146 |
| Charged cost | $0.000047082 |

The session closed after the run. BSK returned the settled post-action
observation with the action, so no separate snapshot command was required.

After the `bsk step` integration, three live samples all reached
`status: "success"` with one executed action:

| Metric | Median |
| --- | ---: |
| Total | 3,283 ms |
| Decision | 2,453 ms |
| Action plus observation | 808 ms |
| Separate observation | 0 ms |

A final smoke test after hardening uncertain-effect handling also succeeded.
The final `agent-browser` smoke test succeeded through the unchanged fallback
path.

See [benchmarks.md](benchmarks.md) for the repeated backend benchmark,
two-action flow, and forvela comparison.
