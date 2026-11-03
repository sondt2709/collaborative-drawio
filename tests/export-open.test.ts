import { chmodSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';
import type { IO } from '../src/commands/common.js';
import { stamp } from '../src/commands/export.js';
import { SMALL, dgm, tmpDir, write } from './helpers.js';

/** A fake draw.io binary: it writes its arguments into the -o file. */
function fakeDrawio(dir: string): string {
  const p = write(dir, 'bin/drawio', '#!/bin/sh\nout=""\nprev=""\nfor a in "$@"; do\n  if [ "$prev" = "-o" ]; then out="$a"; fi\n  prev="$a"\ndone\necho "$@" > "$out"\n');
  chmodSync(p, 0o755);
  return p;
}

const AT = new Date(2026, 10, 3, 14, 5);

async function runIO(cwd: string, args: string[], env: NodeJS.ProcessEnv, extra: Partial<IO> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, { cwd, env: { PATH: process.env.PATH, ...env }, stdin: async () => SMALL, out: (l) => out.push(l), err: (l) => err.push(l), ...extra });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('dgm export', () => {
  it('formats the time as yyyyMMdd-HHmm in local time', () => {
    expect(stamp(AT)).toBe('20261103-1405');
  });

  it('writes <repo>.<diagram>.<time>.png with light, border 20 and scale 2, and adds -1 on a conflict', async () => {
    const dir = tmpDir();
    const repo = join(dir, 'shop');
    await dgm(repo, ['create', 'docs/arch.drawio'], SMALL);
    const env = { DGM_DRAWIO: fakeDrawio(dir), DGM_EXPORT_DIR: join(dir, 'Downloads'), DGM_CONFIG_DIR: dir };
    const first = await runIO(repo, ['export', 'docs/arch.drawio'], env, { now: () => AT });
    expect(first.code).toBe(0);
    const out1 = join(dir, 'Downloads', 'shop.arch.20261103-1405.png');
    expect(first.out).toBe(`${out1} (light, png)`);
    expect(readFileSync(out1, 'utf8')).toBe(`-x -f png --theme light -b 20 -o ${out1} -s 2 ${join(repo, 'docs/arch.drawio')}\n`);
    const second = await runIO(repo, ['export', 'docs/arch.drawio'], env, { now: () => AT });
    expect(second.out).toBe(`${join(dir, 'Downloads', 'shop.arch.20261103-1405-1.png')} (light, png)`);
    expect(readdirSync(join(dir, 'Downloads')).sort()).toEqual(['shop.arch.20261103-1405-1.png', 'shop.arch.20261103-1405.png']);
  });

  it('exits with code 3 when draw.io is not found', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SMALL);
    const r = await runIO(dir, ['export', 'a.drawio'], { DGM_DRAWIO: join(dir, 'missing'), DGM_EXPORT_DIR: dir });
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/draw.io desktop was not found/);
  });
});

describe('open in draw.io', () => {
  it('create opens the new file, and --no-open or DGM_NO_OPEN=1 turns it off', async () => {
    const dir = tmpDir();
    const bin = fakeDrawio(dir);
    const calls: string[][] = [];
    const launch = (cmd: string, args: string[]) => calls.push([cmd, ...args]);
    const env = { DGM_DRAWIO: bin, DGM_CONFIG_DIR: dir };
    const r = await runIO(dir, ['create', 'a.drawio'], env, { launch });
    expect(r.code).toBe(0);
    expect(r.out).toContain('opened a.drawio in draw.io');
    expect(calls).toEqual([[bin, join(dir, 'a.drawio')]]);
    await runIO(dir, ['create', 'b.drawio', '--no-open'], env, { launch });
    await runIO(dir, ['create', 'c.drawio'], { ...env, DGM_NO_OPEN: '1' }, { launch });
    expect(calls.length).toBe(1);
  });

  it('apply does not open the file', async () => {
    const dir = tmpDir();
    const calls: string[][] = [];
    const env = { DGM_DRAWIO: fakeDrawio(dir), DGM_CONFIG_DIR: dir };
    await runIO(dir, ['create', 'a.drawio', '--no-open'], env);
    await runIO(dir, ['apply', 'a.drawio'], env, { launch: (c, a) => calls.push([c, ...a]), stdin: async () => 'add: {x: X}\n' });
    expect(calls).toEqual([]);
  });

  it('dgm open opens an existing file, and a missing file exits with code 2', async () => {
    const dir = tmpDir();
    const bin = fakeDrawio(dir);
    const calls: string[][] = [];
    await dgm(dir, ['create', 'a.drawio'], SMALL);
    const r = await runIO(dir, ['open', 'a.drawio'], { DGM_DRAWIO: bin }, { launch: (c, a) => calls.push([c, ...a]) });
    expect(r.out).toBe('opened a.drawio in draw.io');
    expect(calls).toEqual([[bin, join(dir, 'a.drawio')]]);
    expect((await runIO(dir, ['open', 'nope.drawio'], { DGM_DRAWIO: bin })).code).toBe(2);
    expect(existsSync(join(dir, 'nope.drawio'))).toBe(false);
    expect(basename(bin)).toBe('drawio');
  });
});

describe('dgm help', () => {
  it('prints the reference of a topic', async () => {
    const r = await dgm(tmpDir(), ['help', 'edges']);
    expect(r.code).toBe(0);
    for (const t of ['`t`, `r`, `b`, `l`', '`elbow`', '`orthogonal`', '`network`']) expect(r.out).toContain(t);
  });

  it('lists the topics for an unknown topic', async () => {
    const r = await dgm(tmpDir(), ['help', 'colors']);
    expect(r.code).toBe(2);
    expect(r.err).toBe('dgm: unknown help topic "colors". Topics: yaml, edges, apply');
  });

  it('prints the command list without a topic', async () => {
    expect((await dgm(tmpDir(), ['help'])).out).toMatch(/^dgm: edit draw.io diagrams/);
  });
});
