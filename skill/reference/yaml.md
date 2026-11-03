# dgm help yaml: the create format

```yaml
title: Order system            # optional
subtitle: One line of context  # optional
direction: down                # down (default) or right
rows: [[web, api], [core, db]] # optional: page composition; [a, [b, c]] puts b above c
width: 2400                    # optional: page width in px
nodes:
  api: API gateway             # a string is a card with that title
  web: {title: Web shop, sub: Storefront, icon: monitor, tone: sky}
  core:
    kind: zone
    title: Order services
    tone: violet               # cards inside get the zone tone
    rows: [[svc, queue], [tip]]
    nodes:
      svc: {title: Order service, sub: Creates orders, icon: server}
      queue: {kind: chip, title: Order queue}
      tip: {kind: note, title: Orders are safe to retry.}
  db: {kind: cylinder, title: Postgres, sub: Primary and replica, icon: database}
  bus: {kind: band, title: Event bus for all services, icon: radio-tower, tone: teal}
edges:
  - "web -> api": HTTPS
```

Node keys: `kind`, `title`, `sub`, `tone`, `icon`, `variant`, `style`, `at`, and `nodes` and `rows` for a zone.

- Ids: letters, digits, `_` and `-`. Each id is unique at all depths.
- Quote a title that has `,` or `:` in a `{...}` map.
- kinds: `card` (default: icon, bold title, subtitle), `zone` (tinted container), `chip` (small pill), `band` (solid bar across the page or zone), `note` (muted italic text), `cylinder` (database), `text`.
- tones: `slate`, `sky`, `indigo`, `violet`, `teal`, `orange`, `rose`, `red`.
- variants: `dashed`, `muted`, `emphasis`.
- icons: Lucide names in kebab-case (lucide.dev/icons), for example `server`, `database`, `users`, `cloud`. An unknown name fails with suggestions.
- `style` (rare): `stroke`, `fill` and `text` take a tone, `accent`, `tint`, `surface`, `ink` or `muted`. `dashed` and `bold` take true or false. `width` and `height` take numbers.
- `at: [x, y]` fixes a position, relative to the parent. Normally do not use it.
- Use `rows` on the page and in zones to compose a large diagram. Do not use `at` for that.
- A band in a zone divides the zone.
- Text and notes on a zone become part of the zone. A zone fill that is the same as the page background is transparent.
- `dgm show --geometry` prints positions and sizes.
