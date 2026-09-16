# Registry schema reference

The registry is a single JSON (or JS module exporting JSON) document that
describes a design system: its components, their variants, their Storybook
controls, and their dependencies on each other. `@design-bridge/generator`
consumes it to produce Storybook stories and the Figma organizer manifest;
`@design-bridge/registry` owns validation and dependency-layer computation.

Validation is implemented in `packages/registry/src/schema.mjs`
(`validateRegistry`). It never throws — it returns `{ valid, errors }` with
every problem found, not just the first, so a CLI can report everything in
one run.

## Top level

```json
{
  "name": "acme-ds",
  "framework": "vue",
  "components": []
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | `string` | yes | Non-empty. Used as the Storybook title prefix (`storyTitle`) and as `manifest.system` / `organizer.system`. |
| `framework` | `string` | yes | Must be exactly `"angular"` or `"vue"` — this selects the story adapter. |
| `components` | `array` | yes | Array of [component](#component) objects. |

## Component

```json
{
  "id": "button",
  "name": "Button",
  "family": "Actions",
  "selector": "app-button",
  "import": { "module": "../../lib/Button.vue", "symbol": "default" },
  "dependsOn": [],
  "variants": [],
  "controls": []
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `id` | `string` | yes | Non-empty; must be unique across the whole registry (`duplicate id "..."` error otherwise). Used as the dependency-graph key and as `manifest.components[].id` / `organizer.items[].componentId`. |
| `name` | `string` | yes | Non-empty. Component display name; also the fallback export symbol when `import.symbol` is `"default"`. |
| `family` | `string` | yes | Non-empty. Groups components in the Storybook title (`{name}/{family}/{component}`) and becomes the Figma page name the organizer plugin moves the Component Set onto. |
| `import` | `object` | yes | See [import](#import) below. |
| `dependsOn` | `string[]` | no | Component `id`s this component nests. Every entry must reference an id that exists elsewhere in `components` — a dangling reference is rejected (`unknown component id "..."`), but *forward* references (an id declared later in the array) are fine; validation checks ids only after the whole array is scanned. Drives [dependency layering](./pipeline.md#dependency-layers). |
| `variants` | array of [variant](#variant) | no | Defaults to a single `{ label: 'Default', props: {} }` story if omitted or empty (`generate.mjs` / `organizer.mjs` apply this default, not the schema). |
| `controls` | array of [control](#control) | no | Storybook `argTypes` for this component's props. |
| `selector` | `string` | conditional | **Required** when `framework` is `angular` and any variant declares `slot`. Must be a non-empty string when present. See the [note below](#the-selector-field). |

### `import`

| Field | Type | Required | Rules |
|---|---|---|---|
| `module` | `string` | yes | Non-empty. The import path written verbatim into the generated story (e.g. `import Button from '<module>'`). |
| `symbol` | `string` | yes | Non-empty. Either `"default"` (renders as `import {name} from '<module>'` using the component's `name`) or a named export (renders as `import { symbol } from '<module>'`). |

### Variant

| Field | Type | Required | Rules |
|---|---|---|---|
| `label` | `string` | yes | Non-empty. Storybook export name is derived from it (`exportName`, in `packages/generator/src/naming.mjs`) — it is ASCII-folded and Pascal-cased, and prefixed with `Variant` if it would otherwise start with a digit. It is also the Figma variant name fallback and the join key suffix in the organizer manifest (`{storyTitle}/{label}`). |
| `props` | `object` | no | Must be a plain object (not an array) if present. Becomes the story's `args`. Only `string`/`number`/`boolean` values survive into the Figma organizer manifest as variant properties (`scalarProps` in `organizer.mjs`) — objects, arrays and functions are dropped there, though they still work as ordinary Storybook args. |
| `slot` | `string` | no | Must be a string if present. Marks the variant as needing projected content (`<ng-content>` / Vue slot) instead of plain `args` — see [pipeline.md](./pipeline.md). |

### Control

Maps a component prop to a Storybook `argTypes` entry (`packages/generator/src/argtypes.mjs`).

| Field | Type | Required | Rules |
|---|---|---|---|
| `prop` | `string` | yes | Non-empty. The prop name. |
| `kind` | `string` | yes | Must be one of `CONTROL_KINDS`: `boolean`, `text`, `number`, `select`, `radio`, `color`. |
| `options` | `array` | required for `select`/`radio` | Must be an array when `kind` is `"select"` or `"radio"`. |
| `description` | `string` | no | Passed through to the Storybook `argTypes` entry when present. Not validated by the schema. |

## Example

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
        { "label": "Primary", "props": { "variant": "primary", "size": "md" } },
        { "label": "Ghost", "props": { "variant": "ghost", "size": "sm" } }
      ],
      "controls": [
        { "prop": "variant", "kind": "select", "options": ["primary", "secondary", "ghost"] },
        { "prop": "disabled", "kind": "boolean" }
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

`card` depends on `button`, so `computeLayers` puts `button` in layer 0 and
`card` in layer 1 — `card` is imported into Figma only after `button` already
exists there, so Figma links it as a real component instance rather than a
detached copy. See [pipeline.md](./pipeline.md#dependency-layers).

## The `selector` field

The Angular story adapter (`packages/generator/src/adapters/angular.mjs`)
reads `component.selector` when a variant declares `slot` content, to build
an inline template like `<app-button [variant]="variant">...</app-button>`.
Angular has no equivalent to a JSX/Vue tag name resolved from the imported
class — the component class and the template selector are two different
things — so this field is how the registry supplies it.

`validateRegistry` enforces this: if `framework` is `angular` and any variant
declares `slot` content, a missing `selector` is a validation error, and
`generate()` throws rather than emitting a story.

That rule exists because the alternative is worse. Without a selector the
adapter cannot build a template, so it would fall back to a props-only story —
the projected content would disappear from Storybook and from the Figma import
with no error anywhere. Silent data loss in a generator is harder to catch than
a failed build, so this fails the build.

Vue never needs `selector`: the component is mounted by its imported symbol and
slot content goes between the tags.
