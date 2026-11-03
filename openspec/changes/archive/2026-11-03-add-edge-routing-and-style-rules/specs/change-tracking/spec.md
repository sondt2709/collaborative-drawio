## MODIFIED Requirements

### Requirement: Status
`dgm status <file>` SHALL compare the file with the last known snapshot and print the changes in this format: one line for each added (`+`), removed (`-`) or changed (`~`) node or edge, with the field, the old value and the new value. Moved or resized nodes SHALL be summarized in one line with their count and ids. A style change SHALL be one line with the cell id and the changed style keys. An edge whose points changed SHALL be one line: `~ edge <ref> route changed in draw.io`.
When nothing changed, the command SHALL print nothing and exit with code 0.
For a file without history, the command SHALL say that the file is not tracked.

#### Scenario: Rename and add in draw.io
- **WHEN** a person renames `svc` from `Order Service` to `Order API` and adds a rectangle `Stripe`, then saves
- **THEN** `dgm status` prints `~ svc.title "Order Service" -> "Order API"` and a `+` line for the new cell with `kind: raw`

#### Scenario: No change
- **WHEN** the file did not change since the last snapshot
- **THEN** `dgm status` prints nothing

#### Scenario: Route changed by a person
- **WHEN** a person drags a waypoint of `api -> pay` and saves
- **THEN** `dgm status` prints `~ edge api -> pay route changed in draw.io`
