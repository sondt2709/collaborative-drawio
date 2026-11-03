## MODIFIED Requirements

### Requirement: Set fields
`set` SHALL map a node id or an edge reference `<from> -> <to>` to the fields to change. Fields that the operation does not name SHALL keep their value. The field `id` SHALL rename a node and update its edges and children.
For an edge, `set` SHALL accept `label`, `kind`, `variant`, `badge`, `from` and `to` (with ports), `via`, `route` and `layout`. `via: null` SHALL remove the `via` items, and the system SHALL compute the points again.
For a zone, `set` SHALL accept `rows`. The id `page` SHALL accept `rows` and `width`. A change of `rows` or `width` SHALL NOT move nodes; the output SHALL say to run `dgm layout`.

#### Scenario: Rename a cell that a person drew
- **WHEN** the agent sends `set: {"a1B2c3-4": {id: stripe, kind: card, tone: violet}}`
- **THEN** the cell id is `stripe`, its edges point to `stripe`, and it has the card style with the violet tone

#### Scenario: Steer an edge
- **WHEN** the agent sends `set: {"order -> cache": {from: "order:b", to: "cache:b", via: below core}}`
- **THEN** the edge leaves the bottom of `order`, enters the bottom of `cache`, and goes below `core`

#### Scenario: Page rows
- **WHEN** the agent sends `set: {page: {rows: [[a, b], [c]]}}` and then runs `dgm layout`
- **THEN** `a` and `b` are in the first row and `c` is below them
