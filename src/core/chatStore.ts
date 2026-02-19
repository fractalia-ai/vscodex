import { randomUUID } from 'node:crypto';

export function createInitialState() {
  const id = randomUUID();
  return {
    activeTabId: id,
    isLoggedIn: undefined,
    tabs: [
      {
        id,
        title: 'Dialog 1',
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
      }
    ]
  };
}

export function ensureState(state) {
  if (!state || !state.tabs || state.tabs.length === 0) {
    return createInitialState();
  }
  if (!state.activeTabId || !state.tabs.find((t) => t.id === state.activeTabId)) {
    state.activeTabId = state.tabs[0].id;
  }
  if (!Object.prototype.hasOwnProperty.call(state, 'isLoggedIn')) {
    state.isLoggedIn = undefined;
  }
  return state;
}

export function createDialogTitle(index) {
  return `Dialog ${index + 1}`;
}

export function getActiveTab(state) {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) {
    return state.tabs[0];
  }
  return tab;
}
