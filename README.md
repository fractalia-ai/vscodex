# Codex OAuth Chat

A VS Code extension that gives you a clean chat UI backed by local `codex` CLI authentication (`codex login`) — no API key wiring.

## Highlights

- OAuth/session auth via local Codex CLI
- Multi-chat dialogs with independent history/context
- Streaming assistant output from CLI
- Markdown chat rendering
- Diff detection with inline preview
- One-click **Approve** / **Reject** for generated patches
- Per-tab stop/cancel while a command is running
- Context tools:
  - Add files from workspace
  - Add current editor selection (with file + line range)
- Session persistence across VS Code restarts

## Requirements

- VS Code `^1.90.0`
- Installed `codex` CLI in your shell `PATH`
- Authorized local session:

```bash
codex login
```

## Installation (from source)

1. Clone this repository
2. Install dependencies
3. Build extension
4. Launch Extension Development Host

```bash
npm install
npm run build
```

Then press `F5` in VS Code.

## Commands

- `Focus Codex OAuth Chat`
- `Login with Codex`
- `Codex Chat: Add Editor Selection as Context`

## How patch approval works

When Codex returns a patch-like response, the extension parses file changes and shows an inline diff preview.

- **Approve**: applies patch to workspace files
- **Reject**: discards generated patch draft

## Development

```bash
npm run build
npm run lint
npm run test
```

## Project structure

- `src/` — extension source
- `media/` — webview assets
- `tests/` — test suite
- `scripts/` — build/lint scripts

## Privacy & security notes

- The extension uses your locally authenticated Codex CLI session.
- No API key is required by this extension.
- Context snippets can include file content and selections you explicitly add.

## Roadmap

- Better token/limit telemetry
- Improved patch parser for edge diff formats
- Optional repo-level context presets

## License

MIT
