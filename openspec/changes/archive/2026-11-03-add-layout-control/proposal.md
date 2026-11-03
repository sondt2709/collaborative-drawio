## Why

A large diagram that dgm lays out alone is correct but weak in composition: regions stack instead of standing side by side, some edges with a meaning (for example "outbound") pull boxes to odd places, a band inside a zone goes to the side instead of dividing the zone, and the page width is fixed by the theme. The agent needs a few short levers to compose the page, without coordinates.

## What Changes

- A top-level key `rows` sets the composition of the page, and a zone key `rows` sets the composition of the zone. Each row is a list of child ids, left to right. A nested list in a row is a column (top to bottom). Zones in one row get the same height; zones in one column get the same width.
- An edge key `layout: false` keeps the edge out of the automatic placement. The edge is still drawn and routed.
- A band inside a zone divides the zone: the children before it, the band across the zone, then the children after it.
- A top-level key `width` sets the page width that rows and groups wrap at.
- dgm stores `rows`, `width` and `layout: false` in the file, `dgm show` prints them, and `dgm layout` uses them. `set` changes `rows` of a zone, and `rows` and `width` of the page (with the id `page`).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `layout`: rows and columns, bands inside zones, page width, edges without a layout effect.
- `diagram-dsl`: the document and node formats accept `rows` and `width`; the edge format accepts `layout`.
- `diagram-edit`: `set` accepts `rows`, and `width` for the page.

## Impact

- Code: `src/dsl/parse.ts`, `src/layout/layout.ts`, `src/diagram.ts`, `src/commands/{create,layout,apply,show}.ts`, `skill/SKILL.md`, `README.md`.
- No new dependency. Existing files keep their layout until `dgm layout` runs.
