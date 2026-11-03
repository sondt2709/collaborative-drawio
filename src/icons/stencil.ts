import { deflateRawSync } from 'node:zlib';

/** One SVG element of an icon: [tag, attributes]. This is the Lucide icon node format. */
export type IconNode = Array<[string, Record<string, string | number>]>;

function f(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
}

/** A small scanner for SVG path data. Arc flags can be packed ("a2 2 0 012 2"). */
class PathScanner {
  i = 0;
  constructor(private readonly s: string) {}
  private skip(): void {
    while (this.i < this.s.length && /[\s,]/.test(this.s[this.i])) this.i++;
  }
  done(): boolean {
    this.skip();
    return this.i >= this.s.length;
  }
  isCommand(): boolean {
    this.skip();
    return /[a-zA-Z]/.test(this.s[this.i] ?? '');
  }
  command(): string {
    this.skip();
    return this.s[this.i++];
  }
  number(): number {
    this.skip();
    const m = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/.exec(this.s.slice(this.i));
    if (!m) throw new Error(`bad path data at ${this.i}: ${this.s.slice(this.i, this.i + 12)}`);
    this.i += m[0].length;
    return Number(m[0]);
  }
  flag(): number {
    this.skip();
    const c = this.s[this.i++];
    if (c !== '0' && c !== '1') throw new Error(`bad arc flag at ${this.i - 1}`);
    return Number(c);
  }
}

/** Convert SVG path data to draw.io stencil path operations (absolute coordinates). */
export function pathToStencil(d: string): string {
  const p = new PathScanner(d);
  const out: string[] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let lastCubic: [number, number] | undefined;
  let lastQuad: [number, number] | undefined;
  while (!p.done()) {
    if (p.isCommand()) cmd = p.command();
    else if (!cmd) throw new Error('path data must start with a command');
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ax = (v: number) => (rel ? x + v : v);
    const ay = (v: number) => (rel ? y + v : v);
    let cubic: [number, number] | undefined;
    let quad: [number, number] | undefined;
    switch (C) {
      case 'Z':
        out.push('<close/>');
        x = sx;
        y = sy;
        break;
      case 'M': {
        x = ax(p.number());
        y = ay(p.number());
        sx = x;
        sy = y;
        out.push(`<move x="${f(x)}" y="${f(y)}"/>`);
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': {
        const nx = ax(p.number());
        const ny = ay(p.number());
        x = nx;
        y = ny;
        out.push(`<line x="${f(x)}" y="${f(y)}"/>`);
        break;
      }
      case 'H':
        x = ax(p.number());
        out.push(`<line x="${f(x)}" y="${f(y)}"/>`);
        break;
      case 'V':
        y = ay(p.number());
        out.push(`<line x="${f(x)}" y="${f(y)}"/>`);
        break;
      case 'C':
      case 'S': {
        let x1: number;
        let y1: number;
        if (C === 'C') {
          x1 = ax(p.number());
          y1 = ay(p.number());
        } else if (lastCubic) {
          x1 = 2 * x - lastCubic[0];
          y1 = 2 * y - lastCubic[1];
        } else {
          x1 = x;
          y1 = y;
        }
        const x2 = ax(p.number());
        const y2 = ay(p.number());
        const nx = ax(p.number());
        const ny = ay(p.number());
        out.push(`<curve x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" x3="${f(nx)}" y3="${f(ny)}"/>`);
        cubic = [x2, y2];
        x = nx;
        y = ny;
        break;
      }
      case 'Q':
      case 'T': {
        let x1: number;
        let y1: number;
        if (C === 'Q') {
          x1 = ax(p.number());
          y1 = ay(p.number());
        } else if (lastQuad) {
          x1 = 2 * x - lastQuad[0];
          y1 = 2 * y - lastQuad[1];
        } else {
          x1 = x;
          y1 = y;
        }
        const nx = ax(p.number());
        const ny = ay(p.number());
        out.push(`<quad x1="${f(x1)}" y1="${f(y1)}" x2="${f(nx)}" y2="${f(ny)}"/>`);
        quad = [x1, y1];
        x = nx;
        y = ny;
        break;
      }
      case 'A': {
        const rx = p.number();
        const ry = p.number();
        const rot = p.number();
        const large = p.flag();
        const sweep = p.flag();
        const nx = ax(p.number());
        const ny = ay(p.number());
        out.push(
          `<arc rx="${f(rx)}" ry="${f(ry)}" x-axis-rotation="${f(rot)}" large-arc-flag="${large}" sweep-flag="${sweep}" x="${f(nx)}" y="${f(ny)}"/>`,
        );
        x = nx;
        y = ny;
        break;
      }
      default:
        throw new Error(`unsupported path command ${cmd}`);
    }
    lastCubic = cubic;
    lastQuad = quad;
  }
  return out.join('');
}

