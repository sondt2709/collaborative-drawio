## MODIFIED Requirements

### Requirement: Skill content
The skill SHALL tell the agent to: use `dgm show` to read a diagram, use `dgm create` and `dgm apply` to change it, never read or write `.drawio` XML directly, never write colors, keep edge labels short, use `dgm export` to give the person a PNG, and use `dgm help <topic>` for the full YAML reference. The skill SHALL use the ASD-STE100 writing rules and SHALL be less than 4,500 characters.

#### Scenario: Skill size
- **WHEN** the package is built
- **THEN** `skill/SKILL.md` has fewer than 4,500 characters

## ADDED Requirements

### Requirement: Help topics
`dgm help <topic>` SHALL print the reference for the topics `yaml` (nodes, kinds, tones, variants, icons, style, rows), `edges` (ports, via, route, edge kinds, labels) and `apply` (operations and their order). An unknown topic SHALL list the topics and give exit code 2.

#### Scenario: Edge reference
- **WHEN** the agent runs `dgm help edges`
- **THEN** the output lists the ports `t r b l`, the via items, the routes and the edge kinds
