# Browsemux Benchmark

This directory contains a reproducible A/B benchmark for:

- a harness model directly driving `agent-browser` or BSK
- Browsemux mediating the same browser backend and model

The benchmark uses a local deterministic fixture so page changes, bot walls,
and live-site variance do not contaminate the comparison.

## Run

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

Quick single-task smoke:

```bash
node bench/runner.mjs \
  --tasks open-link \
  --backends agent-browser \
  --repeats 1 \
  --model deepseek/deepseek-chat
```

## What Is Compared

### Direct arm

The direct arm is a simulated harness conversation:

1. The model receives the task and initial observation.
2. The model proposes one typed operation.
3. The browser executes it.
4. A fresh observation is appended to the conversation.
5. The model receives the entire accumulated conversation on the next turn.

This approximates a harness that manages browser turns itself.

### Browsemux arm

The Browsemux arm uses the package loop:

1. Normalize and index the current page.
2. Send compact page state, current candidates, bounded history, recovery
   context, and deterministic success criteria.
3. Validate the proposal locally.
4. Execute one operation.
5. Observe the settled result.
6. Stop on deterministic success, a recovery failure, or the step budget.

## Metrics

The runner records:

- verified task success
- total wall time, including browser open and close
- model decision latency
- browser observation and action latency
- input, output, cached, and total tokens
- provider-reported cost
- model calls and transient model retries
- browser CLI commands
- executed actions and rejected proposals
- final URL, title, status, and raw event stream

## Honest Interpretation

- A general harness model and Browsemux's decision prompt are not identical
  workloads. The runner uses the same model by default so the comparison focuses
  on orchestration and context shape.
- Short tasks are dominated by model latency.
- A lower token count does not guarantee lower wall time.
- A connector can improve one browser backend and regress another.
- Use multiple repeats and keep the raw JSON when publishing results.

For the latest recorded comparison and limitations, see
[`../docs/benchmarks.md`](../docs/benchmarks.md).
