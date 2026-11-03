import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { DgmError } from '../errors.js';
import { abs, type IO } from './common.js';
import { drawioExport, exportOptions, needDrawio, type ExportOptions } from './render.js';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local time as yyyyMMdd-HHmm. */
export function stamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** The base name of the git top folder of `dir`, or of the current folder. */
function repoName(io: IO, dir: string): string {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', timeout: 5_000 });
  const top = r.status === 0 ? r.stdout.trim() : '';
  return basename(top || io.cwd);
}

/** `<dir>/<name>.<ext>`, or `<name>-1.<ext>`, `<name>-2.<ext>` when the file exists. */
export function freePath(dir: string, name: string, ext: string): string {
  let p = join(dir, `${name}.${ext}`);
  for (let i = 1; existsSync(p); i++) p = join(dir, `${name}-${i}.${ext}`);
  return p;
}

/** Export a diagram for sharing: light PNG by default, to ~/Downloads/<repo>.<diagram>.<yyyyMMdd-HHmm>.png. */
export function exportDiagram(io: IO, file: string, opts: ExportOptions & { out?: string }): number {
  const o = exportOptions(opts);
  const src = abs(io, file);
  if (!existsSync(src)) throw new DgmError(`${file} does not exist`);
  const bin = needDrawio(io.env);
  let out: string;
  if (opts.out) out = abs(io, opts.out);
  else {
    const dir = io.env.DGM_EXPORT_DIR ? abs(io, io.env.DGM_EXPORT_DIR) : join(io.env.HOME || homedir(), 'Downloads');
    mkdirSync(dir, { recursive: true });
    const name = `${repoName(io, dirname(src))}.${basename(file).replace(/\.drawio$/i, '')}.${stamp((io.now ?? (() => new Date()))())}`;
    out = freePath(dir, name, o.format);
  }
  drawioExport(bin, src, out, o);
  io.out(`${out} (${o.theme}, ${o.format})`);
  return 0;
}
