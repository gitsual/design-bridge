# FAQ

## Why not just use Style Dictionary?

Style Dictionary is far more general: many input formats, a large
transform/format/filter pipeline, and platform outputs beyond web (Android,
iOS, and more). design-bridge's build step
(`packages/tokens/src/build.mjs`) is deliberately about 120 lines and has no
dependencies — it covers exactly one case, DTCG tokens pulled from Figma
Variables going to CSS custom properties, SCSS, and typed TypeScript. If you
need non-web platform outputs, a custom transform pipeline, or token sources
other than Figma, use Style Dictionary instead — or feed it the same DTCG
JSON design-bridge already produces. See
[Prior art / alternatives](../README.md#prior-art--alternatives) for the
fuller comparison.

## Do I need a Figma Enterprise plan?

Only for **Direction A** (Figma Variables → code). `pull` calls
`GET /v1/files/:key/variables/local`, and that endpoint is gated to
Enterprise Figma organizations by Figma itself — this project has no
workaround for that, because there isn't one. On any other plan, `pull`
fails with a 403/404 from the Figma API (see
[docs/troubleshooting.md](troubleshooting.md)).

**Direction B** (components → Figma) has no such requirement: `story.to.design`
and the bundled Figma plugin work on any plan that can run community plugins.

## Why does CSS keep aliases as `var()` but SCSS resolves them to literals?

Because the two languages resolve variables at different times. `toCss`
(`packages/tokens/src/build.mjs`) keeps an alias as `var(--other-token)` so
that overriding one palette token inside a theme block — for example
`[data-theme="dark"] { --ds-color-brand-primary: ...; }` — cascades to every
semantic token that references it. That cascade *is* the theming mechanism;
resolving aliases to literals in CSS would break theme overrides entirely.

`toScss` resolves the same alias to its literal value instead, because Sass
compiles ahead of time: a compiled `.scss` file has no runtime, so a `var()`
reference to a token that doesn't exist in that context would just be dead
weight. SCSS consumers get the same values baked in at build time.

## Why must components be imported into Figma in a specific order?

Because of how `story.to.design` imports frames. If `Card` nests `Button`
and both frames are imported in the same batch, Figma has no existing
`Button` component yet for `Card`'s nested copy to link to — it becomes a
detached copy of shapes, not a real component instance, and future edits to
`Button` never propagate into `Card`.

`design-bridge-generate` computes a dependency-layer order from each
component's `dependsOn`
(`computeLayers` / `toBatches` in `packages/registry/src/layers.mjs`) and
prints it as an import plan (`L0 (n) -> L1 (n) -> ...`), also written to
`manifest.json.importPlan`. Import one layer at a time, in order — see
[docs/pipeline.md](pipeline.md#dependency-layers).

## Does this replace story.to.design?

No. [story.to.design](https://story.to.design) is a required third-party
step for Direction B — it's the actual Storybook → Figma frame importer.
design-bridge does not reimplement it and never will. What design-bridge
adds on top is the registry (one source of truth for variants, controls, and
dependencies shared with the rest of the pipeline), the dependency-layer
import order, and the **Design Bridge Organizer** plugin that turns
story.to.design's flat frame import into grouped, named Component Sets with
real Figma variant properties.

## Can I use this with React?

Not yet. `registry.framework` only accepts `"angular"` or `"vue"`
(`packages/registry/src/schema.mjs`) — that's what selects the story adapter
in `packages/generator/src/adapters/`. A React adapter is a plausible
addition; see [ROADMAP.md](../ROADMAP.md).

## What happens if I rename a component or variant label after importing it into Figma?

The organizer plugin matches frames to manifest entries by an exact name —
`{registryName}/{family}/{component}/{variantLabel}`
(`packages/figma-plugin/src/code.js`, `resolveItem`). If you rename either
side in the registry and regenerate, the old Figma frame keeps its old name
until you re-import it: nothing updates it automatically. Regenerate *and
re-import* whenever you rename something. See
[docs/pipeline.md](pipeline.md#why-the-manifest-and-the-story-titles-must-match-exactly).
