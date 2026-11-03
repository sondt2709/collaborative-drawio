# layout Specification

## Purpose
Automatic placement of nodes on create, placement of new nodes on apply, and `dgm layout`. Positions that a person gave are kept.
## Requirements
### Requirement: Layout on create
`dgm create` SHALL place all nodes.
A zone that contains an endpoint of an edge (at any depth; chips, notes, text and bands do not count) SHALL be laid out with its connected children aligned to their edges, in the document `direction`, together with the boxes outside the zone. Its other children SHALL go in rows below, with the row rules.
A zone without such an endpoint SHALL place its children in rows in YAML order, wrap a row at the zone maximum width, and start a new row when the kind changes or a node is a `note`.
A zone SHALL grow to contain its children with the theme padding and header height.
At the page level, the system SHALL place top-level nodes with a layered layout in the document `direction`. A top-level `band` SHALL span the content width.
Nodes with `at` SHALL keep that position.

#### Scenario: No overlaps
- **WHEN** the agent creates a diagram with 3 zones, 12 cards and 10 edges and no positions
- **THEN** no two sibling nodes overlap, and each child is inside its zone

#### Scenario: Deterministic result
- **WHEN** the agent runs `dgm create` two times with the same YAML
- **THEN** the two files are byte-identical

#### Scenario: Connected cards in a zone are aligned
- **WHEN** a zone contains `order`, `pay` and `cache`, and the edges are `api -> order`, `order -> cache` and `api -> pay`, with direction `right`
- **THEN** `order -> cache` does not cross `pay`, and `api -> order` is exactly horizontal

### Requirement: Existing nodes keep their position
`dgm apply` SHALL NOT change the position or size of an existing node, except: a zone grows when a new child does not fit, and a node moves when the operation gives `at`.

#### Scenario: Position of a node that a person moved
- **WHEN** a person moves `cache` in draw.io and the agent then adds a node
- **THEN** `cache` keeps the position that the person gave

### Requirement: Placement of new nodes
A new node in a zone SHALL go to the next free position in the row flow of the zone. A new top-level node with `near` SHALL go to the first free position next to that node, in the document direction. A new top-level node without `near` SHALL go below the content.
When a grown zone overlaps a sibling, the output SHALL name both nodes and suggest `dgm layout`.

#### Scenario: Near another node
- **WHEN** the agent adds `queue` with `near: svc` and the direction is `right`
- **THEN** `queue` is to the right of `svc` and overlaps no node

### Requirement: Full layout on request
`dgm layout <file>` SHALL place all nodes again with the create rules. `--keep-moved` SHALL keep the position of nodes whose position differs from the position where dgm placed them last (by `create`, `apply` or `layout`), and of cells that dgm did not place. A later `apply` SHALL NOT make a person's move count as a dgm placement.

#### Scenario: Keep moved nodes
- **WHEN** a person moved `db`, and the agent runs `dgm layout arch.drawio --keep-moved`
- **THEN** `db` keeps its position, and the other nodes are placed again

#### Scenario: Keep a move after a later apply
- **WHEN** a person moved `db`, the agent ran `dgm apply`, and then the agent runs `dgm layout arch.drawio --keep-moved`
- **THEN** `db` keeps its position

### Requirement: Rows and columns
The page (top-level `rows`) and a zone (`rows`) SHALL accept a list of rows. Each row SHALL be a list of items; an item SHALL be a child id or a list of child ids, which is a column.
The system SHALL place the rows top to bottom, the items of a row left to right, and the ids of a column top to bottom. Zones in one row SHALL have the same height; zones in one column SHALL have the same width. Children that `rows` does not name SHALL go in one more row at the end.
A container with `rows` SHALL be laid out alone: each child zone uses its own rules with only the edges inside it.

#### Scenario: Three regions side by side
- **WHEN** the document has `rows: [[users], [left, middle, right]]` and `left`, `middle` and `right` are zones
- **THEN** `left`, `middle` and `right` have the same y and the same height, in this order from left to right, below `users`

#### Scenario: A column in a row
- **WHEN** a row is `[a, [b, c]]`
- **THEN** `b` and `c` are to the right of `a`, and `c` is below `b`

### Requirement: Edges without a layout effect
An edge with `layout: false` SHALL NOT affect the placement of nodes. The system SHALL still draw and route it.

#### Scenario: Outbound edge
- **WHEN** the edges are `in -> svc` and `svc -> out` with `layout: false`, and direction is `down`
- **THEN** `out` is placed as if the edge `svc -> out` did not exist

### Requirement: Bands inside zones
A band inside a zone SHALL divide the zone: the children before the band are laid out above it, the band spans the zone, and the children after it are laid out below it.

#### Scenario: Band between two groups
- **WHEN** a zone has the children `a`, `b`, a band `net`, then `c`
- **THEN** `net` is below `a` and `b`, above `c`, and as wide as the zone without its padding

### Requirement: Page width
The top-level `width` SHALL set the width at which unconnected groups and the last row wrap. Without it, the theme value SHALL apply.

#### Scenario: Wide page
- **WHEN** the document has `width: 2400` and four unconnected zones of 700 px
- **THEN** three zones are in the first row

