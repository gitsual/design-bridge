# The pipeline, step by step

This is the whole of design-bridge, in order, with a capture of every stage.
Nothing here is a mock-up except step 19, which says so in its own caption and
explains why.

Every terminal capture was produced by running the commands in this repository;
every Storybook capture is the `examples/vue-lib` workspace served by
`npm run storybook`; every plugin capture is `packages/figma-plugin/src/ui.html`
rendered with the real generated manifest loaded into it.

To reproduce the whole thing yourself:

```bash
npm ci
npm run demo          # steps 1-11, end to end, no network
npm run generate:vue  # steps 6-7 against the Vue example
npm run storybook     # steps 12-15
```

---

## Direction A — Figma → code

### 1. What the Figma Variables API actually returns

![Raw response of GET /v1/files/:key/variables/local, showing two modes and a VARIABLE_ALIAS reference](./assets/demo/01-figma-api.svg)

`GET /v1/files/:key/variables/local` gives back variables keyed by id, each
carrying one `valuesByMode` entry per mode, and colours as floating-point RGBA
in the 0–1 range. A variable pointing at another variable arrives as
`{ "type": "VARIABLE_ALIAS", "id": "VariableID:…" }` — an id, not a value.
Preserving that indirection instead of flattening it is what makes theming work
three steps later.

This endpoint requires a Figma **Enterprise** plan and a token scoped
`file_variables:read`. See [security.md](./security.md) for how the token is
handled.

### 2. `pull` — one DTCG file per collection and mode

![design-bridge-tokens pull writing palette.light, palette.dark and semantic token files](./assets/demo/02-tokens-pull.svg)

`pull` splits the response by collection **and** by mode, because a mode is not
a variant of a token — it is a whole parallel set of values. `palette/light` and
`palette/dark` become two files that can be built, diffed and reviewed
independently.

### 3. The result: W3C DTCG, aliases intact

![A DTCG token file with $type, $value and a {palette.blue.500} alias reference](./assets/demo/03-dtcg.svg)

Slash-namespaced Figma names (`color/brand/primary`) become nested DTCG groups.
An alias becomes `"{palette.blue.500}"` — a reference in the
[W3C Design Tokens](https://www.w3.org/community/design-tokens/) format, which
any other DTCG tool can read. A dangling alias is a hard error, not a silent
`undefined`.

### 4. `build` — one stylesheet, plus per-mode SCSS, TS and a flat map

![design-bridge-tokens build emitting tokens.css, .scss, .ts and .flat.json](./assets/demo/04-tokens-build.svg)

The default mode owns `:root`. Every other mode is emitted twice: once behind
`:root[data-theme="<mode>"]` for an explicit opt-in, and — for a mode named
`dark` — again inside `@media (prefers-color-scheme: dark)`, so the OS setting
wins unless the page pins a theme.

### 5. Why the three targets differ

![The same token rendered as CSS var(), resolved SCSS, and a TS constant pointing at the CSS var](./assets/demo/05-three-targets.svg)

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

## Direction B — code → Figma

### 6. The registry: one declarative description

![A registry.json describing framework, components, imports, variants and controls](./assets/demo/06-registry.svg)

One JSON document describes the design system: components, their families,
their variants, their Storybook controls and — crucially — which components
nest which. Both the story generator and the Figma organizer read it, so they
cannot disagree. Full field reference: [registry.md](./registry.md).

### 7. `generate` — stories, manifest and import plan

![design-bridge-generate writing story files, figma-organizer.json and printing the import plan](./assets/demo/07-generate.svg)

One command produces the Storybook stories, the organizer manifest the Figma
plugin consumes, and the import plan a human follows.

### 8. A generated Vue story

![A generated CSF3 Vue story with argTypes derived from controls and s2d parameters](./assets/demo/08-generated-story.svg)

`controls` become `argTypes`. Variants become named exports. Variants carrying
`slot` content get a `render:` with a `data-figma-root` wrapper so
story.to.design imports the projected content too, instead of an empty shell.

### 9. The same registry through the Angular adapter

![The same component generated as an Angular CSF3 story with property bindings](./assets/demo/09-angular-story.svg)

Same registry, `"framework": "angular"`, different adapter. Angular needs the
element `selector` to build a template for projected content — the schema
enforces that, rather than silently degrading to a props-only story. The
reasoning is in [registry.md](./registry.md#the-selector-field).

### 10. The import plan — dependency layers

![An import plan showing Icon in layer 0, Button in layer 1, Card in layer 2](./assets/demo/10-import-plan.svg)

Card nests Button, which nests Icon. Import all three at once and Figma gives
you a Card containing a **detached copy** of Button — not an instance. So the
plan is topological: layer 0 first, componentise, then layer 1, then layer 2.
Each layer finds the one below it already a real component and links to it.

### 11. The organizer manifest

![figma-organizer.json listing eleven items with family, component, variantLabel, variantProps and layer](./assets/demo/11-organizer.svg)

The contract between the code side and the plugin: for every frame that will
land in Figma, its family (→ which page), its component (→ which Component Set),
its variant properties (→ the Figma variant name) and its layer.

---

## Storybook

Served from `examples/vue-lib`, generated stories only.

### 12. The generated tree

![Storybook sidebar showing acme / atoms / Button with six stories and Icon, plus molecules / Card](./assets/demo/12-storybook-sidebar.png)

Families become folders. No file in this tree was written by hand.

### 13. Controls, from the registry

![The Storybook controls panel showing variant, size, disabled and icon controls](./assets/demo/13-storybook-controls.png)

Every row here came from a `controls` entry in the registry — `select` with its
options, `boolean`, `text`.

### 14. Autodocs

![The Storybook autodocs page for Button](./assets/demo/14-storybook-autodocs.png)

### 15. Dark mode, driven by the tokens

![The same Button story with the dark theme applied](./assets/demo/15-storybook-dark.png)

The toolbar toggle sets `data-theme="dark"` on the root; the token stylesheet
from step 4 does the rest. Nothing in the component changes — the brand colour
moves from `#3b82f6` to `#60a5fa` purely through the cascade of step 5.

---

## The Figma plugin

`packages/figma-plugin/` rendered in a browser with the real generated manifest.

### 16. Opened, nothing loaded

![The Design Bridge Organizer panel with an empty log and the Organise button disabled](./assets/demo/16-plugin-empty.png)

The run button starts disabled. There is nothing to organise until a manifest is
loaded.

### 17. Manifest loaded

![The panel with the generated manifest pasted in and the log reporting eleven items](./assets/demo/17-plugin-loaded.png)

The plugin fetches `figma-organizer.json` from the running Storybook
(`localhost:6006`, with `127.0.0.1` as a fallback) and falls back to a paste box
when the dev server is not reachable — a Figma plugin iframe cannot always see
your localhost.

### 18. After organising

![The panel log reporting three component sets built across the atoms and molecules pages](./assets/demo/18-plugin-done.png)

The log reports exactly what it built, per component, and how many frames it
could not match. Re-running is safe: an existing Component Set is skipped rather
than duplicated.

### 19. What that looks like inside Figma

![Diagram contrasting eleven loose frames before with three Component Sets after](./assets/demo/19-figma-before-after.svg)

**This one is a diagram, not a screenshot, and that is deliberate.** The Figma
stage needs an Enterprise plan for Variables and a paid story.to.design licence
for the import. No such account was used to produce this repository, so rather
than stage a convincing fake, the stage is drawn — with every name and property
read verbatim from the real `figma-organizer.json` generated in step 7.

---

## Verification

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
