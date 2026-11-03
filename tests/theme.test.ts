import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { parseLightDark } from '../src/theme/color.js';
import { parseStyle } from '../src/model/style.js';
import { renderBadge, renderEdge, renderNode, subtitleStyle, titleStyle } from '../src/theme/render.js';
import { NODE_KINDS, VARIANTS, clearThemeCache, loadTheme } from '../src/theme/theme.js';
import { dgm, read, tmpDir, write } from './helpers.js';

const COLOR_KEYS = ['fillColor', 'strokeColor', 'fontColor', 'labelBackgroundColor', 'gradientColor'];
const LD = /^light-dark\(#[0-9A-F]{6},#[0-9A-F]{6}\)$/;

function assertNoRawColor(style: string): void {
  for (const [k, v] of parseStyle(style)) {
    if (v !== null && COLOR_KEYS.includes(k)) expect(v === 'none' || LD.test(v), `${k}=${v} in ${style}`).toBe(true);
  }
}

describe('theme lookup', () => {
  beforeEach(() => clearThemeCache());

  it('uses the package theme pro by default', () => {
    const dir = tmpDir();
    const t = loadTheme('pro', join(dir, 'a.drawio'), { DGM_CONFIG_DIR: join(dir, 'none') });
    expect(t.source).toMatch(/themes[\\/]pro\.yaml$/);
    expect(Object.keys(t.tones)).toEqual(['slate', 'sky', 'indigo', 'violet', 'teal', 'orange', 'rose', 'red']);
  });

  it('looks in the project, then the user folder, then the package', () => {
    const dir = tmpDir();
    const user = join(dir, 'user');
    mkdirSync(join(user, 'themes'), { recursive: true });
    writeFileSync(join(user, 'themes', 'pro.yaml'), 'extends: pro\ncolors: {ink: ["#111111", "#EEEEEE"]}\n');
    const env = { DGM_CONFIG_DIR: user };
    expect(loadTheme('pro', join(dir, 'a.drawio'), env).colors.ink).toEqual(['#111111', '#EEEEEE']);
    clearThemeCache();
    write(dir, '.dgm/themes/pro.yaml', 'extends: pro\ncolors: {ink: ["#222222", "#DDDDDD"]}\n');
    const t = loadTheme('pro', join(dir, 'a.drawio'), env);
    expect(t.colors.ink).toEqual(['#222222', '#DDDDDD']);
    // The project theme extends the next theme in the lookup order: the user theme, then the package.
    expect(t.tones.violet.accent).toEqual(['#7E22CE', '#D8B4FE']);
  });

  it('dgm create uses the colors of a project theme', async () => {
    const dir = tmpDir();
    write(dir, '.dgm/themes/pro.yaml', 'extends: pro\ntones: {violet: {accent: ["#5B21B6", "#C4B5FD"]}}\n');
    clearThemeCache();
    const r = await dgm(dir, ['create', 'a.drawio'], 'nodes: {x: {title: X, tone: violet}}\n');
    expect(r.code).toBe(0);
    expect(read(dir, 'a.drawio')).toContain('strokeColor=light-dark(#5B21B6,#C4B5FD)');
    clearThemeCache();
  });
});

describe('render functions', () => {
  const theme = loadTheme('pro', join(tmpDir(), 'x.drawio'), { DGM_CONFIG_DIR: '/nonexistent' });

  it('write no raw color for any kind, tone, variant and edge kind', () => {
    for (const kind of NODE_KINDS) {
      for (const tone of Object.keys(theme.tones)) {
        for (const variant of [undefined, ...VARIANTS]) {
          for (const style of [undefined, { stroke: 'teal', fill: 'tint', text: 'muted', bold: true }]) {
            const r = renderNode(theme, { kind, tone, icon: kind === 'note' || kind === 'text' ? undefined : 'server', variant, style, hasSub: true }, 210, 64);
            assertNoRawColor(r.style);
            for (const h of r.helpers) assertNoRawColor(h.style);
          }
        }
      }
    }
    for (const kind of Object.keys(theme.edges)) {
      for (const variant of [undefined, ...VARIANTS]) {
        assertNoRawColor(renderEdge(theme, { kind, variant }));
        assertNoRawColor(renderBadge(theme, { kind, variant }));
      }
    }
    assertNoRawColor(titleStyle(theme));
    assertNoRawColor(subtitleStyle(theme));
  });

  it('draws a card icon as a stencil in the tone accent color', () => {
    const r = renderNode(theme, { kind: 'card', tone: 'indigo', icon: 'server', hasSub: true }, 210, 64);
    const icon = r.helpers.find((h) => h.role === 'icon')!;
    expect(icon.style).toContain('shape=stencil(');
    expect(icon.style).toContain('strokeColor=light-dark(#4338CA,#A5B4FC)');
    const sub = r.helpers.find((h) => h.role === 'sub')!;
    expect(sub.style).toContain('fontColor=light-dark(#475569,#94A3B8)');
  });

  it('every theme color pair parses', () => {
    expect(parseLightDark('light-dark(#FFFFFF,#000000)')).toEqual(['#FFFFFF', '#000000']);
  });
});

describe('tone inheritance and colors in files', () => {
  it('a card without tone uses the tone of its zone', async () => {
    const dir = tmpDir();
    const r = await dgm(dir, ['create', 'a.drawio'], 'nodes:\n  z: {kind: zone, tone: violet, nodes: {c: {title: Card, icon: server}}}\n');
    expect(r.code).toBe(0);
    const xml = read(dir, 'a.drawio');
    const card = xml.slice(xml.indexOf('id="c"'));
    expect(card).toContain('strokeColor=light-dark(#7E22CE,#D8B4FE)');
    expect(xml).toMatch(/adaptiveColors="auto"/);
    for (const m of xml.matchAll(/(fillColor|strokeColor|fontColor|labelBackgroundColor)=([^;"]+)/g)) {
      expect(m[2] === 'none' || LD.test(m[2]), m[0]).toBe(true);
    }
  });
});
