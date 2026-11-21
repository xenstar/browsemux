# Security

## Trust boundary

Decision models are untrusted proposal generators. They do not receive direct
browser handles and they cannot execute code. Browsemux validates every
proposal against the latest observation before dispatching a backend command.

## Default protections

- Target references must exist in the latest snapshot.
- Unsupported operations are rejected.
- Arbitrary JavaScript is not exposed to providers.
- Sensitive input values are not sent to decision providers.
- Navigation URLs must use HTTP or HTTPS.
- Repeated semantic actions are bounded.
- Browser sessions close by default.

## Sensitive actions

Do not delegate payments, destructive account actions, file uploads, MFA, or
CAPTCHA handling without explicit human approval and a backend-specific policy.
Browsemux does not solve CAPTCHAs and does not bypass authentication.

## Reporting

Do not open a public issue for a vulnerability involving credentials or browser
escape. Use GitHub private vulnerability reporting:

```text
https://github.com/xenstar/browsemux/security/advisories/new
```

Include the affected version, backend, provider, reproduction steps, and the
smallest safe diagnostic output. Never include API keys, cookies, session
tokens, private URLs, or page content.