function num(a: Record<string, string | number>, k: string): number {
  return Number(a[k] ?? 0) || 0;
}

function points(s: string): Array<[number, number]> {
  const n = String(s).trim().split(/[\s,]+/).map(Number);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
  return out;
}

/** Convert an icon node list (24 x 24 view box) to draw.io stencil XML. */
export function iconToStencilXml(node: IconNode, size = 24): string {
  const fg: string[] = ['<linecap cap="round"/>', '<linejoin join="round"/>'];
  for (const [tag, a] of node) {
    switch (tag) {
      case 'path':
        fg.push(`<path>${pathToStencil(String(a.d))}</path><stroke/>`);
        break;
      case 'circle': {
        const r = num(a, 'r');
        fg.push(`<ellipse x="${f(num(a, 'cx') - r)}" y="${f(num(a, 'cy') - r)}" w="${f(2 * r)}" h="${f(2 * r)}"/><stroke/>`);
        break;
      }
      case 'ellipse': {
        const rx = num(a, 'rx');
        const ry = num(a, 'ry');
        fg.push(`<ellipse x="${f(num(a, 'cx') - rx)}" y="${f(num(a, 'cy') - ry)}" w="${f(2 * rx)}" h="${f(2 * ry)}"/><stroke/>`);
        break;
      }
      case 'rect': {
        const w = num(a, 'width');
        const h = num(a, 'height');
        const rx = num(a, 'rx') || num(a, 'ry');
        const geo = `x="${f(num(a, 'x'))}" y="${f(num(a, 'y'))}" w="${f(w)}" h="${f(h)}"`;
        fg.push(rx ? `<roundrect ${geo} arcsize="${f((rx / Math.min(w, h)) * 100)}"/><stroke/>` : `<rect ${geo}/><stroke/>`);
        break;
      }
      case 'line':
        fg.push(
          `<path><move x="${f(num(a, 'x1'))}" y="${f(num(a, 'y1'))}"/><line x="${f(num(a, 'x2'))}" y="${f(num(a, 'y2'))}"/></path><stroke/>`,
        );
        break;
      case 'polyline':
      case 'polygon': {
        const pts = points(String(a.points));
        if (!pts.length) break;
        const ops = pts.map(([px, py], i) => `<${i ? 'line' : 'move'} x="${f(px)}" y="${f(py)}"/>`).join('');
        fg.push(`<path>${ops}${tag === 'polygon' ? '<close/>' : ''}</path><stroke/>`);
        break;
      }
      default:
        throw new Error(`unsupported icon element <${tag}>`);
    }
  }
  return `<shape name="icon" w="${size}" h="${size}" aspect="fixed" strokewidth="inherit"><connections/><background/><foreground>${fg.join('')}</foreground></shape>`;
}

/** draw.io stencil compression: URI-encode, raw deflate, base64. */
export function compressStencil(xml: string): string {
  return deflateRawSync(Buffer.from(encodeURIComponent(xml), 'utf8'), { level: 9 }).toString('base64');
}
