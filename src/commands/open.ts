import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { DgmError } from '../errors.js';
import { abs, type IO } from './common.js';
import { findDrawio, MAC_APP } from './render.js';

/** Start a program without waiting for it. Errors are ignored: opening the app is a convenience. */
export function launchDetached(cmd: string, args: string[]): void {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

/** Open a file in draw.io desktop. Returns false when no draw.io app is found. */
export function openInApp(io: IO, path: string): boolean {
  const bin = findDrawio(io.env);
  if (!bin) return false;
  const launch = io.launch ?? launchDetached;
  // On macOS, `open -a` gives the file to the running app, or starts it.
  if (bin === MAC_APP) launch('open', ['-a', 'draw.io', path]);
  else launch(bin, [path]);
  return true;
}

/** Open after create, unless --no-open or DGM_NO_OPEN=1. Prints one line. */
export function openAfterWrite(io: IO, file: string, noOpen?: boolean): void {
  if (noOpen || io.env.DGM_NO_OPEN === '1') return;
  if (openInApp(io, abs(io, file))) io.out(`opened ${file} in draw.io`);
  else io.out('draw.io desktop was not found: open the file by hand');
}

export function open(io: IO, file: string): number {
  const path = abs(io, file);
  if (!existsSync(path)) throw new DgmError(`${file} does not exist`);
  if (!openInApp(io, path)) {
    io.out('draw.io desktop was not found. Install it from https://github.com/jgraph/drawio-desktop/releases, or set DGM_DRAWIO.');
    return 0;
  }
  io.out(`opened ${file} in draw.io`);
  return 0;
}
