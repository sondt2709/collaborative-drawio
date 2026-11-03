---
name: dgm
description: Create, read and change draw.io diagrams (.drawio) with the dgm CLI and short YAML. Use it for any diagram work in this project, and when a dgm hook message reports that a person changed a diagram.
---

# dgm: draw.io diagrams with short YAML

The `.drawio` file is the only source of truth. A person edits it in the draw.io app. You edit it with `dgm`. dgm writes the XML, the style, the positions and the history.

## Rules

1. Never read or write `.drawio` XML. Use `dgm show` to read and `dgm create` / `dgm apply` to change.
2. Never write colors, sizes or style strings. Use `kind`, `tone`, `variant` and `icon`. dgm makes every color readable in light and dark mode.
3. Send only the change. `dgm apply` keeps all other cells and all positions that a person gave.
4. A hook message "dgm: a person changed these diagrams" lists the person's edits. They are recorded. Keep them: do not undo a person's edit unless the person asks.
5. Before an apply, ask the person to save the diagram in draw.io if it is open with unsaved edits. After the apply, draw.io shows "The file has been modified. Click here to synchronize."
6. Read the output of each command. Fix `check` problems. For each `hint:` (a line through a box, an almost straight line, line crossings), first try another YAML order, then ports or `via`. Use `dgm render` to look at the PNG.

## Commands

```sh
dgm create docs/arch.drawio --from spec.yaml   # or YAML on standard input; --force replaces
dgm show docs/arch.drawio [--geometry]          # the diagram as create YAML
dgm apply docs/arch.drawio <<'EOF'              # change: add, set, connect, move, remove
set: {svc: {title: Order API}}
EOF
dgm status docs/arch.drawio [--ack]             # a person's changes since the last snapshot
dgm log docs/arch.drawio                        # history, newest first
dgm layout docs/arch.drawio [--keep-moved]      # place all nodes again
dgm check docs/arch.drawio                      # raw colors, low contrast
dgm render docs/arch.drawio --theme dark        # PNG through the draw.io app
```

Exit codes: 0 ok, 1 check problems, 2 invalid input (no file changed; the error names the YAML path), 3 draw.io not found.

## Create format

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
    tone: violet               # cards inside inherit the zone tone
    nodes:
      svc: {title: Order service, sub: Creates orders, icon: server}
      queue: {kind: chip, title: Order queue}
      tip: {kind: note, title: Orders are safe to retry.}
  db: {kind: cylinder, title: Postgres, sub: Primary and replica, icon: database}
  bus: {kind: band, title: Event bus for all services, icon: radio-tower, tone: teal}
edges:
  - api -> svc                         # no label
  - "web -> api": HTTPS                # with a label
  - {from: svc, to: db, label: SQL, kind: existing, badge: 1}
  - "api:r -> svc:l"                   # ports: t r b l, or r@0.3 (position on the side)
  - "svc:b -> db:t via below core": reads   # via: around a box
  - {from: api, to: db, via: elbow, route: curved}
```

Lines are straight by default (with a detour around boxes when needed). Steer a line only when a hint asks for it:
- `via`: `elbow` (one corner), `above|below|left|right <id>` (a lane beside a box), `x=N` or `y=N` (a lane), `[x, y]` (an exact point, rare). Several: `via: [below core, x=900]`.
- `route`: `straight` (default), `orthogonal`, `curved`.
- dgm computes the points again when boxes move. Points that the person dragged stay.

Node keys: `kind`, `title`, `sub`, `tone`, `icon`, `variant`, `style`, `at`, `nodes` (zone only). Ids: letters, digits, `_`, `-`; unique at all depths. Quote a title that has `,` or `:` in a `{...}` map.

- kinds: `card` (default: icon, bold title, subtitle), `zone` (tinted container), `chip` (small pill), `band` (solid bar, spans the page), `note` (muted italic text), `cylinder` (database), `text`
- tones: `slate`, `sky`, `indigo`, `violet`, `teal`, `orange`, `rose`, `red`
- variants: `dashed`, `muted`, `emphasis`
- icons: Lucide names in kebab-case (lucide.dev/icons), for example `server`, `database`, `users`, `shield`, `cpu`, `globe`, `lock`, `cloud`, `activity`. An unknown name fails with suggestions.
- edge kinds: `default`, `new` (bold, indigo), `existing` (thin), `dns` (dashed), `network` (teal)
- `style` (rare): `stroke`, `fill`, `text` take a tone name or `accent`, `tint`, `surface`, `ink`, `muted`; `dashed`, `bold` take true/false; `width`, `height` take numbers.
- `at: [x, y]` fixes a position (relative to the parent). Normally leave it out.
- Text and notes on a zone become part of the zone. A zone fill that equals the page background is transparent.

## Apply format

Operations run in this order: add, set, connect, move, remove. If one is invalid, nothing changes.

```yaml
add:
  cache: {title: Redis, icon: database, in: core}   # in: a zone; near: a node id
  queue2: {kind: chip, title: Retry queue, near: svc}
set:
  svc: {title: Order API, tone: indigo, sub: null}  # null removes a field
  "a1B2c3-4": {id: stripe, kind: card, icon: credit-card}   # adopt a cell a person drew
  "api -> svc": {label: gRPC, from: "api:r", via: above core}   # edge; "a -> b#2" for the second; via: null clears
connect:
  - "svc -> cache": reads
move:
  worker: {in: batch}        # a zone id or page; at: [x, y] is optional
remove: [old-node, "web -> api"]
```

`dgm show` lists cells that a person drew without dgm data as `kind: raw` with their cell id. Use `set` with `id` and `kind` to give them a name and the theme style.
