<p align="center">
  <img src="assets/logo-512.png" alt="Codex OAuth Chat Logo" width="160" />
</p>

<h1 align="center">Codex OAuth Chat</h1>

<p align="center">
  VS Code extension for Codex CLI OAuth chat with streaming responses, context controls, and patch approve/reject workflow.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-4da3ff" />
  <img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-%5E1.90.0-007ACC" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e" />
</p>

---

## ✨ Features

- OAuth/session auth via local `codex login` (no API key in extension settings)
- Multi-dialog chat tabs with independent state/history
- Streaming assistant output in webview
- Markdown rendering for responses
- Diff detection + inline preview
- One-click **Approve** / **Reject** patch flow
- Per-tab stop/cancel while command is running
- Context tools:
  - add workspace files
  - add current editor selection with file + line ranges
- Persistent chat state across VS Code restarts

## 📋 Requirements

- VS Code `^1.90.0`
- `codex` CLI installed and available in `PATH`
- Authenticated Codex session:

```bash
codex login
```

## 🚀 Local run (from source)

```bash
git clone https://github.com/fractalia-ai/codex-oauth.git
cd codex-oauth
npm install
npm run build
```

Then press `F5` in VS Code to start Extension Development Host.

## 🧩 Commands

- `Focus Codex OAuth Chat`
- `Login with Codex`
- `Codex Chat: Add Editor Selection as Context`

## 🛠 Development

```bash
npm run build
npm run lint
npm run test
```

## 🔐 Privacy & Security

- Uses your local authenticated Codex CLI session.
- No direct API key entry required in the extension.
- Context is included only when explicitly added by user action.

## 🗂 Assets

- Main logo: `assets/logo-1024.png`
- Extension icon: `assets/logo-512.png`
- Small icon: `assets/logo-256.png`
- Favicon: `assets/favicon.ico`

## 📄 License

MIT
