# Architecture

## Data flow

```text
CLI or host library
  -> backend open or attach
  -> normalized observation
  -> decision provider
  -> typed proposal
  -> local validation
  -> backend action
  -> settled observation
  -> bounded result and handoff
```

## Browser backend contract

Every backend exposes:

```js
{
  name,
  async open(url, options),
  async attach(options),
  async snapshot(options),
  async action(operation, options),
  async close(options)
}
```

A normalized observation contains:

```js
{
  backend,
  url,
  title,
  snapshot,
  refs: {
    "@e1": { role: "button", name: "Continue" }
  },
  metadata
}
```

Refs are valid only for the observation that produced them.

## Decision provider contract

Every provider exposes:

```js
{
  name,
  async decide({
    goal,
    observation,
    inputs,
    history,
    recovery,
    signal
  })
}
```

It returns:

```js
{
  proposal: {
    operation,
    target,
    inputKey,
    confidence
  },
  usage,
  latencyMs,
  providerMetadata
}
```

The proposal is data, not an executable browser call.

## Decisions API request

TypeSafe System One and OpenRouter Decisions use the same typed question model:

```text
state
  goal
  url
  snapshot
  current refs
  input metadata
  recent actions
  recovery context

questions
  operation
  click_target
  type_target
  type_input
  select_target
  select_input
  press_input
  navigate_input
  goal_reached
  stuck
```

Compatible target questions are submitted speculatively in one request. Only
the target head matching the selected operation is consumed.

## Validation

Validation is intentionally local and deterministic:

- operation must be supported
- targeted operation requires a current ref
- role must fit the operation
- selected input key must exist and match the operation kind
- navigation URL must use HTTP or HTTPS
- repeated semantic signatures are bounded

An invalid proposal consumes a decision iteration but does not touch the
browser.

## Completion

The decision model cannot declare verified completion. Model `DONE` yields
`completed-unverified` unless deterministic URL or text criteria match.

## Failure states

- `error`: invalid setup or an unexpected failure
- `blocked`: the model reports no safe useful action
- `effect-unknown`: the action ran but the backend could not establish a
  settled observation
- `limit`: the step budget expired
- `completed-unverified`: model completion without deterministic verification
- `success`: configured checks matched
