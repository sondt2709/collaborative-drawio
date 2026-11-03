## Why

People install `dgm` from a `.tgz` link on the GitHub release page. The link has the version in it, so each install command is long and goes out of date. A package on npm gives one short install command, `npm install -g collaborative-drawio`, and `npx` support.

## What Changes

- The release workflow publishes each new release to the npm registry as `collaborative-drawio`. It publishes after semantic-release creates the GitHub release.
- The workflow uses npm trusted publishing (OIDC). The repository has no npm token secret. Each version gets a provenance record.
- CI runs `npm publish --dry-run --tag ci-check` on each pull request.
- `package.json` gets `homepage`, `bugs`, `keywords` and `publishConfig.access`.
- The README tells people to install from npm.
- All YAML files use the `.yaml` extension. The three workflow files change from `.yml` to `.yaml`. `CLAUDE.md` gets this rule.

## Capabilities

### New Capabilities
- `distribution`: how a release is built and published, and how people install `dgm`.

### Modified Capabilities

None.

## Impact

- `.github/workflows/release.yaml`, `ci.yaml`, `pr-title-check.yaml` (renamed from `.yml`).
- `package.json`, `README.md`, `CLAUDE.md`.
- External: the npm package `collaborative-drawio`, owned by the npm user `sondt2709`, with a trusted publisher for `sondt2709/collaborative-drawio` and `release.yaml`.
- No change to the `dgm` command or its output.
