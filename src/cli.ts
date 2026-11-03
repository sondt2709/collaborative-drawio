#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { apply } from './commands/apply.js';
import { check } from './commands/check.js';
import type { IO } from './commands/common.js';
import { create } from './commands/create.js';
import { exportDiagram } from './commands/export.js';
import { layout } from './commands/layout.js';
import { open } from './commands/open.js';
import { render } from './commands/render.js';
import { hookRun, setup } from './commands/setup.js';
import { show } from './commands/show.js';
import { log, status } from './commands/status.js';
import { DgmError, EXIT, ValidationError } from './errors.js';
import { PACKAGE_ROOT, packageVersion } from './paths.js';

const HELP = `dgm: edit draw.io diagrams with short YAML. The .drawio file stays the only source of truth.

Usage: dgm <command> [options]

Commands:
  create <file> [--from <yaml>] [--force] [--no-open]
                                            Write a new diagram from YAML (standard input or --from) and open it in draw.io
  apply <file> [--from <yaml>]              Change a diagram: add, set, connect, move, remove
  show <file> [--geometry]                  Print the diagram as YAML (the create format)
  status <file> [--ack]                     Print the changes that a person made since the last snapshot
  log <file>                                List the history, newest first
  layout <file> [--keep-moved]              Place all nodes again
  check <file>                              Report raw colors and low text contrast
  open <file>                               Open a diagram in draw.io desktop
  export <file> [--theme light|dark] [--format png|svg] [--scale <n>] [--out <path>]
                                            Export for sharing: light PNG to ~/Downloads/<repo>.<diagram>.<yyyyMMdd-HHmm>.png
  render <file> [--theme light|dark] [--format png|svg] [--scale <n>] [--out <path>]
                                            Export next to the file, to look at the result
  help [yaml|edges|apply]                   Print this help, or the reference of a topic
  setup [<project-dir>]                     Install the Claude Code skill and hook in a project
  hook run                                  Hook entry point (reads the hook JSON on standard input)

Options:
  -h, --help       Show this help
  -v, --version    Show the version

Environment: DGM_NO_OPEN=1 (create does not open draw.io), DGM_EXPORT_DIR (export folder), DGM_DRAWIO (draw.io binary).

Exit codes: 0 success, 1 check problems, 2 invalid input, 3 draw.io not found or export failed.
`;

const HELP_TOPICS = ['yaml', 'edges', 'apply'];

const COMMANDS = ['help', 'create', 'apply', 'show', 'status', 'log', 'layout', 'check', 'open', 'export', 'render', 'setup', 'hook'];

export async function run(argv: string[], io: IO): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        force: { type: 'boolean' },
        'no-open': { type: 'boolean' },
        from: { type: 'string' },
        geometry: { type: 'boolean' },
        ack: { type: 'boolean' },
        'keep-moved': { type: 'boolean' },
        theme: { type: 'string' },
        format: { type: 'string' },
        scale: { type: 'string' },
        out: { type: 'string' },
      },
    });
  } catch (e) {
    io.err(`dgm: ${(e as Error).message}`);
    return EXIT.invalid;
  }
  const { values: o, positionals: pos } = parsed;
  const [cmd, ...args] = pos;
  if (o.version) {
    io.out(packageVersion());
    return EXIT.ok;
  }
  if (o.help || !cmd) {
    io.out(HELP.trimEnd());
    return cmd || o.help ? EXIT.ok : EXIT.invalid;
  }
  if (!COMMANDS.includes(cmd)) {
    io.err(`dgm: unknown command "${cmd}". Run dgm --help.`);
    return EXIT.invalid;
  }
  const needFile = (): string => {
    if (!args[0]) throw new DgmError(`dgm ${cmd}: give the .drawio file`);
    return args[0];
  };
  try {
    switch (cmd) {
      case 'help': {
        if (!args[0]) {
          io.out(HELP.trimEnd());
          return EXIT.ok;
        }
        if (!HELP_TOPICS.includes(args[0])) throw new DgmError(`unknown help topic "${args[0]}". Topics: ${HELP_TOPICS.join(', ')}`);
        io.out(readFileSync(join(PACKAGE_ROOT, 'skill', 'reference', `${args[0]}.md`), 'utf8').trimEnd());
        return EXIT.ok;
      }
      case 'create':
        return await create(io, needFile(), { force: o.force, from: o.from, noOpen: o['no-open'] });
      case 'apply':
        return await apply(io, needFile(), { from: o.from });
      case 'show':
        return show(io, needFile(), { geometry: o.geometry });
      case 'status':
        return status(io, needFile(), { ack: o.ack });
      case 'log':
        return log(io, needFile());
      case 'layout':
        return await layout(io, needFile(), { keepMoved: o['keep-moved'] });
      case 'check':
        return check(io, needFile());
      case 'open':
        return open(io, needFile());
      case 'export':
        return exportDiagram(io, needFile(), { theme: o.theme, format: o.format, scale: o.scale, out: o.out });
      case 'render':
        return render(io, needFile(), { theme: o.theme, format: o.format, scale: o.scale, out: o.out });
      case 'setup':
        return setup(io, args[0]);
      case 'hook':
        if (args[0] !== 'run') throw new DgmError('usage: dgm hook run');
        return await hookRun(io);
    }
  } catch (e) {
    if (e instanceof ValidationError) {
      for (const p of e.problems) io.err(`error: ${p}`);
      io.err('No file was changed.');
      return e.code;
    }
    if (e instanceof DgmError) {
      io.err(`dgm: ${e.message}`);
      return e.code;
    }
    io.err(`dgm: internal error: ${(e as Error).stack ?? e}`);
    return EXIT.invalid;
  }
  return EXIT.invalid;
}

async function readStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function isMain(): boolean {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  // A reader that closes the pipe early (for example `dgm show x | head`) is not an error.
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EPIPE') process.exit(process.exitCode ?? 0);
      throw e;
    });
  }
  const io: IO = {
    cwd: process.cwd(),
    env: process.env,
    stdin: readStdin,
    out: (l) => process.stdout.write(`${l}\n`),
    err: (l) => process.stderr.write(`${l}\n`),
  };
  run(process.argv.slice(2), io).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      process.stderr.write(`dgm: ${(e as Error).message}\n`);
      process.exitCode = EXIT.invalid;
    },
  );
}
