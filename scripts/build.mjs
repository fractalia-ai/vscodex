import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function copyTsTree(srcRoot, outRoot) {
  for (const file of walk(srcRoot)) {
    const rel = file.slice(srcRoot.length + 1);
    const outFile = join(outRoot, rel).replace(/\.ts$/, '.js');
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, readFileSync(file, 'utf8'), 'utf8');
  }
}

rmSync('out', { recursive: true, force: true });
copyTsTree('src', 'out/src');
copyTsTree('tests', 'out/tests');
cpSync('media', 'out/media', { recursive: true });
if (existsSync('.vscode')) cpSync('.vscode', 'out/.vscode', { recursive: true });
if (existsSync('README.md')) cpSync('README.md', 'out/README.md');
console.log('build complete');
