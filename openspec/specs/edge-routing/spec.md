# edge-routing Specification

## Purpose
How edges look and how the agent steers them: straight lines by default with a detour around boxes, ports, `via`, route styles, stored intent, points that a person dragged, and the layout hints of `dgm check`.
## Requirements
### Requirement: Straight lines by default
An edge without `route` SHALL be a straight line from its source to its target, with rounded corners at each point (theme `edgeArcSize`).
`route` SHALL accept `straight`, `orthogonal` and `curved`.

#### Scenario: Default edge
- **WHEN** the agent creates `api -> svc` without ports or `via`
- **THEN** the edge style has no `edgeStyle`, has `rounded=1`, and the edge has no points

#### Scenario: Orthogonal route
- **WHEN** an edge has `route: orthogonal`
- **THEN** the edge style has `edgeStyle=orthogonalEdgeStyle`

### Requirement: Ports
An endpoint SHALL accept a port: `<id>:<side>` with the side `t`, `r`, `b` or `l`, and an optional position `@<0..1>` on the side.
The system SHALL write the port as `exitX`/`exitY` for the source and `entryX`/`entryY` for the target.
When two or more edges use one side of one box without a position, the system SHALL spread them evenly on the side, ordered by the position of their other ends.

#### Scenario: Port on a side
- **WHEN** the agent creates `api:r -> order:l`
- **THEN** the edge style has `exitX=1;exitY=0.5` and `entryX=0;entryY=0.5`

#### Scenario: Two edges on one side
- **WHEN** `order:b -> db` and `order:b -> cache` both leave the bottom of `order`, and `cache` is to the right of `db`
- **THEN** the edge to `db` leaves at `exitX=0.33` and the edge to `cache` at `exitX=0.67`

### Requirement: Via
`via` SHALL accept one item or a list of items: `elbow`, `x=<n>`, `y=<n>`, `above <id>`, `below <id>`, `left <id>`, `right <id>`, or a point `[x, y]`.
The system SHALL compute the points from the ports and the items: a lane item adds the point where the line meets the lane, and the last lane joins the target port at a right angle. `above`, `below`, `left` and `right` SHALL use the box of the named node with the theme lane margin.
An unknown node in `via` SHALL fail validation with the YAML path.

#### Scenario: Around a zone
- **WHEN** the agent creates `{from: api:t, to: pay:t, via: above core}`
- **THEN** the edge has two points with the same y, above the top of `core` by the lane margin, and their x values are the x values of the two ports

#### Scenario: Elbow
- **WHEN** the agent creates `order:b -> db:l via elbow`
- **THEN** the edge has one point with the x of the `order` port and the y of the `db` port

### Requirement: Stored intent and re-routing
The system SHALL store the ports, `via` and `route` of an edge as edge attributes. `dgm apply` SHALL compute the points again for new or changed edges and for edges whose source or target box moved or changed size since the last agent snapshot. `dgm layout` SHALL compute the points of all edges again.

#### Scenario: Box moved by a person
- **WHEN** an edge has `via: below core` and a person moved `core` lower, and then the agent runs `dgm apply` with any operation
- **THEN** the edge points follow the new bottom of `core`

### Requirement: Points that a person changed
When the points of an edge differ from the points in the last agent snapshot, the system SHALL keep them: it SHALL store them as the edge's `via` (exact points) and SHALL NOT compute them again.

#### Scenario: Dragged waypoint
- **WHEN** a person drags a waypoint of `api -> pay` in draw.io and saves, and the agent runs `dgm layout`
- **THEN** the edge keeps the points that the person gave, and `dgm show` prints them as `via`

### Requirement: Layout hints
`dgm check` SHALL print hints, without changing the exit code: an edge segment that crosses or runs within 2 px of a box that is not an endpoint, an ancestor of an endpoint or a zone (a zone title counts as a box); a segment that is less than 4 degrees from horizontal or vertical but not exact; the number of crossings between edges; and a text that sits on a zone but is not its child.
`create`, `apply` and `layout` SHALL print the same hints.

#### Scenario: Line through a card
- **WHEN** `order`, `pay` and `cache` are in one row in this order, and the agent connects `order -> cache` without `via`
- **THEN** the output contains `hint: edge order -> cache crosses pay`

#### Scenario: Almost horizontal
- **WHEN** an edge goes from a box at y 128 to a box at y 138 of the same height
- **THEN** the output contains a hint that the edge is almost horizontal, off by 10 px

