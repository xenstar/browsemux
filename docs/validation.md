# Validation Log

## 2026-11-21

Environment:

- Node.js `v24.22.3`
- `agent-browser` `0.43.0`
- `bsk` `0.5.0`

Automated tests:

```text
65 passed
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
Both final live checks completed a one-click task in 4,394 ms with
`agent-browser` and 3,586 ms with BSK, each with one executed action and
`status: "success"`.

The packed release artifact was then installed into a clean temporary project.
`browsemux --version`, `browsemux skill path`, and `browsemux doctor` all
passed. Live checks from that installed artifact reached the same final URL:

| Backend | Status | Actions | Total time | Decision time | Action time |
| --- | --- | ---: | ---: | ---: | ---: |
| `agent-browser` | `success` | 1 | 5,944 ms | 3,034 ms | 135 ms |
| BSK | `success` | 1 | 3,966 ms | 3,091 ms | 873 ms |

One preceding `agent-browser` attempt failed in the provider request before
any browser action; the immediate identical rerun succeeded. This is a
transport-variance observation, not a benchmark result.

See [benchmarks.md](benchmarks.md) for the repeated backend benchmark,
direct-harness A/B comparison, two-action flow, and forvela comparison.
