# Browser Backends

## agent-browser

The connector invokes a persistent `agent-browser` session.

Resolution order:

1. `--browser-command`
2. local npm package
3. global npm package under `APPDATA/npm/node_modules`
4. `agent-browser` from `PATH`

The backend:

- opens the URL
- obtains a JSON accessibility snapshot
- validates refs against that snapshot
- executes one shell command per action
- obtains a fresh snapshot after every action
- closes the session by default

## BSK

The connector talks to Tencent BrowserSkill 0.5 or newer through its JSON CLI.

Supported modes:

- open a new scoped Agent Window
- attach to an existing `--bsk-scope`
- attach to an existing `--bsk-session`

The backend:

- keeps the BSK session and tab IDs
- uses BSK `@eN` refs
- uses `bsk step` for click, fill, select, press, and navigate
- accepts the post-action observation returned by `step`
- reads the current tab URL once after the step
- preserves nonzero JSON, reconciles with read-only `sync`, and never replays
  an action whose effect is uncertain
- calls `sync` after operations that do not have a verified `step` mapping
- falls back to `snapshot` when `sync` returns no content
- reports `EFFECT_UNKNOWN` when no settled observation can be obtained

The optimized path uses two CLI processes instead of three. In four paired
local samples, median action-plus-observation time changed from 742 ms to
691 ms on the fixed one-click task.

`agent-browser batch` was also measured. It was not adopted because the
action-plus-snapshot median was 1,036 ms versus 1,009 ms for separate commands.

BSK remains responsible for the browser process and Agent Window. Browsemux does
not install or manage that application.

## Unsupported in 0.1

Playwright, Playwright MCP, Browser Use, Stagehand, Skyvern, and remote CDP
providers are intentionally excluded until the two-backend loop has measured
value.
