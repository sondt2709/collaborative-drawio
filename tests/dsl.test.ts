import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDiagram, readYaml } from '../src/dsl/parse.js';
import { loadTheme } from '../src/theme/theme.js';
import { dgm, tmpDir } from './helpers.js';

const theme = loadTheme('pro', join(tmpDir(), 'x.drawio'), { DGM_CONFIG_DIR: '/nonexistent' });
const parse = (y: string) => parseDiagram(readYaml(y), theme);
const errorsOf = (y: string): string[] => {
  try {
    parse(y);
  } catch (e) {
    return (e as { problems: string[] }).problems;
  }
  return [];
};

describe('YAML format', () => {
  it('a string node is a card', () => {
    const s = parse('nodes: {api: API Gateway}');
    expect(s.nodes[0]).toMatchObject({ id: 'api', kind: 'card', title: 'API Gateway' });
    expect(s.theme).toBe('pro');
    expect(s.direction).toBe('down');
  });

  it('nests nodes in a zone', () => {
    const s = parse('nodes: {z: {kind: zone, nodes: {vm1: VM 1}}}');
    expect(s.nodes[0].children[0]).toMatchObject({ id: 'vm1', title: 'VM 1' });
  });

  it('reads both edge formats and badges', () => {
    const s = parse('nodes: {api: A, svc: B}\nedges:\n  - {"api -> svc": REST}\n  - {from: svc, to: api, badge: 1, kind: new}\n  - api -> svc\n');
    expect(s.edges[0]).toMatchObject({ from: 'api', to: 'svc', label: 'REST' });
    expect(s.edges[1]).toMatchObject({ from: 'svc', to: 'api', badge: '1', kind: 'new' });
    expect(s.edges[2]).toMatchObject({ from: 'api', to: 'svc' });
  });
});

describe('validation errors name the YAML path', () => {
  it('unknown node in an edge', () => {
    expect(errorsOf('nodes: {api: A}\nedges: [api -> cache]')).toEqual(['edges[0]: unknown node "cache"']);
  });

  it('duplicate id names both paths', () => {
    expect(errorsOf('nodes: {db: A, z: {kind: zone, nodes: {db: B}}}')[0]).toBe('nodes.z.nodes.db: duplicate id "db" at nodes.db and nodes.z.nodes.db');
  });

  it('unknown kind, tone, variant and icon', () => {
    const e = errorsOf('nodes: {a: {kind: box}, b: {tone: pink}, c: {variant: loud}, d: {icon: servr}}');
    expect(e[0]).toMatch(/^nodes\.a\.kind: unknown kind "box"/);
    expect(e[1]).toMatch(/^nodes\.b\.tone: unknown tone "pink"/);
    expect(e[2]).toMatch(/^nodes\.c\.variant: unknown variant "loud"/);
    expect(e[3]).toMatch(/^nodes\.d\.icon: unknown icon "servr"\. Did you mean: server/);
  });

  it('raw color in a style override', () => {
    expect(errorsOf('nodes: {a: {style: {fill: "#ff0000"}}}')[0]).toMatch(/^nodes\.a\.style\.fill: raw colors are not allowed; only tone names are allowed/);
  });

  it('unknown keys and wrong values', () => {
    const e = errorsOf('nodes: {a: {colour: red, at: [1]}, b: {kind: note, sub: x}}\ndirection: up\nfoo: 1');
    expect(e).toContain('foo: unknown key. Use one of: title, subtitle, theme, direction, nodes, edges');
    expect(e).toContain('direction: must be down or right');
    expect(e.some((x) => x.startsWith('nodes.a.colour: unknown key'))).toBe(true);
    expect(e).toContain('nodes.a.at: must be [x, y] with two numbers');
    expect(e.some((x) => x.startsWith('nodes.b.sub: kind note has no subtitle'))).toBe(true);
  });

  it('YAML syntax errors', () => {
    expect(() => readYaml('nodes: {a: [}')).toThrow();
  });

  it('dgm create writes no file and exits 2 on an invalid document', async () => {
    const dir = tmpDir();
    const r = await dgm(dir, ['create', 'a.drawio'], 'nodes: {api: A}\nedges: [api -> cache]\n');
    expect(r.code).toBe(2);
    expect(r.err).toContain('error: edges[0]: unknown node "cache"');
    expect(existsSync(join(dir, 'a.drawio'))).toBe(false);
  });
});
