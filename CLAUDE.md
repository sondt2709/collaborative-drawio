# CLAUDE.md

This file gives guidance to Claude Code (claude.ai/code) when it works with code in this repository.

## What this is

`dgm` is a command line tool for AI agents and people who edit the same draw.io diagram. The agent writes short YAML. The tool writes the draw.io XML, applies the theme, keeps the history, and reports the changes that a person made in the draw.io app. See `README.md` for the workflow.

Status: design stage. No code exists yet.

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
scripts/scan-sensitive.sh          # scan the working tree for sensitive data
git config core.hooksPath .githooks   # enable the pre-push scan (one time per clone)
```

## Architecture (planned)

- `dgm` is a Node.js CLI. One core library does the work. A Claude Code skill and a `UserPromptSubmit` hook call the CLI.
- The `.drawio` file is the only source of truth. `dgm` stores a snapshot for each agent turn in a `.dgm/` folder next to the file.
- Each cell keeps its semantic data (kind, tone, icon, title, subtitle) as draw.io cell attributes. `dgm` makes the style string from this data and the theme.
- `dgm` uses the installed draw.io desktop CLI for layout and PNG export.

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
