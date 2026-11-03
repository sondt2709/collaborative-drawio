## Context

Facts from spikes on draw.io 32.4.1 (scratch files, not in the repo):
- `fillColor=light-dark(#EEF2FF,none)` shows a tint in light mode and is transparent in dark mode, in the desktop CLI export.
- draw.io's obstacle router (`libavoidRouting=1`) routes a line only when a cell of that line changes in the editor. It does not route on open or in the CLI export. It saves the computed points in the file.
- elkjs with `elk.hierarchyHandling: INCLUDE_CHILDREN` places the children of a zone by their edges and routes lines around boxes.
- A hand-made mock with straight lines, ports, lanes and rounded corners had no line over a card. Two flaws in the mock came from hand-typed coordinates: this is why the agent gives intent and dgm computes the points.

## Goals / Non-Goals

**Goals:**
- The agent controls each line with a few tokens: ports and a `via` that names a lane or a box, not coordinates.
- dgm computes the exact points, keeps them correct after moves, and never overwrites points that a person dragged.
- The default layout aligns connected boxes, so most straight lines need no hint.
- `dgm check` tells the agent where a line looks bad, so the agent can fix it.

**Non-Goals:**
- Automatic obstacle avoidance without agent hints (the agent decides; dgm reports).
- draw.io's live router, label placement, curved routing quality.

## Decisions

### D1. Edge syntax
- An endpoint is `id` or `id:port`. A port is a side `t`, `r`, `b` or `l`, with an optional position on the side: `r@0.3` (0 = top or left, 1 = bottom or right).
- The shorthand string takes an optional `via` clause: `"api:t -> pay:t via above core": REST`.
- The map form has the keys `from`, `to`, `label`, `kind`, `variant`, `badge`, `via` and `route`.
- `via` is one item or a list. Items: `elbow`, `x=N`, `y=N`, `above <id>`, `below <id>`, `left <id>`, `right <id>`, `[x, y]`.
- `route`: `straight` (default), `orthogonal` (draw.io `orthogonalEdgeStyle`), `curved` (`curved=1`, through the points).
- Alternative: free waypoints only. Rejected: the agent must know coordinates, and one wrong number gives a slanted line.

### D2. From intent to points (`src/route/`)
- dgm works in page coordinates. It computes the absolute box of each node from the parent chain.
- Port point: the side point at the position. Without a position, the lines on one side of one box are spread at `i / (n + 1)`, ordered by the coordinate of the other end (x for `t` and `b`, y for `l` and `r`). This keeps the lines on one side from crossing.
- Missing port with a `via`: the side that faces the first waypoint (source) or the last waypoint (target).
- Lanes: `y=N` is a horizontal lane and `x=N` a vertical lane. `above X` is `y = top(X) - margin`, `below X` is `y = bottom(X) + margin`, `left X` and `right X` likewise with x. The margin is a theme value (24 px).
- Points from lanes: start at the source port point. For each lane, add the point where the current line meets the lane (`(cur.x, Y)` for a horizontal lane, `(X, cur.y)` for a vertical lane). After the last lane, add the point that joins the lane to the target port (`(target.x, Y)` or `(X, target.y)`).
- `elbow`: one point, `(source.x, target.y)` when the source side is `t` or `b`, else `(target.x, source.y)`. Without ports, the source side follows the larger of |dx| and |dy|.
- No port and no `via`: a straight line between the boxes, without fixed ports (draw.io clips it at the box border).
- The style gets `exitX`, `exitY`, `entryX`, `entryY` (with `exitPerimeter=0` only when needed) and the points as `<Array as="points">`.

### D3. Stored intent and re-routing
- The edge keeps its intent in data attributes: `dgm_from_port`, `dgm_to_port`, `dgm_via` (items joined by `|`), `dgm_route`.
- Snapshots store the rounded points of each edge.
- `apply` routes again: new or changed edges, and edges whose source or target box (absolute) moved or changed size since the last agent snapshot. `layout` routes all edges again.
- A person changed a route when the current points differ from the points in the last agent snapshot. dgm then writes these points as the edge's `via` (exact points), so they stay, and `dgm status` reports `~ edge a -> b route changed in draw.io`.

