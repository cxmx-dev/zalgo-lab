import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(readFileSync(join(root, 'scaffold.json'), 'utf8'));

const checks = [
  ['Canonical HTML', meta.zalgoCanonical],
  ['Engine', meta.engine],
  ['CLI', meta.cli],
  ['Garbler', meta.garbler],
  ['Archive', meta.archive],
];

console.log(`Project: ${meta.name}`);
for (const [label, rel] of checks) {
  const full = join(root, rel);
  console.log(`${label}: ${rel} (${existsSync(full) ? 'yes' : 'MISSING'})`);
}
console.log(meta.notes ?? '');

if (checks.some(([, rel]) => !existsSync(join(root, rel)))) process.exitCode = 1;
