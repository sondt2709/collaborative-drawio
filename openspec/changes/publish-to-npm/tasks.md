## 1. YAML extension rule

- [x] 1.1 Rename `.github/workflows/*.yml` to `.yaml` with `git mv`; `git ls-files | grep '\.yml$'` prints nothing
- [x] 1.2 Add the `.yaml` rule to `CLAUDE.md`

## 2. Package metadata

- [x] 2.1 Add `homepage`, `bugs`, `keywords` and `publishConfig.access` to `package.json`; `npm pkg get publishConfig` prints `{"access":"public"}`
- [x] 2.2 Change the README install section to `npm install -g collaborative-drawio`

## 3. Workflows

- [x] 3.1 In `release.yaml`, add `id-token: write`, install `npm@11.9.0`, and run `npm publish` of the release tarball after semantic-release
- [x] 3.2 In `ci.yaml`, add `npm publish --dry-run --tag ci-check`
- [x] 3.3 `npm publish --dry-run --tag ci-check` passes locally and lists 34 files

## 4. Verification

- [x] 4.1 `npm run typecheck`, `npm run build` and `npm test` pass
- [x] 4.2 Install the packed tarball into a temporary prefix; `dgm --help` and `dgm create` with `examples/order-system.yaml` work
- [x] 4.3 `scripts/scan-sensitive.sh` passes
- [ ] 4.4 CI passes on the pull request, including the dry run
