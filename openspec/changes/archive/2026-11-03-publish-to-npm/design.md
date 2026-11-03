## Context

The release workflow computes the next version with semantic-release, builds and tests the package, packs `release/collaborative-drawio-<version>.tgz`, and runs semantic-release. semantic-release creates the tag and the GitHub release and uploads the `.tgz`. Nothing goes to npm.

The name `dgm` is taken on npm (`dgm@0.0.8`). The name `collaborative-drawio` is free.

npm trusted publishing lets a GitHub Actions workflow publish without a token. npm lets you add a trusted publisher only to a package that exists, so the first version is published by hand.

## Goals / Non-Goals

**Goals:**
- Each release that semantic-release makes is also on npm, with the same version and the same tarball.
- No long-lived npm token in the repository.

**Non-Goals:**
- A scoped name or the name `dgm`.
- Publishing pre-release or canary versions.
- Changing which commits make a release.

## Decisions

1. **Package name `collaborative-drawio`.** It matches the repository and the release tarball name. The command stays `dgm` through `bin`. Alternative: `@sondt2709/dgm`; rejected because the install command is longer and the tarball name would change.
2. **Publish after semantic-release.** The workflow runs `npm publish release/collaborative-drawio-<version>.tgz` after the GitHub release exists. If the npm step fails, a person can publish the same tarball by hand. If npm published first and semantic-release then failed, npm would have a version without a tag. Alternative: the `@semantic-release/npm` plugin; rejected because it packs again, and we want the npm tarball to be the GitHub release asset.
3. **Trusted publishing (OIDC).** The release job gets `id-token: write`. Trusted publishing needs npm 11.5.1 or later, so the job installs `npm@11.9.0`. npm makes the provenance record automatically. Alternative: an `NPM_TOKEN` secret; rejected because a long-lived token can leak, and npm is restricting tokens that bypass 2FA.
4. **Dry run in CI.** `npm publish --dry-run --tag ci-check` on each pull request checks the package before a release needs it.
5. **`.yaml` extension.** One extension for all YAML files. The trusted publisher on npm names the workflow file, so it must be `release.yaml` before the first automatic publish.

## Risks / Trade-offs

- [A version on npm cannot be changed or used again] → The workflow builds and tests before it packs, and publishes the tested tarball.
- [The trusted publisher names the wrong workflow file] → The publish fails with an auth error. Fix the setting on npmjs.com, then publish the release tarball by hand.
- [`workflow_dispatch` with no new commits makes no release] → The publish step runs only when semantic-release computes a next version.

## Migration Plan

1. The owner publishes `v1.2.0` by hand: `npm publish collaborative-drawio-1.2.0.tgz --access public`.
2. The owner adds the trusted publisher on npmjs.com: user `sondt2709`, repository `collaborative-drawio`, workflow `release.yaml`.
3. Merge this change. The next `feat` or `fix` release goes to npm.

Rollback: remove the publish step. Use `npm deprecate` for a bad version; `npm unpublish` works only in the first 72 hours.

## Open Questions

None.
