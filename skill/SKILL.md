---
name: dgm
description: Create, read and change draw.io diagrams (.drawio) with the dgm CLI and short YAML. Use it for all diagram work in this project, and when a dgm hook message reports that a person changed a diagram.
---

# dgm: draw.io diagrams with short YAML

The `.drawio` file is the only source of truth. A person edits it in draw.io. You edit it with `dgm`.

## Rules

1. Do not read or write `.drawio` XML. Use `dgm show`, `dgm create` and `dgm apply`.
2. Do not write colors, sizes or style strings. Use `kind`, `tone`, `variant` and `icon`.
3. Send only the change. Do not undo the edit of a person, unless the person asks.
4. Before `dgm apply`, tell the person to save the diagram in draw.io.
5. Keep edge labels short: 1 to 3 words. Put details in `sub`.
6. Read the output of each command. Fix each `check` problem and each `hint:`. First change the YAML order or `rows`, then ports or `via`.

## Commands

```sh
dgm create docs/arch.drawio --from spec.yaml   # also YAML on standard input; opens draw.io
dgm show docs/arch.drawio [--geometry]          # the diagram as create YAML
dgm apply docs/arch.drawio <<'EOF'              # add, set, connect, move, remove
set: {svc: {title: Order API}}
EOF
dgm status docs/arch.drawio                     # the changes of a person
dgm layout docs/arch.drawio [--keep-moved]      # place all nodes again
dgm check docs/arch.drawio                      # colors, contrast and layout hints
dgm render docs/arch.drawio                     # PNG next to the file: look at it
dgm export docs/arch.drawio                     # PNG for the person, in ~/Downloads
dgm open docs/arch.drawio                       # show the diagram in draw.io
dgm help yaml|edges|apply                       # the full reference
```

Exit codes: 0 ok, 1 check problems, 2 invalid input (no change), 3 draw.io not found.

When the person asks for an image, run `dgm export` and give the path.

## Create

```yaml
title: Order system
direction: down                 # or right
rows: [[web, api], [core]]      # optional page composition
nodes:
  web: {title: Web shop, sub: Storefront, icon: monitor, tone: sky}
  api: {title: API gateway, icon: shield}
  core:
    kind: zone
    title: Order services
    nodes:
      svc: {title: Order service, sub: Creates orders, icon: server}
      db: {kind: cylinder, title: Postgres, icon: database}
edges:
  - "web -> api": HTTPS
  - api -> svc
  - "svc:b -> db:t": SQL         # ports t r b l
  - {from: api, to: db, via: below core, kind: existing}
```

- kinds: `card` (default), `zone`, `chip`, `band`, `note`, `cylinder`, `text`
- tones: `slate`, `sky`, `indigo`, `violet`, `teal`, `orange`, `rose`, `red`
- variants: `dashed`, `muted`, `emphasis`
- icons: Lucide names, for example `server`, `database`, `users`, `cloud`
- edge kinds: `default`, `new`, `existing`, `dns`, `network`
- `via`: `elbow`, `above|below|left|right <id>`, `x=N`, `y=N`. `route`: `straight`, `orthogonal`, `curved`.

## Apply

```yaml
add:
  cache: {title: Redis, icon: database, in: core}   # in: a zone; near: a node
set:
  svc: {tone: indigo, sub: null}                     # null removes a field
  "api -> svc": {label: gRPC, via: above core}
connect:
  - "svc -> cache": reads
move:
  cache: {in: page}
remove: [old-node, "web -> api"]
```

`dgm show` lists cells that a person drew as `kind: raw`. Run `dgm help apply` to adopt them.
