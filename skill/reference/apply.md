# dgm help apply: change a diagram

The operations run in this order: add, set, connect, move, remove. If one operation is not valid, dgm changes nothing.

```yaml
add:
  cache: {title: Redis, icon: database, in: core}   # in: a zone id
  queue2: {kind: chip, title: Retry queue, near: svc}
set:
  svc: {title: Order API, tone: indigo, sub: null}  # null removes a field
  "a1B2c3-4": {id: stripe, kind: card, icon: credit-card}       # adopt a cell that a person drew
  "api -> svc": {label: gRPC, from: "api:r", via: above core}   # an edge; via: null removes the via
  page: {rows: [[a, b], [c]], width: 2000}          # then run dgm layout
connect:
  - "svc -> cache": reads
move:
  worker: {in: batch}        # a zone id or page; at: [x, y] is optional
remove: [old-node, "web -> api"]
```

- `apply` does not move existing nodes. Only a zone grows, and `at` moves a node.
- `dgm show` lists cells that a person drew as `kind: raw`, with their cell id. Use `set` with `id` and `kind` to name them and give them the theme style.
- After a change of `rows` or `width`, run `dgm layout`.
