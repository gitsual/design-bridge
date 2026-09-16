# Pipeline

design-bridge moves design tokens and components in both directions between
Figma and a component library. The two directions are independent — you can
use either one alone — but they read the same registry format and share the
same token output, so a codebase using both stays consistent.

```
                        Direction A: Figma -> code
 ┌────────────┐  GET /variables/local  ┌──────────────┐   CSS / SCSS / TS
 │   Figma     │ ─────────────────────>│ tokens/cli.mjs│ ──────────────────>
 │  Variables  │  (Enterprise only)    │ pull → build  │   packages/tokens
 └────────────┘                        └──────────────┘

                        Direction B: code -> Figma
 ┌──────────────┐  generate  ┌───────────────┐  import   ┌──────────────┐
 │   registry    │ ─────────>│  Storybook     │ ────────> │ story.to     │
 │  (JSON)       │            │  stories +     │  (3rd     │  .design     │
 └──────────────┘            │  organizer.json│   party)  └──────┬───────┘
                              └───────────────┘                  │
                                                     Component Sets, │
                                                     named + laid    ▼
                                                     out by family ┌──────────────┐
                                                                   │ Figma plugin │
                                                                   │ (organizer)  │
                                                                   └──────────────┘
```

## Direction A: Figma → code

`design-bridge-tokens` (`packages/tokens/`) has two subcommands:

```bash
design-bridge-tokens pull  --file <key> [--out tokens/]
design-bridge-tokens build --in tokens/ --out dist/ [--prefix ds]
```

`pull` calls `GET /v1/files/:key/variables/local` (`figma-variables.mjs`) and
converts the response into one [W3C DTCG](https://www.w3.org/community/design-tokens/)
token JSON file per `{collection}.{mode}` pair — e.g. `palette.light.tokens.json`,
`palette.dark.tokens.json`. Figma variable names are slash-namespaced
(`color/brand/primary`); the converter (`nameToPath`) turns the slashes into
nested DTCG groups. A variable that aliases another Figma variable becomes a
DTCG reference (`"{color.brand.primary}"`), not a resolved literal — the alias
graph is preserved, not flattened.

`build` reads every `*.tokens.json` file in the input directory and emits, per
file, a `.scss`, a `.ts` and a `.flat.json`, plus one combined `tokens.css` for
the whole directory (`build.mjs`). The default mode (`--default-mode`, default
`light`) owns `:root`; every other mode is emitted twice — once behind
`:root[data-theme="<mode>"]` for an explicit opt-in, and, for a mode literally
named `dark`, again inside `@media (prefers-color-scheme: dark)` so the theme
follows the OS unless a page pins one explicitly.

CSS and SCSS diverge on one point deliberately: `toCss` keeps aliases as
`var(--other-token)` so overriding one palette token in a theme block cascades
to every semantic token that references it — that is the whole mechanism
theming relies on. `toScss` resolves every alias to its literal value instead,
because Sass compiles ahead of time and cannot follow a runtime `var()`.

**Figma Variables require an Enterprise plan.** The `variables/local` REST
endpoint is gated to Enterprise Figma organizations with a token that has the
`file_variables:read` scope; on any other plan, `pull` fails with a 403/404
from the Figma API. There is no workaround inside this tool — see
[Prior Art](../README.md#prior-art--alternatives) in the README for
alternatives that don't need it.

## Direction B: code → Figma

1. Describe the design system in a [registry](./registry.md) JSON document.
2. `design-bridge-generate --registry <file> --out <dir>` (`packages/generator/`)
   validates the registry, then emits one Storybook story file per component
   plus two manifests: `manifest.json` (a human-readable summary — component
   count, story count, the import plan) and `figma-organizer.json` (the
   machine contract for the Figma plugin, see below).
3. Run Storybook, and import it into a Figma file with the third-party plugin
   [story.to.design](https://story.to.design). It renders every story as
   a flat, independent frame named after the story's title path — useful, but
   not yet a design system: nothing is grouped into Component Sets, nothing
   carries Figma variant properties, and nothing is laid out.
4. Run the **Design Bridge Organizer** Figma plugin
   (`packages/figma-plugin/`, see its own
   [README](../packages/figma-plugin/README.md) for install and use). It
   reads `figma-organizer.json`, matches each imported frame to a manifest
   entry by name, converts matched frames to real Figma `COMPONENT`s, combines
   each component's variants into a `COMPONENT_SET` (naming every variant
   `prop=value, ...` so Figma exposes real, inspectable variant properties),
   and moves each set onto a page named after its `family`. Re-running is
   idempotent — an already-organised `COMPONENT_SET` is skipped, not
   duplicated.

### Dependency layers

Import order matters. If `Card` renders a nested `Button` and both frames
arrive in the same `story.to.design` import batch, Figma has no existing
`Button` component to link to yet — the `Button` inside `Card`'s frame becomes
a detached copy of shapes, not an instance of the real `Button` component. Any
later change to `Button` then never propagates into `Card`.

`computeLayers` (`packages/registry/src/layers.mjs`) solves this with a
longest-path-to-a-leaf layering over each component's `dependsOn`: components
with no dependencies sit at layer 0 ("Atoms"); a component sits one layer
above the deepest dependency it nests. `toBatches` groups components by layer
into an ordered import plan, which `design-bridge-generate` prints and also
writes into `manifest.json.importPlan`:

```
import plan: L0 (1) -> L1 (1)
```

Import `story.to.design` **once per layer, in order** — layer 0 first, so
every atom exists as a real Figma component before anything that nests it is
imported. A dependency cycle (two components nesting each other) cannot be
imported in any order; `computeLayers` detects it, breaks it so the rest of
the graph still resolves, and `generate()` turns it into a build warning
rather than a silent wrong answer.

### Why the manifest and the story titles must match exactly

The organizer plugin indexes `figma-organizer.json` items by `name`, which is
built as `{registryName}/{family}/{component}/{variantLabel}` — the same
scheme Storybook's own `title` uses (`storyTitle`, one level shallower, since
Storybook's title doesn't include the variant). `story.to.design` writes that
title path as the frame's name (or as a text layer inside it, which the
plugin also checks as a fallback via `resolveItem`). If you rename a component
or a variant label in the registry, regenerate *and re-import* — an
already-imported frame keeps its old name until you overwrite it.
