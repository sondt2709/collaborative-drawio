## ADDED Requirements

### Requirement: Open after create
After `dgm create` writes a file, dgm SHALL open the file in draw.io desktop: with `open -a draw.io <file>` on macOS, and with the detached draw.io binary on other systems. `--no-open` or the environment variable `DGM_NO_OPEN=1` SHALL turn this off. When no draw.io app is found, dgm SHALL print one line and exit with the code of the create.
`dgm apply` and `dgm layout` SHALL NOT open the file.

#### Scenario: Create opens the file
- **WHEN** the agent runs `dgm create docs/arch.drawio --from spec.yaml`
- **THEN** draw.io desktop shows `docs/arch.drawio`

#### Scenario: Open turned off
- **WHEN** `DGM_NO_OPEN=1` is set and the agent runs `dgm create`
- **THEN** dgm starts no app

### Requirement: Open command
`dgm open <file>` SHALL open an existing diagram in draw.io desktop in the same way. A missing file SHALL give exit code 2.

#### Scenario: Open an existing diagram
- **WHEN** the agent runs `dgm open docs/arch.drawio`
- **THEN** draw.io desktop shows `docs/arch.drawio`
