import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const roots = ['src', 'tests', 'media', 'scripts'];
let failed = false;
for (const root of roots) {
  for (const file of walk(root)) {
    if (!/\.(ts|js|mjs|css|json|md)$/.test(file)) continue;
    const txt = readFileSync(file, 'utf8');
    if (txt.includes('\t')) {
      console.error(`Tab character found: ${file}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('lint passed');
