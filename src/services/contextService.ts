import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';

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
  async pickWorkspaceFiles(vscode) {
    const files = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,out}/**', 2000);
    const picks = files.map((f) => ({ label: vscode.workspace.asRelativePath(f), uri: f }));
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
