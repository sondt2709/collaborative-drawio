import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { DgmError, EXIT } from '../errors.js';
import { abs, type IO } from './common.js';

export const MAC_APP = '/Applications/draw.io.app/Contents/MacOS/draw.io';

/** The draw.io binary: $DGM_DRAWIO, then drawio on the PATH, then the macOS app. */
export function findDrawio(env: NodeJS.ProcessEnv): string | undefined {
  if (env.DGM_DRAWIO) return existsSync(env.DGM_DRAWIO) ? env.DGM_DRAWIO : undefined;
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const name of ['drawio', 'draw.io', 'drawio.exe']) {
      const p = join(dir, name);
      if (existsSync(p) && statSync(p).isFile()) return p;
    }
  }
  if (process.platform === 'darwin' && existsSync(MAC_APP)) return MAC_APP;
  return undefined;
}

export interface ExportOptions {
  theme?: string;
  format?: string;
  scale?: string;
}

/** Check the export options and fill in the defaults: light, png, scale 2. */
export function exportOptions(opts: ExportOptions): Required<ExportOptions> {
  const theme = opts.theme ?? 'light';
  const format = opts.format ?? 'png';
  const scale = opts.scale ?? '2';
  if (theme !== 'light' && theme !== 'dark') throw new DgmError('--theme must be light or dark');
  if (format !== 'png' && format !== 'svg') throw new DgmError('--format must be png or svg');
  if (!(Number(scale) > 0)) throw new DgmError('--scale must be a positive number');
  return { theme, format, scale };
}

/** The draw.io binary, or an error with exit code 3. */
export function needDrawio(env: NodeJS.ProcessEnv): string {
  const bin = findDrawio(env);
  if (!bin) {
    throw new DgmError(
      'draw.io desktop was not found. Install it from https://github.com/jgraph/drawio-desktop/releases, or set DGM_DRAWIO to the draw.io binary.',
      EXIT.drawio,
    );
  }
  return bin;
}

/** Export the first page of `src` to `out` with the draw.io CLI, with a 20 px border. */
export function drawioExport(bin: string, src: string, out: string, o: Required<ExportOptions>): void {
  const args = ['-x', '-f', o.format, '--theme', o.theme, '-b', '20', '-o', out];
  if (o.format === 'png') args.push('-s', o.scale);
  args.push(src);
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 120_000 });
  if (r.status !== 0 || !existsSync(out)) {
    const msg = `${r.stderr ?? ''}${r.stdout ?? ''}`.trim().split('\n').slice(-3).join(' ');
    throw new DgmError(`draw.io export failed${msg ? `: ${msg}` : ''}`, EXIT.drawio);
  }
}

export function render(io: IO, file: string, opts: ExportOptions & { out?: string }): number {
  const o = exportOptions(opts);
  const src = abs(io, file);
  if (!existsSync(src)) throw new DgmError(`${file} does not exist`);
  const bin = needDrawio(io.env);
  const outRel = opts.out ?? `${file}.${o.theme}.${o.format}`;
  drawioExport(bin, src, abs(io, outRel), o);
  io.out(`${outRel} (${o.theme}, ${o.format})`);
  return 0;
}
