export type Role = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  isStreaming?: boolean;
}

export interface ContextItem {
  id: string;
  kind: 'file' | 'selection';
  label: string;
  icon: string;
  source: string;
  range?: string;
  content: string;
  truncated: boolean;
}

export interface DiffDraft {
  messageId: string;
  diffText: string;
  createdAt: number;
}

export interface DialogTab {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  history: ChatMessage[];
  contextItems: ContextItem[];
  running: boolean;
  inputTokens?: number;
  outputTokens?: number;
  tokensUsed?: number;
  remainingLimit?: string;
  draftDiffs: DiffDraft[];
}

export interface PersistedState {
  tabs: DialogTab[];
  activeTabId: string;
  isLoggedIn?: boolean;
}
