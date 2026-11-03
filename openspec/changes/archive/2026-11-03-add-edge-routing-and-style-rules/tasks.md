## 1. Spike and theme

- [x] 1.1 Check `light-dark(none,#hex)` and `light-dark(#hex,none)` in a draw.io CLI export, light and dark. Result: PNGs in `tmp/`; the design fallback is used if it fails.
- [x] 1.2 Add `rules` to `themes/pro.yaml` (`containerThreshold`, `edgeArcSize`, `laneMargin`, `groupText`) and to the theme loader. Result: unit test.

## 2. Edge syntax

- [x] 2.1 Parse ports (`id:side`, `@pos`), the shorthand ` via` clause, `via` items and `route`, with errors that name the YAML path. Result: unit tests, including an invalid port and an unknown node in `via`.
- [x] 2.2 `set` on edges: `from`, `to`, `via` (and `null`), `route`. Result: unit test of the "Steer an edge" scenario.

## 3. Routing

- [x] 3.1 `src/route/`: absolute boxes, port points, spreading on a side, lanes, elbow, exact points. Result: unit tests for each `via` item and the two-edges scenario.
- [x] 3.2 Edge rendering: straight default, `orthogonal`, `curved`, rounded corners, `exit*`/`entry*`, points, intent attributes. Result: unit tests on the style and the points.
- [x] 3.3 Re-routing in `apply` (new, changed, moved endpoints) and `layout` (all), and person-dragged points kept as `via`. Result: unit tests for both scenarios.

## 4. Layout and style rules

- [x] 4.1 Compound elk layout for zones with edge endpoints, rows for the other children and zones. Result: tests for alignment, no overlap and determinism.
- [x] 4.2 Container rule and text grouping in create, apply and layout. Result: unit tests for the three scenarios.

## 5. Check, show and status

- [x] 5.1 Layout hints: crossing a box, almost straight, line crossings, floating text. Result: unit tests; exit code 0 with hints only.
- [x] 5.2 `dgm show` prints ports, `via` and `route`; round trip. `dgm status` reports a changed route. Result: unit tests.

## 6. Docs and examples

- [x] 6.1 Update `skill/SKILL.md` (fewer than 6,000 characters), `README.md`, `CLAUDE.md`, and the examples (no hint on both examples). Result: size test, examples test, scan passes.

## 7. Real-app verification

- [x] 7.1 Render both examples in light and dark with the draw.io CLI. Open one in the desktop app, drag a waypoint, save, and check `dgm status`. Result: PNGs and command output in `tmp/`.
- [x] 7.2 Real `claude -p` session: ask for a diagram, the agent reads the hints and fixes them with ports or `via`. Result: transcript in `tmp/`, and the size of the edge YAML.
- [x] 7.3 Draw a large private reference diagram with the new syntax, in `tmp/` only (never committed). Result: PNGs in light and dark, and the list of gaps found.
