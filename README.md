# collaborative-drawio

A command line tool, `dgm`, that lets you and an AI coding agent work on the same [draw.io](https://www.drawio.com) diagram.

The agent writes short YAML. `dgm` writes the draw.io XML, applies a professional theme that reads well in light and dark mode, keeps a history for each agent turn, and tells the agent what you changed in the draw.io app.

| Light | Dark |
|---|---|
| ![Platform overview, light mode](docs/images/platform-overview.light.png) | ![Platform overview, dark mode](docs/images/platform-overview.dark.png) |

These pictures come from [`examples/platform-overview.yaml`](examples/platform-overview.yaml): 2.4 KB of YAML for 38 KB of draw.io XML.

## Why

When an AI agent edits draw.io files directly, these problems occur:

- The agent writes long XML. The examples in this repository are about 16 times larger as XML than as YAML.
- For each update, the agent rewrites the whole page.
- The agent does not see the changes that you make in the draw.io app.
- The diagram looks correct in a browser, but text becomes unreadable in the draw.io desktop app in dark mode.
- The agent cannot reproduce a style that you describe in words.

`dgm` does the exact work, so the agent does not have to:

| The agent does | `dgm` does |
|---|---|
| Writes short YAML: nodes, zones, edges, a kind, a tone, an icon | Writes the draw.io XML and places the nodes |
| Sends only the changes | Applies the changes and keeps the positions that you gave |
| Reads a short list of your edits | Compares the file with the last snapshot |
| Names a kind and a tone, for example `kind: card, tone: indigo` | Writes every color as `light-dark(light, dark)` |

## How it works

```
 You (draw.io app)                 AI agent (for example Claude Code)
       |  edit + save                     |  new prompt
       v                                  v
  diagram.drawio  <---- write -----   dgm CLI  <---- skill + prompt hook
       |                                  |
       +-------- read + compare ----------+---> .dgm/   one snapshot for each agent turn
                                          +---> theme   tones, kinds, icons (light and dark)
                                          +---> draw.io CLI (PNG and SVG export)
```

1. The `.drawio` file is the only source of truth. You can open it in any draw.io app. Each cell keeps its meaning (kind, tone, icon) as cell data, which you can see in draw.io with Edit Data.
2. After `dgm` writes the file, the draw.io desktop app shows "The file has been modified. Click here to synchronize." Click it to load the change.
3. A prompt hook runs before each agent turn. When you changed a diagram, the agent gets a short list of the changes, one time. When you did not, the hook adds nothing.

## Install

You need Node.js 22 or later. For `dgm render`, you also need the [draw.io desktop app](https://github.com/jgraph/drawio-desktop/releases).

Install the `.tgz` file of the [latest release](https://github.com/sondt2709/collaborative-drawio/releases):

```sh
npm install -g https://github.com/sondt2709/collaborative-drawio/releases/download/vX.Y.Z/collaborative-drawio-X.Y.Z.tgz
```

Or build from the source:

```sh
git clone https://github.com/sondt2709/collaborative-drawio.git
cd collaborative-drawio
npm ci && npm run build && npm link
```

Then, in each project where an agent edits diagrams:

```sh
dgm setup        # installs .claude/skills/dgm/SKILL.md and the UserPromptSubmit hook
```

To remove it, delete `.claude/skills/dgm/` and the `dgm hook run` entry in `.claude/settings.json`.

## Quick start

```sh
dgm create docs/arch.drawio --from examples/order-system.yaml
dgm show docs/arch.drawio            # the diagram as YAML, without colors or positions
dgm apply docs/arch.drawio <<'EOF'
add:
  redis: {title: Redis, sub: Session store, icon: database, in: core}
connect:
  - "svc -> redis": reads
EOF
# Now edit the diagram in draw.io and save it.
dgm status docs/arch.drawio          # your changes since the last snapshot
dgm render docs/arch.drawio --theme dark
```

## Commands

| Command | What it does |
|---|---|
| `dgm create <file> [--from <yaml>] [--force]` | Write a new diagram from YAML (standard input or `--from`) |
| `dgm apply <file> [--from <yaml>]` | Change a diagram: `add`, `set`, `connect`, `move`, `remove` |
| `dgm show <file> [--geometry]` | Print the diagram as YAML in the create format |
| `dgm status <file> [--ack]` | Print the changes since the last snapshot; `--ack` records them as one human entry |
| `dgm log <file>` | List the history, newest first |
| `dgm layout <file> [--keep-moved]` | Place all nodes again; `--keep-moved` keeps nodes that you moved |
| `dgm check <file>` | Report raw colors and text with low contrast, in light and dark mode |
| `dgm render <file> [--theme light\|dark] [--format png\|svg] [--scale <n>] [--out <path>]` | Export through the draw.io desktop CLI |
| `dgm setup [<dir>]` | Install the Claude Code skill and hook in a project |
| `dgm hook run` | The hook entry point |

Exit codes: 0 success, 1 check problems, 2 invalid input (no file is changed), 3 draw.io not found or export failed.

`dgm render` finds draw.io in this order: the `DGM_DRAWIO` environment variable, `drawio` on the `PATH`, then `/Applications/draw.io.app` on macOS.

## YAML format

```yaml
title: Order system            # optional
subtitle: One line of context  # optional
direction: down                # down (default) or right
nodes:
  api: API gateway             # a string is a card with that title
  web: {title: Web shop, sub: Storefront, icon: monitor, tone: sky}
  core:
    kind: zone
    title: Order services
    tone: violet               # cards inside use the zone tone
    nodes:
      svc: {title: Order service, sub: Creates orders, icon: server}
      queue: {kind: chip, title: Order queue}
  db: {kind: cylinder, title: Postgres, icon: database}
edges:
  - api -> svc
  - "web -> api": HTTPS
  - {from: svc, to: db, label: SQL, kind: existing, badge: 1}
```

| Key | Values |
|---|---|
| `kind` | `card` (default), `zone`, `chip`, `band`, `note`, `cylinder`, `text` |
| `tone` | `slate`, `sky`, `indigo`, `violet`, `teal`, `orange`, `rose`, `red` |
| `variant` | `dashed`, `muted`, `emphasis` |
| `icon` | a [Lucide](https://lucide.dev/icons) icon name in kebab-case, drawn as a draw.io stencil |
| edge `kind` | `default`, `new`, `existing`, `dns`, `network` |
| `style` | `stroke`, `fill`, `text` (a tone name or `accent`, `tint`, `surface`, `ink`, `muted`), `dashed`, `bold`, `width`, `height` |
| `at` | `[x, y]`, a fixed position relative to the parent |

Apply operations:

```yaml
add:     {cache: {title: Redis, icon: database, in: core}}   # in: a zone; near: a node id
set:     {svc: {title: Order API, sub: null}, "api -> svc": {label: gRPC}}
connect: ["svc -> cache"]
move:    {cache: {in: page}}
remove:  [queue, "web -> api"]
```

The skill in [`skill/SKILL.md`](skill/SKILL.md) is the full reference for agents.

## Themes

The package includes the theme `pro` ([`themes/pro.yaml`](themes/pro.yaml)). Each color is a pair: a light value and a dark value. `dgm` looks for a theme in this order:

1. `.dgm/themes/<name>.yaml` next to the diagram
2. `~/.config/dgm/themes/<name>.yaml` (or `$XDG_CONFIG_HOME/dgm/themes/`)
3. the themes in the package

A theme file can start with `extends: pro` and change only some values.

## History

`dgm` keeps the history of `docs/arch.drawio` in `docs/.dgm/arch.drawio/`: a log and one small JSON snapshot for each entry (no XML). You decide whether to commit the `.dgm/` folder.

## Limits

- `dgm` changes the first page only. It keeps all other pages unchanged.
- draw.io routes the edges. Long edges can cross other nodes. Move a node in draw.io, or run `dgm layout`.
- `dgm` cannot see edits that you did not save. Save in draw.io before you ask the agent for a change.
- When the agent changes the style of a node, your own style edits on that node are replaced by the theme style.

## Contributing

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for changes and Conventional Commits for PR titles. Read `CLAUDE.md` before you open a PR.

```sh
npm ci
npm run build
npm test
git config core.hooksPath .githooks   # the sensitive-data check before each push
```

## License

MIT. See `LICENSE`. Icons: [Lucide](https://lucide.dev) (ISC). Layout: [elkjs](https://github.com/kieler/elkjs) (EPL-2.0).
