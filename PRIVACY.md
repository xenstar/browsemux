# Privacy and Data Handling

Browsemux does not include telemetry or analytics. It does not persist page
content, prompts, credentials, or API keys by default.

## Data Sent to Decision Providers

For each decision, Browsemux sends the configured provider:

- the parent-supplied goal
- the current URL and page title
- a bounded, indexed page snapshot
- labels, kinds, and target hints for supplied inputs
- recent action metadata and bounded recovery context

Secret input values are replaced with `[redacted]` before provider requests.
Non-secret values are sent only when the parent supplies them.

A page snapshot can still contain personal, confidential, or regulated data
that appears in visible page content. Use a local or contractually suitable
provider when the page cannot be disclosed to a third party.

## API Keys

API keys are read from environment variables and sent only as authorization
headers to the selected provider. They are not included in prompts, action
history, JSON results, or handoffs.

## Browser State

Session persistence, cookies, profiles, downloads, and browser logs are
controlled by the selected backend (`agent-browser` or BSK), not by a central
Browsemux service. Browsemux closes sessions by default.

## Diagnostics

Review JSONL output before publishing it. Redact credentials, cookies, session
IDs, private URLs, and page content. Security reports should use the process in
[SECURITY.md](SECURITY.md).
