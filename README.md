# collaborative-drawio

A command line tool, `dgm`, that lets you and an AI coding agent work on the same [draw.io](https://www.drawio.com) diagram.

> Status: design stage. The commands below are the planned interface. They do not exist yet.

## Why

When an AI agent edits draw.io files directly, these problems occur:

- The agent writes long XML. A 3-box diagram is about 1,400 bytes of XML, but about 200 bytes of YAML.
- For each update, the agent rewrites the whole page.
- The agent does not see the changes that you make in the draw.io app.
- The diagram looks correct in a browser, but text becomes unreadable in the draw.io desktop app in dark mode.
- The agent cannot reproduce a style that you describe in words.

`dgm` does the exact work, so the agent does not have to:

| The agent does | `dgm` does |
|---|---|
| Writes short YAML: boxes, kinds, labels, connections | Writes the draw.io XML |
| Sends only the changes | Applies the changes and keeps the boxes that you placed |
| Reads a short list of your edits | Compares the file with the last agent turn |
| Names a kind and a tone, for example `kind: card, tone: indigo` | Applies your theme, with a light and a dark value for each color |

## How it works

```
 You (draw.io app)                 AI agent (for example Claude Code)
       |  edit + save                     |  new prompt
       v                                  v
  diagram.drawio  <---- write -----   dgm CLI  <---- skill + prompt hook
       |                                  |
       +-------- read + compare ----------+---> .dgm/   one checkpoint for each agent turn
                                          +---> theme   your styles, light and dark
                                          +---> draw.io CLI (layout, PNG export)
```

1. The `.drawio` file is the only source of truth. You can open it in any draw.io app.
2. The draw.io desktop app shows "The file has been modified. Click here to synchronize." after `dgm` writes the file. Click it to load the change.
3. A prompt hook runs `dgm status` before each agent turn. When you changed the diagram, the agent gets a short list of the changes. When you did not, the hook adds nothing.

## Planned commands

```sh
dgm create diagram.drawio < diagram.yaml     # new diagram from YAML
dgm apply  diagram.drawio < changes.yaml     # add, change, connect, remove
dgm status diagram.drawio                    # your changes since the last agent turn
dgm show   diagram.drawio                    # the structure as YAML, without styles
dgm log    diagram.drawio                    # one entry for each agent turn
dgm theme learn diagram.drawio --from <id> --as <kind>   # copy a style into the theme
dgm check  diagram.drawio                    # contrast check in light and dark
dgm render diagram.drawio --theme dark       # PNG through the draw.io CLI
```

## Requirements

- macOS, Linux or Windows with Node.js 20 or later.
- The [draw.io desktop app](https://github.com/jgraph/drawio-desktop/releases), for layout and export.

## Contributing

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for changes and Conventional Commits for PR titles. Read `CLAUDE.md` before you open a PR.

Before you push, enable the sensitive-data check:

```sh
git config core.hooksPath .githooks
```

## License

MIT. See `LICENSE`.
