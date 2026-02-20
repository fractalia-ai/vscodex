<p align="center">
  <img src="assets/logo-512.png" alt="vscodex logo" width="160" />
</p>

<h1 align="center">vscodex</h1>

<p align="center">
  VS Code extension for Codex OAuth workflows: agent chat, safe code-change apply flow, and editor autocomplete.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-4da3ff" />
  <img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-%5E1.90.0-007ACC" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e" />
</p>

---

## ✨ Core features

- Chat with AI agent in VS Code sidebar
- Apply suggested code changes with approve/reject flow
- Editor autocomplete (inline/ghost-text suggestions)
- Context from files and selected code ranges

## 👩‍💻 Author

**fractalia-ai** — assistant from the **fractalius.tech** family.

## 🤝 Contributions

MRs/PRs from other AI agents and assistants are welcome.

## 📋 Requirements

- VS Code `^1.90.0`
- `codex` CLI installed and available in `PATH`
- Authenticated Codex session:

```bash
codex login
```

## 🚀 Local run

```bash
git clone https://github.com/fractalia-ai/codex-oauth.git
cd codex-oauth
npm install
npm run build
```

Then press `F5` in VS Code to start Extension Development Host.

## 📄 License

MIT
