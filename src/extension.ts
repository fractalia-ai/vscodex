import * as vscode from 'vscode';
import { ChatController } from './core/chatController.js';
import { applyUnifiedDiff } from './core/diff.js';
import { createInitialState, ensureState, getActiveTab } from './core/chatStore.js';
import { CodexCliService } from './services/codexCliService.js';
import { ContextService } from './services/contextService.js';
import { getWebviewHtml } from './ui/webviewHtml.js';

const STATE_KEY = 'codexOAuthChat.state.v1';

export async function activate(context) {
  const codex = new CodexCliService();
  const contextService = new ContextService();
  const loaded = ensureState(context.workspaceState.get(STATE_KEY));

  let view;
  let controller;

  const postState = () => {
    if (!view || !controller) return;
    view.webview.postMessage({ type: 'state', payload: controller.snapshot() });
  };

  controller = new ChatController(
    loaded,
    (next) => {
      void context.workspaceState.update(STATE_KEY, next);
      postState();
    },
    codex
  );

  const refreshAuthState = async () => {
    try {
      const loggedIn = await codex.isLoggedIn();
      controller.setLoginStatus(loggedIn);
    } catch {
      controller.setLoginStatus(false);
    }
  };

  const onMessage = async (msg) => {
    if (msg.type === 'init') {
      await refreshAuthState();
      postState();
    }

    if (msg.type === 'newTab') {
      controller.addTab();
      postState();
    }

    if (msg.type === 'switchTab') {
      if (controller.switchTab(msg.tabId)) {
        postState();
      }
    }

    if (msg.type === 'renameTab') {
      controller.renameTab(msg.tabId, msg.title);
      postState();
    }

    if (msg.type === 'requestDeleteTab') {
      const tab = controller.snapshot().tabs.find((t) => t.id === msg.tabId);
      if (!tab) return;

      const selected = await vscode.window.showWarningMessage(
        `Delete dialog "${tab.title}"?`,
        { modal: true, detail: 'This action cannot be undone.' },
        'Delete'
      );

      if (selected === 'Delete') {
        controller.deleteTab(msg.tabId);
        postState();
      }
    }

    if (msg.type === 'send') {
      await refreshAuthState();
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      await controller.sendUserMessage(msg.input, { workspaceRoot });
      postState();
    }

    if (msg.type === 'stop') {
      controller.stopActive();
      postState();
    }

    if (msg.type === 'login') {
      codex.triggerLoginInTerminal(vscode);
      await refreshAuthState();
      postState();
    }

    if (msg.type === 'pickContextFiles') {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showWarningMessage('Open a workspace folder first.');
        return;
      }

      const files = await contextService.pickWorkspaceFiles(vscode);
      for (const rel of files) {
        try {
          controller.addContextItem(contextService.buildFileContext(root, rel));
        } catch (err) {
          vscode.window.showWarningMessage(`Failed to add context ${rel}: ${err.message}`);
        }
      }
      postState();
    }

    if (msg.type === 'addEditorSelection') {
      const item = contextService.buildSelectionContext(vscode);
      if (!item) {
        vscode.window.showInformationMessage('No active editor selection to add as context.');
        return;
      }
      controller.addContextItem(item);
      postState();
    }

    if (msg.type === 'removeContext') {
      controller.removeContextItem(msg.contextId);
      postState();
    }

    if (msg.type === 'approveDiff') {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showWarningMessage('Open a workspace folder first.');
        return;
      }

      const diff = controller.getDiffForMessage(msg.messageId);
      if (!diff) {
        vscode.window.showWarningMessage('No draft diff found for this message.');
        return;
      }

      const result = applyUnifiedDiff(root, diff.diffText);
      controller.rejectDiff(msg.messageId);
      if (result.errors.length === 0) {
        controller.addDiffAppliedMessage(msg.messageId);
      }
      postState();
      if (result.errors.length > 0) {
        vscode.window.showWarningMessage(`Applied with errors: ${result.errors.join('; ')}`);
      } else {
        vscode.window.showInformationMessage(`Applied diff to: ${result.applied.join(', ') || 'no files'}`);
      }
    }

    if (msg.type === 'rejectDiff') {
      controller.rejectDiff(msg.messageId);
      postState();
    }
  };

  const viewProvider = {
    resolveWebviewView(webviewView) {
      view = webviewView;
      webviewView.webview.options = {
        enableScripts: true,
        retainContextWhenHidden: true
      };
      webviewView.webview.html = getWebviewHtml(webviewView.webview, context.extensionUri);
      webviewView.webview.onDidReceiveMessage(onMessage);
      webviewView.onDidDispose(() => {
        if (view === webviewView) {
          view = undefined;
        }
      });
      postState();
    }
  };

  const ensureAndOpen = async () => {
    const state = context.workspaceState.get(STATE_KEY);
    if (!state) {
      await context.workspaceState.update(STATE_KEY, createInitialState());
    }
    await vscode.commands.executeCommand('workbench.view.extension.codexOAuthChat');
    await vscode.commands.executeCommand('codexOAuthChat.sidebar.focus');
    await refreshAuthState();
    postState();
  };

  await refreshAuthState();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codexOAuthChat.sidebar', viewProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand('codexOAuthChat.open', ensureAndOpen),
    vscode.commands.registerCommand('codexOAuthChat.login', () => codex.triggerLoginInTerminal(vscode)),
    vscode.commands.registerCommand('codexOAuthChat.addEditorSelection', () => {
      const item = contextService.buildSelectionContext(vscode);
      if (!item) {
        vscode.window.showInformationMessage('No active editor selection to add as context.');
        return;
      }
      controller.addContextItem(item);
      postState();
      const active = getActiveTab(controller.snapshot());
      vscode.window.showInformationMessage(`Added selection context to ${active.title}.`);
    })
  );
}

export function deactivate() {
  return undefined;
}
