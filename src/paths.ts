import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The package root (one level above src/ or dist/). */
export const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The user config folder: $DGM_CONFIG_DIR, else $XDG_CONFIG_HOME/dgm, else ~/.config/dgm. */
export function userConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DGM_CONFIG_DIR) return env.DGM_CONFIG_DIR;
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, 'dgm');
  return join(homedir(), '.config', 'dgm');
}
