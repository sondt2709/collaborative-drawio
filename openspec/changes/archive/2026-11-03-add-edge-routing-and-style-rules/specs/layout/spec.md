## MODIFIED Requirements

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
