import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatController } from '../src/core/chatController.js';
import { createInitialState } from '../src/core/chatStore.js';
import { applyUnifiedDiff } from '../src/core/diff.js';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

class FakeCodex {
  constructor() {
    this.callbacks = null;
    this.lastPrompt = '';
    this.startedTab = '';
    this.stoppedTabIds = [];
    this.lastStartOptions = undefined;
  }

  startSession(tabId, prompt, callbacks, options) {
    this.startedTab = tabId;
    this.lastPrompt = prompt;
    this.callbacks = callbacks;
    this.lastStartOptions = options;
    return true;
  }

  stop(tabId) {
    this.stoppedTabIds.push(tabId);
  }
}

test('Clicking Send sends user input to codex and creates user bubble data', async () => {
  const codex = new FakeCodex();
  const controller = new ChatController(createInitialState(), () => {}, codex);

  const sent = await controller.sendUserMessage('hello codex');
  const tab = controller.snapshot().tabs[0];

  assert.ok(sent);
  assert.equal(tab.history[0].role, 'user');
  assert.equal(tab.history[0].content, 'hello codex');
  assert.match(codex.lastPrompt, /hello codex/);
});

test('Prompt excludes streaming placeholder assistant entry', async () => {
  const codex = new FakeCodex();
  const controller = new ChatController(createInitialState(), () => {}, codex);

  await controller.sendUserMessage('explain this bug');

  const assistantMarkers = codex.lastPrompt.match(/ASSISTANT:/g) || [];
  assert.equal(assistantMarkers.length, 1);
  assert.doesNotMatch(codex.lastPrompt, /ASSISTANT:\n\nCONTEXT:/);
});

test('Workspace root is forwarded to codex run options and prompt', async () => {
  const codex = new FakeCodex();
  const controller = new ChatController(createInitialState(), () => {}, codex);

  await controller.sendUserMessage('apply fix', { workspaceRoot: '/tmp/my-ws' });

  assert.equal(codex.lastStartOptions.workspaceRoot, '/tmp/my-ws');
  assert.match(codex.lastPrompt, /WORKSPACE_ROOT:\n\/tmp\/my-ws/);
  assert.match(codex.lastPrompt, /Return proposed file changes only as git unified diff blocks/);
  assert.match(codex.lastPrompt, /Do not apply edits directly/);
});

test('Token usage updates input and output token counters', async () => {
  const codex = new FakeCodex();
  const controller = new ChatController(createInitialState(), () => {}, codex);

  await controller.sendUserMessage('count tokens');
  codex.callbacks.onTokenUsage({ tokensUsed: 27, inputTokens: 11, outputTokens: 16 });

  const tab = controller.snapshot().tabs[0];
  assert.equal(tab.tokensUsed, 27);
  assert.equal(tab.inputTokens, 11);
  assert.equal(tab.outputTokens, 16);
});

