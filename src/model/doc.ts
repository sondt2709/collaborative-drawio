import { DOMParser, XMLSerializer, type Document, type Element, type Node } from '@xmldom/xmldom';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { DgmError } from '../errors.js';

export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One draw.io cell. `el` is the outer element (`object`, `UserObject` or `mxCell`); `cell` is the `mxCell`. */
export interface Cell {
  id: string;
  el: Element;
  cell: Element;
}

export interface NewCell {
  id: string;
  parent: string;
  type: 'vertex' | 'edge';
  label?: string;
  style?: string;
  attrs?: Array<[string, string]>;
  geometry?: Geometry;
  /** Geometry of a vertex on an edge: position along the edge (-1..1) and offset. */
  edgeGeometry?: { x: number; y: number; w: number; h: number; ox: number; oy: number };
  source?: string;
  target?: string;
  /** Insert after this cell (and its following helper cells are not skipped). Default: append. */
  after?: Cell;
}

const WRAPPERS = new Set(['object', 'UserObject']);
/** mxfile attributes that leak the machine, the app version or the edit time. */
const PRIVATE_FILE_ATTRS = ['host', 'agent', 'etag', 'modified'];

function elements(parent: Node): Element[] {
  const out: Element[] = [];
  for (let n = parent.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
}

function firstElement(parent: Node, tag: string): Element | undefined {
  return elements(parent).find((e) => e.tagName === tag);
}

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

/** draw.io page compression: URI-encode, raw deflate, base64. */
export function compressText(text: string): string {
  return deflateRawSync(Buffer.from(encodeURIComponent(text), 'utf8'), { level: 9 }).toString('base64');
}

export function decompressText(data: string): string {
  const raw = inflateRawSync(Buffer.from(data.trim(), 'base64')).toString('utf8');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function parseXml(xml: string, what: string): Document {
  try {
    const dom = new DOMParser({
      onError: (level: string, msg: string) => {
        if (level !== 'warning') throw new Error(msg);
      },
    }).parseFromString(xml, 'text/xml');
    if (!dom.documentElement) throw new Error('no root element');
    return dom;
  } catch (e) {
    throw new DgmError(`${what} is not a valid draw.io file: ${(e as Error).message.split('\n')[0]}`);
  }
}

/**
 * A draw.io file. dgm works on the first page only. All other pages and all
 * cells that dgm does not change keep their XML.
 */
export class DrawioDoc {
  private constructor(
    readonly dom: Document,
    readonly mxfile: Element,
    readonly diagram: Element,
    readonly model: Element,
    readonly root: Element,
  ) {}

  static parse(xml: string, what = 'the file'): DrawioDoc {
    let dom = parseXml(xml, what);
    let top = dom.documentElement!;
    if (top.tagName === 'mxGraphModel') {
      dom = parseXml(`<mxfile><diagram id="page-1" name="Page-1">${xml.replace(/^<\?xml[^>]*>/, '')}</diagram></mxfile>`, what);
      top = dom.documentElement!;
    }
    if (top.tagName !== 'mxfile') throw new DgmError(`${what} is not a draw.io file (root element <${top.tagName}>)`);
    const diagram = firstElement(top, 'diagram');
    if (!diagram) throw new DgmError(`${what} has no page`);
    let model = firstElement(diagram, 'mxGraphModel');
    if (!model) {
      const data = diagram.textContent ?? '';
      if (!data.trim()) throw new DgmError(`${what}: the first page is empty`);
      const inner = parseXml(decompressText(data), what);
      const imported = dom.importNode(inner.documentElement!, true) as Element;
      while (diagram.firstChild) diagram.removeChild(diagram.firstChild);
      diagram.appendChild(imported);
      model = imported;
    }
    const root = firstElement(model, 'root');
    if (!root) throw new DgmError(`${what}: the first page has no <root>`);
    return new DrawioDoc(dom, top, diagram, model, root);
  }

  /** A new file with one empty page. */
  static create(pageName: string): DrawioDoc {
    const esc = pageName.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return DrawioDoc.parse(
      [
        '<mxfile>',
        `  <diagram id="page-1" name="${esc}">`,
        '    <mxGraphModel adaptiveColors="auto" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">',
        '      <root>',
        '        <mxCell id="0" />',
        '        <mxCell id="1" parent="0" />',
        '      </root>',
        '    </mxGraphModel>',
        '  </diagram>',
        '</mxfile>',
        '',
      ].join('\n'),
    );
  }

  /** Serialize. Removes private file attributes and sets adaptive colors on the page. */
  serialize(): string {
    for (const a of PRIVATE_FILE_ATTRS) this.mxfile.removeAttribute(a);
    this.model.setAttribute('adaptiveColors', 'auto');
    let s = new XMLSerializer().serializeToString(this.dom);
    if (!s.endsWith('\n')) s += '\n';
    return s;
  }

  // ---- cells -------------------------------------------------------------

  cells(): Cell[] {
    const out: Cell[] = [];
    for (const el of elements(this.root)) {
      const c = this.wrap(el);
      if (c) out.push(c);
    }
    return out;
  }

  private wrap(el: Element): Cell | undefined {
    if (el.tagName === 'mxCell') return { id: el.getAttribute('id') ?? '', el, cell: el };
    if (WRAPPERS.has(el.tagName)) {
      const cell = firstElement(el, 'mxCell');
      if (!cell) return undefined;
      return { id: el.getAttribute('id') ?? '', el, cell };
    }
    return undefined;
  }

  get(id: string): Cell | undefined {
    for (const el of elements(this.root)) {
      if (el.getAttribute('id') === id) return this.wrap(el);
    }
    return undefined;
  }

  has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  parentId(c: Cell): string | undefined {
    return c.cell.getAttribute('parent') ?? undefined;
  }

  setParent(c: Cell, parent: string): void {
    c.cell.setAttribute('parent', parent);
  }

  isVertex(c: Cell): boolean {
    return c.cell.getAttribute('vertex') === '1';
  }

  isEdge(c: Cell): boolean {
    return c.cell.getAttribute('edge') === '1';
  }

  /** The raw label (HTML when the style has html=1). */
  label(c: Cell): string {
    return (c.el === c.cell ? c.cell.getAttribute('value') : c.el.getAttribute('label')) ?? '';
  }

  setLabel(c: Cell, label: string): void {
    if (c.el === c.cell) c.cell.setAttribute('value', label);
    else c.el.setAttribute('label', label);
  }

  attr(c: Cell, name: string): string | undefined {
    if (c.el === c.cell) return undefined;
    return c.el.hasAttribute(name) ? (c.el.getAttribute(name) ?? undefined) : undefined;
  }

  /** Set or remove a data attribute. A plain mxCell becomes an object. Returns the (new) cell. */
  setAttr(c: Cell, name: string, value: string | undefined): Cell {
    if (value === undefined) {
      if (c.el !== c.cell) c.el.removeAttribute(name);
      return c;
    }
    const w = c.el === c.cell ? this.toObject(c) : c;
    w.el.setAttribute(name, value);
    return w;
  }

  private toObject(c: Cell): Cell {
    const obj = this.dom.createElement('object');
    obj.setAttribute('label', c.cell.getAttribute('value') ?? '');
    obj.setAttribute('id', c.id);
    c.cell.removeAttribute('id');
    c.cell.removeAttribute('value');
    this.root.replaceChild(obj, c.cell);
    obj.appendChild(c.cell);
    this.format(obj, this.indent());
    return { id: c.id, el: obj, cell: c.cell };
  }

  style(c: Cell): string {
    return c.cell.getAttribute('style') ?? '';
  }

  setStyle(c: Cell, style: string): void {
    c.cell.setAttribute('style', style);
  }

  source(c: Cell): string | undefined {
    return c.cell.getAttribute('source') ?? undefined;
  }

  target(c: Cell): string | undefined {
    return c.cell.getAttribute('target') ?? undefined;
  }

  setEnds(c: Cell, source: string | undefined, target: string | undefined): void {
    if (source) c.cell.setAttribute('source', source);
    if (target) c.cell.setAttribute('target', target);
  }

  geometry(c: Cell): Geometry | undefined {
    const g = firstElement(c.cell, 'mxGeometry');
    if (!g || g.getAttribute('relative') === '1') return undefined;
    const n = (a: string) => Number(g.getAttribute(a) ?? 0) || 0;
    return { x: n('x'), y: n('y'), w: n('width'), h: n('height') };
  }

  setGeometry(c: Cell, geo: Geometry): void {
    let g = firstElement(c.cell, 'mxGeometry');
    if (!g) {
      g = this.dom.createElement('mxGeometry');
      g.setAttribute('as', 'geometry');
      c.cell.appendChild(g);
      this.format(c.el, this.indentOf(c.el));
    }
    const set = (a: string, v: number, keepZero: boolean) => {
      if (!keepZero && v === 0) g!.removeAttribute(a);
      else g!.setAttribute(a, fmt(v));
    };
    const as = g.getAttribute('as') ?? 'geometry';
    // Keep the attribute order that draw.io writes: x, y, width, height, as.
    for (const a of ['x', 'y', 'width', 'height', 'as']) g.removeAttribute(a);
    set('x', geo.x, false);
    set('y', geo.y, false);
    set('width', geo.w, true);
    set('height', geo.h, true);
    g.setAttribute('as', as);
  }

  /** Add a cell. Attributes make it an `object` cell. */
  addCell(n: NewCell): Cell {
    const d = this.dom;
    const cell = d.createElement('mxCell');
    let el: Element = cell;
    if (n.attrs && n.attrs.length) {
      el = d.createElement('object');
      el.setAttribute('label', n.label ?? '');
      for (const [k, v] of n.attrs) el.setAttribute(k, v);
      el.setAttribute('id', n.id);
      el.appendChild(cell);
    } else {
      cell.setAttribute('id', n.id);
      cell.setAttribute('value', n.label ?? '');
    }
    if (n.style !== undefined) cell.setAttribute('style', n.style);
    cell.setAttribute(n.type, '1');
    cell.setAttribute('parent', n.parent);
    if (n.source) cell.setAttribute('source', n.source);
    if (n.target) cell.setAttribute('target', n.target);
    const g = d.createElement('mxGeometry');
    if (n.type === 'edge') {
      g.setAttribute('relative', '1');
    } else if (n.edgeGeometry) {
      const eg = n.edgeGeometry;
      g.setAttribute('x', fmt(eg.x));
      if (eg.y) g.setAttribute('y', fmt(eg.y));
      g.setAttribute('width', fmt(eg.w));
      g.setAttribute('height', fmt(eg.h));
      g.setAttribute('relative', '1');
      const p = d.createElement('mxPoint');
      p.setAttribute('x', fmt(eg.ox));
      p.setAttribute('y', fmt(eg.oy));
      p.setAttribute('as', 'offset');
      g.appendChild(p);
    } else {
      const geo = n.geometry ?? { x: 0, y: 0, w: 0, h: 0 };
      if (geo.x) g.setAttribute('x', fmt(geo.x));
      if (geo.y) g.setAttribute('y', fmt(geo.y));
      g.setAttribute('width', fmt(geo.w));
      g.setAttribute('height', fmt(geo.h));
    }
    g.setAttribute('as', 'geometry');
    cell.appendChild(g);
    this.insert(el, n.after?.el);
    return { id: n.id, el, cell };
  }

  removeCell(c: Cell): void {
    const prev = c.el.previousSibling;
    if (prev && prev.nodeType === 3 && !(prev.nodeValue ?? '').trim()) this.root.removeChild(prev);
    this.root.removeChild(c.el);
  }

  rename(c: Cell, newId: string): Cell {
    c.el.setAttribute('id', newId);
    return { ...c, id: newId };
  }

  // ---- page data on the root cell (id 0) ---------------------------------

  pageAttr(name: string): string | undefined {
    const r = this.get('0');
    return r ? this.attr(r, name) : undefined;
  }

  setPageAttr(name: string, value: string | undefined): void {
    const r = this.get('0');
    if (r) this.setAttr(r, name, value);
  }

  setPageName(name: string): void {
    this.diagram.setAttribute('name', name);
  }

  // ---- formatting --------------------------------------------------------

  /** The indentation text before a child of <root>, or '' for a compact file. */
  private indent(): string {
    for (let n = this.root.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && /^\s*\n[ \t]*$/.test(n.nodeValue ?? '') && n.nextSibling?.nodeType === 1) {
        return n.nodeValue!.replace(/^\s*\n/, '\n');
      }
    }
    return '';
  }

  private indentOf(el: Element): string {
    const prev = el.previousSibling;
    if (prev && prev.nodeType === 3 && /\n/.test(prev.nodeValue ?? '')) return prev.nodeValue!.replace(/^[^\n]*/, '');
    return this.indent();
  }

  private insert(el: Element, after?: Element): void {
    const indent = this.indent();
    let ref: Node | null;
    if (after) ref = after.nextSibling;
    else {
      const last = this.root.lastChild;
      ref = last && last.nodeType === 3 && !(last.nodeValue ?? '').trim() ? last : null;
    }
    if (indent) {
      this.root.insertBefore(this.dom.createTextNode(indent), ref);
      this.format(el, indent);
    }
    this.root.insertBefore(el, ref);
    if (indent && !ref) this.root.appendChild(this.dom.createTextNode(indent.replace(/[ \t]{2}$/, '')));
  }

  /** Indent the children of a new element, two spaces for each level. */
  private format(el: Element, indent: string): void {
    if (!indent) return;
    for (let n = el.firstChild; n; ) {
      const next = n.nextSibling;
      if (n.nodeType === 3 && !(n.nodeValue ?? '').trim()) el.removeChild(n);
      n = next;
    }
    const kids = elements(el);
    if (!kids.length) return;
    const inner = `${indent}  `;
    for (const k of kids) {
      el.insertBefore(this.dom.createTextNode(inner), k);
      this.format(k, inner);
    }
    el.appendChild(this.dom.createTextNode(indent));
  }
}
