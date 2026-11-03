## 1. Failing test first

- [x] 1.1 Add a synthetic fixture (Shoppers, Gateway, Web shop, Order API, Auth server, RabbitMQ, Payment worker) and a test that no edge label box overlaps a node box. Run it on the base commit and keep the failure output.

## 2. Label geometry

- [x] 2.1 Add `labelSize(text)` (text width at font size 11) and `edgePath(...)` (full polyline with the two ends) in `src/route/label.ts`
- [x] 2.2 Add `placeLabel(path, size, obstacles, placed)`: points every 4 px, nearest free point to the middle of the longest segment, then side offsets, then the fallback
- [x] 2.3 Add read and write of the edge label geometry (`x`, `y`, `<mxPoint as="offset">`) in `src/model/doc.ts`
- [x] 2.4 Call the placement from `routeAll` in `src/diagram.ts` for each labeled edge, in edge order, and also for edges whose points a person kept
- [x] 2.5 Unit tests: free point, side offset, fallback, deterministic output

## 3. Dragged labels

- [x] 3.1 Store the label geometry of each edge in the agent snapshot (`src/track/track.ts`)
- [x] 3.2 Keep the label position of an edge when it differs from the snapshot, on `apply` and `layout`
- [x] 3.3 Test: a person moves a label, then `apply` adds a node, and the label geometry stays

## 4. Layout gaps

- [x] 4.1 Add `label` to `LEdge` and pass edge labels from `create` and `layout`
- [x] 4.2 `rowsBlock`: widen the column gap and the row gap for labeled edges between them
- [x] 4.3 elk, direction `right`: raise the spacing between layers for the largest label of the group
- [x] 4.4 Tests for the column gap, the row gap and the unchanged gap without a label

## 5. Check hint

- [x] 5.1 Add the label overlap hint in `src/check.ts`
- [x] 5.2 Test with two cards fixed by `at` and a 10 px gap

## 6. Export and open

- [x] 6.1 Move the draw.io call of `render` into a shared function
- [x] 6.2 Add `src/commands/export.ts`: defaults, `DGM_EXPORT_DIR`, the file name `<repo>.<diagram>.<yyyyMMdd-HHmm>`, `-1`/`-2` on conflict
- [x] 6.3 Add `src/commands/open.ts` and an optional `launch` in `IO`; open after `create` unless `--no-open` or `DGM_NO_OPEN=1`; add `dgm open <file>`
- [x] 6.4 Set `DGM_NO_OPEN=1` in `tests/helpers.ts`
- [x] 6.5 Register `export` and `open` in `src/cli.ts` and the usage text
- [x] 6.6 Tests: export file name, conflict suffix, missing draw.io exit 3, open launcher call, `--no-open`

## 7. Skill and help

- [x] 7.1 Add `dgm help <topic>` (`yaml`, `edges`, `apply`) with the reference text from the old skill
- [x] 7.2 Rewrite `skill/SKILL.md` in ASD-STE100: about 6 rules, commands, short examples, below 4,500 characters
- [x] 7.3 Change the skill size test to 4,500 characters; test `dgm help edges` and an unknown topic
- [x] 7.4 Update `README.md` and `CLAUDE.md` for `export`, `open`, `help` and the label placement

## 8. Verification

- [ ] 8.1 `npm run typecheck`, `npm test`, `npm run build`
- [ ] 8.2 Export the fixture before and after; compare the PNG files
- [ ] 8.3 Open the fixture in a separate draw.io profile (CDP) and take a screenshot to confirm the label positions
- [ ] 8.4 Run `dgm export` to the real `~/Downloads`; check the name and the 40 px border
- [ ] 8.5 Let one subagent draw the fixture with the new skill only
