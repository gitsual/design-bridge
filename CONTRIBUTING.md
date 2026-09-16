# Contributing

## Setup

```bash
npm install
```

This is an npm workspaces monorepo (`packages/*`, `examples/*`). One install
at the root links every package.

## Running tests

```bash
npm test
```

Runs `node --test` in every workspace that defines a `test` script
(currently `@design-bridge/tokens`, `@design-bridge/registry` and
`@design-bridge/generator`). To run a single package's tests:

```bash
npm test --workspace=@design-bridge/tokens
```

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(tokens): support gradient variables
fix(generator): escape slot content in Vue adapter
docs(registry): document the selector field
```

Do not add AI attribution lines (`Co-Authored-By`, "Generated with", etc.) to
commits.

## Before opening a PR

- `npm test` passes for every touched workspace.
- New behaviour in `packages/*/src/` has a matching test in that package's
  `test/` directory.
- If you changed the registry schema, the generator adapters and
  `docs/registry.md` stay in sync with it.
