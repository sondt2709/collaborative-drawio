# dgm help edges: lines between nodes

```yaml
edges:
  - api -> svc                              # no label
  - "web -> api": HTTPS                     # with a label
  - {from: svc, to: db, label: SQL, kind: existing, badge: 1}
  - "api:r -> svc:l"                        # ports
  - "svc:b -> db:t via below core": reads   # a lane around a box
  - {from: api, to: db, via: elbow, route: curved}
  - {from: a, to: b, layout: false}         # the edge does not move boxes
```

- Ports: `t`, `r`, `b`, `l`. Add a position on the side with `@`, for example `r@0.3`.
- `via`: `elbow` (one corner), `above|below|left|right <id>` (a lane beside a box), `x=N` or `y=N` (a lane), `[x, y]` (an exact point, rare). Use a list for more items: `via: [below core, x=900]`.
- `route`: `straight` (default), `orthogonal`, `curved`.
- Edge kinds: `default`, `new` (bold, indigo), `existing` (thin), `dns` (dashed), `network` (teal).
- `badge`: a small number or letter on the line.
- Labels: keep them short (1 to 3 words). dgm puts each label on a free part of its line. `dgm create` and `dgm layout` make the gaps wide enough for the labels. `dgm check` reports a label that covers a box.
- Lines are straight by default, with a detour around boxes when necessary. Steer a line only when a `hint:` asks for it.
- dgm computes the points again when boxes move. Points and labels that a person dragged stay.
- A second edge between the same nodes is `a -> b#2`.
