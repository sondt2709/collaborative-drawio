# diagram-edit Specification

## Purpose
Changes to an existing diagram with `dgm apply`: add, set, connect, move and remove.
## Requirements
### Requirement: Apply operations
`dgm apply <file>` SHALL read a YAML document of operations from standard input or from `--from <yaml-file>`. The document SHALL contain one or more of the keys `add`, `set`, `connect`, `remove` and `move`. The system SHALL apply them in this order: `add`, `set`, `connect`, `move`, `remove`.
The system SHALL validate all operations before it changes the file. When one operation is invalid, the system SHALL write no change and exit with code 2.
The system SHALL keep all other pages and all cells that the operations do not name.

#### Scenario: Only the change is sent
- **WHEN** the agent sends `set: {svc: {title: Order API}}` for a diagram with 20 nodes
- **THEN** only the label of `svc` changes, and all other cells keep their XML

#### Scenario: Invalid operation
- **WHEN** one operation names an unknown node
- **THEN** the file does not change and the command exits with code 2

### Requirement: Add nodes
`add` SHALL map new node ids to nodes in the `diagram-dsl` node format, with two more keys: `in` (the parent zone id) and `near` (a node id that the layout uses to place the new node).

#### Scenario: Add a card to a zone
- **WHEN** the agent sends `add: {cache: {title: Redis, icon: database, in: prod}}`
- **THEN** `cache` is a child of the zone `prod`, and the zone grows to contain it

### Requirement: Set fields
`set` SHALL map a node id or an edge reference `<from> -> <to>` to the fields to change. Fields that the operation does not name SHALL keep their value. The field `id` SHALL rename a node and update its edges and children.

#### Scenario: Rename a cell that a person drew
- **WHEN** the agent sends `set: {"a1B2c3-4": {id: stripe, kind: card, tone: violet}}`
- **THEN** the cell id is `stripe`, its edges point to `stripe`, and it has the card style with the violet tone

### Requirement: Connect and remove
`connect` SHALL accept the edge formats of `diagram-dsl`. `remove` SHALL accept a list of node ids and edge references. Removing a node SHALL also remove its children and all edges that touch them.

#### Scenario: Remove a node with edges
- **WHEN** the agent sends `remove: [cache]` and two edges touch `cache`
- **THEN** `cache` and the two edges no longer exist

### Requirement: Move nodes
`move` SHALL map a node id to `in` (a new parent zone id, or `page`) and, optionally, `at: [x, y]`.

#### Scenario: Move a card to another zone
- **WHEN** the agent sends `move: {worker: {in: batch}}`
- **THEN** `worker` is a child of `batch`

### Requirement: Apply output
The command SHALL print one line for each kind of change (added, changed, connected, removed, moved), the count of existing nodes that kept their position, and the result of `dgm check`.

#### Scenario: Summary
- **WHEN** an apply adds 2 nodes and 3 edges and removes 1 edge in a diagram with 5 other nodes
- **THEN** the output contains `+2 nodes`, `+3 edges`, `-1 edge` and `5 nodes kept in place`

