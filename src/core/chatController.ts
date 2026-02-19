import { randomUUID } from 'node:crypto';
import { createDialogTitle, ensureState, getActiveTab } from './chatStore.js';
import { extractDiffBlocks } from './diff.js';

function createTab(index) {
  return {
    id: randomUUID(),
    title: createDialogTitle(index),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    history: [],
    contextItems: [],
    running: false,
    inputTokens: undefined,
    outputTokens: undefined,
    tokensUsed: undefined,
    remainingLimit: 'Unknown',
    draftDiffs: []
  };
}

function detectLanguage(text) {
  if (!text) return 'en';
  if (/[А-Яа-яЁё]/.test(text)) return 'ru';
  return 'en';
}

function appliedMessageByLanguage(language) {
  if (language === 'ru') return 'Изменения применены.';
  return 'Changes applied.';
}

export class ChatController {
  constructor(state, persist, codexService) {
    this.state = ensureState(state);
    this.persist = persist;
    this.codexService = codexService;
  }

  snapshot() {
    return this.state;
  }

  setLoginStatus(isLoggedIn) {
    this.state.isLoggedIn = isLoggedIn;
    this.persist(this.state);
  }

  addTab() {
    const tab = createTab(this.state.tabs.length);
    this.state.tabs.push(tab);
    this.state.activeTabId = tab.id;
    this.persist(this.state);
    return tab;
  }

  switchTab(tabId) {
    if (!this.state.tabs.find((t) => t.id === tabId)) return false;
    if (this.state.activeTabId === tabId) return false;

    this.state.activeTabId = tabId;
    this.persist(this.state);
    return true;
  }

  renameTab(tabId, title) {
    const tab = this.state.tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    const nextTitle = String(title || '').trim();
    if (!nextTitle) return false;

    tab.title = nextTitle.slice(0, 80);
    tab.updatedAt = Date.now();
    this.persist(this.state);
    return true;
  }

  deleteTab(tabId) {
    const idx = this.state.tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return false;

    const [removed] = this.state.tabs.splice(idx, 1);
    if (removed?.running) {
      this.codexService.stop(removed.id);
    }

    if (this.state.tabs.length === 0) {
      const tab = createTab(0);
      this.state.tabs.push(tab);
      this.state.activeTabId = tab.id;
      this.persist(this.state);
      return true;
    }

    if (this.state.activeTabId === tabId) {
      const fallback = this.state.tabs[Math.min(idx, this.state.tabs.length - 1)];
      this.state.activeTabId = fallback.id;
    } else if (!this.state.tabs.find((t) => t.id === this.state.activeTabId)) {
      this.state.activeTabId = this.state.tabs[0].id;
    }

    this.persist(this.state);
    return true;
  }

  addContextItem(item) {
    const tab = getActiveTab(this.state);
    tab.contextItems.push(item);
    tab.updatedAt = Date.now();
    this.persist(this.state);
  }

  removeContextItem(itemId) {
    const tab = getActiveTab(this.state);
    tab.contextItems = tab.contextItems.filter((c) => c.id !== itemId);
    tab.updatedAt = Date.now();
    this.persist(this.state);
  }

  async sendUserMessage(input, options = {}) {
    const tab = getActiveTab(this.state);
    if (tab.running) return null;

    const userMsg = { id: randomUUID(), role: 'user', content: input, createdAt: Date.now() };
    tab.history.push(userMsg);

    const request = this.composeRequest(tab, options);

    const assistantMsg = {
      id: randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      isStreaming: true
    };

    tab.history.push(assistantMsg);
    tab.running = true;
    tab.updatedAt = Date.now();
    this.persist(this.state);

    const started = this.codexService.startSession(tab.id, request, {
      onChunk: (chunk) => {
        assistantMsg.content += chunk;
        tab.updatedAt = Date.now();
        this.persist(this.state);
      },
      onTokenUsage: (usage) => {
        tab.tokensUsed = usage.tokensUsed;
        tab.inputTokens = usage.inputTokens;
        tab.outputTokens = usage.outputTokens;
        this.persist(this.state);
      },
      onDone: () => {
        tab.running = false;
        assistantMsg.isStreaming = false;
        this.captureDiffDrafts(tab, assistantMsg.id, assistantMsg.content);
        this.persist(this.state);
      },
      onError: (err) => {
        tab.running = false;
        assistantMsg.isStreaming = false;
        assistantMsg.content += `\n\n[Codex CLI error] ${err}`;
        this.persist(this.state);
      }
    }, options);

    if (!started) {
      tab.running = false;
      assistantMsg.isStreaming = false;
      assistantMsg.content += '\n\n[Codex CLI already running for this tab]';
      this.persist(this.state);
      return { userMsg, assistantMsg, request };
    }

    return { userMsg, assistantMsg, request };
  }

  stopActive() {
    const tab = getActiveTab(this.state);
    this.codexService.stop(tab.id);
    tab.running = false;
    const last = tab.history[tab.history.length - 1];
    if (last && last.role === 'assistant') last.isStreaming = false;
    this.persist(this.state);
  }

  composeRequest(tab, options = {}) {
    const historyBlock = tab.history.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n');
    const contextBlock = tab.contextItems
      .map((c) => `- ${c.source}${c.range ? `:${c.range}` : ''}\n${c.content}`)
      .join('\n\n');
    const workspaceBlock = options.workspaceRoot
      ? `WORKSPACE_ROOT:\n${options.workspaceRoot}\n\n`
      : '';
    const contextGuidance = contextBlock
      ? 'Use CONTEXT snippets as the primary source. Do not browse files outside WORKSPACE_ROOT.'
      : 'No explicit CONTEXT snippets provided. Stay inside WORKSPACE_ROOT if you need to inspect files.';
    const patchRules =
      'Do not apply edits directly. Never modify files or run write commands. Return proposed file changes only as git unified diff blocks starting with "diff --git".';

    return `Follow the rules strictly.\n${workspaceBlock}${contextGuidance}\n${patchRules}\n\nHISTORY:\n${historyBlock}\n\nCONTEXT:\n${contextBlock}\n\nASSISTANT:`;
  }

  captureDiffDrafts(tab, messageId, content) {
    const diffs = extractDiffBlocks(content);
    tab.draftDiffs = tab.draftDiffs.filter((d) => d.messageId !== messageId);
    for (const diffText of diffs) {
      tab.draftDiffs.push({ messageId, diffText, createdAt: Date.now() });
    }
  }

  rejectDiff(messageId) {
    const tab = getActiveTab(this.state);
    tab.draftDiffs = tab.draftDiffs.filter((d) => d.messageId !== messageId);
    this.persist(this.state);
  }

  getDiffForMessage(messageId) {
    const tab = getActiveTab(this.state);
    return tab.draftDiffs.find((d) => d.messageId === messageId);
  }

  addDiffAppliedMessage(messageId) {
    const tab = getActiveTab(this.state);
    const assistantIdx = tab.history.findIndex((m) => m.id === messageId);
    let language = 'en';

    if (assistantIdx > 0) {
      for (let i = assistantIdx - 1; i >= 0; i -= 1) {
        if (tab.history[i].role === 'user') {
          language = detectLanguage(tab.history[i].content);
          break;
        }
      }
    }

    tab.history.push({
      id: randomUUID(),
      role: 'assistant',
      content: appliedMessageByLanguage(language),
      createdAt: Date.now()
    });
    tab.updatedAt = Date.now();
    this.persist(this.state);
  }
}
