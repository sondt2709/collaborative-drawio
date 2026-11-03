## Why

An AI agent that edits draw.io files writes long XML, rewrites the whole page for each update, and does not see the edits that a person makes in the draw.io app. Its colors are often unreadable in the draw.io desktop app in dark mode, and it cannot reproduce a professional style from a description. A tool must do this exact work, so the agent only describes the structure.

## What Changes

- Add `dgm`, a Node.js command line tool, with the commands `create`, `apply`, `show`, `status`, `log`, `layout`, `check`, `render` and `setup`.
- The agent writes short YAML: nodes, zones, edges, with a `kind`, a `tone`, an `icon`, a `title` and a `sub`. The agent writes no colors, no XML and, by default, no positions.
- `dgm` writes standard `.drawio` files. Each cell keeps its semantic data as draw.io cell attributes. The `.drawio` file stays the only source of truth.
- Add the `pro` theme: tones with light and dark values, element kinds (card, zone, chip, band, note, badge, cylinder, text), edge kinds, and Lucide line icons drawn as draw.io stencils. Every color is written as `light-dark()`, so the diagram reads the same in a browser and in the desktop app, in light and dark mode.
- Add a layout: rows of nodes inside zones, and a layered layout with right-angle edges for the page. Nodes that a person moved keep their position.
- Add change tracking: one snapshot for each agent turn in a `.dgm/` folder next to the file. `dgm status` reports the changes that a person made since the last agent turn, in a short diff. `dgm log` lists the turns.
- Add a Claude Code skill and a per-project `UserPromptSubmit` hook. The hook gives the agent the diff only when a tracked diagram changed.
- Add `dgm check` (raw colors, text contrast in light and dark) and `dgm render` (PNG or SVG through the draw.io desktop CLI).
- Add CI: a Conventional Commits PR title check, unit tests on each PR, and semantic-release for GitHub releases.

Not in this change: learning a style from a cell (`theme learn`), conversion of old diagrams (`adopt`), keeping human style edits as overrides, an MCP server, and a live link to the draw.io editor.

## Capabilities

### New Capabilities
- `diagram-dsl`: the YAML format that the agent writes, its validation, `dgm create` and `dgm show`.
- `diagram-edit`: `dgm apply` operations (add, set, connect, remove, move) on an existing diagram.
- `theme`: the theme file, tones, kinds, icons as stencils, `light-dark()` colors, and `dgm check`.
- `layout`: automatic placement of new nodes and zones, `dgm layout`, and fixed positions for existing nodes.
- `change-tracking`: snapshots for each agent turn, `dgm status` and `dgm log`.
- `agent-integration`: the Claude Code skill and hook, `dgm setup` and the hook output.
- `export`: `dgm render` through the draw.io desktop CLI.

### Modified Capabilities

None. This is the first change.

## Impact

- New code: a TypeScript CLI in `src/`, the theme in `themes/pro.yaml`, the skill in `skill/`, synthetic examples in `examples/`, tests in `tests/`.
- New runtime dependencies: `yaml` (ISC), `elkjs` (EPL-2.0), `lucide` (ISC, icon data only), `@xmldom/xmldom` (MIT). New development dependencies: `typescript`, `vitest`, `tsx`.
- External tool: the draw.io desktop app, for `dgm render` only.
- New GitHub Actions workflows: PR title check, tests, release.
- A user's project gets a `.dgm/` folder next to each tracked diagram, and a skill and a hook entry in its `.claude/` folder after `dgm setup`.
