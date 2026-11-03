## Context

A person edits diagrams in the draw.io desktop app. An AI agent (Claude Code) edits the same files. Today the agent writes raw draw.io XML. This proposal moves all exact work into a CLI. Facts that limit the design (verified with draw.io 32.4.1):

- draw.io desktop does not load external plugins, and its content security policy blocks connections to localhost. A live link to the editor is not possible without a fork.
- The desktop app watches open files. After an external write, it shows "The file has been modified. Click here to synchronize."
- Upgraded desktop installs use `defaultAdaptiveColors = simple`; browsers use `auto`. Colors written as `light-dark(a,b)` render the same in both. Plain colors are inverted under `adaptiveColors="auto"`. `light-dark()` inside HTML label CSS is ignored.
- Inline stencils (`shape=stencil(<base64 deflate>)`) take `strokeColor`, so line icons follow the theme.

A spike rendered a professional style (cards with icons, tinted zones, chips, bands, cylinders, badges) in light mode, dark mode and the desktop app. The agent-side YAML was 1,747 bytes; the generated XML was 22,654 bytes.

## Goals / Non-Goals

**Goals:**
- The agent writes structure only. The tool writes XML, style and positions in a deterministic way.
- Diagrams read correctly in light mode and dark mode, in a browser and in the desktop app.
- The agent learns about human edits automatically, in a short diff, without repeated reports.
- Standard `.drawio` files that any draw.io app opens.

**Non-Goals:**
- A live link to the editor, a draw.io fork or plugin.
- Learning a style from a cell, conversion of old diagrams, keeping human style edits as overrides (next change).
- An MCP server (later; the CLI uses fewer tokens).
- Multi-page editing (the first page only; other pages are kept unchanged).

## Decisions

### D1. TypeScript on Node.js 22+, small dependency set
- `yaml` parses YAML with line numbers for errors. `@xmldom/xmldom` reads and writes XML with a DOM, so cells that dgm does not change keep their XML. `elkjs` does the layered page layout. `lucide` gives icon data as arrays of SVG elements.
- Argument parsing uses `node:util` `parseArgs`. Tests use `vitest`. Development runs use `tsx`.
- Alternative: Python. Rejected: the agent tools and draw.io ecosystem are JavaScript, and Node is already required by Claude Code.
- Alternative: reuse code from jgraph/drawio-mcp. Rejected: its model works on XML strings for whole pages, and it is Apache-2.0. We only reuse its idea of a headless model.

### D2. The `.drawio` file is the only source of truth
- Semantic data lives in the file as `object` attributes (`dgm_kind`, `dgm_tone`, `dgm_icon`, `dgm_variant`, `dgm_style`). draw.io keeps custom attributes on save and shows them in "Edit Data".
- The cell id is the node id. A card is one container cell (title as its label) with helper children: `<id>.icon` and `<id>.sub`. Helper cells carry `dgm_role`.
- Edges are named by `<from> -> <to>` (with `#2`, `#3` for duplicates), not by cell id, so edges that a person drew are addressable.
- Alternative: a YAML source file next to the `.drawio`. Rejected: two sources of truth need a merge whenever the person edits.

### D3. Style = theme(kind, tone, variant, style override)
- `src/theme/` has one render function for each kind. Each function takes the theme tokens and returns the cell style string and the helper cells.
- All colors go through one function `ld(light, dark)` that returns `light-dark(a,b)`. A unit test parses each generated style and fails on any raw color.
- The page sets `adaptiveColors="auto"`. Labels are plain text (`html=1` only for wrap); colors are style keys, never inline CSS.
- Text with two colors (title and subtitle) uses two cells.
- Alternative: draw.io named styles in the file stylesheet. Rejected: the desktop app and browser handle custom stylesheets differently, and a style edit by a person would not be visible as a key change.

