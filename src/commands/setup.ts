import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DgmError } from '../errors.js';
import { DrawioDoc } from '../model/doc.js';
import { PACKAGE_ROOT, packageVersion } from '../paths.js';
import { ackHuman } from '../track/track.js';
import { abs, type IO } from './common.js';

export const HOOK_COMMAND = 'dgm hook run';

const SKILL_PATH = join('.claude', 'skills', 'dgm', 'SKILL.md');

function packageSkill(): string {
  return readFileSync(join(PACKAGE_ROOT, 'skill', 'SKILL.md'), 'utf8');
}

/** The project skill compared with the skill of the installed dgm. */
export function skillState(root: string): 'absent' | 'current' | 'old' {
  const file = join(root, SKILL_PATH);
  if (!existsSync(file)) return 'absent';
  return readFileSync(file, 'utf8') === packageSkill() ? 'current' : 'old';
}

interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
}

function isDgmHook(e: HookEntry): boolean {
  return !!e.hooks?.some((h) => typeof h.command === 'string' && /(^|[\s/])dgm hook run\b/.test(h.command));
}

/** Add the dgm hook entry to Claude Code settings. Keeps all other keys. Idempotent. */
export function mergeHook(settings: Record<string, unknown>): { settings: Record<string, unknown>; added: boolean } {
  const hooks = (settings.hooks ?? {}) as Record<string, HookEntry[]>;
  if (typeof hooks !== 'object' || Array.isArray(hooks)) throw new DgmError('.claude/settings.json: "hooks" must be an object');
  const list = hooks.UserPromptSubmit ?? [];
  if (!Array.isArray(list)) throw new DgmError('.claude/settings.json: "hooks.UserPromptSubmit" must be a list');
  if (list.some(isDgmHook)) return { settings, added: false };
  const next = { ...settings, hooks: { ...hooks, UserPromptSubmit: [...list, { hooks: [{ type: 'command', command: HOOK_COMMAND }] }] } };
  return { settings: next, added: true };
}

export function setup(io: IO, dir: string | undefined): number {
  const root = abs(io, dir ?? '.');
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new DgmError(`${dir} is not a folder`);
  const state = skillState(root);
  if (state !== 'current') {
    mkdirSync(join(root, '.claude', 'skills', 'dgm'), { recursive: true });
    writeFileSync(join(root, SKILL_PATH), packageSkill());
  }
  io.out(`skill: .claude/skills/dgm/SKILL.md (${{ absent: 'created', old: 'updated', current: 'unchanged' }[state]})`);

  const settingsPath = join(root, '.claude', 'settings.json');
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    } catch (e) {
      throw new DgmError(`.claude/settings.json is not valid JSON: ${(e as Error).message}`);
    }
  }
  const r = mergeHook(settings);
  if (r.added) writeFileSync(settingsPath, `${JSON.stringify(r.settings, null, 2)}\n`);
  io.out(`hook: .claude/settings.json UserPromptSubmit "${HOOK_COMMAND}" (${r.added ? 'added' : 'already there'})`);
  return 0;
}

const SKIP = new Set(['node_modules', '.git']);

/** Diagrams with history (.dgm/<file>/log.jsonl), at most `depth` folder levels below `dir`. */
export function findTracked(dir: string, depth = 4): string[] {
  const out: string[] = [];
  const walk = (d: string, level: number) => {
    let entries: string[];
    try {
      entries = readdirSync(d).sort();
    } catch {
      return;
    }
    if (entries.includes('.dgm')) {
      const meta = join(d, '.dgm');
      let names: string[] = [];
      try {
        names = readdirSync(meta).sort();
      } catch {
        names = [];
      }
      for (const n of names) {
        if (n === 'themes') continue;
        if (existsSync(join(meta, n, 'log.jsonl')) && existsSync(join(d, n))) out.push(join(d, n));
      }
    }
    if (level >= depth) return;
    for (const e of entries) {
      if (SKIP.has(e) || e.startsWith('.')) continue;
      const p = join(d, e);
      try {
        if (statSync(p).isDirectory()) walk(p, level + 1);
      } catch {
        // Ignore unreadable entries.
      }
    }
  };
  walk(dir, 0);
  return out;
}

/** The UserPromptSubmit hook: report and record the changes that a person made. Always exits 0. */
export async function hookRun(io: IO): Promise<number> {
  try {
    let cwd = io.cwd;
    try {
      const input = await io.stdin();
      if (input?.trim()) {
        const j = JSON.parse(input) as { cwd?: string };
        if (typeof j.cwd === 'string' && j.cwd) cwd = j.cwd;
      }
    } catch {
      // Use the process folder.
    }
    try {
      if (skillState(cwd) === 'old') {
        io.out(`dgm: .claude/skills/dgm/SKILL.md is not the skill of dgm ${packageVersion()}. Run \`dgm setup\` to update it.`);
      }
    } catch {
      // An unreadable skill must not block the prompt.
    }
    const blocks: string[] = [];
    for (const file of findTracked(cwd)) {
      try {
        const doc = DrawioDoc.parse(readFileSync(file, 'utf8'), file);
        const d = ackHuman(file, doc);
        if (d) blocks.push([relative(cwd, file), ...d.lines.map((l) => `  ${l}`)].join('\n'));
      } catch {
        // A broken file must not block the prompt.
      }
    }
    if (blocks.length) {
      io.out('dgm: a person changed these diagrams in draw.io since the last turn (now recorded in dgm log):');
      for (const b of blocks) io.out(b);
    }
  } catch {
    // Never block a prompt.
  }
  return 0;
}