test('Codex response streams and diff output creates draft for Approve/Reject controls', async () => {
  const codex = new FakeCodex();
  const controller = new ChatController(createInitialState(), () => {}, codex);

  await controller.sendUserMessage('patch this');
  codex.callbacks.onChunk('## Update\nApplied changes\n');
  codex.callbacks.onChunk('diff --git a/src/a.ts b/src/a.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n');
  codex.callbacks.onDone();

  const tab = controller.snapshot().tabs[0];
  const assistant = tab.history[1];

  assert.match(assistant.content, /## Update/);
  const draft = controller.getDiffForMessage(assistant.id);
  assert.ok(draft, 'diff draft should exist when diff is streamed');
});

test('Approve applies patch and Reject discards temporary patch', async () => {
  const codex = new FakeCodex();
  const controller = new ChatController(createInitialState(), () => {}, codex);

  await controller.sendUserMessage('apply diff');
  codex.callbacks.onChunk('diff --git a/app.txt b/app.txt\n@@ -1,1 +1,1 @@\n-old\n+new\n');
  codex.callbacks.onDone();

  const tab = controller.snapshot().tabs[0];
  const msgId = tab.history[1].id;
  const diff = controller.getDiffForMessage(msgId);
  assert.ok(diff);

  const dir = mkdtempSync(`${tmpdir()}/codex-oauth-test-`);
  writeFileSync(`${dir}/app.txt`, 'old', 'utf8');
  applyUnifiedDiff(dir, diff.diffText);
  assert.equal(readFileSync(`${dir}/app.txt`, 'utf8'), 'new');

  controller.rejectDiff(msgId);
  assert.equal(controller.getDiffForMessage(msgId), undefined);
});

test('Approve flow adds localized applied message in request language', async () => {
  const codex = new FakeCodex();
  const controller = new ChatController(createInitialState(), () => {}, codex);

  await controller.sendUserMessage('Обнови модель по дефолту');
  codex.callbacks.onChunk('diff --git a/app.txt b/app.txt\n@@ -1,1 +1,1 @@\n-old\n+new\n');
  codex.callbacks.onDone();

  const tab = controller.snapshot().tabs[0];
  const assistantDiffMsgId = tab.history[1].id;
  controller.rejectDiff(assistantDiffMsgId);
  controller.addDiffAppliedMessage(assistantDiffMsgId);

  const nextTab = controller.snapshot().tabs[0];
  const lastMessage = nextTab.history[nextTab.history.length - 1];
  assert.equal(lastMessage.role, 'assistant');
  assert.equal(lastMessage.content, 'Изменения применены.');
});

test('Login status in state toggles UI visibility contract', () => {
  const codex = new FakeCodex();
  const controller = new ChatController(createInitialState(), () => {}, codex);

  controller.setLoginStatus(true);
  assert.equal(controller.snapshot().isLoggedIn, true);

  controller.setLoginStatus(false);
  assert.equal(controller.snapshot().isLoggedIn, false);
});

test('Delete removes dialog and keeps valid active tab', () => {
  const codex = new FakeCodex();
  const controller = new ChatController(createInitialState(), () => {}, codex);
  const firstId = controller.snapshot().activeTabId;

  const second = controller.addTab();
  const third = controller.addTab();
  controller.switchTab(second.id);

  const removed = controller.deleteTab(second.id);
  const state = controller.snapshot();

  assert.equal(removed, true);
  assert.equal(state.tabs.some((t) => t.id === second.id), false);
  assert.equal(state.activeTabId, third.id);
  assert.equal(state.tabs.some((t) => t.id === firstId), true);
});

test('Delete last running dialog stops session and creates replacement dialog', () => {
  const codex = new FakeCodex();
  const controller = new ChatController(createInitialState(), () => {}, codex);
  const onlyTab = controller.snapshot().tabs[0];
  onlyTab.running = true;

  const removed = controller.deleteTab(onlyTab.id);
  const state = controller.snapshot();

  assert.equal(removed, true);
  assert.equal(codex.stoppedTabIds.includes(onlyTab.id), true);
  assert.equal(state.tabs.length, 1);
  assert.notEqual(state.tabs[0].id, onlyTab.id);
  assert.equal(state.activeTabId, state.tabs[0].id);
});

test('Rename tab updates title and rejects empty names', () => {
  const codex = new FakeCodex();
  const controller = new ChatController(createInitialState(), () => {}, codex);
  const tabId = controller.snapshot().tabs[0].id;

  const renamed = controller.renameTab(tabId, 'Backend Refactor');
  assert.equal(renamed, true);
  assert.equal(controller.snapshot().tabs[0].title, 'Backend Refactor');

  const rejected = controller.renameTab(tabId, '   ');
  assert.equal(rejected, false);
  assert.equal(controller.snapshot().tabs[0].title, 'Backend Refactor');
});

test('Switch tab does not persist when switching to already active tab', () => {
  const codex = new FakeCodex();
  let persistCount = 0;
  const controller = new ChatController(createInitialState(), () => { persistCount += 1; }, codex);
  const activeId = controller.snapshot().activeTabId;

  const changed = controller.switchTab(activeId);
  assert.equal(changed, false);
  assert.equal(persistCount, 0);
});
