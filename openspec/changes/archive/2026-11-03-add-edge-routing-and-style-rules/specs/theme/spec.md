## ADDED Requirements

### Requirement: Style rules
The theme SHALL have a `rules` section. The system SHALL apply these rules each time it writes a diagram:
- A container (a zone) whose fill has a contrast of less than the theme threshold with the page background in a mode SHALL have the fill `none` in that mode.
- Edges SHALL have `rounded=1` with the theme `edgeArcSize`.
- A `text` or `note` node, or a raw text cell, whose box is inside a zone but whose parent is not that zone SHALL move into the innermost such zone, at the same page position. The command output SHALL list each moved text.

#### Scenario: Container like the page background
- **WHEN** a zone has `style: {fill: surface}`, and the surface color is the page background in light mode and almost the page background in dark mode
- **THEN** the zone style has `fillColor=none`

#### Scenario: Tinted container
- **WHEN** a zone has the violet tone
- **THEN** the zone fill is the violet tint in light mode and in dark mode

#### Scenario: Floating text
- **WHEN** a person adds a text cell on top of zone `core` in draw.io, and the agent runs `dgm apply`
- **THEN** the text cell is a child of `core`, its page position does not change, and the output names it

## MODIFIED Requirements

### Requirement: Check
`dgm check <file>` SHALL report: each raw color in a style, and each text cell whose contrast with its effective background is less than 4.5 (3.0 for bold text of 14 px or more) in the light theme or in the dark theme.
The command SHALL exit with code 1 when it reports a problem. `create` and `apply` SHALL run the same check and print its result.
The command SHALL also print the layout hints of the `edge-routing` capability. Hints SHALL NOT change the exit code.

#### Scenario: Low contrast from a person's edit
- **WHEN** a person sets a card fill to `#FFFFFF` and its text to `#EEEEEE`
- **THEN** `dgm check` reports the cell id and the contrast ratio, and exits with code 1

#### Scenario: Hints only
- **WHEN** a diagram has no color problem and one edge crosses a box
- **THEN** `dgm check` prints the hint and exits with code 0
