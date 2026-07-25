function layout(title, body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}  Latch</title>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <style>
    :root { --bg: #0a0e13; --panel: #0e141b; --rule: #1b2530; --text: #cdd6df; --dim: #5c6875; --green: #3fb950; --green-dk: #2ea043; --red: #f85149; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace;
      background: var(--bg); color: var(--text);
      display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0;
    }
    main { max-width: 380px; width: 100%; padding: 2rem; }
    h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 0.4rem; }
    h1::before { content: "▪ "; color: var(--green-dk); }
    p.sub { color: var(--dim); margin: 0 0 1.5rem; font-size: 0.9rem; line-height: 1.5; }
    input {
      width: 100%; box-sizing: border-box; padding: 0.7rem; font: inherit; font-size: 1.1rem;
      letter-spacing: 0.1em; text-align: center; border: 1px solid var(--rule);
      background: var(--panel); color: var(--text);
    }
    input:focus { outline: none; border-color: var(--dim); }
    button {
      margin-top: 0.6rem; width: 100%; padding: 0.7rem; border: 1px solid rgba(63,185,80,0.4);
      background: transparent; color: var(--green); font: inherit; font-size: 1rem; cursor: pointer;
    }
    button:hover { background: rgba(63,185,80,0.12); border-color: var(--green); }
    .error { color: var(--red); margin-top: 0.75rem; font-size: 0.9rem; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

function pairPage() {
  return layout('Pair this browser', `
    <h1>latch</h1>
    <p class="sub">Enter the one-time code shown on the server (re-SSH in if you have misplaced the code)</p>
    <form id="f">
      <input name="code" id="code" placeholder="XXXX-XXXX" autofocus autocomplete="off" />
      <button type="submit" id="btn">Pair</button>
    </form>
    <p class="error" id="err" style="display:none"></p>
    <script>
      const params = new URLSearchParams(location.search);
      const pre = params.get('code');
      if (pre) document.getElementById('code').value = pre.toUpperCase();

      async function submit(code) {
        const btn = document.getElementById('btn');
        const err = document.getElementById('err');
        err.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Pairing…';
        try {
          const res = await fetch('/api/pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Pairing failed');
          }
          location.href = '/';
        } catch (e) {
          err.textContent = e.message;
          err.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Pair';
        }
      }

      document.getElementById('f').addEventListener('submit', (e) => {
        e.preventDefault();
        submit(document.getElementById('code').value.trim().toUpperCase());
      });

      if (pre) submit(pre.toUpperCase());
    </script>
  `);
}

module.exports = { pairPage };
