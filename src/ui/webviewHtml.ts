export function getWebviewHtml(webview, extensionUri) {
  const scriptUri = webview.asWebviewUri({ ...extensionUri, path: `${extensionUri.path}/media/webview.js` });
  const styleUri = webview.asWebviewUri({ ...extensionUri, path: `${extensionUri.path}/media/webview.css` });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Codex OAuth Chat</title>
</head>
<body>
  <div id="app"></div>
  <script>
    window.__CODEx_STATE__ = ${JSON.stringify({})};
  </script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
}