### D4. Layout aligned by edges
- At the page level, dgm keeps the segments at bands and the packing of unconnected groups.
- A zone that contains an endpoint of an edge (at any depth, without counting chips, notes, text and bands) is a compound node for elk (`INCLUDE_CHILDREN`). elk places its connected children and aligns them with the boxes outside.
- Inside a compound zone, the "decoration" children (chips, notes, text, bands) and unconnected children go in rows below the elk area, with the row rules of today.
- A zone without such an endpoint keeps the row flow of today, and elk sees it as one box of fixed size.
- elk options: `layered`, `BRANDES_KOEPF` with `BALANCED` alignment, `favorStraightEdges`, model order. Output stays deterministic.
- Alternative: one elk layout for everything. Rejected: lists of servers and chips must stay in rows, not in a long column.

### D5. Style rules (theme `rules`)
- `containerSameAsPage`: for a zone (and a style override on a zone), compute the fill in each mode. When its contrast with the page background is less than the threshold (1.1), write `none` for that mode: `light-dark(x,none)`, `light-dark(none,y)` or `none`.
- `edgeArcSize`: the corner radius of lines (`rounded=1;arcSize=N`).
- `groupText`: after `create`, `apply` and `layout`, a `text` or `note` node, or a raw text cell (style base `text`), whose box is inside a zone box but whose parent is not that zone, moves into the innermost such zone. Its position is converted, so it does not move on the page. The output lists each grouped text.

### D6. Layout hints in `dgm check`
- `hint: edge a -> b crosses c` for each line segment that crosses a box that is not an endpoint, an ancestor of an endpoint, or a zone.
- `hint: edge a -> b is almost horizontal (off by N px)` when a segment is less than 4° from horizontal or vertical but not exact.
- `hint: N line crossings` for lines that cross each other.
- `hint: text t sits on zone z but is not part of it`.
- Hints do not change the exit code. Color and contrast problems still exit 1.

### D7. `dgm show`
- An edge prints its ports in the arrow (`api:r -> order:l`), and `via` and `route` in the map form. Exact points print as a list of `[x, y]`.

## Risks / Trade-offs

- [elk compound layout changes the look of `create`] → Zones without edges keep rows. Existing files change only with `dgm layout` or edges that the agent touches. Tests check no overlap and determinism.
- [Fixed points look wrong after a person moves a box in draw.io] → The next `apply` routes the lines of moved boxes again from the intent. Until then, the points stay where they were.
- [`light-dark(none, color)` may not work in draw.io] → A spike in the first task checks it. If it fails, use a near-page color with `fillOpacity` for that mode only, or keep the tint.
- [Hints are noisy on large diagrams] → One line per edge at most, and a count for line crossings.

## Migration Plan

None. Old edges keep their style until the agent re-renders them. Rollback: revert the commit; files stay valid draw.io files.

## Findings during apply

- elkjs 0.12 swaps the two values of `elk.nodeSize.minimum` when the direction is DOWN; the layout passes them swapped.
- A straight line between boxes of different heights is slightly slanted. The default route therefore uses an exactly horizontal or vertical line when the boxes overlap, and a detour (simple shapes, then an A* search on a grid of box borders) only when the line would cross a box.
- With direction `down`, the rows of chips and notes go beside the connected boxes, not below them, so lines can leave the zone.
- A large private reference (116 nodes, 20 edges) draws without a line through a box, but its composition is weaker than a hand layout. Gaps for a next change: regions side by side (rows or columns of zones), an edge that does not affect placement, a band as a separator inside a zone, and the page width.
- In YAML flow maps, an unquoted comma starts a new key. The error now tells the writer to quote the text.

## Open Questions

- Should `dgm layout` also clear person-dragged points? Default: no, it keeps them (they are the edge's `via`).
