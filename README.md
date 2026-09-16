<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <img src="docs/assets/banner-light.svg" alt="design-bridge — your design system, in both directions. Figma to Angular and Vue, through Storybook." width="880">
</picture>

<p>
  <em>Figma and your component library stop being two sources of truth.</em><br>
  <strong>Variables become tokens. Components become Component Sets. Both directions, one repo, zero runtime dependencies.</strong>
</p>

[![CI](https://github.com/gitsual/design-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/gitsual/design-bridge/actions/workflows/ci.yml)
[![Lint](https://github.com/gitsual/design-bridge/actions/workflows/lint.yml/badge.svg)](https://github.com/gitsual/design-bridge/actions/workflows/lint.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![Frameworks](https://img.shields.io/badge/adapters-Angular%20%7C%20Vue-informational.svg)](./docs/registry.md)
[![Runtime deps](https://img.shields.io/badge/runtime%20deps-0-success.svg)](./package.json)

<a href="#-60-second-tour"><strong>60-second tour</strong></a> ·
<a href="#-the-pipeline-step-by-step"><strong>The 19-step walkthrough</strong></a> ·
<a href="#-architecture"><strong>Architecture</strong></a> ·
<a href="./docs/registry.md"><strong>Registry schema</strong></a>

</div>

---

## 🌉 Why this exists

Every design system starts with the same promise and breaks in the same place.
The tokens live in Figma. The components live in the repo. Someone renames a
colour on a Tuesday, and three weeks later a button is the wrong shade of blue
in production and nobody can say when it happened.

The usual answer is a hand-written mapping file that somebody has to remember to
update. **design-bridge deletes that file.** Both directions are generated:

| | Direction | What crosses the bridge |
|---|---|---|
| 🎨 | **Figma → code** | Figma Variables become W3C DTCG tokens, then CSS custom properties, SCSS variables, and typed TypeScript — aliases preserved, so a palette override cascades everywhere. |
| 🧩 | **code → Figma** | A registry describes your components; the generator emits Storybook stories; [story.to.design](https://story.to.design) imports them; the bundled Figma plugin rebuilds real **Component Sets** with proper variant properties. |

### ✨ What you get

- **🔁 Two-way, not one-way.** Most tools pull from Figma. This one also pushes back.
- **🧬 Aliases survive the trip.** `semantic.bg` stays `var(--palette-slate-900)` in CSS — theming is one block of overrides, and no component knows a theme exists.
- **🪜 Dependency-aware imports.** Card nests Button, so Button lands in Figma *first*. Import them together and Figma gives you detached copies, not instances. The generator computes the layers for you.
- **🅰️ Angular and 🟩 Vue.** Same registry, two story adapters. Adding a third is one file.
- **📦 Zero runtime dependencies.** Plain Node ESM. Nothing to audit, nothing to upgrade.
- **✅ Everything below is real.** Every image in this README comes out of the commands in it — with exactly one labelled exception, and it says so in its own caption.

### ⚡ 60-second tour

```bash
git clone https://github.com/gitsual/design-bridge && cd design-bridge
npm ci

npm run demo          # the whole pipeline, end to end, no network, no Figma account
npm run generate:vue  # regenerate the Vue example's stories from the registry
npm run storybook     # see them running
```

`npm run demo` needs no token and no Enterprise plan: it runs the full
Figma → tokens → build → registry → stories → Figma-organizer chain against a
fixture and prints every intermediate artifact. 👇 The rest of this README is
that run, stage by stage, with a capture of each one.

---

## 👀 What it looks like

The same three components, the same registry, the same fifteen tokens — in both
themes.

| Light | Dark |
| --- | --- |
| <img src="docs/assets/story-button-light.png" alt="Button story, light theme" width="420"> | <img src="docs/assets/story-button-dark.png" alt="Button story, dark theme" width="420"> |
| <img src="docs/assets/story-card-light.png" alt="Card story, light theme" width="420"> | <img src="docs/assets/story-card-dark.png" alt="Card story, dark theme" width="420"> |

Switching the theme rewrites one block of custom properties. Because semantic
tokens are emitted as `var(--palette-…)` rather than as literals, overriding the
palette is enough — no component knows a theme exists.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/storybook-dark.png">
  <img src="docs/assets/storybook-light.png" alt="The generated stories running in Storybook" width="860">
</picture>

## 🪜 The pipeline, step by step

This is the whole of design-bridge, in order, with a capture of every stage.
Nothing here is a mock-up except step 19, which says so in its own caption and
explains why.

Every terminal capture was produced by running the commands in this repository;
every Storybook capture is the `examples/vue-lib` workspace served by
`npm run storybook`; every plugin capture is `packages/figma-plugin/src/ui.html`
rendered with the real generated manifest loaded into it.

| Steps | Command |
|---|---|
| 1–11 | `npm run demo` |
| 6–7 against the Vue example | `npm run generate:vue` |
| 12–15 | `npm run storybook` |

---

### Direction A — Figma → code

#### 1. What the Figma Variables API actually returns

![Raw response of GET /v1/files/:key/variables/local, showing two modes and a VARIABLE_ALIAS reference](docs/assets/demo/01-figma-api.svg)

`GET /v1/files/:key/variables/local` gives back variables keyed by id, each
carrying one `valuesByMode` entry per mode, and colours as floating-point RGBA
in the 0–1 range. A variable pointing at another variable arrives as
`{ "type": "VARIABLE_ALIAS", "id": "VariableID:…" }` — an id, not a value.
Preserving that indirection instead of flattening it is what makes theming work
three steps later.

This endpoint requires a Figma **Enterprise** plan and a token scoped
`file_variables:read`. See [security.md](docs/security.md) for how the token is
handled.

#### 2. `pull` — one DTCG file per collection and mode

![design-bridge-tokens pull writing palette.light, palette.dark and semantic token files](docs/assets/demo/02-tokens-pull.svg)

`pull` splits the response by collection **and** by mode, because a mode is not
a variant of a token — it is a whole parallel set of values. `palette/light` and
`palette/dark` become two files that can be built, diffed and reviewed
independently.

#### 3. The result: W3C DTCG, aliases intact

![A DTCG token file with $type, $value and a {palette.blue.500} alias reference](docs/assets/demo/03-dtcg.svg)

Slash-namespaced Figma names (`color/brand/primary`) become nested DTCG groups.
An alias becomes `"{palette.blue.500}"` — a reference in the
[W3C Design Tokens](https://www.w3.org/community/design-tokens/) format, which
any other DTCG tool can read. A dangling alias is a hard error, not a silent
`undefined`.

#### 4. `build` — one stylesheet, plus per-mode SCSS, TS and a flat map

![design-bridge-tokens build emitting tokens.css, .scss, .ts and .flat.json](docs/assets/demo/04-tokens-build.svg)

The default mode owns `:root`. Every other mode is emitted twice: once behind
`:root[data-theme="<mode>"]` for an explicit opt-in, and — for a mode named
`dark` — again inside `@media (prefers-color-scheme: dark)`, so the OS setting
wins unless the page pins a theme.

#### 5. Why the three targets differ

![The same token rendered as CSS var(), resolved SCSS, and a TS constant pointing at the CSS var](docs/assets/demo/05-three-targets.svg)

This is the one place the outputs deliberately disagree, and it is worth ten
seconds of your attention:

- **CSS keeps the alias** as `var(--ds-palette-blue-500)`. Overriding one
  palette token in a theme block then cascades to every semantic token that
  references it. That cascade IS the theming mechanism.
- **SCSS resolves the alias** to the literal value, because Sass compiles ahead
  of time and cannot follow a runtime `var()`.
- **TypeScript points at the CSS variable**, never at a literal, so a value read
  from TS and a value read from CSS can never drift apart.

---

### Direction B — code → Figma

#### 6. The registry: one declarative description

![A registry.json describing framework, components, imports, variants and controls](docs/assets/demo/06-registry.svg)

One JSON document describes the design system: components, their families,
their variants, their Storybook controls and — crucially — which components
nest which. Both the story generator and the Figma organizer read it, so they
cannot disagree. Full field reference: [registry.md](docs/registry.md).

#### 7. `generate` — stories, manifest and import plan

![design-bridge-generate writing story files, figma-organizer.json and printing the import plan](docs/assets/demo/07-generate.svg)

One command produces the Storybook stories, the organizer manifest the Figma
plugin consumes, and the import plan a human follows.

#### 8. A generated Vue story

![A generated CSF3 Vue story with argTypes derived from controls and s2d parameters](docs/assets/demo/08-generated-story.svg)

`controls` become `argTypes`. Variants become named exports. Variants carrying
`slot` content get a `render:` with a `data-figma-root` wrapper so
story.to.design imports the projected content too, instead of an empty shell.

#### 9. The same registry through the Angular adapter

![The same component generated as an Angular CSF3 story with property bindings](docs/assets/demo/09-angular-story.svg)

Same registry, `"framework": "angular"`, different adapter. Angular needs the
element `selector` to build a template for projected content — the schema
enforces that, rather than silently degrading to a props-only story. The
reasoning is in [registry.md](docs/registry.md#the-selector-field).

#### 10. The import plan — dependency layers

![An import plan showing Icon in layer 0, Button in layer 1, Card in layer 2](docs/assets/demo/10-import-plan.svg)

Card nests Button, which nests Icon. Import all three at once and Figma gives
you a Card containing a **detached copy** of Button — not an instance. So the
plan is topological: layer 0 first, componentise, then layer 1, then layer 2.
Each layer finds the one below it already a real component and links to it.

#### 11. The organizer manifest

![figma-organizer.json listing eleven items with family, component, variantLabel, variantProps and layer](docs/assets/demo/11-organizer.svg)

The contract between the code side and the plugin: for every frame that will
land in Figma, its family (→ which page), its component (→ which Component Set),
its variant properties (→ the Figma variant name) and its layer.

---

### Storybook

Served from `examples/vue-lib`, generated stories only.

#### 12. The generated tree

![Storybook sidebar showing acme / atoms / Button with six stories and Icon, plus molecules / Card](docs/assets/demo/12-storybook-sidebar.png)

Families become folders. No file in this tree was written by hand.

#### 13. Controls, from the registry

![The Storybook controls panel showing variant, size, disabled and icon controls](docs/assets/demo/13-storybook-controls.png)

Every row here came from a `controls` entry in the registry — `select` with its
options, `boolean`, `text`.

#### 14. Autodocs

![The Storybook autodocs page for Button](docs/assets/demo/14-storybook-autodocs.png)

#### 15. Dark mode, driven by the tokens

![The same Button story with the dark theme applied](docs/assets/demo/15-storybook-dark.png)

The toolbar toggle sets `data-theme="dark"` on the root; the token stylesheet
from step 4 does the rest. Nothing in the component changes — the brand colour
moves from `#3b82f6` to `#60a5fa` purely through the cascade of step 5.

---

### The Figma plugin

`packages/figma-plugin/` rendered in a browser with the real generated manifest.

#### 16. Opened, nothing loaded

![The Design Bridge Organizer panel with an empty log and the Organise button disabled](docs/assets/demo/16-plugin-empty.png)

The run button starts disabled. There is nothing to organise until a manifest is
loaded.

#### 17. Manifest loaded

![The panel with the generated manifest pasted in and the log reporting eleven items](docs/assets/demo/17-plugin-loaded.png)

The plugin fetches `figma-organizer.json` from the running Storybook
(`localhost:6006`, with `127.0.0.1` as a fallback) and falls back to a paste box
when the dev server is not reachable — a Figma plugin iframe cannot always see
your localhost.

#### 18. After organising

![The panel log reporting three component sets built across the atoms and molecules pages](docs/assets/demo/18-plugin-done.png)

The log reports exactly what it built, per component, and how many frames it
could not match. Re-running is safe: an existing Component Set is skipped rather
than duplicated.

#### 19. What that looks like inside Figma

![Diagram contrasting eleven loose frames before with three Component Sets after](docs/assets/demo/19-figma-before-after.svg)

**This one is a diagram, not a screenshot, and that is deliberate.** The Figma
stage needs an Enterprise plan for Variables and a paid story.to.design licence
for the import. No such account was used to produce this repository, so rather
than stage a convincing fake, the stage is drawn — with every name and property
read verbatim from the real `figma-organizer.json` generated in step 7.

---

### Verification

Everything above is covered by tests, so the demo cannot quietly rot:

- `test/tokens-contract.test.mjs` — the stylesheet declares every `var(--ds-*)`
  any component references, Vue and Angular consume the same token set, and no
  component hard-codes a hex colour.
- `test/docs-assets.test.mjs` — every image referenced in the docs exists, and
  every file in `docs/assets` is referenced by something. An orphan capture
  fails the build.

```bash
npm test
```

<img src="docs/assets/tests.svg" alt="npm test output, all suites passing" width="560">

## 🏗️ Architecture

An npm workspaces monorepo (`packages/*` only — the examples under `examples/`
are standalone consumers with their own `package.json`, so CI never installs
Angular or Storybook to run the test suite): `@design-bridge/tokens`,
`@design-bridge/registry`, `@design-bridge/generator`, `@design-bridge/figma-plugin`.

```
 Direction A — Figma Variables become code
 ┌────────────┐   GET /variables/local    ┌──────────────────┐
 │   Figma     │ ─────────────────────────>│ design-bridge-    │
 │  Variables  │   (Enterprise plan only)  │ tokens (pull)      │
 └────────────┘                           └─────────┬─────────┘
                                                      │ DTCG token JSON
                                                      ▼
                                           ┌──────────────────┐
                                           │ design-bridge-    │
                                           │ tokens (build)     │
                                           └─────────┬─────────┘
                                                      │
                              ┌───────────────┬───────┴───────┬────────────────┐
                              ▼               ▼               ▼                ▼
                         tokens.css        *.scss          *.ts          *.flat.json


 Direction B — components become Figma Component Sets
 ┌──────────────┐  design-bridge-generate  ┌────────────────────┐
 │   registry    │ ─────────────────────────>│ Storybook stories   │
 │  (JSON)       │                          │ + figma-organizer.  │
 └──────────────┘                          │   json               │
                                            └──────────┬──────────┘
                                                        │ import (per dependency layer)
                                                        ▼
                                            ┌────────────────────┐
                                            │  story.to.design     │  (3rd-party Figma plugin)
                                            │  flat frame import   │
                                            └──────────┬──────────┘
                                                        │
                                                        ▼
                                            ┌────────────────────┐
                                            │  Design Bridge       │  (this repo's Figma plugin)
                                            │  Organizer            │
                                            │  → real Component Sets│
                                            │  → grouped by family  │
                                            └────────────────────┘
```

See [docs/pipeline.md](docs/pipeline.md) for the full walkthrough of both
directions.

## 🎨 Direction A: Figma Variables → code

Figma Variables are read through `GET /v1/files/:key/variables/local` and
converted into [W3C DTCG](https://www.w3.org/community/design-tokens/) token
JSON, one file per collection/mode. Aliases between variables become DTCG
references (`"{color.brand.primary}"`), not resolved literals.

From there, tokens are built into platform artefacts. Aliases stay as
`var(--other-token)` in the emitted CSS, so overriding one palette token in a
theme block cascades to every semantic token that references it — that's how
theming works. The SCSS output resolves the same aliases to literal values
instead, because Sass compiles ahead of time and cannot follow a runtime
`var()`.

> **Figma Variables require an Enterprise plan.** The `variables/local` REST
> endpoint is gated to Enterprise Figma organizations, with an access token
> scoped to `file_variables:read`. On any other plan, `pull` will fail with an
> error from the Figma API.

### Styles, not just variables

Variables are the newer half of Figma's design data; most real libraries still
carry their gradients, shadows, text styles and layout grids as **styles**.
Those come across too, through a second pair of endpoints — `GET
/v1/files/:key/styles` gives the names and ids, `GET /v1/files/:key/nodes` the
values — and land as DTCG composite tokens:

| Figma style | `$type` | Emitted as |
| --- | --- | --- |
| Fill (solid) | `color` | one custom property |
| Fill (linear gradient) | `gradient` | one custom property, `linear-gradient(…)` |
| Effect (shadows, blurs) | `effect` | `-shadow`, `-blur`, `-backdrop-blur` |
| Text | `typography` | one property per sub-property, plus a utility class |
| Layout grid | `grid` | one property per sub-property |

A composite token has no single CSS spelling, so `build` splits it rather than
stringifying it. `typography` becomes `--ds-text-body-font-size`,
`--ds-text-body-line-height` and so on, plus a `typography.css` sheet whose
`.ds-text-body` class *references those properties* — never repeats their
values — so a theme override still reaches the class. An `effect` that carries
only a blur emits only `--ds-effect-frosted-blur`; adding a blur to a shadow
token never renames the shadow.

Styles ride along with `pull` by default; `--no-styles` skips them. They are a
separate endpoint and therefore a separate failure: if the styles request
fails, the variables you already fetched are still written, with a warning.

The plugin publishes the same tokens back as Figma styles — see
[packages/figma-plugin/README.md](packages/figma-plugin/README.md#publishing-styles).

## 🧩 Direction B: components → Figma

A JSON [registry](docs/registry.md) declares each component's variants,
Storybook controls, and which other registry components it nests
(`dependsOn`). `design-bridge-generate` validates it and emits:

- One Storybook story file per component.
- `figma-organizer.json` — the manifest the Figma plugin reads to rebuild
  Component Sets from a flat `story.to.design` import.
- `manifest.json` — a human-readable summary, including the import order.

Import order matters: if `Card` nests `Button` and both are imported into
Figma in the same batch, Figma has no existing `Button` component to link to
yet, so the `Button` inside `Card` becomes a detached copy rather than a real
instance. The registry's `dependsOn` graph is layered
(`packages/registry/src/layers.mjs`) so atoms (layer 0) are always imported
before anything that nests them.

## 🚀 Quickstart

```bash
npm install
```

To see both directions run end-to-end with no Figma account or network
access (a canned Figma Variables payload stands in for the API), run:

```bash
npm run demo
```

### Tokens

```bash
# Requires FIGMA_TOKEN in the environment (never pass it as a flag — see
# docs/security.md) and a Figma file key on an Enterprise plan.
FIGMA_TOKEN=... npx design-bridge-tokens pull --file <fileKey> --out tokens/

npx design-bridge-tokens build --in tokens/ --out dist/tokens --prefix ds
```

`build` writes `tokens.css` (all modes combined) plus one `.scss`, `.ts` and
`.flat.json` per `{collection}.{mode}` input file into `--out`.

### Components

```bash
npx design-bridge-generate --registry registry.json --out src/stories/generated --dry-run
npx design-bridge-generate --registry registry.json --out src/stories/generated
```

Then run Storybook, import it into Figma with
[story.to.design](https://story.to.design) one dependency layer at a time
(the printed import plan tells you the order), and run the **Design Bridge
Organizer** plugin — see
[packages/figma-plugin/README.md](packages/figma-plugin/README.md) to install
it via **Plugins → Development → Import plugin from manifest…** in the Figma
desktop app.

## 🗂️ Registry example

```json
{
  "name": "acme-ds",
  "framework": "vue",
  "components": [
    {
      "id": "button",
      "name": "Button",
      "family": "Actions",
      "import": { "module": "../../lib/Button.vue", "symbol": "default" },
      "variants": [
        { "label": "Primary", "props": { "variant": "primary", "size": "md" } }
      ],
      "controls": [
        { "prop": "variant", "kind": "select", "options": ["primary", "secondary", "ghost"] }
      ]
    },
    {
      "id": "card",
      "name": "Card",
      "family": "Layout",
      "dependsOn": ["button"],
      "import": { "module": "../../lib/Card.vue", "symbol": "default" },
      "variants": [
        { "label": "With action", "props": { "title": "Plan", "action": "Upgrade" } }
      ]
    }
  ]
}
```

Full field-by-field reference, including the `selector` field the Angular
adapter needs for slotted variants: [docs/registry.md](docs/registry.md).

## 🔎 Prior art / alternatives

design-bridge is narrow on purpose — it only does the two things above. Some
honest comparisons:

- **[Style Dictionary](https://styledictionary.com/)** does the token side
  far more generally: many input formats, a large transform/format/filter
  pipeline, platform outputs beyond web. This project's DTCG-to-CSS/SCSS/TS
  build (`packages/tokens/src/build.mjs`) is deliberately about ~120 lines
  and dependency-free, covering exactly the DTCG → web-platform case. If you
  need Android/iOS outputs, custom transform pipelines, or non-Figma token
  sources, use Style Dictionary instead.
- **[Tokens Studio](https://tokens.studio/)** is a Figma plugin that manages
  tokens *as Figma Styles/Variables with its own token format*, inside Figma,
  with a two-way sync UI. design-bridge does not manage tokens inside Figma
  at all — it only reads Figma's native Variables API one-way (Figma → code)
  and has no UI for authoring tokens.
- **[Figma Code Connect](https://www.figma.com/code-connect-docs/)** links
  existing Figma components to existing code components so Figma's Dev Mode
  can show the real code snippet for a selected component. It does not
  generate Figma components from code, and it does not move tokens in either
  direction — it is a documentation/inspection layer on top of components
  that already exist on both sides.
- **[story.to.design](https://story.to.design)** is the actual Storybook →
  Figma importer this project depends on for Direction B; design-bridge does
  not reimplement it. What design-bridge adds on top is the registry (a
  single source of truth for variants/controls/dependencies shared with the
  rest of the pipeline), the dependency-layer import order, and the
  organizer plugin that turns story.to.design's flat frame import into
  grouped, named Component Sets.

**What this project does *not* do:** it has no live two-way sync (nothing
watches Figma or the codebase for changes and re-runs automatically), no UI
for editing tokens or the registry, and no support for design systems outside
Angular and Vue (`registry.framework` accepts only those two values). It
Component-level Figma **styles** are in scope in both directions — fills,
gradients, text styles, effects and layout grids come across as DTCG
composite tokens, and colour, gradient, effect and typography tokens can be
published back as Figma styles — but a style is still a value, not a
component: the plugin never generates the component that uses it.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

[MIT](LICENSE) © 2026 Álvaro González Sanz

---

<div align="center">

<img src="docs/assets/logo.svg" alt="design-bridge" width="48">

<sub>Built because a design system with two sources of truth has none.</sub>

</div>
