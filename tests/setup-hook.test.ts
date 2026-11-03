import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { byId, dgm, drawioSave, read, tmpDir, write, SMALL } from './helpers.js';

const ROOT = join(import.meta.dirname, '..');

describe('skill', () => {
  it('has fewer than 4,500 characters and names the rules', () => {
    const s = readFileSync(join(ROOT, 'skill/SKILL.md'), 'utf8');
    expect(s.length).toBeLessThan(4500);
    for (const w of ['dgm show', 'dgm create', 'dgm apply', 'Do not read or write `.drawio` XML', 'Do not write colors', 'Keep edge labels short', 'dgm export', 'dgm help', 'tones:', 'kinds:', 'variants:', 'edge kinds:']) {
      expect(s).toContain(w);
    }
  });
});

describe('dgm setup', () => {
  it('keeps other settings and hooks, and adds one dgm hook', async () => {
    const dir = tmpDir();
    write(dir, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo hi' }] }], Stop: [] } }));
    const r = await dgm(dir, ['setup']);
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, '.claude/skills/dgm/SKILL.md'))).toBe(true);
    const s = JSON.parse(read(dir, '.claude/settings.json'));
    expect(s.permissions).toEqual({ allow: ['Bash(ls)'] });
    expect(s.hooks.Stop).toEqual([]);
    expect(s.hooks.UserPromptSubmit).toEqual([
      { hooks: [{ type: 'command', command: 'echo hi' }] },
      { hooks: [{ type: 'command', command: 'dgm hook run' }] },
    ]);
  });

  it('run two times: one dgm hook entry', async () => {
    const dir = tmpDir();
    await dgm(dir, ['setup']);
    const r = await dgm(dir, ['setup', '.']);
    expect(r.out).toContain('already there');
    const s = JSON.parse(read(dir, '.claude/settings.json'));
    expect(s.hooks.UserPromptSubmit).toHaveLength(1);
  });
});

describe('dgm hook run', () => {
  it('prints the changes of a person once, with the path relative to cwd', async () => {
    const dir = tmpDir();
    expect((await dgm(dir, ['create', 'docs/arch.drawio'], SMALL)).code).toBe(0);
    const none = await dgm(dir, ['hook', 'run'], JSON.stringify({ cwd: dir, prompt: 'hi' }));
    expect(none).toEqual({ code: 0, out: '', err: '' });
    drawioSave(join(dir, 'docs/arch.drawio'), (root) => byId(root, 'svc')!.setAttribute('label', 'Order API'));
    const r = await dgm('/', ['hook', 'run'], JSON.stringify({ cwd: dir, prompt: 'next' }));
    expect(r.code).toBe(0);
    expect(r.out).toContain('docs/arch.drawio');
    expect(r.out).toContain('~ svc.title "Order Service" -> "Order API"');
    expect((await dgm(dir, ['hook', 'run'], JSON.stringify({ cwd: dir }))).out).toBe('');
  });

  it('always exits 0, also for broken input and broken files', async () => {
    const dir = tmpDir();
    expect((await dgm(dir, ['create', 'a.drawio'], SMALL)).code).toBe(0);
    write(dir, 'a.drawio', '<broken');
    expect((await dgm(dir, ['hook', 'run'], 'not json')).code).toBe(0);
    expect((await dgm(dir, ['hook', 'run'], JSON.stringify({ cwd: dir }))).code).toBe(0);
  });

  it('skips node_modules and folders deeper than 4 levels', async () => {
    const dir = tmpDir();
    for (const p of ['node_modules/x', 'a/b/c/d/e']) expect((await dgm(dir, ['create', `${p}/n.drawio`], SMALL)).code).toBe(0);
    for (const p of ['node_modules/x', 'a/b/c/d/e']) drawioSave(join(dir, p, 'n.drawio'), (root) => byId(root, 'svc')!.setAttribute('label', 'X'));
    expect((await dgm(dir, ['hook', 'run'], JSON.stringify({ cwd: dir }))).out).toBe('');
  });

  it('finishes in less than 2 seconds for 20 tracked diagrams', async () => {
    const dir = tmpDir();
    for (let i = 0; i < 20; i++) await dgm(dir, ['create', `d${i % 4}/f${i}.drawio`], SMALL);
    for (let i = 0; i < 20; i++) drawioSave(join(dir, `d${i % 4}/f${i}.drawio`), (root) => byId(root, 'svc')!.setAttribute('label', `S${i}`));
    const t = Date.now();
    const r = await dgm(dir, ['hook', 'run'], JSON.stringify({ cwd: dir }));
    const ms = Date.now() - t;
    expect(r.out.match(/~ svc\.title/g)).toHaveLength(20);
    expect(ms).toBeLessThan(2000);
    expect(statSync(dir).isDirectory()).toBe(true);
  });
});
