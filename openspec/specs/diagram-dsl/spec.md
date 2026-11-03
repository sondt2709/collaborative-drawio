# diagram-dsl Specification

## Purpose
The YAML format that the agent writes, its validation, `dgm create` and `dgm show`.
## Requirements
### Requirement: YAML diagram format
The system SHALL accept a YAML document with these top-level keys: `title` (optional), `subtitle` (optional), `theme` (optional, default `pro`), `direction` (optional, `down` or `right`, default `down`), `nodes` (required map) and `edges` (optional list).
Each entry of `nodes` SHALL map a node id to a node. A node SHALL be either a string, which is a `card` with that `title`, or a map with the keys `kind`, `title`, `sub`, `tone`, `icon`, `variant`, `style`, `at` and, for a zone, `nodes`.
The default `kind` SHALL be `card`.

#### Scenario: String shorthand for a card
- **WHEN** the YAML contains `nodes: {api: API Gateway}`
- **THEN** the diagram contains a node with id `api`, kind `card` and title `API Gateway`

#### Scenario: Nested zone
- **WHEN** a node has `kind: zone` and its own `nodes` map with `vm1`
- **THEN** the diagram contains `vm1` as a child cell of the zone cell

### Requirement: Edge format
Each entry of `edges` SHALL be either a one-key map `"<from> -> <to>": <label>` or a map with the keys `from`, `to`, `label`, `kind` and `badge`.
The ids in `from` and `to` SHALL name nodes at any depth.

#### Scenario: Shorthand edge with a label
- **WHEN** the YAML contains `edges: [{"api -> svc": REST}]`
- **THEN** the diagram contains an edge from `api` to `svc` with the label `REST`

#### Scenario: Edge with a badge
- **WHEN** an edge has `badge: 1`
- **THEN** the edge has a child badge cell that shows `1`

### Requirement: Validation
The system SHALL reject a document with an error that names the YAML path when: a node id appears more than once at any depth, an edge names an unknown node, a `kind`, `tone`, `icon` or `variant` value is unknown, or a `style` value contains a raw color.
The system SHALL write no file when validation fails, and SHALL exit with code 2.

#### Scenario: Unknown node in an edge
- **WHEN** an edge is `api -> cache` and no node `cache` exists
- **THEN** the command prints an error that names `edges[0]` and `cache`, writes no file and exits with code 2

#### Scenario: Duplicate id
- **WHEN** the id `db` appears at the top level and inside a zone
- **THEN** the command prints an error that names both paths and exits with code 2

### Requirement: Create a diagram
`dgm create <file> [--force]` SHALL read YAML from standard input or from `--from <yaml-file>`, and write a standard `.drawio` file with one page.
The command SHALL refuse to overwrite an existing file without `--force`.
The command SHALL print a short summary: the counts of nodes and edges, the theme, and the result of `dgm check`.

#### Scenario: New file
- **WHEN** the agent runs `dgm create arch.drawio` with a valid YAML document
- **THEN** `arch.drawio` exists, the draw.io desktop CLI opens and exports it without an error, and the output contains the node and edge counts

#### Scenario: Existing file
- **WHEN** `arch.drawio` exists and the agent runs `dgm create arch.drawio` without `--force`
- **THEN** the command exits with code 2 and the file does not change

### Requirement: Semantic data in cells
The system SHALL store the semantic data of each node and edge as attributes of a draw.io `object` element: `dgm_kind`, `dgm_tone`, `dgm_icon`, `dgm_variant` and `dgm_style` when set.
The node id SHALL be the cell id. The `title` SHALL be the cell label. The subtitle SHALL be the label of a child cell with the id `<node-id>.sub`. Helper cells (subtitle, icon, badge, page title and page subtitle) SHALL have the attribute `dgm_role`, and `dgm show` SHALL NOT list them as nodes.

#### Scenario: Attributes survive a save in draw.io
- **WHEN** a person opens a file that dgm wrote, moves one node and saves it in the draw.io desktop app
- **THEN** `dgm show` reads the same kinds, tones, icons and titles as before

### Requirement: Show the structure
`dgm show <file>` SHALL print the diagram as YAML in the format of `dgm create`, without colors, sizes or positions.
`dgm show <file> --geometry` SHALL add `at: [x, y]` to each node.
A cell without dgm attributes SHALL show as `kind: raw` with its label.

#### Scenario: Round trip
- **WHEN** the agent runs `dgm show` on a file that `dgm create` wrote from a document D
- **THEN** the output describes the same nodes, kinds, tones, icons, titles, subtitles and edges as D

#### Scenario: Cell drawn by a person
- **WHEN** a person adds a plain rectangle with the label `Stripe` in draw.io
- **THEN** `dgm show` lists it with its cell id, `kind: raw` and `title: Stripe`

