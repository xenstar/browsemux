# Decision Providers

## TypeSafe System One

Default endpoint:

```text
https://api.typesafe.ai/v1/systemone
```

Default model:

```text
jev-latest
```

Default key variable:

```text
TYPESAFE_API_KEY
```

```bash
browsemux run \
  --provider typesafe \
  --url https://example.com \
  --goal "Open the documentation link"
```

## OpenRouter Decisions

Default endpoint:

```text
https://openrouter.ai/api/alpha/decisions
```

Default model:

```text
typesafe/jev-1.14
```

Default key variable:

```text
OPENROUTER_API_KEY
```

```bash
browsemux run \
  --provider openrouter \
  --model typesafe/jev-1.14 \
  --url https://example.com \
  --goal "Open the documentation link"
```

OpenRouter Decisions is currently an alpha API. Pin the model slug and monitor
request failures.

## OpenAI-Compatible

Default endpoint:

```text
https://openrouter.ai/api/v1/chat/completions
```

This provider requires `--model` and `--api-key-env`. It supports:

- `--structured-output json_object`
- `--structured-output json_schema`
- `--structured-output none`

```bash
export OPENROUTER_API_KEY=...
browsemux run \
  --provider openai \
  --endpoint https://openrouter.ai/api/v1/chat/completions \
  --api-key-env OPENROUTER_API_KEY \
  --model example/model \
  --url https://example.com \
  --goal "Open the documentation link"
```

This path expects a model that follows JSON instructions. Its confidence score
is not automatically comparable to a calibrated decision-model probability.
