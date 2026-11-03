# CLAUDE.md

This file gives guidance to Claude Code (claude.ai/code) when it works with code in this repository.

## What this is

`dgm` is a command line tool for AI agents and people who edit the same draw.io diagram. The agent writes short YAML. The tool writes the draw.io XML, applies the theme, keeps the history, and reports the changes that a person made in the draw.io app. See `README.md` for the workflow.

Status: first version (OpenSpec change `add-dgm-cli`).

## Open source rules (IMPORTANT)

This repository is public. Do not publish personal or sensitive data.

1. Before each push, run `scripts/scan-sensitive.sh`. The pre-push hook in `.githooks/` runs it on the pushed commits. Enable the hook with `git config core.hooksPath .githooks`.
2. The script does not find everything. Before each push, read the full diff of each non-code file yourself: Markdown, YAML, JSON, `.drawio`, SVG, HTML and test fixtures.
3. Do not write these in any committed file:
   - absolute paths of a local machine, for example a home folder;
   - names of employers, clients or other private projects;
   - content from private diagrams: names, topology, workflow, server details;
   - email addresses, tokens, keys.
4. Make all examples and test fixtures synthetic, for example "order service", "Postgres", "payment worker". Do not copy a real diagram, and do not copy a style reference file into the repo. Copy only generic style values: colors, sizes, fonts.
5. Remove the `host`, `agent`, `etag` and `modified` attributes from committed `.drawio` files.
6. Name upstream projects by their public repository, for example `jgraph/drawio-desktop`. Do not write where they are on a local machine.
7. The private word list for the scan is in `tmp/sensitive-denylist.txt` or `~/.config/dgm/sensitive-denylist.txt`. Never commit it.

## Local files

Put evidence, demos, spikes, screenshots and other local files in `./tmp`. Git ignores `tmp/`. Do not commit them.

## PR rules

- Use Conventional Commits for PR titles: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
- Merge with squash only. The PR title becomes the commit message.
- Do not push to `main`. Use a branch: `<type>/<short-kebab-description>`.

## Commands

```sh
npm ci                     # install
npm run build              # compile to dist/ (bin: dist/cli.js)
npm test                   # vitest, all tests in tests/
npm run typecheck          # tsc on src/ and tests/
npm run dev -- <command>   # run the CLI from src/ with tsx
scripts/scan-sensitive.sh  # scan the working tree for sensitive data
git config core.hooksPath .githooks   # enable the pre-push scan (one time per clone)
```

The render test in `tests/examples.test.ts` runs only when the draw.io desktop app is installed. CI runs on Ubuntu without it.

## Architecture

- `src/cli.ts`: argument parsing (`node:util` parseArgs), the command list and the exit codes (0 ok, 1 check problems, 2 invalid input, 3 draw.io). `run(argv, io)` is used in tests, so tests run in-process.
- `src/model/`: the draw.io file (`@xmldom/xmldom`). It reads plain and compressed pages, works on the first page only, and keeps the XML of all other cells and pages.
- `src/diagram.ts`: the semantic view (`readView`) and the `Editor` that writes nodes, helper cells and edges.
  - Semantic data is in `object` attributes: `dgm_kind`, `dgm_tone`, `dgm_icon`, `dgm_variant`, `dgm_style`. The cell id is the node id. The title is the cell label.
  - Helper cells have `dgm_role` (`sub`, `icon`, `badge`, `title`, `subtitle`) and ids such as `<id>.sub`. The subtitle text is only in the `<id>.sub` cell.
  - The theme name and direction are attributes of the root cell `0`.
  - Edges are named `from -> to` (`#2` for a second edge), not by cell id. The intent of an edge is in `dgm_from_port`, `dgm_to_port`, `dgm_via` and `dgm_route`; the points are computed from it.
- `src/theme/`: theme files (`themes/*.yaml`, lookup: `.dgm/themes/`, `~/.config/dgm/themes/`, package) and one render function for each kind. All colors go through `ld()`.
- `src/icons/`: Lucide icon nodes to draw.io stencil XML, compressed as draw.io does.
- `src/route/`: edge routing. `route.ts` turns ports and `via` items into points (lines on one side are spread out). The default route is straight, exactly horizontal or vertical when the boxes overlap, with a detour when the line would cross a box: simple shapes first, then an A* search on a grid of box borders (`grid.ts`). `geom.ts` has the crossing tests that `dgm check` also uses.
- `src/dsl/parse.ts`: YAML parsing and validation. Errors name the YAML path.
- `src/layout/`: text width table, elkjs layered layout (`INCLUDE_CHILDREN`) that aligns connected boxes also inside zones, rows for chips, notes and boxes without edges, placement of new nodes.
- `src/track/track.ts`: snapshots, the diff and the log in `.dgm/<file-name>/`.
- `src/check.ts`: raw colors and contrast in light and dark mode.
- `src/commands/`: one file for each command. `setup.ts` also has the hook.
- `skill/SKILL.md`: the agent skill that `dgm setup` copies. Keep it below 6,000 characters (a test checks this).

Rules for changes:
- `apply` never moves an existing node, except zone growth and an explicit `at`.
- Output must be deterministic: the same YAML gives a byte-identical file. Do not write times, random ids or machine data into `.drawio` files.
- Write each change as a short line for the agent. Do not print XML.
- Never overwrite the points of a line that a person dragged (`personRoutes` in `src/track/track.ts`).
- elkjs 0.12 swaps the two values of `elk.nodeSize.minimum` when the direction is DOWN. `src/layout/layout.ts` works around it; keep the test.

## draw.io facts (verified with draw.io 32.4.1)

- The desktop app does not load external plugins. Its content security policy (`connect-src 'self'`) blocks connections to localhost. Do not design a plugin or a live socket link.
- The desktop app watches open files. After an external write, it shows "The file has been modified. Click here to synchronize."
- Desktop installs that were upgraded from before version 30 use `defaultAdaptiveColors = simple`. New installs and the browser use `auto`. A diagram that mixes explicit and unset colors becomes unreadable in dark mode in one of them.

## Style rules for generated XML

1. Write every color as `light-dark(<light>,<dark>)`, also white and black. A plain color such as `#FFFFFF` is inverted in dark mode when `adaptiveColors="auto"`.
2. Set `adaptiveColors="auto"` on each `mxGraphModel`.
3. Do not put colors in HTML labels. draw.io ignores `light-dark()` in inline CSS. Use a separate text cell for each text color, for example a title and a subtitle.
4. Draw icons as inline stencils (`shape=stencil(...)`), so `strokeColor` sets their color in both themes.

## OpenSpec

Use OpenSpec for change management (`openspec/`). A significant feature starts with a change proposal (`/opsx:propose`). Specs go to `openspec/specs/` after the change is archived.
