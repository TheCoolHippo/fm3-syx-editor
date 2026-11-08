// Per-machine settings kept out of the shared repo: fm3-local.json next to the scripts (git-ignored).
// { "protected": [383] } lists preset slots the scripts must never write. FM3_PROTECTED="383,384" overrides it.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), 'fm3-local.json');
const local = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
export const PROTECTED = process.env.FM3_PROTECTED
  ? process.env.FM3_PROTECTED.split(',').map(Number)
  : (local.protected || []);
export const PORT = process.env.FM3_PORT || local.port || 'COM7';
// Reload a preset by loading a neighbour first, then the slot again (loading writes nothing).
export const neighbour = slot => (slot > 0 ? slot - 1 : 1);
