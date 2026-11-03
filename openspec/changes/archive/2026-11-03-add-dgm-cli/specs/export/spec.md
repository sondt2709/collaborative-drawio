## ADDED Requirements

### Requirement: Render through the draw.io CLI
`dgm render <file> [--theme light|dark] [--format png|svg] [--scale <n>] [--out <path>]` SHALL export the first page with the draw.io desktop CLI. The default theme SHALL be `light`, the default format `png` and the default output path `<file>.<theme>.<format>`.
The system SHALL find the draw.io binary in this order: the `DGM_DRAWIO` environment variable, `drawio` on the `PATH`, then the standard install path on macOS.

#### Scenario: Dark PNG
- **WHEN** the agent runs `dgm render arch.drawio --theme dark`
- **THEN** `arch.drawio.dark.png` exists and shows the diagram on a dark background

#### Scenario: draw.io not installed
- **WHEN** no draw.io binary is found
- **THEN** the command prints how to install draw.io or set `DGM_DRAWIO`, and exits with code 3
