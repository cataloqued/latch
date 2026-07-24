// All user-visible copy for the v0 backend lives in this file so it's easy
// to find and rewrite in one place before the real frontend replaces it.

function layout(title, body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Latch</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
    main { max-width: 420px; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    p.sub { color: #94a3b8; margin-top: 0; }
    input { width: 100%; box-sizing: border-box; padding: 0.6rem; font-size: 1.1rem; letter-spacing: 0.1em; text-align: center; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; }
    button { margin-top: 0.75rem; width: 100%; padding: 0.6rem; border-radius: 6px; border: none; background: #2563eb; color: white; font-size: 1rem; cursor: pointer; }
    .error { color: #f87171; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

function pairPage({ error } = {}) {
  return layout('Pair this browser', `
    <h1>Pair this browser</h1>
    <p class="sub">Enter the one-time code shown on the server (SSH into the box to see it again).</p>
    <form method="post" action="/api/pair">
      <input name="code" placeholder="XXXX-XXXX" autofocus autocomplete="off" />
      <button type="submit">Pair</button>
    </form>
    ${error ? `<p class="error">${error}</p>` : ''}
  `);
}

function panelStub() {
  return layout('Panel', `
    <h1>You're paired.</h1>
    <p class="sub">The dashboard isn't built yet — this backend only exposes the API for now. Check back once the frontend lands.</p>
  `);
}

module.exports = { pairPage, panelStub };
