## Why

In the diagrams that dgm writes today, lines often go through cards. Inside a zone, dgm places the cards in YAML order and ignores the edges, so an edge between two cards that are not neighbours crosses the card between them. draw.io then draws orthogonal lines without obstacle avoidance. The agent has no way to steer a line. A good-looking diagram needs both a better layout and lines that the agent can control, with few tokens.

Some style rules are also missing: a container whose fill is the same as the page background still paints a solid box, line corners are hard to see, and a text that sits on a zone does not move with it.

## What Changes

- Edges are straight lines by default, with clearly rounded corners where they bend.
- The agent can steer a line with a short syntax:
  - ports: `api:r -> order:l` (sides `t`, `r`, `b`, `l`, with an optional position such as `r@0.3`);
  - `via`: `elbow`, `x=N`, `y=N`, `above <id>`, `below <id>`, `left <id>`, `right <id>`, or exact points `[x, y]`;
  - `route`: `straight` (default), `orthogonal` or `curved`.
- dgm computes the exact points from this intent. Several lines on one side of a box are spread out and ordered so that they do not cross. dgm stores the intent in the edge, and computes the points again when a box moves.
- When a person drags the points of a line in draw.io, dgm keeps them and reports the change.
- The layout aligns connected boxes, also inside zones, so most straight lines are horizontal or vertical without hints.
- `dgm check` gives layout hints: a line that crosses a box, a line that is almost horizontal or vertical, lines that cross each other, and text that floats over a zone.
- Style rules in the theme:
  - a container fill that is the same as the page background in a mode becomes `none` in that mode;
  - lines have a visible corner radius;
  - text and notes that sit inside a zone become children of the zone.
- `dgm show` prints ports, `via` and `route`, so the agent can read and change them.

Not in this change: draw.io's live obstacle router (`libavoidRouting`), automatic routing around obstacles without agent hints, and edge label placement.

## Capabilities

### New Capabilities
- `edge-routing`: ports, `via`, route styles, spreading lines on a side, stored intent, re-routing after moves, person-dragged points, and the layout hints of `dgm check`.

### Modified Capabilities
- `diagram-dsl`: the edge format accepts ports, `via` and `route`.
- `diagram-edit`: `set` on an edge can change its ports, `via` and `route`.
- `layout`: connected boxes are aligned by their edges, also inside zones.
- `theme`: style rules (container fill, line corners, text in zones), and `dgm check` gives layout hints.
- `change-tracking`: `dgm status` reports a line whose route a person changed.

## Impact

- Code: `src/dsl/parse.ts`, new `src/route/`, `src/layout/layout.ts`, `src/theme/render.ts`, `src/diagram.ts`, `src/check.ts`, `src/commands/apply.ts`, `src/commands/layout.ts`, `src/commands/show.ts`, `src/track/track.ts`, `themes/pro.yaml`, `skill/SKILL.md`.
- Files that dgm wrote before keep working. Their edges stay orthogonal until the agent changes them or runs `dgm layout`.
- `dgm create` places boxes differently (aligned by edges). The file format does not change.
- No new dependency.
