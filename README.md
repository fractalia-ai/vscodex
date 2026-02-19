# Codex OAuth Chat VSCode Extension

A VSCode extension that provides a multi-dialog chat interface powered by local `codex` CLI OAuth/session auth.

## Key Features

- OAuth/session auth only (`codex login`), no API keys.
- `Login with Codex` button and command triggers login in integrated terminal.
- Multi-dialog tabs with independent history/context per tab.
- Workspace persistence (`workspaceState`) across VSCode restarts.
- Streaming assistant output from `codex` stdout/stderr.
- Bubble chat UI with markdown rendering.
- Git-style diff detection and inline diff highlighting.
- Diff actions: `Approve` applies patch to workspace files, `Reject` discards draft patch.
- Per-active-tab stop button while command is running.
- Bottom blurred status bar:
  - Remaining Codex limit (or `Unknown`)
  - Tokens used for current command (or `N/A`)
- Context picker for project files + current editor selection (with file and line range).
- Context content is capped to 1024 chars with truncation indicator.

## Requirements

- Install and authenticate Codex CLI locally.
- From VSCode terminal: `codex login`

## Development

```bash
npm run build
npm run test
npm run lint
```

## Run Extension

1. Open this folder in VSCode.
2. Run `npm run build`.
3. Press `F5` to launch Extension Development Host.
4. Run command `Open Codex OAuth Chat`.
5. Click `Login with Codex` in the chat UI (runs `codex login` in integrated terminal).

## Notes on CLI

- This extension uses local `codex` CLI process streaming.
- Remaining limit and token usage are parsed from stream text if present.
- If CLI output does not include those fields, values remain `Unknown` / `N/A`.
