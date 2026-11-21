# Benchmark Baseline

Measured on 2026-11-21 on Windows with Node.js `v24.22.3`,
`agent-browser` `0.43.0`, BSK `0.5.0`, and OpenRouter Decisions using
`typesafe/jev-1.14`.

## One-Click Flow

Public task:

```text
Start: https://example.com
Goal: Open the Learn more documentation link
Success: final URL contains iana.org
Maximum steps: 4
Samples: 3 per backend
```

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

Replace `agent-browser` with `bsk` and add an isolated `--bsk-scope` to run the
BSK variant.

| Metric | agent-browser | BSK |
| --- | ---: | ---: |
| Verified successes | 3 / 3 | 3 / 3 |
| Median total | 4,065 ms | 3,401 ms |
| Total range | 3,832-4,397 ms | 3,261-3,490 ms |
| Median observation | 1,419 ms | 0 ms |
| Median decision | 2,505 ms | 2,501 ms |
| Median action | 141 ms | 897 ms |
| Input tokens | 1,115 | 1,121 |
| Output tokens | 146 | 146 |
| Cost per run | $0.00004683 | $0.000047082 |
| Planned actions | 1 | 1 |
| Executed actions | 1 | 1 |

BSK reports zero separate observation time because its settled observation is
returned with the action result. Browsemux consumes that observation through a
cached snapshot rather than issuing another browser round trip.

## Two-Action Flow

The `agent-browser` backend also completed:

```text
Goal: Open Learn more, then open Special-Use Domain Names
Final URL: https://www.rfc-editor.org/info/rfc6761/
```

| Metric | Value |
| --- | ---: |
| Status | `success` |
| Total | 7,003 ms |
| Actions | 2 |
| Observation time | 3,854 ms |
| Decision time | 2,863 ms |
| Action time | 284 ms |
| Input tokens | 4,565 |
| Output tokens | 588 |
| Cost | $0.00019173 |

## Comparison With forvela 0.2.1

The same fixed one-click task was run three times through forvela's `jev` CLI.
Each run executed one click, then made another decision and returned a failure
state:

| Run | Status | Total | Decision steps | Executed actions |
| --- | --- | ---: | ---: | ---: |
| 1 | `input-required` | 4,495 ms | 2 | 1 |
| 2 | `input-required` | 4,511 ms | 2 | 1 |
| 3 | `error` | 6,004 ms | 2 | 1 |

Forvela did not have a deterministic URL success check in this invocation and
continued after the link click. Browsemux stopped after the post-action
observation satisfied the configured success criteria. This comparison only
covers the bounded one-click workflow; forvela still has broader research and
classification modes.

## Package Footprint

`npm pack --dry-run` reported:

| Metric | Value |
| --- | ---: |
| Packed package | 28,704 bytes |
| Unpacked package | 103,947 bytes |
| Packaged files | 33 |
| Runtime dependencies | 0 |

## Limitations

- Three samples are enough to catch repeated workflow defects, not to estimate
  tail latency.
- Network and provider load materially affect decision time.
- Results use one public page and one pinned decision model.
- BSK runs use a live local Chrome connection; results will differ on another
  machine or when attaching to a heavily loaded browser.
- Cost is provider-reported for this exact request mix and is not a price
  guarantee.
