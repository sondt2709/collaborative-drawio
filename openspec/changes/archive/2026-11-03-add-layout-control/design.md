## Context

The private reference diagram (116 nodes) showed four gaps in composition. The agent can name structure well, but not coordinates. Rows of ids are the simplest structure that composes a page: designers think in rows and columns, and the agent writes them in a few tokens.

## Goals / Non-Goals

**Goals:** compose the page and zones with rows and columns; stop a meaningful edge from distorting the layout; divide a zone with a band; set the page width.

**Non-Goals:** free grids with spans, alignment guides, automatic composition of regions.

## Decisions

### D1. `rows`
- `rows` is a list of rows. A row is a list of items. An item is a child id, or a list of child ids (a column, top to bottom).
- Each id must be a direct child of the container (a top-level node for the page), at most once. Unknown ids fail validation with the YAML path.
- Children that `rows` does not name go in one more row at the end, in YAML order.
- A row places its items left to right with the gap (page: `layerGap`, so lanes fit between rows; zone: the zone gap), aligned at the top. After a row of notes only (headings), the gap is half. A column places its items top to bottom. Rows stack top to bottom.
- Zones in one row get the height of the row; zones in one column get the width of the column. A band in a row spans the width of the container.
- A container with `rows` is laid out alone: its children are placed by the rows, and each child zone is laid out by its own rules with only the edges inside it. The outer elk layout treats the container as one box.
- Alternative: an invisible `group` kind with `arrange: row`. Rejected: it adds cells that a person sees and must move in draw.io.

### D2. `layout: false` on an edge
- Such an edge is left out of the elk input and of the grouping. It is still rendered and routed. Stored as `dgm_layout="0"`.

### D3. Band inside a zone
- A zone with a band child is laid out in segments: the children before the band, the band, the children after it. Each segment is laid out like a zone without bands (elk for connected children with the edges inside the segment, rows for the others). The band spans the zone. The zone is one box for the outer layout.

### D4. `width`
- The top-level `width` replaces the theme `page.maxWidth` for the packing of groups and for the wrap of the last row. Stored as the page attribute `dgm_width`.

### D5. Storage and editing
- `rows` is stored as JSON in `dgm_rows` on the zone, and on the root cell for the page.
- `set: {page: {rows: [...], width: 2400}}` and `set: {zone: {rows: [...]}}` change them. `page` is reserved and cannot be a node id. `apply` does not move boxes for a rows change; it prints a hint to run `dgm layout`.

### D6. Findings during apply
- Page rows use the layer gap (64 px), so two or three lanes fit between rows. Zone rows use the zone gap, and half of it after a row of headings.
- To compute exact lanes, the agent needs sizes: `dgm show --geometry` adds `# size WxH` comments (the output stays valid input).
- `dgm show ... | head` crashed with EPIPE; the CLI now ends quietly when the reader closes the pipe.
- Remaining gaps on the private reference: edge labels are not placed (they can overlap), and exact lanes (`x=N`) must be updated by the agent after a layout change; named lanes (`above <id>`) stay correct.

## Risks / Trade-offs

- [A container with rows does not align its children with boxes outside it] → This is the purpose of rows: the agent decides. Edges are still routed around boxes.
- [Long rows are wider than the page] → Rows do not wrap; the page grows. `dgm check` does not report it.

## Migration Plan

None. Rollback: revert; files stay valid.
