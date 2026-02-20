(() => {
  const vscode = acquireVsCodeApi();
  let state = { tabs: [], activeTabId: '', isLoggedIn: undefined };
  let renamingTabId = '';
  let renamingValue = '';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function escapeHtml(value) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderMarkdown(md) {
    const fencedBlocks = [];
    const withFencedPlaceholders = md.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const token = `@@CODEBLOCK_${fencedBlocks.length}@@`;
      fencedBlocks.push({
        lang: (lang || '').trim(),
        code: code || ''
      });
      return token;
    });

    const safe = escapeHtml(withFencedPlaceholders);
    const lines = safe.split('\n').map((line) => {
      if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
      return line;
    });

    let rendered = lines
      .join('\n')
      .replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, '<br/>');

    rendered = rendered.replace(/@@CODEBLOCK_(\d+)@@/g, (_, rawIndex) => {
      const block = fencedBlocks[Number(rawIndex)];
      if (!block) return '';

      const langClass = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : '';
      const code = escapeHtml(block.code.replace(/\n$/, ''));
      return `<pre class="md-code-block"><code${langClass}>${code}</code></pre>`;
    });

    return rendered;
  }

  function splitMessage(text) {
    const parts = [];
    const lines = text.split('\n');
    const markdown = [];
    let currentDiff = null;

    for (const line of lines) {
      if (line.startsWith('diff --git ')) {
        if (markdown.length > 0) {
          parts.push({ type: 'markdown', content: markdown.join('\n').trim() });
          markdown.length = 0;
        }
        if (currentDiff) parts.push({ type: 'diff', content: currentDiff.join('\n') });
        currentDiff = [line];
        continue;
      }
      if (currentDiff) currentDiff.push(line);
      else markdown.push(line);
    }

    if (currentDiff) parts.push({ type: 'diff', content: currentDiff.join('\n').trim() });
    if (markdown.length > 0) parts.push({ type: 'markdown', content: markdown.join('\n').trim() });

    return parts.filter((p) => p.content.length > 0);
  }

  function renderDiff(text) {
    const card = el('div', 'diff-card');
    card.appendChild(el('div', 'diff-title', 'Git Diff'));

    const pre = el('pre', 'diff-block');
    const lines = text.split('\n');
    for (const line of lines) {
      const div = el('div', 'diff-line');
      div.textContent = line;
      if (line.startsWith('+') && !line.startsWith('+++')) div.classList.add('add');
      else if (line.startsWith('-') && !line.startsWith('---')) div.classList.add('del');
      else if (line.startsWith('@@')) div.classList.add('meta');
      else if (line.startsWith('diff --git')) div.classList.add('file');
      pre.appendChild(div);
    }
    card.appendChild(pre);
    return card;
  }

  function renderCommand(text) {
    const card = el('div', 'command-card');
    card.appendChild(el('div', 'command-title', 'Command Execution'));
    const pre = el('pre', 'command-block');
    pre.textContent = text;
    card.appendChild(pre);
    return card;
  }

  function activeTab() {
    return state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
  }

  function extensionFromSource(source) {
    const normalized = String(source || '').split(/[\\/]/).pop() || '';
    const lastDot = normalized.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === normalized.length - 1) return '';
    return normalized.slice(lastDot + 1).toLowerCase();
  }

  function fileIconMeta(source) {
    const ext = extensionFromSource(source);
    const byExt = {
      ts: { label: 'TS', color: '#3c85d9' },
      tsx: { label: 'TS', color: '#3c85d9' },
      js: { label: 'JS', color: '#d8b548' },
      jsx: { label: 'JS', color: '#d8b548' },
      py: { label: 'PY', color: '#5aa8ff' },
      md: { label: 'MD', color: '#59c18a' },
      json: { label: '{}', color: '#dca85f' },
      yml: { label: 'YML', color: '#d27676' },
      yaml: { label: 'YML', color: '#d27676' },
      css: { label: 'CSS', color: '#6ea8ff' },
      scss: { label: 'SC', color: '#d27ab0' },
      html: { label: 'HT', color: '#e08d66' },
      sql: { label: 'SQL', color: '#8b8bf0' }
    };
    return byExt[ext] || { label: ext ? ext.slice(0, 3).toUpperCase() : 'TXT', color: '#8f97ab' };
  }

  function renderContextBadgeIcon(source) {
    const meta = fileIconMeta(source);
    const icon = el('span', 'badge-file-icon');
    icon.style.setProperty('--badge-file-accent', meta.color);
    icon.title = source || 'file';

    const fold = el('span', 'badge-file-fold');
    const label = el('span', 'badge-file-label', meta.label);
    icon.append(fold, label);
    return icon;
  }

  function shouldShowLoginButton() {
    return state.isLoggedIn === false;
  }

  function beginTabRename(tabId, title) {
    renamingTabId = tabId;
    renamingValue = title;
    render();
  }

  function cancelTabRename() {
    renamingTabId = '';
    renamingValue = '';
    render();
  }

  function commitTabRename(tabId, rawTitle) {
    const title = String(rawTitle || '').trim();
    renamingTabId = '';
    renamingValue = '';
    if (title) {
      vscode.postMessage({ type: 'renameTab', tabId, title });
    }
    render();
  }

  function sendMessage(input) {
    const value = input.value.trim();
    if (!value) return;
    vscode.postMessage({ type: 'send', input: value });
    input.value = '';
  }

  function render() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    const panel = el('div', 'panel');

    const header = el('div', 'header');
    const title = el('div', 'title', 'Codex OAuth Chat');
    const actions = el('div', 'header-actions');

    if (shouldShowLoginButton()) {
      const loginBtn = el('button', 'btn btn-primary', 'Login');
      loginBtn.onclick = () => vscode.postMessage({ type: 'login' });
      actions.appendChild(loginBtn);
    }

    const addTabBtn = el('button', 'btn', '+ New Dialog');
    addTabBtn.onclick = () => vscode.postMessage({ type: 'newTab' });
    actions.appendChild(addTabBtn);
    header.append(title, actions);

    const tabs = el('div', 'tabs');
    for (const tab of state.tabs) {
      const tabItem = el('div', `tab ${tab.id === state.activeTabId ? 'active' : ''}`);
      if (renamingTabId === tab.id) {
        const renameInput = el('input', 'tab-rename-input');
        renameInput.type = 'text';
        renameInput.value = renamingValue || tab.title;
        renameInput.oninput = (event) => {
          renamingValue = event.target.value;
        };
        renameInput.onkeydown = (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitTabRename(tab.id, renameInput.value);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            cancelTabRename();
          }
        };
        renameInput.onblur = () => commitTabRename(tab.id, renameInput.value);
        tabItem.append(renameInput);
        setTimeout(() => {
          renameInput.focus();
          renameInput.select();
        }, 0);
      } else {
        const tabLabel = el('button', 'tab-label', tab.title);
        tabLabel.onclick = () => {
          if (tab.id !== state.activeTabId) {
            vscode.postMessage({ type: 'switchTab', tabId: tab.id });
          }
        };
        tabLabel.ondblclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          beginTabRename(tab.id, tab.title);
        };

        const closeBtn = el('button', 'tab-close', 'x');
        closeBtn.title = `Delete ${tab.title}`;
        closeBtn.onclick = (event) => {
          event.stopPropagation();
          vscode.postMessage({ type: 'requestDeleteTab', tabId: tab.id });
        };

        tabItem.append(tabLabel, closeBtn);
      }
      tabs.appendChild(tabItem);
    }

    const body = el('div', 'body');
    const current = activeTab();

    const messages = el('div', 'messages');
    if (current) {
      for (const msg of current.history) {
        const bubble = el('div', `bubble ${msg.role === 'user' ? 'user' : 'assistant'}`);
        const pendingCommands = (current?.pendingCommands || []).filter((cmd) => cmd.messageId === msg.id);
        const content = msg.content.trim();

        if (msg.role === 'assistant' && !content && msg.isStreaming && pendingCommands.length === 0) {
          bubble.appendChild(el('div', 'streaming-dot', 'Thinking...'));
          messages.appendChild(bubble);
          continue;
        }

        if (msg.role === 'assistant' && !content && !msg.isStreaming && pendingCommands.length === 0) {
          bubble.appendChild(el('div', 'streaming-dot', 'No response from Codex'));
          messages.appendChild(bubble);
          continue;
        }

        const parts = msg.role === 'assistant' ? splitMessage(content) : [{ type: 'markdown', content }];
        const hasDraftDiff = (current?.draftDiffs || []).some((d) => d.messageId === msg.id);

        for (const part of parts) {
          if (!part.content) continue;
          if (part.type === 'markdown') {
            const md = el('div', 'markdown');
            md.innerHTML = renderMarkdown(part.content);
            bubble.appendChild(md);
          } else {
            bubble.appendChild(renderDiff(part.content));
            if (hasDraftDiff) {
              const controls = el('div', 'diff-controls');
              const approve = el('button', 'btn btn-approve', 'Approve');
              const reject = el('button', 'btn btn-reject', 'Reject');
              approve.onclick = () => vscode.postMessage({ type: 'approveDiff', messageId: msg.id });
              reject.onclick = () => vscode.postMessage({ type: 'rejectDiff', messageId: msg.id });
              controls.append(approve, reject);
              bubble.appendChild(controls);
            }
          }
        }

        if (msg.role === 'assistant') {
          for (const pending of pendingCommands) {
            bubble.appendChild(renderCommand(pending.command));
            const controls = el('div', 'diff-controls');
            const execute = el('button', 'btn btn-execute', 'Execute');
            const cancel = el('button', 'btn btn-cancel', 'Cancel');
            execute.onclick = () => vscode.postMessage({ type: 'executeCommand', commandId: pending.id });
            cancel.onclick = () => vscode.postMessage({ type: 'cancelCommand', commandId: pending.id });
            controls.append(execute, cancel);
            bubble.appendChild(controls);
          }
        }

        if (bubble.childElementCount > 0) messages.appendChild(bubble);
      }
    }

    const commandBar = el('div', 'command-bar');
    const metrics = el('div', 'status-metrics');
    metrics.appendChild(el('div', 'status-metric', `↑ ${current?.inputTokens ?? 0}`));
    metrics.appendChild(el('div', 'status-metric', `↓ ${current?.outputTokens ?? 0}`));
    commandBar.appendChild(metrics);

    if (current?.running) {
      const stopBtn = el('button', 'btn btn-stop', 'Stop');
      stopBtn.onclick = () => vscode.postMessage({ type: 'stop' });
      commandBar.appendChild(stopBtn);
    }

    const contextBar = el('div', 'context-bar');
    const pickFiles = el('button', 'btn btn-ghost', '+ Context');
    pickFiles.onclick = () => vscode.postMessage({ type: 'pickContextFiles' });
    contextBar.append(pickFiles);

    const badges = el('div', 'badges');
    for (const item of current?.contextItems || []) {
      const badge = el('div', 'badge');
      const label = `${item.source}${item.range ? ':' + item.range : ''}`;
      badge.appendChild(renderContextBadgeIcon(item.source));
      badge.appendChild(el('span', 'badge-text', label));
      const remove = el('button', 'badge-remove', 'x');
      remove.onclick = () => vscode.postMessage({ type: 'removeContext', contextId: item.id });
      badge.appendChild(remove);
      badges.appendChild(badge);
    }

    const composer = el('div', 'composer');
    const input = el('textarea', 'input');
    input.placeholder = 'Ask Codex... (Cmd+Enter to send)';
    input.onkeydown = (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        sendMessage(input);
      }
    };

    const send = el('button', 'btn btn-primary send-btn', 'Send');
    send.onclick = () => sendMessage(input);

    composer.append(input, send);

    const footer = el('div', 'footer', 'Codex OAuth Chat');

    body.append(messages, commandBar, contextBar, badges, composer);
    panel.append(header, tabs, body, footer);
    app.append(panel);

    messages.scrollTop = messages.scrollHeight;
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'state') {
      state = event.data.payload;
      render();
    }
  });

  vscode.postMessage({ type: 'init' });
})();
