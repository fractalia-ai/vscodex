import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export function extractDiffBlocks(content) {
  const blocks = [];
  const lines = content.split('\n');
  let current = null;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) blocks.push(current.join('\n').trim());
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }

  if (current) {
    blocks.push(current.join('\n').trim());
  }

  return blocks;
}

function parseHunks(patch) {
  const lines = patch.split('\n');
  const files = [];
  let current = null;
  let currentHunk = null;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (current) files.push(current);
      const parts = line.split(' ');
      const bPath = parts[3]?.replace(/^b\//, '') || '';
      current = { path: bPath, hunks: [] };
      currentHunk = null;
      continue;
    }

    if (!current) continue;

    if (line.startsWith('@@')) {
      currentHunk = [line];
      current.hunks.push(currentHunk);
      continue;
    }

    if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      currentHunk.push(line);
      continue;
    }
  }

  if (current) files.push(current);
  return files;
}

export function applyUnifiedDiff(workspaceRoot, patchText) {
  const files = parseHunks(patchText);
  const applied = [];
  const errors = [];

  for (const f of files) {
    if (!f.path) {
      errors.push('Missing target file path in patch');
      continue;
    }

    const targetPath = `${workspaceRoot}/${f.path}`;
    const original = existsSync(targetPath) ? readFileSync(targetPath, 'utf8').split('\n') : [];
    const output = [];
    let cursor = 0;

    for (const hunk of f.hunks) {
      const header = hunk[0];
      const match = header.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (!match) {
        errors.push(`Invalid hunk header for ${f.path}: ${header}`);
        continue;
      }

      const oldStart = Number(match[1]) - 1;
      while (cursor < oldStart && cursor < original.length) {
        output.push(original[cursor]);
        cursor += 1;
      }

      for (let i = 1; i < hunk.length; i += 1) {
        const line = hunk[i];
        if (line.startsWith(' ')) {
          output.push(line.slice(1));
          cursor += 1;
        } else if (line.startsWith('-')) {
          cursor += 1;
        } else if (line.startsWith('+')) {
          output.push(line.slice(1));
        }
      }
    }

    while (cursor < original.length) {
      output.push(original[cursor]);
      cursor += 1;
    }

    writeFileSync(targetPath, output.join('\n'), 'utf8');
    applied.push(f.path);
  }

  return { applied, errors };
}
