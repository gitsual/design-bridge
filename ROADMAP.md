# Roadmap

This is a list of directions the project could go, derived from real gaps in
the current implementation. **None of this is a commitment or a timeline** —
design-bridge is maintained as time allows, and items here may never
happen, change shape, or get superseded by an issue that makes a better case.
If one of these matters to you, open or upvote an issue rather than assuming
it's in progress.

See also [Prior art / alternatives](README.md#prior-art--alternatives) for
things this project deliberately does *not* try to do.

## Candidate items

- **A React adapter.** `registry.framework` currently accepts only
  `"angular"` and `"vue"` (`packages/registry/src/schema.mjs`); the two
  existing adapters (`packages/generator/src/adapters/`) share no framework
  detection logic that would make a third one structurally hard, but nobody
  has written it yet.
- **A `--watch` mode for `design-bridge-generate`.** Right now regenerating
  after a registry edit means re-running the CLI by hand. A file watcher that
  regenerates on save (and maybe reloads Storybook) would close the loop
  during registry authoring.
- **Style Dictionary interop.** `packages/tokens/src/build.mjs` is a small,
  dependency-free DTCG → CSS/SCSS/TS build on purpose (see the README's
  "Prior art" section). An optional path that hands the same DTCG JSON to
  Style Dictionary — for Android/iOS outputs or a custom transform pipeline —
  would let people outgrow the built-in build without leaving the token
  format behind.
- **Figma Code Connect output.** `design-bridge-generate` already knows each
  component's `import.module` and `import.symbol`. Emitting a Code Connect
  mapping file alongside the Storybook stories would let Figma's Dev Mode
  show the real code snippet for components this project already organises,
  without requiring anyone to hand-write the mapping separately.
- **Round-tripping variant property renames.** The organizer plugin matches
  imported frames to manifest entries by name
  (`{registryName}/{family}/{component}/{variantLabel}`,
  `packages/figma-plugin/src/code.js`). Renaming a component or variant label
  in the registry orphans the old Figma frame rather than updating it in
  place — there's no reconciliation between an old and a new manifest. A
  rename-aware diff between two `figma-organizer.json` snapshots could turn
  that into an update instead of a stale duplicate.
- **A dry-run / diff mode for `design-bridge-tokens build`.** `pull` already
  writes files and reports what it wrote; `build` does the same. Neither has
  a `--dry-run` to preview the generated CSS/SCSS/TS diff before writing,
  unlike `design-bridge-generate --dry-run` on the components side.
- **Live two-way sync.** Nothing in this project watches Figma or the
  codebase and re-runs automatically — every step is a manual CLI invocation
  or plugin run. This is a large, different kind of project (persistent
  service, webhooks or polling, conflict resolution) and is intentionally
  out of scope for now rather than a near-term item.
