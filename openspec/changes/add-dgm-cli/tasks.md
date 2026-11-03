## 1. Project setup

- [x] 1.1 Add `package.json` (bin `dgm`, scripts `build`, `test`, `dev`), `tsconfig.json`, and the dependencies `yaml`, `@xmldom/xmldom`, `elkjs`, `lucide`, `typescript`, `vitest`, `tsx`. Result: `npm run build` and `npm test` run.
- [x] 1.2 Add `src/cli.ts` with `parseArgs`, the command list, `--help`, and the exit codes 0, 1, 2, 3. Result: `dgm --help` lists all commands.

## 2. draw.io model

- [x] 2.1 `src/model/`: read a `.drawio` file (plain or compressed page), give the first page as a cell tree with `object` attributes, and write it back. Result: a test reads and writes a file, and cells that were not changed keep their XML.
- [x] 2.2 Remove `host`, `agent`, `etag` and `modified` from the `mxfile` element on write, and set `adaptiveColors="auto"`. Result: unit test.

## 3. Theme and icons

- [x] 3.1 `themes/pro.yaml` with font, semantic colors, the 8 tones, kind sizes and edge kinds; a theme loader with the lookup order project, user, package. Result: unit test of the lookup order.
- [x] 3.2 `src/icons/`: Lucide icon nodes to draw.io stencil XML (path commands, circle, rect, line, polyline, polygon, ellipse), compression, cache, name suggestions. Result: unit tests, and a rendered PNG that shows 6 icons.
- [x] 3.3 `src/theme/`: render functions for `card`, `zone`, `chip`, `band`, `note`, `cylinder`, `text`, edge kinds, badges, variants and `style` overrides; tone inheritance from zones; all colors through `ld()`. Result: a test parses every generated style and finds no raw color.

## 4. YAML format, create and show

- [x] 4.1 `src/dsl/`: parse and validate the create document (shorthands, nesting, unique ids, edges, known kinds, tones, icons, variants, style keys), with errors that name the YAML path. Result: unit tests for each error in the spec.
- [x] 4.2 `src/layout/`: text width table, zone row flow, elkjs page layout, title area, band width. Result: tests for no overlap, children inside zones, and byte-identical output for the same input.
- [x] 4.3 `dgm create` and `dgm show` (with `--geometry`; `kind: raw` for cells without dgm data). Result: round-trip test on `examples/order-system.yaml`.

## 5. Apply and layout commands

- [x] 5.1 `dgm apply` with `add`, `set` (with `id` rename), `connect`, `move`, `remove`, validation before any write, and the summary output. Result: unit tests for each operation and the invalid case.
- [x] 5.2 Placement of new nodes (zone slot, `near`, below content), zone growth, overlap report. Result: unit tests.
- [x] 5.3 `dgm layout` with `--keep-moved`. Result: unit test.

## 6. Change tracking

- [x] 6.1 `src/track/`: snapshot, log, diff (fields, geometry summary, style keys). Result: unit tests with a file that a script edits the way draw.io saves.
- [x] 6.2 `dgm status` (with `--ack`) and `dgm log`; record pending human changes before `apply` and `layout`. Result: unit tests for the spec scenarios.

## 7. Check and render

- [x] 7.1 `dgm check`: raw colors, contrast in light and dark with the effective background. Result: unit tests, including a low-contrast human edit.
- [x] 7.2 `dgm render`: find the draw.io binary, export PNG or SVG with `--theme`. Result: PNGs of the example in light and dark.

## 8. Agent integration

- [x] 8.1 `skill/SKILL.md` (fewer than 6,000 characters) with the YAML reference and the rules. Result: size test.
- [x] 8.2 `dgm setup` (copy skill, merge hook entry, idempotent) and `dgm hook run` (find tracked diagrams, `status --ack`, print only changes, always exit 0). Result: unit tests, and a timing test with 20 diagrams.

## 9. Examples, docs and CI

- [x] 9.1 Synthetic examples: `examples/order-system.yaml` and `examples/platform-overview.yaml` (a large diagram in the pro style). Result: both create and render without check problems.
- [x] 9.2 Update `README.md` (install, quick start, YAML reference) and `CLAUDE.md` (commands, architecture). Result: `scripts/scan-sensitive.sh` passes.
- [ ] 9.3 GitHub Actions: `pr-title-check.yml`, `ci.yml` (build and test on PRs), `release.yml` (semantic-release, `npm pack` asset) and `.releaserc.json`. Result: the CI run passes on the PR.

## 10. Real-app verification

- [x] 10.1 Open the example in the draw.io desktop app in dark mode, move a node and edit a label, save, and check `dgm show` and `dgm status`. Result: screenshots and command output.
- [x] 10.2 Run a real Claude Code session (`claude -p`) in a sample project after `dgm setup`: create, human edit, second prompt. Result: transcript that shows the hook diff and an `apply` call.
