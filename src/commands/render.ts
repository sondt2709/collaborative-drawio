import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { DgmError, EXIT } from '../errors.js';
import { abs, type IO } from './common.js';

const MAC_APP = '/Applications/draw.io.app/Contents/MacOS/draw.io';

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

export function render(io: IO, file: string, opts: { theme?: string; format?: string; scale?: string; out?: string }): number {
  const theme = opts.theme ?? 'light';
  const format = opts.format ?? 'png';
  if (theme !== 'light' && theme !== 'dark') throw new DgmError('--theme must be light or dark');
  if (format !== 'png' && format !== 'svg') throw new DgmError('--format must be png or svg');
  const scale = opts.scale ?? '2';
  if (!(Number(scale) > 0)) throw new DgmError('--scale must be a positive number');
  const src = abs(io, file);
  if (!existsSync(src)) throw new DgmError(`${file} does not exist`);
  const bin = findDrawio(io.env);
  if (!bin) {
    throw new DgmError(
      'draw.io desktop was not found. Install it from https://github.com/jgraph/drawio-desktop/releases, or set DGM_DRAWIO to the draw.io binary.',
      EXIT.drawio,
    );
  }
  const outRel = opts.out ?? `${file}.${theme}.${format}`;
  const out = abs(io, outRel);
  const args = ['-x', '-f', format, '--theme', theme, '-b', '20', '-o', out];
  if (format === 'png') args.push('-s', scale);
  args.push(src);
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 120_000 });
  if (r.status !== 0 || !existsSync(out)) {
    const msg = `${r.stderr ?? ''}${r.stdout ?? ''}`.trim().split('\n').slice(-3).join(' ');
    throw new DgmError(`draw.io export failed${msg ? `: ${msg}` : ''}`, EXIT.drawio);
  }
  io.out(`${outRel} (${theme}, ${format})`);
  return 0;
}
