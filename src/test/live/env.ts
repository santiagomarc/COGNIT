import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Loads `.env.local` into `process.env` for the live tests, without
 * overriding anything already set (CI passes the key in the environment).
 * Returns whether a Gemini key is available so a suite can skip itself.
 */
export function loadLocalEnv(): boolean {
  const file = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = line.trim().match(/^([^=#]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      if (process.env[key] !== undefined) continue;
      process.env[key] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return Boolean(process.env.GEMINI_API_KEY);
}
