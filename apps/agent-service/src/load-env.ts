import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLogger } from '@repo/telemetry';

const logger = createLogger('load-env');

/** Minimal `KEY=value` reader. Enough to compare against `process.env`. */
function readEnvFile(path: string): Map<string, string> {
  const pairs = new Map<string, string>();

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed
      .slice(0, eq)
      .replace(/^export\s+/, '')
      .trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    if (key !== '') pairs.set(key, value);
  }

  return pairs;
}

/**
 * Loads `.env` from the repository root, then reports every variable the file
 * set that the ambient environment overrode.
 *
 * Precedence is Node's and is deliberately not inverted: a real environment
 * variable beats the file, which is what every container, CI runner and secrets
 * manager assumes. Inverting it would mean a stray `.env` in a deployed image
 * silently outranked the platform's own configuration.
 *
 * The warning exists because the correct precedence has a bad failure mode. A
 * long-lived `export GOOGLE_API_KEY=...` in a shell rc file shadows the `.env`
 * the README tells you to create, and nothing says so: the file looks right,
 * the key in it is valid, and the service authenticates with a different one.
 * That cost a debugging session. Names only are logged, never values.
 */
export function loadEnvFile(root: string = process.cwd()): void {
  const path = resolve(root, '.env');
  if (!existsSync(path)) return;

  const fromFile = readEnvFile(path);
  process.loadEnvFile(path);

  const shadowed = [...fromFile]
    .filter(([key, value]) => process.env[key] !== value)
    .map(([key]) => key);

  if (shadowed.length > 0) {
    logger.warn({
      msg: 'env.file.shadowed',
      variables: shadowed,
      detail: 'set in .env but overridden by the ambient environment; the .env value is not in use',
    });
  }
}
