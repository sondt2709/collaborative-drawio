# change-tracking Specification

## Purpose
The history of a diagram: one snapshot for each agent turn in `.dgm/`, `dgm status` for the changes of a person, and `dgm log`.
## Requirements
### Requirement: Snapshots
The system SHALL keep the history of a diagram in `.dgm/<file-name>/` next to the file. After each `create`, `apply` and `layout`, the system SHALL save a snapshot of the model and append an agent entry to the log.
A snapshot SHALL contain, for each cell: id, parent, kind data, label, subtitle, geometry, source and target, and a hash of the style string. It SHALL NOT contain the full XML.

#### Scenario: Snapshot after create
- **WHEN** the agent runs `dgm create arch.drawio`
- **THEN** `.dgm/arch.drawio/` contains a snapshot and a log entry `turn-1 agent`

### Requirement: Status
`dgm status <file>` SHALL compare the file with the last known snapshot and print the changes in this format: one line for each added (`+`), removed (`-`) or changed (`~`) node or edge, with the field, the old value and the new value. Moved or resized nodes SHALL be summarized in one line with their count and ids. A style change SHALL be one line with the cell id and the changed style keys.
When nothing changed, the command SHALL print nothing and exit with code 0.
For a file without history, the command SHALL say that the file is not tracked.

#### Scenario: Rename and add in draw.io
- **WHEN** a person renames `svc` from `Order Service` to `Order API` and adds a rectangle `Stripe`, then saves
- **THEN** `dgm status` prints `~ svc.title "Order Service" -> "Order API"` and a `+` line for the new cell with `kind: raw`

#### Scenario: No change
- **WHEN** the file did not change since the last snapshot
- **THEN** `dgm status` prints nothing

### Requirement: Acknowledge human changes
`dgm status --ack` SHALL print the same changes, then save a snapshot and append one human entry to the log with a one-line summary. Later status calls SHALL compare with this snapshot.
`apply` and `layout` SHALL do the same before they change the file, so human changes always become one log entry.

#### Scenario: Several saves become one entry
- **WHEN** a person saves the file 3 times between two agent turns
- **THEN** the log contains one human entry for these saves

#### Scenario: No repeated report
- **WHEN** `dgm status --ack` reported a change and the file did not change after that
- **THEN** the next `dgm status --ack` prints nothing

### Requirement: Log
`dgm log <file>` SHALL print the entries, newest first, one line each: the entry id (`turn-N` for agent entries, `human` for human entries), the time and the summary.

#### Scenario: Log after two turns and a human edit
- **WHEN** the agent created the diagram, a person edited it, and the agent applied a change
- **THEN** `dgm log` prints `turn-2 agent`, `human`, `turn-1 agent` in this order

