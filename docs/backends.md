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

The connector talks to Tencent BrowserSkill through its JSON CLI.

Supported modes:

- open a new scoped Agent Window
- attach to an existing `--bsk-scope`
- attach to an existing `--bsk-session`

The backend:

- keeps the BSK session and tab IDs
- uses BSK `@eN` refs
- calls `sync` after actions
- falls back to `snapshot` when `sync` returns no content
- reports `EFFECT_UNKNOWN` when no settled observation can be obtained

BSK remains responsible for the browser process and Agent Window. Browsemux does
not install or manage that application.

## Unsupported in 0.1

Playwright, Playwright MCP, Browser Use, Stagehand, Skyvern, and remote CDP
providers are intentionally excluded until the two-backend loop has measured
value.
