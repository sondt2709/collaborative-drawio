import { DgmError } from '../errors.js';
import { ackHuman, pending, readLog } from '../track/track.js';
import { loadDiagram, type IO } from './common.js';

export function status(io: IO, file: string, opts: { ack?: boolean }): number {
  const { path, doc } = loadDiagram(io, file);
  const p = pending(path, doc);
  if (!p) {
    io.out(`${file} is not tracked. dgm tracks a file after dgm create, dgm apply or dgm layout writes it.`);
    return 0;
  }
  for (const l of p.diff.lines) io.out(l);
  if (opts.ack) ackHuman(path, doc);
  return 0;
}

function localTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function log(io: IO, file: string): number {
  const { path } = loadDiagram(io, file);
  const entries = readLog(path);
  if (!entries.length) throw new DgmError(`${file} is not tracked`, 0);
  for (const e of [...entries].reverse()) {
    const id = e.actor === 'agent' ? `${e.id} agent` : 'human';
    io.out(`${id.padEnd(12)}  ${localTime(e.time)}  ${e.summary}`);
  }
  return 0;
}
