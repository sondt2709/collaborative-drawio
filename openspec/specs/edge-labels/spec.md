# edge-labels Specification

## Purpose
Edge labels that do not cover boxes: label-aware gaps in the layout, label placement on the line, labels that a person dragged, and the label hint of `dgm check`.
## Requirements
### Requirement: Gaps for edge labels
On `dgm create` and `dgm layout`, the layout SHALL make the gap between two adjacent columns of `rows` at least the label width plus 32 px, when a labeled edge joins a node of one column (or a node inside it) to a node of the other column. The gap between two rows SHALL be at least the label height plus 32 px, when a labeled edge joins the two rows. For direction `right`, the elk spacing between layers SHALL be at least the largest label width of the group plus 32 px.
The label width SHALL come from the text width table at font size 11.

#### Scenario: Wide label between two cards in a row
- **WHEN** a zone has `rows: [[cart, checkout]]` and the edge `"cart -> checkout": basket snapshot`
- **THEN** after `dgm create`, the gap between `cart` and `checkout` is at least the label width plus 32 px

#### Scenario: No label, no change
- **WHEN** the edge between two adjacent columns has no label
- **THEN** the gap is the theme gap

### Requirement: Label placement
Each time dgm computes the route of an edge with a label, it SHALL place the label at the free point of the route that is nearest to the middle of its longest segment. A point is free when the label box does not overlap a node box (zones and bands do not count), a zone header, the arrowhead at the target end, or a label that dgm placed before.
When no point on the route is free, dgm SHALL try the same points with an offset beside the line. When no position is free, dgm SHALL use the middle of the longest segment.
dgm SHALL write the position into the edge geometry: `x` along the path from -1 to 1, and the side offset as `<mxPoint as="offset">`.

#### Scenario: Label moves off a box
- **WHEN** a short line enters a cylinder and its middle point puts the label on the cylinder
- **THEN** the label box does not overlap any node box

#### Scenario: Label beside a short vertical line
- **WHEN** the vertical line between two boxes is shorter than the label height plus 8 px
- **THEN** the label is beside the line and does not overlap either box

#### Scenario: Same YAML, same file
- **WHEN** the agent runs `dgm create` two times with the same YAML
- **THEN** the two files are byte-identical

### Requirement: Labels that a person dragged
When the label geometry of an edge differs from the last agent snapshot, dgm SHALL keep that label position on `apply` and `layout`.

#### Scenario: Dragged label stays
- **WHEN** a person drags the label of `cart -> checkout` in draw.io and saves, and then the agent runs `dgm apply` that adds a node
- **THEN** the label geometry of `cart -> checkout` is unchanged

### Requirement: Label overlap hint
`dgm check` SHALL print `hint: label "<text>" of edge <ref> overlaps <ids>. Shorten the label, or run dgm layout` for each edge label whose box overlaps a node box. The hint SHALL NOT change the exit code.

#### Scenario: Label in a gap that is too small
- **WHEN** two cards fixed with `at` have a 10 px gap and a labeled edge between them
- **THEN** `dgm check` prints the label hint with the ids of the two cards

