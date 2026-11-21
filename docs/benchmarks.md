# Benchmarks

## Public Benchmark Landscape

As of 2026-11-21, no public benchmark was found that compares a harness model
directly controlling `agent-browser` or BSK against Browsemux mediating the same
browser and model.

The closest useful evidence is:

- [Ora's JEV evaluation](https://ora.ai/blog/evaluating-jev) compared the same
  seeded sites and writer model while changing only the step decider. The
  browser arm had a 1.9 s median with JEV versus 8.2 s without it, and step
  decisions took 159 ms versus 1,211 ms. It is not a Browsemux benchmark.
- [LangChain's WebVoyager-100 harness comparison](https://github.com/langchain-ai/deepagents/pull/6868)
  held the model and task set constant across eight harness designs. Cost
  varied by about 24x. Response size and model turns mattered more than raw
  command count. Its `agent-browser` arm reported 77% success, 34,495 median
  tokens, $0.0206 median cost, and 17 s median latency.
- [WABER](https://www.microsoft.com/en-us/research/wp-content/uploads/2025/04/134_WABER_Web_Agent_Benchmarki.pdf)
  measures web-agent reliability and efficiency on real websites.
- [WindTunnel](https://webmcp.com/windtunnel-paper.pdf) compares screenshot,
  DOM, and WebMCP interfaces to the same browser tasks.
- [MCP vs RAG vs NLWeb vs HTML](https://doi.org/10.1145/3774904.3792893)
  found that browser interface choice materially changes tokens, latency, and
  task success.

These studies support measuring the connector directly. They do not establish
that Browsemux is faster or cheaper on a particular browser or task.

## Direct Harness vs Browsemux

The repository includes a dependency-free A/B runner in `bench/`.

It compares:

- **Direct:** a simulated harness conversation that accumulates every previous
  action and page snapshot.
- **Browsemux:** compact indexed state, bounded action history, local target
  validation, no-progress detection, and deterministic completion checks.

Both arms use the same:

- local fixture pages and task inputs
- `agent-browser` or BSK executable
- decision model and endpoint
- fresh browser session per run
- 8,000-character snapshot limit
- deterministic URL and visible-text success checks
- bounded transient model retries

The fixture has four tasks:

1. Open a documentation link.
2. Fill a search field and submit the form.
3. Select a dropdown value and submit.
4. Complete a two-step navigation journey.

### Latest Three-Repeat Rerun

Environment:

- Node.js `v24.22.3`
- `agent-browser` `0.43.0`
- BSK `0.5.0`
- OpenRouter chat completions with `deepseek/deepseek-chat`
- Three recorded repeats per task/backend/arm
- Separate backend runs: 24 records for `agent-browser` and 24 for BSK
- Bounded model retries: 2

| Backend | Arm | Verified | Median wall | Median input tokens | Cost / verified task |
| --- | --- | ---: | ---: | ---: | ---: |
| `agent-browser` | direct | 12/12 | 12,500 ms | 910.5 | $0.000331 |
| `agent-browser` | Browsemux | 11/12 | 11,558 ms | 832.5 | $0.000294 |
| BSK | direct | 11/12 | 15,532 ms | 993.5 | $0.000404 |
| BSK | Browsemux | 11/12 | 13,200 ms | 902.5 | $0.000401 |

Relative to the direct harness:

| Backend | Success delta | Median wall change | Input-token change | Cost / verified task change |
| --- | ---: | ---: | ---: | ---: |
| `agent-browser` | -8.3 pp | -7.5% | -8.6% | -10.9% |
| BSK | 0.0 pp | -15.0% | -9.2% | -0.7% |

The efficiency signal favors Browsemux in this rerun, but the reliability result
is mixed. `agent-browser` recorded one failure: a Browsemux run terminated
during browser startup before any model call. BSK recorded two failures: one
direct and one Browsemux. These failures remain in the success and cost totals.

Result records:

- `bench/results/2026-11-21-agent-browser-rerun/`
- `bench/results/2026-11-21-bsk-rerun/`

### Earlier Two-Repeat Run

Environment:

- Node.js `v24.22.3`
- `agent-browser` `0.43.0`
- BSK `0.5.0`
- OpenRouter chat completions with `deepseek/deepseek-chat`
- Two recorded repeats per task/backend/arm
- 32 total recorded runs
- Bounded model retries: 2

Overall results:

| Backend | Arm | Verified | Median wall | p95 wall | Median input tokens | Cost / verified task | Median commands |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| agent-browser | direct | 7/8 | 13,638 ms | 30,902 ms | 823 | $0.000393 | 7 |
| agent-browser | Browsemux | 7/8 | 10,040 ms | 27,655 ms | 743 | $0.000272 | 7 |
| BSK | direct | 7/8 | 10,029 ms | 26,483 ms | 876 | $0.000342 | 6 |
| BSK | Browsemux | 7/8 | 10,275 ms | 41,424 ms | 908.5 | $0.000447 | 6 |

Relative to the direct harness:

| Backend | Success delta | Median wall change | Input-token change | Cost / verified task change |
| --- | ---: | ---: | ---: | ---: |
| agent-browser | 0.0 pp | -26.4% | -9.7% | -30.7% |
| BSK | 0.0 pp | +2.5% | +3.7% | +30.9% |

### Findings

- The latest `agent-browser` run recorded 7.5% lower median wall time, 8.6%
  fewer input tokens, and 10.9% lower cost per verified task. Verified success
  was 11/12 with Browsemux versus 12/12 direct because one Browsemux run
  terminated during browser startup.
- The latest BSK run reached equal verified success at 11/12, with 15.0% lower
  median wall time, 9.2% fewer input tokens, and approximately flat cost per
  verified task.
- The earlier two-repeat BSK regression did not reproduce: Browsemux was 2.5%
  slower and 30.9% more expensive in that sample. The sample was confounded by
  one provider transport failure, one browser process termination, and a
  duplicate-ref recovery turn. It is retained as historical evidence, not the
  current headline.
- BSK can still expose duplicate identical labels, such as two `Search` refs.
  When the first ref makes no progress, recovery adds a model turn. This is the
  main remaining efficiency risk visible in the benchmark.
- Small tasks are dominated by model latency. Connector execution overhead is
  secondary, so context savings do not automatically produce wall-time wins.
- Browser startup and provider transport failures must be tracked separately
  from decision quality and action correctness.

The earlier raw records are in
`bench/results/2026-11-21-direct-vs-browsemux/`. The latest records are in the
two rerun directories listed above.

### Reproduce

```bash
export OPENROUTER_API_KEY=...
node bench/runner.mjs \
  --tasks open-link,search-form,select-filter,two-step-journey \
  --backends agent-browser,bsk \
  --arms direct,browsemux \
  --repeats 3 \
  --model deepseek/deepseek-chat \
  --model-retries 2 \
  --output-dir bench/results/local
```

Query parameters, content, and states may vary when using another machine,
browser build, provider route, or model.

Measured on 2026-11-21 on Windows with Node.js `v24.22.3`,
`agent-browser` `0.43.0`, BSK `0.5.0`, and OpenRouter Decisions using
`typesafe/jev-1.14`.

## Earlier One-Click Baseline

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

### Post-Optimization

After switching the common BSK operations to `bsk step`, three fresh runs on
the same task and model all succeeded:

| Metric | BSK |
| --- | ---: |
| Verified successes | 3 / 3 |
| Median total | 3,283 ms |
| Total range | 3,207-3,313 ms |
| Median decision | 2,453 ms |
| Median action plus observation | 808 ms |
| Cost per run | $0.000047082 |

Against the stored pre-change median, total time improved by 118 ms (3.5%) and
the action phase improved by 89 ms (9.9%). This is a modest optimization; the
decision call remains the dominant cost.

## Low-Level Timing Probes

Paired local probes isolated the browser command paths from decision-model
latency.

| Path | Samples | Median |
| --- | ---: | ---: |
| BSK click + sync + tab list | 4 | 742 ms |
| BSK step + tab list | 4 | 691 ms |
| agent-browser separate click + snapshot | 3 | 1,009 ms |
| agent-browser batch click + snapshot | 3 | 1,036 ms |

The BSK optimization uses two CLI processes instead of three. The
`agent-browser batch` path was rejected because it was not faster.

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
| Packed package | approximately 45 KB |
| Unpacked package | approximately 161 KB |
| Packaged files | 38 |
| Runtime dependencies | 0 |

## Limitations

- Three samples are enough to catch repeated workflow defects, not to estimate
  tail latency.
- The latest controlled rerun uses three repeats per task/backend/arm. Treat it
  as reproducible engineering evidence, not a final ranking.
- The earlier two-repeat run is superseded by the three-repeat rerun and remains
  only as historical evidence of sample variance.
- Network and provider load materially affect decision time.
- Results use one public page and one pinned decision model.
- The direct-vs-mediated fixture covers four short deterministic flows and one
  fixed general-purpose model.
- BSK runs use a live local Chrome connection; results will differ on another
  machine or when attaching to a heavily loaded browser.
- Cost is provider-reported for this exact request mix and is not a price
  guarantee.
