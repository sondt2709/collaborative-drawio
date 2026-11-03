import { describe, expect, it } from 'vitest';
import { DrawioDoc, compressText } from '../src/model/doc.js';

const FILE = `<mxfile host="Electron" agent="Mozilla/5.0 Electron" etag="abc" modified="2026-01-01" version="32.4.1">
  <diagram id="p1" name="Page-1">
    <mxGraphModel dx="1000" dy="800" grid="1">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="a" value="Keep me" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1">
          <mxGeometry x="10" y="20" width="120" height="60" as="geometry" />
        </mxCell>
        <object label="B" dgm_kind="card" custom="x" id="b">
          <mxCell style="rounded=1;" vertex="1" parent="1">
            <mxGeometry x="200" y="20" width="120" height="60" as="geometry" />
          </mxCell>
        </object>
      </root>
    </mxGraphModel>
  </diagram>
  <diagram id="p2" name="Other">compressed-data-kept</diagram>
</mxfile>
`;

describe('draw.io model', () => {
  it('reads cells with object attributes', () => {
    const d = DrawioDoc.parse(FILE);
    expect(d.cells().map((c) => c.id)).toEqual(['0', '1', 'a', 'b']);
    const b = d.get('b')!;
    expect(d.attr(b, 'dgm_kind')).toBe('card');
    expect(d.attr(b, 'custom')).toBe('x');
    expect(d.label(b)).toBe('B');
    expect(d.label(d.get('a')!)).toBe('Keep me');
    expect(d.geometry(d.get('a')!)).toEqual({ x: 10, y: 20, w: 120, h: 60 });
  });

  it('keeps the XML of cells that it does not change, and other pages', () => {
    const d = DrawioDoc.parse(FILE);
    d.setLabel(d.get('b')!, 'B2');
    const out = d.serialize();
    expect(out).toContain(
      '<mxCell id="a" value="Keep me" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1">\n          <mxGeometry x="10" y="20" width="120" height="60" as="geometry"/>',
    );
    expect(out).toContain('<diagram id="p2" name="Other">compressed-data-kept</diagram>');
    expect(out).toContain('label="B2"');
  });

  it('reads a compressed first page', () => {
    const inner = FILE.match(/<mxGraphModel[\s\S]*<\/mxGraphModel>/)![0];
    const comp = FILE.replace(inner, compressText(inner));
    const d = DrawioDoc.parse(comp);
    expect(d.cells().map((c) => c.id)).toEqual(['0', '1', 'a', 'b']);
  });

  it('removes host, agent, etag and modified, and sets adaptiveColors="auto"', () => {
    const out = DrawioDoc.parse(FILE).serialize();
    expect(out).not.toMatch(/\b(host|agent|etag|modified)=/);
    expect(out).toContain('version="32.4.1"');
    expect(out).toMatch(/<mxGraphModel[^>]*adaptiveColors="auto"/);
  });

  it('turns a plain cell into an object cell when it gets data', () => {
    const d = DrawioDoc.parse(FILE);
    d.setAttr(d.get('a')!, 'dgm_kind', 'card');
    const again = DrawioDoc.parse(d.serialize());
    const a = again.get('a')!;
    expect(a.el.tagName).toBe('object');
    expect(again.label(a)).toBe('Keep me');
    expect(again.attr(a, 'dgm_kind')).toBe('card');
  });

  it('rejects a file that is not draw.io', () => {
    expect(() => DrawioDoc.parse('<svg/>')).toThrow(/not a draw.io file/);
    expect(() => DrawioDoc.parse('not xml <')).toThrow();
  });
});
