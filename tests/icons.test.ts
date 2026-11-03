import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { iconExists, iconStencil, suggestIcons } from '../src/icons/index.js';
import { iconToStencilXml, pathToStencil } from '../src/icons/stencil.js';
import { decompressText } from '../src/model/doc.js';

describe('icons', () => {
  it('converts path commands to absolute stencil operations', () => {
    expect(pathToStencil('M3 5v14h2l1 1z')).toBe('<move x="3" y="5"/><line x="3" y="19"/><line x="5" y="19"/><line x="6" y="20"/><close/>');
    expect(pathToStencil('M4 4c1 1 2 2 3 3s1 1 2 2')).toContain('<curve x1="5" y1="5" x2="6" y2="6" x3="7" y3="7"/><curve x1="8" y1="8"');
    expect(pathToStencil('M2 2a2 2 0 012 2')).toBe('<move x="2" y="2"/><arc rx="2" ry="2" x-axis-rotation="0" large-arc-flag="0" sweep-flag="1" x="4" y="4"/>');
    expect(pathToStencil('M0 0q1 1 2 0t2 0')).toBe('<move x="0" y="0"/><quad x1="1" y1="1" x2="2" y2="0"/><quad x1="3" y1="-1" x2="4" y2="0"/>');
  });

  it('converts every element type', () => {
    const xml = iconToStencilXml([
      ['circle', { cx: 12, cy: 12, r: 3 }],
      ['ellipse', { cx: 12, cy: 5, rx: 9, ry: 3 }],
      ['rect', { x: 2, y: 2, width: 20, height: 8, rx: 2 }],
      ['rect', { x: 2, y: 2, width: 4, height: 4 }],
      ['line', { x1: 1, y1: 2, x2: 3, y2: 4 }],
      ['polyline', { points: '1 1 2 2 3 1' }],
      ['polygon', { points: '1,1 2,2 3,1' }],
    ]);
    expect(xml).toContain('<ellipse x="9" y="9" w="6" h="6"/>');
    expect(xml).toContain('<ellipse x="3" y="2" w="18" h="6"/>');
    expect(xml).toContain('<roundrect x="2" y="2" w="20" h="8" arcsize="25"/>');
    expect(xml).toContain('<rect x="2" y="2" w="4" h="4"/>');
    expect(xml).toContain('<path><move x="1" y="2"/><line x="3" y="4"/></path>');
    expect(xml).toContain('<line x="3" y="1"/><close/></path>');
    expect(xml.match(/<stroke\/>/g)!.length).toBe(7);
  });

  it('converts all Lucide icons without an error', () => {
    const lucide = createRequire(import.meta.url)('lucide') as { icons: Record<string, never> };
    for (const node of Object.values(lucide.icons)) expect(() => iconToStencilXml(node)).not.toThrow();
  });

  it('compresses as draw.io does', () => {
    const s = iconStencil('server');
    expect(s).toMatch(/^stencil\([A-Za-z0-9+/=]+\)$/);
    const xml = decompressText(s.slice(8, -1));
    expect(xml).toMatch(/^<shape name="icon" w="24" h="24" aspect="fixed" strokewidth="inherit">/);
    expect(iconStencil('server')).toBe(s);
  });

  it('knows names and suggests near names', () => {
    expect(iconExists('server')).toBe(true);
    expect(iconExists('arrow-right')).toBe(true);
    expect(iconExists('servr')).toBe(false);
    expect(iconExists('Server')).toBe(false);
    expect(suggestIcons('servr')).toContain('server');
    expect(suggestIcons('databse')).toContain('database');
    expect(suggestIcons('servr').length).toBeLessThanOrEqual(3);
  });
});
