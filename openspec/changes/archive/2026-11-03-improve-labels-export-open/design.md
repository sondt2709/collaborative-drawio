## Context

- dgm writes an edge label as the label of the edge cell (`src/diagram.ts` `insertEdge`). The edge geometry has no label position, so draw.io puts the label at the middle of the full path.
- `rows` place boxes with `zone.gap` (20 px) inside a zone and `page.layerGap` (64 px) on the page. elk uses `nodeGap` (40 px) and `layerGap` (64 px). No layout step knows the label size.
- `routeAll` (`src/diagram.ts`) computes the points of each edge from its intent. It runs on `create`, `apply` and `layout`.
- `personRoutes` (`src/track/track.ts`) compares the points of each edge with the last agent snapshot to find a route that a person dragged.
- `dgm render` exports with the draw.io CLI (`-x -f png --theme light -b 20`). draw.io crops the image to the cells plus the border.

## Goals / Non-Goals

**Goals:**
- A label does not cover a box when there is space for it.
- When there is no space, `dgm check` tells the agent.
- The person sees a new diagram in draw.io without an extra step.
- The person gets a PNG for sharing with one command.
- The skill is short and in ASD-STE100.

**Non-Goals:**
- Labels do not avoid other lines. The label background already hides the line below it.
- `apply` does not move nodes to make space for a label.
- No label wrapping, and no change to the label font.

## Decisions

### D1. Label size from the text width table
Label box: `w = textWidth(label, 11) + 8`, `h = 18`, from `src/layout/text.ts`. The same function serves the layout, the placement and the check. This keeps the output deterministic, because dgm uses no browser.

### D2. Label-aware gaps in the layout
- `LEdge` gets an optional `label`.
- `rows`: the gap between two adjacent columns is at least `labelW + 2 × 16` when a labeled edge joins a node of one column (or a node inside it) to a node of the other column. The gap between two rows is at least `labelH + 2 × 16` for a labeled edge between the rows.
- elk: for direction `right`, the between-layers spacing of a group is at least the largest `labelW + 2 × 16` of its labels. For direction `down`, the layer gap (64 px) is already larger than a label height, and elk puts no edges between nodes of one layer.
- Alternative: give the labels to elk as edge labels. Rejected: elk then adds a label layer, which makes each labeled layer gap about 2 times taller, and it does not help `rows`.

### D3. Label placement on the route
New module `src/route/label.ts`: `placeLabel(path, size, obstacles, placed)`.
1. `path` is the full polyline: the source end, the points, and the target end. An end comes from the port fraction, or from `borderPoint` toward the next point.
2. Obstacles are all node boxes except zones and bands, plus the header strip of each zone, plus a 14 px box at the target end for the arrowhead, plus the labels that dgm placed before (in edge order). The label box keeps 2 px from each obstacle.
3. Candidates are points along the path, every 4 px. The preferred point is the middle of the longest segment. dgm picks the free candidate nearest to the preferred point.
4. If no candidate on the line is free, dgm tries the same points with a side offset. A vertical segment gets a left or right offset of `w/2 + 6`. A horizontal segment gets an offset up or down of `h/2 + 4`.
5. If no position is free, dgm uses the preferred point. The check reports it.

dgm writes the result into the edge geometry: `x` is the position along the path (-1 to 1), `y = 0`, and `<mxPoint as="offset">` holds the side offset in px. The absolute offset does not depend on the segment direction. The real app test confirms that draw.io reads it the same way.

Alternative: the draw.io `labelPosition` styles. Rejected: they are relative to the full path and know nothing about the boxes.

### D4. Labels that a person dragged
The agent snapshot stores the label geometry of each edge (`x`, `y`, offset). When the current geometry differs from the snapshot, `routeAll` keeps the label position of that edge. This copies the rule for dragged points.

### D5. Check hint
`dgm check` computes the label box from the stored geometry `x` and the offset (the same path function as D3). It does not use the orthogonal `y` that draw.io can write when a person drags a label. It adds `hint: label "<text>" of edge <ref> overlaps <ids>. Shorten the label, or run dgm layout`.

### D6. `dgm export`
- New file `src/commands/export.ts`. It reuses the draw.io call of `render` through one shared function.
- Defaults: `png`, `light`, border 20, scale 2. Options: `--theme`, `--format`, `--scale`, `--out`.
- Default path: `~/Downloads/<repo>.<diagram>.<yyyyMMdd-HHmm>.png`.
  - `<repo>` is the base name of the git top folder (`git rev-parse --show-toplevel`), or the base name of the current folder.
  - `<diagram>` is the file base name without `.drawio`.
  - The time is local time.
  - When the file exists, dgm adds `-1`, `-2`, and so on before `.png`.
- `DGM_EXPORT_DIR` replaces `~/Downloads`. Tests use it.
- `render` stays the same. The agent uses it to look at the result.
- The human wrote `yyyyMMhh`. dgm uses `yyyyMMdd`, because `hh` repeats the hour.

### D7. Open in draw.io
- New file `src/commands/open.ts` with `openInApp(io, file)`.
  - macOS: `open -a draw.io <file>`.
  - Other systems: the draw.io binary from `findDrawio`, detached.
  - When no app is found, dgm prints one line and does not fail.
- `dgm create` calls it after a successful write, unless `--no-open` is set or `DGM_NO_OPEN=1`.
- `dgm open <file>` calls it directly.
- `IO` gets an optional `launch` function, so tests record the call and start no app. `tests/helpers.ts` sets `DGM_NO_OPEN=1`.

### D8. Skill and `dgm help`
- `skill/SKILL.md` gets about 6 rules, the commands, and a short create and apply example. The target is about 4,000 characters.
- The full YAML reference moves to `skill/reference/<topic>.md` (in the package). `dgm help <topic>` prints it, with the topics `yaml`, `edges` and `apply`. The skill names these commands.
- The size test changes its limit to 4,500 characters.

## Risks / Trade-offs

- [The path that dgm computes differs from the path that draw.io draws, for example at rounded corners] → The 4 px steps and the margins absorb small errors. The real app screenshot checks it.
- [Existing diagrams change label positions on the next apply] → This is the intended fix. Nodes do not move. Dragged labels stay.
- [`open -a draw.io` brings the window to the front when the file is already open] → It runs only on `create`.
- [`~/Downloads` does not exist on a server] → dgm creates the folder. Use `--out` or `DGM_EXPORT_DIR` to choose another place.
- [Wider gaps make a diagram wider] → The gaps grow only for labeled edges, and only by the label size.

## Migration Plan

No data migration. A diagram gets the new label positions on the next `apply` or `layout`. Rollback: revert the PR. Older dgm versions ignore the label geometry.

## Open Questions

None.
