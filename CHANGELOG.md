# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-16

Initial release.

### Added

- **Direction A — Figma Variables → code** (`@design-bridge/tokens`):
  - `design-bridge-tokens pull` reads `GET /v1/files/:key/variables/local`
    (Figma Enterprise only) and converts the response into one
    [W3C DTCG](https://www.w3.org/community/design-tokens/) token JSON file
    per collection/mode. Variable aliases are preserved as DTCG references,
    not resolved literals.
  - `design-bridge-tokens build` emits a combined `tokens.css`, plus a
    `.scss`, a typed `.ts`, and a `.flat.json` per input file. CSS keeps
    aliases as `var(--other-token)` for runtime theming; SCSS resolves them
    to literals at build time.
  - Multi-mode support: the default mode owns `:root`; other modes are
    emitted under `[data-theme="<mode>"]`, and a mode named `dark` is also
    wrapped in `@media (prefers-color-scheme: dark)`.
- **Direction B — components → Figma** (`@design-bridge/registry`,
  `@design-bridge/generator`, `@design-bridge/figma-plugin`):
  - A JSON registry format describing components, variants, Storybook
    controls, and inter-component `dependsOn`, validated by
    `validateRegistry` with exhaustive (not fail-fast) error reporting.
  - `design-bridge-generate` renders one Storybook story per component for
    Angular and Vue, plus `manifest.json` and `figma-organizer.json`.
  - Dependency-layer computation (`computeLayers` / `toBatches`) so
    components can be imported into Figma one layer at a time, avoiding
    detached-copy imports of nested components. Circular dependencies are
    detected and reported as build warnings.
  - The **Design Bridge Organizer** Figma plugin: matches a flat
    `story.to.design` import to the organizer manifest by name, converts
    matched frames to `COMPONENT`s, combines variants into `COMPONENT_SET`s
    with real Figma variant properties, and optionally files each set onto
    a page named after its `family`. Re-running is idempotent.
- Contract test (`test/tokens-contract.test.mjs`) checking that every custom
  property referenced by the example Vue/Angular components is actually
  declared in the built `tokens.css`, that both example libraries consume
  the same token set, and that neither hard-codes a hex colour.
- `npm run demo` — runs both directions end-to-end against a canned Figma
  Variables payload, with no network access or Figma account required.
- Example consumers under `examples/` (`vue-lib`, `angular-lib`, `shared`)
  used by the demo and the contract test; standalone `package.json`s so CI
  never installs Angular or Storybook to run the test suite.

[Unreleased]: https://github.com/gitsual/design-bridge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gitsual/design-bridge/releases/tag/v0.1.0
