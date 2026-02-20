import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const CONTEXT_MAX = 1024;

function truncate(text) {
  if (text.length <= CONTEXT_MAX) return { content: text, truncated: false };
  return { content: `${text.slice(0, CONTEXT_MAX)}\n...[truncated]`, truncated: true };
}

function iconFromFilename(file) {
  const ext = file.split('.').pop() || '';
  const map = {
    ts: 'symbol-method',
    js: 'symbol-function',
    json: 'symbol-key',
    md: 'book',
    yml: 'settings-gear',
    yaml: 'settings-gear'
  };
  return map[ext] || 'file';
}

export class ContextService {
  async listGitVisibleFiles(workspaceRoot) {
    return await new Promise((resolve) => {
      const child = spawn(
        'git',
        ['-C', workspaceRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      );

      let stdout = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });

      child.on('error', () => {
        resolve(undefined);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          resolve(undefined);
          return;
        }

        const files = [...new Set(stdout.split('\0').filter(Boolean))];
        resolve(files);
      });
    });
  }

  async pickWorkspaceFiles(vscode, workspaceRoot) {
    let relativeFiles;

    if (workspaceRoot) {
      const gitVisibleFiles = await this.listGitVisibleFiles(workspaceRoot);
      if (gitVisibleFiles && gitVisibleFiles.length > 0) {
        relativeFiles = gitVisibleFiles.slice(0, 2000);
      }
    }

    if (!relativeFiles) {
      const files = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,out}/**', 2000);
      relativeFiles = files.map((f) => vscode.workspace.asRelativePath(f));
    }

    const picks = relativeFiles.map((relativePath) => ({ label: relativePath }));
    const selected = await vscode.window.showQuickPick(picks, {
      canPickMany: true,
      matchOnDescription: true,
      title: 'Select context files for Codex'
    });

    if (!selected) return [];
    return selected.map((s) => s.label);
  }

  buildFileContext(workspaceRoot, relativePath) {
    const raw = readFileSync(`${workspaceRoot}/${relativePath}`, 'utf8');
    const { content, truncated } = truncate(raw);
    return {
      id: randomUUID(),
      kind: 'file',
      label: basename(relativePath),
      icon: iconFromFilename(relativePath),
      source: relativePath,
      content,
      truncated
    };
  }

  buildSelectionContext(vscode) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return undefined;
    const document = editor.document;
    const selection = editor.selection;
    if (selection.isEmpty) return undefined;

    const text = document.getText(selection);
    const { content, truncated } = truncate(text);
    const rel = vscode.workspace.asRelativePath(document.uri);
    const range = `${selection.start.line + 1}-${selection.end.line + 1}`;

    return {
      id: randomUUID(),
      kind: 'selection',
      label: basename(rel),
      icon: iconFromFilename(rel),
      source: rel,
      range,
      content,
      truncated
    };
  }
}
