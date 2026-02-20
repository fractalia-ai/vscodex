import { spawn } from 'node:child_process';

export function buildExecArgs(prompt, workspaceRoot) {
  const args = ['exec', '--skip-git-repo-check', '--json', '--sandbox', 'read-only'];
  if (workspaceRoot) {
    args.push('-C', workspaceRoot);
  }
  args.push(prompt);
  return args;
}

function stripAnsi(input) {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

function parseJsonLoose(line) {
  const cleaned = stripAnsi(line).trim();
  if (!cleaned) return undefined;

  const candidates = [cleaned];
  if (cleaned.startsWith('data:')) {
    candidates.push(cleaned.slice(5).trim());
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue with the next candidate.
    }
  }
  return undefined;
}

function textFromAny(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => textFromAny(item)).filter(Boolean).join('');
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string' && value.text) return value.text;
    if (typeof value.output_text === 'string' && value.output_text) return value.output_text;
    if (typeof value.delta === 'string' && value.delta) return value.delta;
    if (value.content) return textFromAny(value.content);
  }
  return '';
}

function textFromContentPart(part) {
  if (!part) return '';
  if (typeof part.text === 'string' && part.text) return part.text;
  if (typeof part.output_text === 'string' && part.output_text) return part.output_text;
  return '';
}

function extractAssistantFinalText(event, type) {
  if (type.includes('output_text.done') && typeof event?.text === 'string') {
    return event.text;
  }

  if (event?.part?.type === 'output_text') {
    return textFromContentPart(event.part);
  }

  const item = event?.item;
  if (item?.role === 'assistant' && Array.isArray(item.content)) {
    return item.content
      .map((part) => textFromContentPart(part))
      .filter(Boolean)
      .join('');
  }

  if (event?.response?.output_text && typeof event.response.output_text === 'string') {
    return event.response.output_text;
  }

  if (Array.isArray(event?.response?.output)) {
    return event.response.output
      .filter((item) => item?.role === 'assistant')
      .map((item) => textFromAny(item.content))
      .filter(Boolean)
      .join('');
  }

  if (event?.message?.role === 'assistant') {
    return textFromAny(event.message.content);
  }

  return '';
}

function extractCommandRequest(event, type) {
  if (type !== 'item.started') return undefined;
  const itemType = typeof event?.item?.type === 'string' ? event.item.type.toLowerCase() : '';
  if (itemType !== 'command_execution') return undefined;
  const command = typeof event?.item?.command === 'string' ? event.item.command.trim() : '';
  if (!command) return undefined;
  const id = typeof event?.item?.id === 'string' ? event.item.id : undefined;
  return { id, command };
}

export function parseJsonEventLine(line) {
  const event = parseJsonLoose(line);
  if (!event) {
    return {
      isJson: false,
      textDelta: '',
      finalText: '',
      tokensUsed: undefined,
      inputTokens: undefined,
      outputTokens: undefined,
      commandRequest: undefined,
      error: undefined
    };
  }

  const type = typeof event?.type === 'string' ? event.type.toLowerCase() : '';

  let textDelta = '';
  if (type === 'item.completed') {
    const itemType = typeof event?.item?.type === 'string' ? event.item.type.toLowerCase() : '';
    if (itemType === 'agent_message' || itemType === 'assistant_message') {
      textDelta = textFromAny(event.item.text || event.item.content);
    }
  }

  if (type === 'response.output_text.delta') {
    if (typeof event.delta === 'string') {
      textDelta = event.delta;
    } else {
      textDelta = textFromAny(event.delta);
    }
  } else if (type.endsWith('.delta') && typeof event.delta === 'string') {
    const role = typeof event.role === 'string' ? event.role.toLowerCase() : '';
    if (role === 'assistant' || type.includes('assistant') || type.includes('output_text')) {
      textDelta = event.delta;
    }
  } else if (type.endsWith('.delta') && event.delta) {
    const role = typeof event.role === 'string' ? event.role.toLowerCase() : '';
    if (role === 'assistant' || type.includes('assistant') || type.includes('output_text')) {
      textDelta = textFromAny(event.delta);
    }
  }

  const finalText = extractAssistantFinalText(event, type);
  const commandRequest = extractCommandRequest(event, type);

  let tokensUsed;
  let inputTokens;
  let outputTokens;
  const usage = event?.usage ?? event?.response?.usage;
  if (usage) {
    if (typeof usage.input_tokens === 'number') {
      inputTokens = usage.input_tokens;
    }
    if (typeof usage.output_tokens === 'number') {
      outputTokens = usage.output_tokens;
    }

    if (typeof usage.total_tokens === 'number') {
      tokensUsed = usage.total_tokens;
    } else if (typeof usage.input_tokens === 'number' || typeof usage.output_tokens === 'number') {
      tokensUsed = (usage.input_tokens || 0) + (usage.output_tokens || 0);
    }
  }

  let error;
  if (type === 'error' && typeof event.message === 'string') {
    error = event.message;
  } else if (type.includes('failed') && typeof event?.error?.message === 'string') {
    error = event.error.message;
  }

  return { isJson: true, textDelta, finalText, tokensUsed, inputTokens, outputTokens, commandRequest, error };
}

function collectOutput(child, onDone) {
  let output = '';
  const append = (chunk) => {
    output += chunk.toString('utf8');
  };

  child.stdout?.on('data', append);
  child.stderr?.on('data', append);

  child.on('close', (code) => {
    onDone(code, output.trim());
  });

  child.on('error', () => {
    onDone(1, output.trim());
  });
}

