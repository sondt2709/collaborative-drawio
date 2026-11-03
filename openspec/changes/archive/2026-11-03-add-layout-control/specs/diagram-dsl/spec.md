## MODIFIED Requirements

### Requirement: YAML diagram format
The system SHALL accept a YAML document with these top-level keys: `title` (optional), `subtitle` (optional), `theme` (optional, default `pro`), `direction` (optional, `down` or `right`, default `down`), `rows` (optional), `width` (optional, a number of px), `nodes` (required map) and `edges` (optional list).
Each entry of `nodes` SHALL map a node id to a node. A node SHALL be either a string, which is a `card` with that `title`, or a map with the keys `kind`, `title`, `sub`, `tone`, `icon`, `variant`, `style`, `at` and, for a zone, `nodes` and `rows`.
The default `kind` SHALL be `card`. The id `page` SHALL be reserved.

#### Scenario: String shorthand for a card
- **WHEN** the YAML contains `nodes: {api: API Gateway}`
- **THEN** the diagram contains a node with id `api`, kind `card` and title `API Gateway`

#### Scenario: Nested zone
- **WHEN** a node has `kind: zone` and its own `nodes` map with `vm1`
- **THEN** the diagram contains `vm1` as a child cell of the zone cell

#### Scenario: Unknown id in rows
- **WHEN** the top-level `rows` names `cache`, and `cache` is not a top-level node
- **THEN** validation fails with an error that names `rows` and `cache`

### Requirement: Edge format
Each entry of `edges` SHALL be either a string `"<from> -> <to>"`, a one-key map `"<from> -> <to>": <label>`, or a map with the keys `from`, `to`, `label`, `kind`, `variant`, `badge`, `via`, `route` and `layout`.
The string and the key of the one-key map SHALL accept an optional ` via <item>` clause at the end.
`from` and `to` SHALL be a node id, optionally followed by a port (`:t`, `:r`, `:b`, `:l`, with an optional `@<0..1>`). The ids SHALL name nodes at any depth. `layout` SHALL be `true` (default) or `false`.

#### Scenario: Shorthand edge with a label
- **WHEN** the YAML contains `edges: [{"api -> svc": REST}]`
- **THEN** the diagram contains an edge from `api` to `svc` with the label `REST`

#### Scenario: Edge with a badge
- **WHEN** an edge has `badge: 1`
- **THEN** the edge has a child badge cell that shows `1`

#### Scenario: Shorthand with ports and via
- **WHEN** the YAML contains `edges: [{"api:t -> pay:t via above core": REST}]`
- **THEN** the edge has the label `REST`, the source port `t`, the target port `t` and the `via` item `above core`

#### Scenario: Invalid port
- **WHEN** an edge is `api:x -> svc`
- **THEN** validation fails with an error that names the edge path and lists the sides `t`, `r`, `b` and `l`

### Requirement: Show the structure
`dgm show <file>` SHALL print the diagram as YAML in the format of `dgm create`, without colors, sizes or positions.
`dgm show <file> --geometry` SHALL add `at: [x, y]` to each node, and the size of each node as a YAML comment (`# size WxH`). The output SHALL stay valid input for `dgm create`.
A cell without dgm attributes SHALL show as `kind: raw` with its label.

#### Scenario: Round trip
- **WHEN** the agent runs `dgm show` on a file that `dgm create` wrote from a document D
- **THEN** the output describes the same nodes, kinds, tones, icons, titles, subtitles and edges as D

#### Scenario: Cell drawn by a person
- **WHEN** a person adds a plain rectangle with the label `Stripe` in draw.io
- **THEN** `dgm show` lists it with its cell id, `kind: raw` and `title: Stripe`

#### Scenario: Sizes for lanes
- **WHEN** the agent runs `dgm show --geometry`
- **THEN** each node line ends with `# size WxH`, and `dgm create` accepts the output
