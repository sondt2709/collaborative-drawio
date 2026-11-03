## ADDED Requirements

### Requirement: Publish each release to npm
The release workflow SHALL publish each release that semantic-release makes to the npm registry as the package `collaborative-drawio`. It SHALL publish the same tarball that it uploads to the GitHub release, and only after semantic-release has created the GitHub release.

#### Scenario: Feature merged to main
- **WHEN** a `feat` commit is merged to `main` and semantic-release computes version `X.Y.Z`
- **THEN** the GitHub release `vX.Y.Z` has `collaborative-drawio-X.Y.Z.tgz`, and `npm view collaborative-drawio@X.Y.Z version` prints `X.Y.Z`

#### Scenario: No release-worthy commits
- **WHEN** only `chore` or `docs` commits are merged to `main`
- **THEN** the workflow makes no GitHub release and publishes nothing to npm

### Requirement: Publish without a stored token
The release workflow SHALL authenticate to npm with trusted publishing (OIDC). The repository SHALL NOT store an npm token. Each published version SHALL have a provenance record.

#### Scenario: Provenance
- **WHEN** the workflow publishes version `X.Y.Z`
- **THEN** `npm view collaborative-drawio@X.Y.Z dist.attestations` is not empty

### Requirement: Check the package on each pull request
CI SHALL run `npm publish --dry-run --tag ci-check` on each pull request. The tag is needed because the source version `0.0.0-development` is a pre-release.

#### Scenario: Package check
- **WHEN** a pull request runs CI
- **THEN** the CI log shows the package name `collaborative-drawio` and the file list, and the step passes

### Requirement: Install from npm
A person SHALL be able to install the `dgm` command with `npm install -g collaborative-drawio`. The package SHALL contain `dist`, `themes` and `skill`.

#### Scenario: Global install
- **WHEN** a person runs `npm install -g collaborative-drawio`
- **THEN** `dgm --help` prints the command list
