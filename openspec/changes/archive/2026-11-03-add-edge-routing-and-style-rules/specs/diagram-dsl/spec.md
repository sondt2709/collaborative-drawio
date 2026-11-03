## MODIFIED Requirements

### Requirement: Edge format
Each entry of `edges` SHALL be either a string `"<from> -> <to>"`, a one-key map `"<from> -> <to>": <label>`, or a map with the keys `from`, `to`, `label`, `kind`, `variant`, `badge`, `via` and `route`.
The string and the key of the one-key map SHALL accept an optional ` via <item>` clause at the end.
`from` and `to` SHALL be a node id, optionally followed by a port (`:t`, `:r`, `:b`, `:l`, with an optional `@<0..1>`). The ids SHALL name nodes at any depth.

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