### D4. Icons as inline stencils
- `src/icons/` converts a Lucide icon node list (`path`, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse`) to draw.io stencil XML: SVG path commands map to `move`, `line`, `curve`, `quad`, `arc` and `close`; relative commands become absolute. The stencil is compressed as draw.io does (URI-encode, raw deflate, base64). Results are cached by icon name.
- Icon names are kebab-case. An unknown name fails validation with up to 3 suggestions (Levenshtein distance).

### D5. Layout
- Sizes: each kind has a theme size. Text width is estimated with a per-character width table for the theme font (bold and regular), so the result is deterministic without a browser.
- Zones: a row flow (YAML order, wrap at `zone.maxWidth`, new row on a kind change or a note). Zones are sized bottom-up.
- Page: top-level bands split the page into segments. In a segment, each connected group of top-level nodes gets the `elkjs` `layered` layout with fixed sizes; the groups are packed in rows (direction `down`, wrap at the theme page width) or in one column (direction `right`). Edges between nested nodes are lifted to their top-level ancestors for the layout. dgm writes no edge waypoints; draw.io routes edges with `edgeStyle=orthogonalEdgeStyle` and keeps routing when a person moves a node.
- Title and subtitle text cells go above the content. A top-level band spans the content width.
- `apply` keeps every existing geometry. New nodes go to the next free slot (zone row flow, or near the `near` node, or below the content). An overlap after zone growth is reported, not fixed.
- Alternative: draw.io CLI `--layout`. Rejected for create: it needs a draw.io process and cannot keep zone rows. It stays available through the draw.io app.

### D6. Change tracking
- `.dgm/<file-name>/log.jsonl` holds entries `{id, actor: agent|human, time, summary, snapshot}`. Snapshots are JSON files in `.dgm/<file-name>/snapshots/`.
- A snapshot is a normalized model: for each cell id, parent, kind data, label text, subtitle, rounded geometry, source, target, and a short hash of each style value (key -> hash). Edge keys that draw.io changes when a person drags an edge end (`exitX`, `entryX` and similar) are left out.
- The diff compares two snapshots: nodes and edges added, removed or changed by field; geometry changes are summarized in one line; style changes list the changed style keys from the key hashes, so no XML is stored or read.
- `status --ack`, `apply` and `layout` first record pending human changes as one human entry. This rule makes several saves one entry, and stops the hook from repeating a report.

### D7. Agent integration
- `dgm setup` copies `skill/SKILL.md` into the project and merges a hook entry into `.claude/settings.json`: `{"hooks": {"UserPromptSubmit": [{"hooks": [{"type": "command", "command": "dgm hook run"}]}]}}`. The merge keeps other keys and is idempotent.
- `dgm hook run` prints plain text on standard output. Claude Code adds the standard output of a `UserPromptSubmit` hook to the agent context. It prints nothing when nothing changed, and always exits 0, so a dgm bug never blocks a prompt.

### D8. Commands and output
- Output is short plain text for the agent. Errors name the YAML path (`nodes.prod.nodes.vm1.icon`).
- Exit codes: 0 success, 1 check problems, 2 invalid input, 3 draw.io not found or export failed.

### D9. Packaging and CI
- `package.json` `bin: {dgm: dist/cli.js}`. `npm run build` compiles with `tsc`. The package also contains `themes/` and `skill/`, which the code finds relative to `dist/`.
- CI on pull requests: Conventional Commits title check (same action as the author's other projects), `npm ci`, `npm run build`, `npm test`.
- Release on push to `main`: semantic-release with commit-analyzer, release-notes-generator and the GitHub plugin. The workflow sets the version at build time (not committed), runs `npm pack`, and attaches the `.tgz` to the GitHub release. Users install with `npm install -g <release .tgz URL>`. No npm publish in this change.

## Risks / Trade-offs

- [Automatic layout looks worse than a hand layout for large diagrams] → Zone rows keep a grid look. Existing nodes never move on apply. `dgm layout --keep-moved` and manual moves in draw.io stay possible.
- [Text width estimates are wrong for some fonts or languages] → Cards wrap text and grow in height. The width table is per theme font. Wide characters (CJK) use double width.
- [The desktop app may rewrite attributes or ids on save] → A test opens and saves a dgm file in the real app and checks `dgm show`. If ids change, map by `dgm_*` attributes.
- [The person has unsaved edits when dgm writes the file] → dgm cannot see unsaved edits. The app shows the "synchronize" banner; the skill tells the agent to ask the person to save before an apply. Not fully verified.
- [elkjs is EPL-2.0] → It is used as an unmodified dependency, which is compatible with an MIT project.
- [Hook cost on every prompt] → The search is limited to 4 levels and skips `node_modules` and `.git`; the hook prints nothing when nothing changed.

## Migration Plan

New tool; no migration. Rollback: remove the hook entry from `.claude/settings.json` and the `.claude/skills/dgm/` folder. Diagrams stay standard `.drawio` files.

## Open Questions

- Should `.dgm/` be committed in a user's repo? Default: the user decides; dgm writes no `.gitignore` entry.