export class CodexCliService {
  sessions = new Map();

  triggerLoginInTerminal(vscode) {
    const terminal = vscode.window.createTerminal({ name: 'Codex Login' });
    terminal.show(true);
    terminal.sendText('codex login');
  }

  async isLoggedIn() {
    return await new Promise((resolve) => {
      const child = spawn('codex', ['login', 'status'], { stdio: ['ignore', 'pipe', 'pipe'] });

      collectOutput(child, (code, text) => {
        if (code !== 0) {
          resolve(false);
          return;
        }

        const normalized = text.toLowerCase();
        const loggedIn = normalized.includes('logged in') && !normalized.includes('not logged in');
        resolve(loggedIn);
      });
    });
  }

  startSession(tabId, prompt, callbacks, options = {}) {
    if (this.sessions.has(tabId)) return false;

    const workspaceRoot = options.workspaceRoot;
    const child = spawn('codex', buildExecArgs(prompt, workspaceRoot), {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: workspaceRoot || process.cwd()
    });
    const session = { id: tabId, process: child, callbacks };
    this.sessions.set(tabId, session);

    let settled = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let stderrText = '';
    let plainStdoutText = '';
    const jsonErrors = [];
    const seenCommandRequests = new Set();
    let commandApprovalPending = false;
    let streamedTextSeen = false;
    let finalTextEmitted = false;
    let jsonEventSeen = false;

    const settleDone = () => {
      if (settled) return;
      settled = true;
      this.sessions.delete(tabId);
      callbacks.onDone();
    };

    const settleError = (message) => {
      if (settled) return;
      settled = true;
      this.sessions.delete(tabId);
      callbacks.onError(message);
    };

    const processLine = (line, fromStderr) => {
      const parsed = parseJsonEventLine(line);
      if (!parsed.isJson) {
        if (fromStderr) {
          stderrText += `${line}\n`;
        } else {
          plainStdoutText += `${line}\n`;
        }
        return;
      }

      jsonEventSeen = true;

      if (parsed.commandRequest) {
        const requestId = parsed.commandRequest.id || `cmd-${tabId}-${seenCommandRequests.size + 1}`;
        const dedupeKey = `${requestId}:${parsed.commandRequest.command}`;
        if (!seenCommandRequests.has(dedupeKey)) {
          seenCommandRequests.add(dedupeKey);
          callbacks.onCommandRequest?.({
            id: requestId,
            command: parsed.commandRequest.command
          });
          if (!commandApprovalPending) {
            commandApprovalPending = true;
            // Stop current codex turn immediately so the command is not auto-executed
            // and no additional command output is streamed into the assistant bubble.
            child.kill('SIGINT');
          }
        }
      }

      if (commandApprovalPending) {
        return;
      }

      if (parsed.textDelta) {
        streamedTextSeen = true;
        callbacks.onChunk(parsed.textDelta);
      }
      if (parsed.finalText && !streamedTextSeen && !finalTextEmitted) {
        finalTextEmitted = true;
        callbacks.onChunk(parsed.finalText);
      }
      if (parsed.tokensUsed !== undefined) {
        callbacks.onTokenUsage({
          tokensUsed: parsed.tokensUsed,
          inputTokens: parsed.inputTokens,
          outputTokens: parsed.outputTokens
        });
      }
      if (parsed.error) {
        jsonErrors.push(parsed.error);
      }
    };

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      let newlineIndex = stdoutBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const rawLine = stdoutBuffer.slice(0, newlineIndex).trimEnd();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (rawLine.trim()) processLine(rawLine, false);
        newlineIndex = stdoutBuffer.indexOf('\n');
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString('utf8');
      let newlineIndex = stderrBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const rawLine = stderrBuffer.slice(0, newlineIndex).trimEnd();
        stderrBuffer = stderrBuffer.slice(newlineIndex + 1);
        if (rawLine.trim()) processLine(rawLine, true);
        newlineIndex = stderrBuffer.indexOf('\n');
      }
    });

    child.on('close', (code, signal) => {
      const stdoutTail = stdoutBuffer.trim();
      if (stdoutTail) processLine(stdoutTail, false);
      const stderrTail = stderrBuffer.trim();
      if (stderrTail) processLine(stderrTail, true);

      if (!jsonEventSeen && !streamedTextSeen && !finalTextEmitted) {
        const plain = plainStdoutText.trim();
        if (plain) {
          callbacks.onChunk(plain);
        }
      }

      if (code === 0 || signal === 'SIGINT') {
        settleDone();
      } else {
        const err = (jsonErrors.join('\n') || stderrText).trim();
        settleError(err ? err : `codex exited with code ${code ?? 'unknown'}`);
      }
    });

    child.on('error', (err) => {
      settleError(err.message);
    });

    return true;
  }

  stop(tabId) {
    const session = this.sessions.get(tabId);
    if (!session) return;
    session.process.kill('SIGINT');
  }

  async executeApprovedCommand(command, options = {}) {
    const workspaceRoot = options.workspaceRoot;
    const shell = process.env.SHELL || '/bin/zsh';

    return await new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const child = spawn(shell, ['-lc', command], {
        cwd: workspaceRoot || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });

      child.on('close', (code) => {
        resolve({
          exitCode: typeof code === 'number' ? code : 1,
          stdout,
          stderr
        });
      });

      child.on('error', (err) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: `${stderr}\n${err.message}`.trim()
        });
      });
    });
  }
}
