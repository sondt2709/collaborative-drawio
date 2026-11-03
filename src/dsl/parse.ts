import { parseDocument } from 'yaml';
import { ValidationError } from '../errors.js';
import { iconExists, suggestIcons } from '../icons/index.js';
import { OVERRIDE_KEYS, type StyleOverride } from '../theme/render.js';
import { NODE_KINDS, SEMANTIC_COLORS, VARIANTS, type NodeKind, type Theme } from '../theme/theme.js';
import { ROUTES, parsePort, parseViaItem, splitEndpoint, splitViaText, type Port, type RouteStyle, type ViaItem } from '../route/route.js';

export type Direction = 'down' | 'right';

export interface NodeSpec {
  id: string;
  path: string;
  kind: NodeKind;
  title: string;
  sub?: string;
  tone?: string;
  icon?: string;
  variant?: string;
  style?: StyleOverride;
  at?: [number, number];
  children: NodeSpec[];
  /** apply `add` only: the parent zone. */
  in?: string;
  /** apply `add` only: place the node next to this node. */
  near?: string;
}

export interface EdgeSpec {
  path: string;
  from: string;
  to: string;
  fromPort?: Port;
  toPort?: Port;
  via?: ViaItem[];
  route?: RouteStyle;
  label?: string;
  kind?: string;
  variant?: string;
  badge?: string;
}

export interface DiagramSpec {
  title?: string;
  subtitle?: string;
  theme: string;
  direction: Direction;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
}

/** Fields of a `set` operation. `null` removes the field. */
export interface SetFields {
  id?: string;
  title?: string;
  sub?: string | null;
  kind?: NodeKind;
  tone?: string | null;
  icon?: string | null;
  variant?: string | null;
  style?: StyleOverride | null;
  label?: string | null;
  badge?: string | null;
  edgeKind?: string | null;
  /** Edge endpoints with ports. */
  from?: { id: string; port?: Port };
  to?: { id: string; port?: Port };
  via?: ViaItem[] | null;
  route?: RouteStyle | null;
}

export interface SetOp {
  ref: string;
  path: string;
  fields: SetFields;
}

export interface MoveOp {
  id: string;
  path: string;
  in?: string;
  at?: [number, number];
}

export interface RemoveOp {
  ref: string;
  path: string;
}

export interface ApplySpec {
  add: NodeSpec[];
  set: SetOp[];
  connect: EdgeSpec[];
  move: MoveOp[];
  remove: RemoveOp[];
}

export const ID_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const NODE_KEYS = ['kind', 'title', 'sub', 'tone', 'icon', 'variant', 'style', 'at', 'nodes'];
const EDGE_KEYS = ['from', 'to', 'label', 'kind', 'variant', 'badge', 'via', 'route'];
const ICON_KINDS: NodeKind[] = ['card', 'cylinder', 'zone', 'chip', 'band'];
const SUB_KINDS: NodeKind[] = ['card', 'cylinder'];

