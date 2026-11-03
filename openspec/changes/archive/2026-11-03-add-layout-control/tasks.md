## 1. Format

- [x] 1.1 Parse and validate top-level `rows` and `width`, zone `rows`, edge `layout`; reserve the id `page`. Result: unit tests, including an unknown id in rows.
- [x] 1.2 Store `rows` (`dgm_rows`), `width` (`dgm_width`) and `layout: false` (`dgm_layout`); read them in the view; `dgm show` prints them. Result: round-trip test.

## 2. Layout

- [x] 2.1 Rows and columns for the page and zones, with equal heights in a row and equal widths in a column. Result: tests for both scenarios, no overlap, determinism.
- [x] 2.2 `layout: false` edges out of the placement. Result: unit test.
- [x] 2.3 Bands inside zones divide the zone. Result: unit test.
- [x] 2.4 Page `width`. Result: unit test.

## 3. Edit and docs

- [x] 3.1 `set` for `rows` and `width` (with `page`) and edge `layout`; `dgm layout` uses them. Result: unit test of the "Page rows" scenario.
- [x] 3.3 `dgm show --geometry` prints the size of each node as a comment; the CLI ends quietly when the reader closes the pipe. Result: unit tests.
- [x] 3.2 Skill (fewer than 6,000 characters), README, CLAUDE.md. Result: size test, scan passes.

## 4. Real-app verification

- [x] 4.1 Draw the private reference again with `rows`, `width`, `layout: false` and bands, in `tmp/` only. Result: PNGs in light and dark, and the remaining gaps.
- [x] 4.2 Real `claude -p` session: the agent composes a page with rows. Result: transcript in `tmp/`.
