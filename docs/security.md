# Security

## `FIGMA_TOKEN` is an environment variable, never a flag

`design-bridge-tokens pull` reads the Figma token from `process.env.FIGMA_TOKEN`
(`packages/tokens/src/cli.mjs`). There is no `--token` flag, and there never
should be one:

- **Shell history.** A flag value is written to `~/.bash_history` /
  `~/.zsh_history` in plain text the moment the command runs.
- **CI logs.** Most CI systems echo the invoked command line into the job log
  by default. A flag leaks the token to anyone who can read the log; an
  environment variable set through the CI's secret store does not, as long as
  it isn't `echo`'d elsewhere in the job.
- **Process listings.** Command-line arguments are visible to any other user
  on the same host via `ps aux` / `/proc/<pid>/cmdline`. Environment variables
  of another user's process are not readable without elevated privileges.

If you add a new script that talks to the Figma API, keep this pattern: read
the token from the environment, fail with a clear error if it is missing, and
never accept it as a CLI argument.

## Never commit a `.env`

`.env` is in `.gitignore` for exactly this reason. If you need a local
`FIGMA_TOKEN` for development, export it in your shell or keep it in an
untracked `.env` file loaded by your own tooling — don't add one to the repo,
even "temporarily".

## Rotating a leaked Figma token

If a `FIGMA_TOKEN` is ever exposed (committed, pasted into a log, shared in
chat):

1. In Figma, go to **Settings → Personal access tokens** and revoke the
   token immediately.
2. Generate a new token scoped to `file_variables:read` only — this project
   never needs write access to a Figma file.
3. Update the secret in every place that held the old value (CI secret
   store, local shell profile, password manager).
4. If the token was committed to git, treat the commit history as
   compromised: rotating the token is the actual fix, since removing the
   commit afterwards does not un-expose a token that was ever pushed.

## Figma plugin network access

The plugin's `manifest.json` restricts `networkAccess` to
`http://localhost:6006` and `http://127.0.0.1:6006` — the local Storybook dev
server. It fetches `figma-organizer.json` from there to match imported frames
to registry components; it has no other network access and never talks to
the Figma API or any remote host.
