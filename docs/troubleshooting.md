# Troubleshooting

## `Figma API 403 ...` (or 404) from `design-bridge-tokens pull`

**Symptom:**

```
design-bridge-tokens: Figma API 403 Forbidden. Variables require an
Enterprise plan and a token with the `file_variables:read` scope. ...
```

**Cause:** `GET /v1/files/:key/variables/local` (`packages/tokens/src/figma-variables.mjs`,
`fetchLocalVariables`) is gated by Figma to Enterprise organizations, and
additionally requires a personal access token scoped to
`file_variables:read`. Either condition failing produces a non-2xx response.

**Fix:**

- Confirm the Figma file belongs to an Enterprise organization plan — there
  is no workaround for this on other plans (see
  [docs/faq.md](faq.md#do-i-need-a-figma-enterprise-plan)).
- Regenerate the token in Figma under **Settings → Personal access tokens**
  with the `file_variables:read` scope, and re-export `FIGMA_TOKEN`.
- Double-check the file key: `--file <key>` (or `FIGMA_FILE_KEY`) is the id
  in the file's URL, not the file's name.

## Figma plugin: "Load from localhost:6006" fails / stays stuck

**Symptom:** clicking **Load from localhost:6006** in the Design Bridge
Organizer UI produces an error or never populates the manifest textarea.

**Cause:** the plugin's `manifest.json` restricts `networkAccess` to
`http://localhost:6006` and `http://127.0.0.1:6006` only (see
[docs/security.md](security.md#figma-plugin-network-access)) — it fetches
`figma-organizer.json` straight from a running Storybook dev server. If
Storybook isn't running on port 6006, or is running on a different port,
there is nothing to fetch and the request fails.

**Fix:**

- Start Storybook locally on the default port 6006 in the library whose
  `registry.json` you generated stories from.
- If your Storybook runs on a non-default port, or a firewall blocks
  localhost requests from the Figma desktop app, use the fallback instead:
  copy the contents of the generated `figma-organizer.json` and paste it
  into the textarea, then click **Use pasted**
  (`packages/figma-plugin/src/ui.html`).

## `validateRegistry` errors

**Symptom:** `design-bridge-generate` exits with `Invalid registry (N
problem(s))` and a list of `registry.components[i].<field>: ...` messages.

**Cause:** `validateRegistry` (`packages/registry/src/schema.mjs`) collects
every problem in the registry document instead of stopping at the first one,
so the CLI can report the whole list in one run — see
[docs/registry.md](registry.md) for the full field reference.

**Common ones:**

- `registry.components[i].<id|name|family>: is required and must be a
  non-empty string` — one of the three required string fields is missing or
  blank.
- `registry.components[i].id: duplicate id "..."` — two components share an
  `id`; ids must be unique across the whole registry.
- `registry.components[i].dependsOn: unknown component id "..."` — a
  `dependsOn` entry points at an `id` that doesn't exist anywhere in
  `components`. Forward references (an id declared later in the array) are
  fine; only genuinely missing ids are rejected.
- **The Angular `selector` rule:** `registry.components[i].selector: is
  required: this component has a variant with \`slot\`, and Angular content
  projection needs the element selector to render it`. This fires only when
  `framework` is `"angular"` and at least one of the component's variants
  declares `slot`. Angular has no equivalent to a JSX/Vue tag name resolved
  from the imported class, so the adapter needs `component.selector`
  explicitly to build a template like
  `<app-button [variant]="variant">...</app-button>`. Add a `selector` field
  to the component. See
  [docs/registry.md#the-selector-field](registry.md#the-selector-field) for
  why this is a hard error instead of a silent fallback.

## `Circular dependency: a -> b -> a. ...` warning

**Symptom:** `design-bridge-generate` runs to completion but prints a
warning like:

```
warning: Circular dependency: card -> button -> card. Figma cannot import
either component as a real instance of the other; break the cycle.
```

**Cause:** two (or more) components' `dependsOn` reference each other,
directly or transitively. `computeLayers`
(`packages/registry/src/layers.mjs`) detects the cycle, breaks it (by
treating the back-reference as layer 0) so the rest of the dependency graph
still resolves and generation can proceed, and reports it as a warning
rather than failing silently or crashing.

**Fix:** remove one side of the cycle from the registry's `dependsOn`
arrays. A genuine mutual nesting relationship (`Card` contains `Button` *and*
`Button` contains `Card`) cannot be imported into Figma in any order, so one
of the two relationships is almost always a modelling mistake — decide which
component is really the "atom" here.

## A token renders as nothing — no error, just a missing style

**Symptom:** a component looks unstyled or uses a default/inherited value
for one property, but the build produced no error and no warning.

**Cause:** this is exactly the failure mode CSS custom properties are
designed to swallow silently — the browser drops a `var(--typo-'d-name))`
declaration instead of erroring, so a misspelled token name in a component
(`var(--ds-colour-brand)` instead of `var(--ds-color-brand)`, say) compiles
fine, ships fine, and only shows up as a visual bug in review, if anyone
notices at all.

**Fix:** run `npm run test:contract` (part of `npm test`). It's the check
built specifically to catch this class of bug —
`test/tokens-contract.test.mjs` scans every `.vue` / Angular `.ts` component
for `var(--ds-...)` references and asserts each one is actually declared in
the built `tokens.css`, in addition to checking that Vue and Angular examples
reference the same token set and that no component hard-codes a hex colour.
If the test fails, the reported token name is the misspelling (or a token
that was renamed/removed from the source `*.tokens.json` without updating
the component) — fix the name at the source rather than adding the wrong
one to the token set.

## Running the examples

These are the failures actually hit while building the Vue example. Each one
produces a confusing symptom, so they are worth recognising.

### `Could not resolve "react"` when starting Storybook

Storybook 8's manager UI is written in React, whatever framework renders your
components. A Vue or Angular example still needs `react` and `react-dom` as dev
dependencies. Without them `storybook dev` dies during bundling, before it ever
serves a page.

### Every `.vue` import 404s, or "content contains invalid JS syntax"

Vite has no Vue compiler registered, so it serves the single-file component as
raw text and import analysis rejects it. The error names a missing file, which
sends you looking at paths; the real cause is a missing plugin.

Install `@vitejs/plugin-vue` and register it explicitly in `.storybook/main.ts`
rather than relying on the framework preset to inject it — whether it does
varies across Storybook and Vite minor versions:

```ts
viteFinal: async (config) => {
  const hasVue = (config.plugins ?? []).flat().some((p: any) => p?.name === 'vite:vue');
  if (!hasVue) config.plugins = [...(config.plugins ?? []), vue()];
  return config;
},
```

### `WARN Could not resolve addon "@storybook/addon-essentials", skipping`

`.storybook/main.ts` lists an addon that is not installed. Storybook warns and
continues, so the only visible symptom is that controls and autodocs never
appear. Add the addon to `devDependencies`.

### Components live outside `src/`

Keep component sources under `src/`. Vite serves files outside its project root
through a `/@fs/` prefix, and an import that escapes the root (`../../../lib/…`)
resolves to a URL that does not exist. Putting `lib/` inside `src/` avoids the
whole class of problem.

### Stories 404 after regenerating while the dev server runs

`design-bridge-generate` removes its output directory before rewriting it, so
the files a running Vite has open are replaced with new inodes and it serves
404s for modules it still believes in. Restart the dev server after a manual
regeneration. The `storybook` npm script generates *before* starting, which is
why the normal path never hits this.

### The theme toolbar appears to do nothing

Apply the theme in the decorator body, not inside a Vue `setup()`. `setup()`
runs once when the story mounts, so changing the global re-renders the story
without ever updating `document.documentElement.dataset.theme`.
