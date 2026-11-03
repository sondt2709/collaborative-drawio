## ADDED Requirements

### Requirement: Export for sharing
`dgm export <file> [--theme light|dark] [--format png|svg] [--scale <n>] [--out <path>]` SHALL export the first page with the draw.io desktop CLI, with a 20 px border. The defaults SHALL be `light`, `png` and scale 2.
The default output path SHALL be `<dir>/<repo>.<diagram>.<yyyyMMdd-HHmm>.<format>`, where `<dir>` is `DGM_EXPORT_DIR` or `~/Downloads`, `<repo>` is the base name of the git top folder (or of the current folder), `<diagram>` is the file base name without `.drawio`, and the time is local time. When the path exists, dgm SHALL add `-1`, `-2` and so on before the extension. dgm SHALL create `<dir>` when it does not exist.
The command SHALL print the output path. A missing draw.io binary SHALL give exit code 3, as for `dgm render`.

#### Scenario: Default export
- **WHEN** the agent runs `dgm export docs/arch.drawio` in the repository `shop` at 2026-11-03 14:05
- **THEN** `~/Downloads/shop.arch.20261103-1405.png` exists, with a light background and a 40 px border at scale 2

#### Scenario: Name conflict
- **WHEN** `~/Downloads/shop.arch.20261103-1405.png` exists and the agent runs the same export in the same minute
- **THEN** dgm writes `~/Downloads/shop.arch.20261103-1405-1.png` and keeps the first file
