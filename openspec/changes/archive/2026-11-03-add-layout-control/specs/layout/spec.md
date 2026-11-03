## ADDED Requirements

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
