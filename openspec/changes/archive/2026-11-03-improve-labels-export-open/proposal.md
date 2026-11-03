## Why

Edge labels cover boxes and icons. draw.io puts each label at the middle of its line, and the layout keeps a 40 px gap between boxes, so a 100 px label cannot fit. `dgm check` does not report it. Also, the person must open each new diagram by hand, and has no short command to export a PNG to share.

## What Changes

- The layout makes the gap between two boxes wide enough for the label of the edge between them (`dgm create` and `dgm layout` only).
- dgm places each edge label on a free part of its line, or beside the line. A label that a person dragged keeps its position.
- `dgm check` prints a hint when an edge label overlaps a box.
- New command `dgm export <file>`: PNG, light theme, 20 px border, scale 2, written to `~/Downloads/<repo>.<diagram>.<yyyyMMdd-HHmm>.png`. A name conflict adds `-1`, `-2`.
- `dgm create` opens the new file in draw.io desktop. `--no-open` or `DGM_NO_OPEN=1` turns it off.
- New command `dgm open <file>` opens a diagram in draw.io desktop.
- `skill/SKILL.md` is rewritten in ASD-STE100 with fewer, shorter rules. Rare reference items move to `dgm help <topic>`.

## Capabilities

### New Capabilities
- `edge-labels`: label-aware gaps in the layout, label placement, dragged labels, and the label overlap hint.
- `open-in-app`: open a diagram in draw.io desktop after `create` and with `dgm open`.

### Modified Capabilities
- `export`: add `dgm export` with the share defaults and the `~/Downloads` file name.
- `agent-integration`: a shorter skill, and `dgm help <topic>` for the reference.

## Impact

- Code: `src/layout/layout.ts`, `src/route/` (new label placement), `src/diagram.ts`, `src/track/track.ts`, `src/check.ts`, `src/commands/` (new `export.ts`, `open.ts`; `create.ts`), `src/cli.ts`, `skill/SKILL.md`.
- Existing diagrams get new label positions on the next `dgm apply`. Nodes do not move.
- `dgm export` writes outside the project, in `~/Downloads`.
- `dgm create` starts draw.io desktop. Tests and CI set `DGM_NO_OPEN=1`.
- No new dependency.