/** Parse YAML text. Syntax errors become validation errors with the line number. */
export function readYaml(text: string, what = 'input'): unknown {
  const doc = parseDocument(text, { prettyErrors: true, uniqueKeys: true });
  if (doc.errors.length) {
    throw new ValidationError(doc.errors.map((e) => `${what}: ${e.message.split('\n')[0]}`));
  }
  return doc.toJS();
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function list(items: string[]): string {
  return items.join(', ');
}

class Ctx {
  problems: string[] = [];
  /** Node id -> YAML path where it is defined. */
  ids = new Map<string, string>();
  constructor(readonly theme: Theme) {}
  bad(path: string, msg: string): void {
    this.problems.push(`${path}: ${msg}`);
  }
  done(): void {
    if (this.problems.length) throw new ValidationError(this.problems);
  }
}

function checkTone(ctx: Ctx, path: string, v: unknown): string | undefined {
  const s = str(v);
  if (s === undefined || !ctx.theme.tones[s]) {
    ctx.bad(path, `unknown tone ${JSON.stringify(v)}. Use one of: ${list(Object.keys(ctx.theme.tones))}`);
    return undefined;
  }
  return s;
}

function checkVariant(ctx: Ctx, path: string, v: unknown): string | undefined {
  const s = str(v);
  if (s === undefined || !(VARIANTS as readonly string[]).includes(s)) {
    ctx.bad(path, `unknown variant ${JSON.stringify(v)}. Use one of: ${list([...VARIANTS])}`);
    return undefined;
  }
  return s;
}

function checkIcon(ctx: Ctx, path: string, v: unknown): string | undefined {
  const s = str(v);
  if (s === undefined || !iconExists(s)) {
    const near = s ? suggestIcons(s) : [];
    ctx.bad(path, `unknown icon ${JSON.stringify(v)}.${near.length ? ` Did you mean: ${list(near)}?` : ''} Icons are Lucide names in kebab-case (lucide.dev/icons).`);
    return undefined;
  }
  return s;
}

function checkKind(ctx: Ctx, path: string, v: unknown): NodeKind | undefined {
  const s = str(v);
  if (s === undefined || !(NODE_KINDS as readonly string[]).includes(s)) {
    ctx.bad(path, `unknown kind ${JSON.stringify(v)}. Use one of: ${list([...NODE_KINDS])}`);
    return undefined;
  }
  return s as NodeKind;
}

function checkPoint(ctx: Ctx, path: string, v: unknown): [number, number] | undefined {
  if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) return [v[0], v[1]];
  ctx.bad(path, 'must be [x, y] with two numbers');
  return undefined;
}

