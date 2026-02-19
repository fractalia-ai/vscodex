import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ContextService } from '../src/services/contextService.js';
import { ChatController } from '../src/core/chatController.js';
import { createInitialState } from '../src/core/chatStore.js';

class FakeCodex {
  startSession() { return true; }
  stop() {}
}

test('Clicking add-context opens file selector', async () => {
  const service = new ContextService();
  let quickPickCalled = false;
  const fakeVscode = {
    workspace: {
      findFiles: async () => [{ path: '/tmp/a.ts' }],
      asRelativePath: () => 'src/a.ts'
    },
    window: {
      showQuickPick: async (items) => {
        quickPickCalled = true;
        return [items[0]];
      }
    }
  };

  const selected = await service.pickWorkspaceFiles(fakeVscode);
  assert.equal(quickPickCalled, true);
  assert.deepEqual(selected, ['src/a.ts']);
});

test('Selecting file adds context badge model', () => {
  const service = new ContextService();
  const dir = mkdtempSync(`${tmpdir()}/codex-oauth-context-`);
  writeFileSync(`${dir}/file.ts`, 'const a = 1;\n', 'utf8');

  const item = service.buildFileContext(dir, 'file.ts');
  const controller = new ChatController(createInitialState(), () => {}, new FakeCodex());
  controller.addContextItem(item);

  const tab = controller.snapshot().tabs[0];
  assert.equal(tab.contextItems.length, 1);
  assert.equal(tab.contextItems[0].source, 'file.ts');
});

test('Adding selected editor code includes filename and line numbers', () => {
  const service = new ContextService();

  const fakeVscode = {
    window: {
      activeTextEditor: {
        document: {
          uri: { fsPath: '/ws/src/main.ts' },
          getText: () => 'const x = 42;'
        },
        selection: {
          isEmpty: false,
          start: { line: 4 },
          end: { line: 6 }
        }
      }
    },
    workspace: {
      asRelativePath: () => 'src/main.ts'
    }
  };

  const item = service.buildSelectionContext(fakeVscode);
  assert.ok(item);
  assert.equal(item.source, 'src/main.ts');
  assert.equal(item.range, '5-7');
});
