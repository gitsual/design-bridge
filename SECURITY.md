# Security Policy

## Supported versions

design-bridge is pre-1.0. Only the latest published `0.x` release is
supported with security fixes.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Reporting a vulnerability

Please **do not open a public issue** for a security report. Use
[GitHub Security Advisories](https://github.com/gitsual/design-bridge/security/advisories/new)
on this repository to report privately. If that is not available to you,
contact the maintainer directly at shirokulll@gmail.com.

Include, where possible:

- The affected package (`@design-bridge/tokens`, `@design-bridge/registry`,
  `@design-bridge/generator`, `@design-bridge/figma-plugin`) and version.
- Steps to reproduce, or a minimal registry/token input that triggers the
  issue.
- The impact you believe it has.

### Response window

We aim to acknowledge a report within **5 business days** and to provide a
status update (fix, mitigation, or rejection with rationale) within
**14 days**. Confirmed vulnerabilities are fixed and released before any
public disclosure or advisory is published.

## Risk surface specific to this project

design-bridge has two places where it handles anything sensitive:

1. **The Figma personal access token (`FIGMA_TOKEN`).** `design-bridge-tokens
   pull` needs a token scoped to `file_variables:read` to call
   `GET /v1/files/:key/variables/local`. The token is read only from the
   environment — there is no `--token` CLI flag, and there should never be
   one, so it can't end up in shell history, CI logs, or a process listing.
   See [docs/security.md](docs/security.md) for the full rationale and for
   what to do if a token leaks.

2. **The Figma plugin's network access.** `packages/figma-plugin/manifest.json`
   restricts `networkAccess` to `http://localhost:6006` and
   `http://127.0.0.1:6006` — the local Storybook dev server it reads
   `figma-organizer.json` from. The plugin never talks to the Figma REST API
   or any other host. Any change that widens `networkAccess` is a
   security-relevant change and should be called out explicitly in review.

Everything else in this project runs locally, offline, over files you already
control: token building, registry validation, and Storybook story generation
have no network access at all.

See also [docs/security.md](docs/security.md) for day-to-day operational
guidance (never commit `.env`, rotating a leaked token).
