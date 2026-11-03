# theme Specification

## Purpose
The theme file, tones, kinds, icons as stencils, colors that read in light and dark mode, and `dgm check`.
## Requirements
### Requirement: Theme file
A theme SHALL be a YAML file with: `font`, semantic colors (`ink`, `muted`, `surface`), `tones`, kind sizes, and edge kinds. Each color SHALL have a light value and a dark value.
The system SHALL look for a theme named N in this order: `.dgm/themes/N.yaml` next to the diagram, `~/.config/dgm/themes/N.yaml`, then the themes in the package. The package SHALL include the theme `pro`.
The diagram SHALL store its theme name, so later commands use the same theme.

#### Scenario: Project theme overrides the package theme
- **WHEN** `.dgm/themes/pro.yaml` exists next to the diagram
- **THEN** `dgm create` uses its colors

### Requirement: Tones
The `pro` theme SHALL define the tones `slate`, `sky`, `indigo`, `violet`, `teal`, `orange`, `rose` and `red`. Each tone SHALL have an `accent` color and a `tint` color.
A node without `tone` SHALL use the tone of its nearest parent zone, else the theme default tone.

#### Scenario: Card inherits the zone tone
- **WHEN** a card without `tone` is inside a zone with `tone: violet`
- **THEN** the card stroke and icon use the violet accent color

### Requirement: Kinds
The system SHALL render these node kinds: `card` (icon, bold title, muted subtitle), `zone` (tinted container with a bold header in the accent color), `chip` (small pill), `band` (solid accent bar with white text), `note` (muted text), `cylinder` (database shape with icon, title and subtitle) and `text` (free text).
The system SHALL render these edge kinds: `default`, `new`, `existing`, `dns` (dashed) and `network`.
`variant` SHALL accept `dashed`, `muted` and `emphasis`.

#### Scenario: Card with a subtitle
- **WHEN** a card has `title: Order service` and `sub: Creates and tracks orders`
- **THEN** the title and the subtitle are in separate cells, and the subtitle uses the `muted` color

### Requirement: Colors readable in both themes
Every color in every style string that dgm writes SHALL be `light-dark(<light>,<dark>)` or `none`. The system SHALL set `adaptiveColors="auto"` on the page. The system SHALL NOT write colors inside HTML labels.

#### Scenario: No raw colors
- **WHEN** dgm writes any diagram
- **THEN** no `fillColor`, `strokeColor`, `fontColor` or `labelBackgroundColor` value in the file is a raw color

#### Scenario: Readable in the desktop app in dark mode
- **WHEN** the file is opened in the draw.io desktop app in dark mode with `defaultAdaptiveColors = simple`
- **THEN** all text is light on a dark fill, and all edges are visible

### Requirement: Icons
`icon` SHALL accept a Lucide icon name in kebab-case. The system SHALL draw the icon as an inline draw.io stencil whose stroke uses the accent color of the node tone.
An unknown icon name SHALL fail validation, and the error SHALL suggest up to 3 near names.

#### Scenario: Icon color follows the tone
- **WHEN** a card has `icon: server` and `tone: indigo`
- **THEN** the icon cell style contains `shape=stencil(` and `strokeColor=light-dark(` with the indigo accent values

#### Scenario: Unknown icon
- **WHEN** a card has `icon: servr`
- **THEN** validation fails, and the error suggests `server`

### Requirement: Style overrides
`style` SHALL accept only these keys: `stroke`, `fill` and `text` (a tone name, or `accent`, `tint`, `surface`, `ink`, `muted`), `dashed` (boolean), `bold` (boolean), `width` and `height` (numbers).

#### Scenario: Raw color in an override
- **WHEN** a node has `style: {fill: "#ff0000"}`
- **THEN** validation fails, and the error says that only tone names are allowed

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