const COLOR_LIKE = /^(#|rgb|hsl|light-dark)|^(white|black|red|green|blue|gray|grey|yellow)$/i;

export function checkStyle(ctx: Ctx, path: string, v: unknown): StyleOverride | undefined {
  if (!isMap(v)) {
    ctx.bad(path, `must be a map with the keys ${list([...OVERRIDE_KEYS])}`);
    return undefined;
  }
  const o: StyleOverride = {};
  const colorNames = [...Object.keys(ctx.theme.tones), ...SEMANTIC_COLORS];
  for (const [k, val] of Object.entries(v)) {
    const p = `${path}.${k}`;
    if (k === 'stroke' || k === 'fill' || k === 'text') {
      const s = str(val);
      if (s && colorNames.includes(s)) o[k] = s;
      else if (s && COLOR_LIKE.test(s)) ctx.bad(p, `raw colors are not allowed; only tone names are allowed (${list(colorNames)})`);
      else ctx.bad(p, `unknown color name ${JSON.stringify(val)}; only tone names are allowed (${list(colorNames)})`);
    } else if (k === 'dashed' || k === 'bold') {
      if (typeof val === 'boolean') o[k] = val;
      else ctx.bad(p, 'must be true or false');
    } else if (k === 'width' || k === 'height') {
      if (typeof val === 'number' && val > 0 && val < 10000) o[k] = val;
      else ctx.bad(p, 'must be a positive number');
    } else {
      ctx.bad(p, `unknown style key. Use one of: ${list([...OVERRIDE_KEYS])}`);
    }
  }
  return o;
}

function checkId(ctx: Ctx, id: string, path: string): boolean {
  if (!ID_PATTERN.test(id)) {
    ctx.bad(path, `invalid id ${JSON.stringify(id)}: use letters, digits, "_" and "-"`);
    return false;
  }
  const prev = ctx.ids.get(id);
  if (prev) {
    ctx.bad(path, `duplicate id "${id}" at ${prev} and ${path}`);
    return false;
  }
  ctx.ids.set(id, path);
  return true;
}

function parseNode(ctx: Ctx, id: string, value: unknown, path: string, extra: string[] = []): NodeSpec {
  checkId(ctx, id, path);
  if (typeof value === 'string' || typeof value === 'number') {
    return { id, path, kind: 'card', title: String(value), children: [] };
  }
  if (value === null || value === undefined) return { id, path, kind: 'card', title: id, children: [] };
  if (!isMap(value)) {
    ctx.bad(path, 'a node is a title string or a map');
    return { id, path, kind: 'card', title: id, children: [] };
  }
  const allowed = [...NODE_KEYS, ...extra];
  for (const k of Object.keys(value)) {
    if (allowed.includes(k)) continue;
    const hint = /\s/.test(k) ? ' A comma inside {...} starts a new key: put quotes around a text that has a comma, for example title: "a, b".' : '';
    ctx.bad(`${path}.${k}`, `unknown key. Use one of: ${list(allowed)}.${hint}`);
  }
  const kind = value.kind === undefined ? 'card' : (checkKind(ctx, `${path}.kind`, value.kind) ?? 'card');
  const n: NodeSpec = { id, path, kind, title: str(value.title) ?? id, children: [] };
  if (value.sub !== undefined && value.sub !== null) {
    if (!SUB_KINDS.includes(kind)) ctx.bad(`${path}.sub`, `kind ${kind} has no subtitle. Only ${list(SUB_KINDS)} have one`);
    else n.sub = str(value.sub);
  }
  if (value.tone !== undefined) n.tone = checkTone(ctx, `${path}.tone`, value.tone);
  if (value.icon !== undefined) {
    if (!ICON_KINDS.includes(kind)) ctx.bad(`${path}.icon`, `kind ${kind} has no icon. Only ${list(ICON_KINDS)} have one`);
    else n.icon = checkIcon(ctx, `${path}.icon`, value.icon);
  }
  if (value.variant !== undefined) n.variant = checkVariant(ctx, `${path}.variant`, value.variant);
  if (value.style !== undefined) n.style = checkStyle(ctx, `${path}.style`, value.style);
  if (value.at !== undefined) n.at = checkPoint(ctx, `${path}.at`, value.at);
  if (value.nodes !== undefined) {
    if (kind !== 'zone') ctx.bad(`${path}.nodes`, 'only a zone can contain nodes');
    else if (!isMap(value.nodes)) ctx.bad(`${path}.nodes`, 'must be a map of node ids to nodes');
    else for (const [cid, cv] of Object.entries(value.nodes)) n.children.push(parseNode(ctx, cid, cv, `${path}.nodes.${cid}`));
  }
  if (extra.includes('in') && value.in !== undefined) n.in = str(value.in);
  if (extra.includes('near') && value.near !== undefined) n.near = str(value.near);
  return n;
}

function checkEdgeKind(ctx: Ctx, path: string, v: unknown): string | undefined {
  const s = str(v);
  if (s === undefined || !ctx.theme.edges[s]) {
    ctx.bad(path, `unknown edge kind ${JSON.stringify(v)}. Use one of: ${list(Object.keys(ctx.theme.edges))}`);
    return undefined;
  }
  return s;
}

/** Split "a -> b" into [a, b] (ports and via are not allowed). */
export function splitEdgeRef(s: string): [string, string] | undefined {
  const m = /^\s*([^\s>]+?)\s*->\s*([^\s#]+?)\s*$/.exec(s);
  return m ? [m[1], m[2]] : undefined;
}

/** "a:r -> b:l via above core" into its parts. Returns undefined when it is not an edge. */
export function splitEdgeText(s: string): { from: string; to: string; via?: string } | undefined {
  const m = /^\s*(\S+?)\s*->\s*(\S+?)(?:\s+via\s+(.+?))?\s*$/.exec(s);
  return m ? { from: m[1], to: m[2], via: m[3] } : undefined;
}

function checkEndpoint(ctx: Ctx, path: string, text: string): { id: string; port?: Port } {
  const { id, port } = splitEndpoint(text);
  if (port === undefined) return { id };
  const p = parsePort(port);
  if (!p) {
    ctx.bad(path, `invalid port "${port}" in "${text}". Use a side t, r, b or l, with an optional position @0..1 (for example r or b@0.3)`);
    return { id };
  }
  return { id, port: p };
}

export function checkVia(ctx: Ctx, path: string, v: unknown): ViaItem[] | undefined {
  const items: unknown[] =
    typeof v === 'string'
      ? splitViaText(v)
      : Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')
        ? [v]
        : Array.isArray(v)
          ? v
          : [v];
  const out: ViaItem[] = [];
  for (const it of items) {
    let item: ViaItem | undefined;
    if (Array.isArray(it) && it.length === 2 && it.every((n) => typeof n === 'number' && Number.isFinite(n))) item = { kind: 'point', x: it[0], y: it[1] };
    else if (typeof it === 'string') item = parseViaItem(it);
    if (!item) {
      ctx.bad(path, `invalid via item ${JSON.stringify(it)}. Use elbow, x=<n>, y=<n>, above <id>, below <id>, left <id>, right <id> or [x, y]`);
      return undefined;
    }
    out.push(item);
  }
  return out;
}

function checkRoute(ctx: Ctx, path: string, v: unknown): RouteStyle | undefined {
  if (typeof v === 'string' && (ROUTES as string[]).includes(v)) return v as RouteStyle;
  ctx.bad(path, `unknown route ${JSON.stringify(v)}. Use one of: ${list(ROUTES)}`);
  return undefined;
}

function edgeFromText(ctx: Ctx, path: string, text: string): EdgeSpec | undefined {
  const parts = splitEdgeText(text);
  if (!parts) {
    ctx.bad(path, `edge must be "from -> to", got ${JSON.stringify(text)}`);
    return undefined;
  }
  const f = checkEndpoint(ctx, path, parts.from);
  const t = checkEndpoint(ctx, path, parts.to);
  const e: EdgeSpec = { path, from: f.id, to: t.id, fromPort: f.port, toPort: t.port };
  if (parts.via) e.via = checkVia(ctx, path, parts.via);
  return e;
}

function parseEdge(ctx: Ctx, item: unknown, path: string): EdgeSpec | undefined {
  if (typeof item === 'string') return edgeFromText(ctx, path, item);
  if (!isMap(item)) {
    ctx.bad(path, 'an edge is "from -> to", {"from -> to": label} or a map with from and to');
    return undefined;
  }
  const keys = Object.keys(item);
  if (keys.length === 1 && splitEdgeText(keys[0]) && !EDGE_KEYS.includes(keys[0])) {
    const e = edgeFromText(ctx, path, keys[0]);
    const v = item[keys[0]];
    if (e && v !== null && v !== undefined) e.label = str(v);
    return e;
  }
  for (const k of keys) if (!EDGE_KEYS.includes(k)) ctx.bad(`${path}.${k}`, `unknown key. Use one of: ${list(EDGE_KEYS)}`);
  const from = str(item.from);
  const to = str(item.to);
  if (!from) ctx.bad(`${path}.from`, 'is required');
  if (!to) ctx.bad(`${path}.to`, 'is required');
  if (!from || !to) return undefined;
  const f = checkEndpoint(ctx, `${path}.from`, from);
  const t = checkEndpoint(ctx, `${path}.to`, to);
  const e: EdgeSpec = { path, from: f.id, to: t.id, fromPort: f.port, toPort: t.port };
  if (item.label !== undefined && item.label !== null) e.label = str(item.label);
  if (item.kind !== undefined) e.kind = checkEdgeKind(ctx, `${path}.kind`, item.kind);
  if (item.variant !== undefined) e.variant = checkVariant(ctx, `${path}.variant`, item.variant);
  if (item.badge !== undefined && item.badge !== null) e.badge = str(item.badge);
  if (item.via !== undefined && item.via !== null) e.via = checkVia(ctx, `${path}.via`, item.via);
  if (item.route !== undefined) e.route = checkRoute(ctx, `${path}.route`, item.route);
  return e;
}

/** The node ids that the via items of an edge name. */
export function viaIds(e: { via?: ViaItem[] }): string[] {
  return (e.via ?? []).flatMap((v) => (v.kind === 'above' || v.kind === 'below' || v.kind === 'left' || v.kind === 'right' ? [v.id] : []));
}

function parseEdges(ctx: Ctx, v: unknown, path: string): EdgeSpec[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    ctx.bad(path, 'must be a list');
    return [];
  }
  const out: EdgeSpec[] = [];
  v.forEach((item, i) => {
    const e = parseEdge(ctx, item, `${path}[${i}]`);
    if (e) out.push(e);
  });
  return out;
}

/** The theme name that a create document asks for. */
export function themeNameOf(raw: unknown): string {
  return isMap(raw) && typeof raw.theme === 'string' ? raw.theme : 'pro';
}

/** Parse and validate a `dgm create` document. */
export function parseDiagram(raw: unknown, theme: Theme): DiagramSpec {
  const ctx = new Ctx(theme);
  if (!isMap(raw)) throw new ValidationError(['document: must be a YAML map with a "nodes" key']);
  for (const k of Object.keys(raw)) {
    if (!['title', 'subtitle', 'theme', 'direction', 'nodes', 'edges'].includes(k)) {
      ctx.bad(k, 'unknown key. Use one of: title, subtitle, theme, direction, nodes, edges');
    }
  }
  const direction = raw.direction === undefined ? 'down' : raw.direction;
  if (direction !== 'down' && direction !== 'right') ctx.bad('direction', 'must be down or right');
  const spec: DiagramSpec = {
    title: str(raw.title),
    subtitle: str(raw.subtitle),
    theme: theme.name,
    direction: direction === 'right' ? 'right' : 'down',
    nodes: [],
    edges: [],
  };
  if (!isMap(raw.nodes)) ctx.bad('nodes', 'is required and must be a map of node ids to nodes');
  else for (const [id, v] of Object.entries(raw.nodes)) spec.nodes.push(parseNode(ctx, id, v, `nodes.${id}`));
  spec.edges = parseEdges(ctx, raw.edges, 'edges');
  for (const e of spec.edges) {
    for (const end of [e.from, e.to]) if (!ctx.ids.has(end)) ctx.bad(e.path, `unknown node "${end}"`);
    for (const id of viaIds(e)) if (!ctx.ids.has(id)) ctx.bad(e.path, `unknown node "${id}" in via`);
  }
  ctx.done();
  return spec;
}

/** Parse a `dgm apply` document. References to existing cells are checked later. */
export function parseApply(raw: unknown, theme: Theme): ApplySpec {
  const ctx = new Ctx(theme);
  if (!isMap(raw)) throw new ValidationError(['document: must be a YAML map with add, set, connect, move or remove']);
  const spec: ApplySpec = { add: [], set: [], connect: [], move: [], remove: [] };
  const keys = Object.keys(raw);
  if (!keys.length) ctx.bad('document', 'is empty. Use add, set, connect, move or remove');
  for (const k of keys) if (!['add', 'set', 'connect', 'move', 'remove'].includes(k)) ctx.bad(k, 'unknown key. Use add, set, connect, move or remove');

  if (raw.add !== undefined) {
    if (!isMap(raw.add)) ctx.bad('add', 'must be a map of new node ids to nodes');
    else for (const [id, v] of Object.entries(raw.add)) spec.add.push(parseNode(ctx, id, v, `add.${id}`, ['in', 'near']));
  }

  if (raw.set !== undefined) {
    if (!isMap(raw.set)) ctx.bad('set', 'must be a map of node ids or edge references to fields');
    else
      for (const [ref, v] of Object.entries(raw.set)) {
        const path = `set.${ref}`;
        if (!isMap(v)) {
          ctx.bad(path, 'must be a map of fields');
          continue;
        }
        const isEdge = ref.includes('->');
        const allowed = isEdge ? ['label', 'kind', 'variant', 'badge', 'from', 'to', 'via', 'route'] : ['id', 'title', 'sub', 'kind', 'tone', 'icon', 'variant', 'style'];
        const f: SetFields = {};
        for (const [k, val] of Object.entries(v)) {
          const p = `${path}.${k}`;
          if (!allowed.includes(k)) {
            ctx.bad(p, `unknown field. Use one of: ${list(allowed)}`);
            continue;
          }
          if (isEdge) {
            if (k === 'label') f.label = val === null ? null : (str(val) ?? null);
            else if (k === 'badge') f.badge = val === null ? null : (str(val) ?? null);
            else if (k === 'kind') f.edgeKind = val === null ? null : checkEdgeKind(ctx, p, val);
            else if (k === 'variant') f.variant = val === null ? null : checkVariant(ctx, p, val);
            else if (k === 'from' || k === 'to') {
              const t = str(val);
              if (!t) ctx.bad(p, 'must be a node id, with an optional port (for example api:r)');
              else f[k] = checkEndpoint(ctx, p, t);
            } else if (k === 'via') f.via = val === null ? null : (checkVia(ctx, p, val) ?? null);
            else if (k === 'route') f.route = val === null ? null : checkRoute(ctx, p, val);
            continue;
          }
          switch (k) {
            case 'id': {
              const s = str(val);
              if (!s || !ID_PATTERN.test(s)) ctx.bad(p, `invalid id ${JSON.stringify(val)}: use letters, digits, "_" and "-"`);
              else f.id = s;
              break;
            }
            case 'title':
              f.title = str(val) ?? '';
              break;
            case 'sub':
              f.sub = val === null ? null : (str(val) ?? null);
              break;
            case 'kind':
              f.kind = checkKind(ctx, p, val);
              break;
            case 'tone':
              f.tone = val === null ? null : checkTone(ctx, p, val);
              break;
            case 'icon':
              f.icon = val === null ? null : checkIcon(ctx, p, val);
              break;
            case 'variant':
              f.variant = val === null ? null : checkVariant(ctx, p, val);
              break;
            case 'style':
              f.style = val === null ? null : checkStyle(ctx, p, val);
              break;
          }
        }
        spec.set.push({ ref, path, fields: f });
      }
  }

  spec.connect = parseEdges(ctx, raw.connect, 'connect');

  if (raw.move !== undefined) {
    if (!isMap(raw.move)) ctx.bad('move', 'must be a map of node ids to {in, at}');
    else
      for (const [id, v] of Object.entries(raw.move)) {
        const path = `move.${id}`;
        if (!isMap(v)) {
          ctx.bad(path, 'must be a map with in and/or at');
          continue;
        }
        const m: MoveOp = { id, path };
        for (const k of Object.keys(v)) if (k !== 'in' && k !== 'at') ctx.bad(`${path}.${k}`, 'unknown key. Use in or at');
        if (v.in !== undefined) m.in = str(v.in);
        if (v.at !== undefined) m.at = checkPoint(ctx, `${path}.at`, v.at);
        if (m.in === undefined && m.at === undefined) ctx.bad(path, 'needs in or at');
        spec.move.push(m);
      }
  }

  if (raw.remove !== undefined) {
    const items = Array.isArray(raw.remove) ? raw.remove : [raw.remove];
    items.forEach((r, i) => {
      const s = str(r);
      if (!s) ctx.bad(`remove[${i}]`, 'must be a node id or an edge reference "from -> to"');
      else spec.remove.push({ ref: s, path: `remove[${i}]` });
    });
  }
  ctx.done();
  return spec;
}
