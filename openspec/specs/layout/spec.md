# layout Specification

## Purpose
Automatic placement of nodes on create, placement of new nodes on apply, and `dgm layout`. Positions that a person gave are kept.
## Requirements
### Requirement: Layout on create
`dgm create` SHALL place all nodes. Inside a zone, the system SHALL place children in rows in YAML order, wrap a row at the zone maximum width, and start a new row when the kind changes or a node is a `note`. A zone SHALL grow to contain its children with the theme padding and header height.
At the page level, the system SHALL place top-level nodes with a layered layout in the document `direction`, using the edges between their top-level ancestors. A top-level `band` SHALL span the content width.
Nodes with `at` SHALL keep that position.

#### Scenario: No overlaps
- **WHEN** the agent creates a diagram with 3 zones, 12 cards and 10 edges and no positions
- **THEN** no two sibling nodes overlap, and each child is inside its zone

#### Scenario: Deterministic result
- **WHEN** the agent runs `dgm create` two times with the same YAML
- **THEN** the two files are byte-identical

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

