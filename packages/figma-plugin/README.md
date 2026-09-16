# @design-bridge/figma-plugin — Design Bridge Organizer

A Figma plugin that rebuilds Component Sets from a `story.to.design` import,
using the manifest emitted by `design-bridge-generate`
(`figma-organizer.json`). See [../../docs/pipeline.md](../../docs/pipeline.md)
for how it fits into the full code → Figma direction.

`story.to.design` imports every Storybook story as an independent, flat
frame. This plugin turns that flat import back into a real design system
inside Figma:

1. Matches each imported frame to a manifest item, by name.
2. Converts matched frames into Figma `COMPONENT`s.
3. Combines each component's variants into a `COMPONENT_SET`, naming every
   variant `prop=value, ...` so Figma exposes real, inspectable variant
   properties (a component with no scalar props falls back to
   `Variant=<label>`).
4. Optionally moves each Component Set onto a page named after its `family`.

Re-running is safe: a `COMPONENT_SET` that is already organised is left
alone, not duplicated.

## Install (development)

Figma plugins are not published to a marketplace during development — they
are loaded locally from `manifest.json`:

1. Open the Figma desktop app.
2. **Plugins → Development → Import plugin from manifest…**
3. Select `packages/figma-plugin/manifest.json` from this repo.
4. The plugin now appears under **Plugins → Development → Design Bridge
   Organizer** in any file.

## Use

1. In your library repo, run Storybook locally on port 6006 (the default) and
   generate stories with `design-bridge-generate` (see the root
   [README](../../README.md#quickstart)).
2. Import Storybook into the target Figma file with `story.to.design`.
3. Select the imported frames (or select nothing to scan the whole current
   page — `figma.currentPage.children` is used as the fallback).
4. Run **Design Bridge Organizer**. In the plugin UI:
   - Click **Load from localhost:6006** to fetch `figma-organizer.json`
     directly from your running Storybook dev server (the plugin tries both
     `http://localhost:6006` and `http://127.0.0.1:6006`), or paste the
     manifest's contents into the textarea and click **Use pasted**.
   - Leave **Move each family onto its own page** checked to have the plugin
     create/reuse one page per `family` and move each finished Component Set
     there. Uncheck it to organise components in place on the current page.
   - Adjust **Page prefix** (default `DS / `) if you want the created pages
     named differently.
   - Click **Organise selection**.
5. The log panel reports, per run: how many components were matched, how many
   Component Sets were created, and counts of unmatched/skipped nodes (a node
   is skipped when it can't be converted to a `COMPONENT` — e.g. it is
   already a `COMPONENT_SET`, or Figma's `createComponentFromNode` rejects
   it).

## Network access

`manifest.json` restricts `networkAccess` to `http://localhost:6006` and
`http://127.0.0.1:6006` only — the plugin can fetch the organizer manifest
from a local Storybook dev server and nothing else. It never talks to the
Figma REST API or any other host. See
[../../docs/security.md](../../docs/security.md).
