# Latch

**Latch is a self-hosted panel to view and manage your instances across systems.**

Latch is like an SSH key for your browser. Install it on a VPS, open the dashboard, and remotely monitor, restart, stop, or reconfigure your processes without touching the command line. No third-party service in the middle.

```bash
npm i -g latchup      # installs the `latch` command
latch up             # starts the panel over TLS + prints the connection link
```

Open the link, enter the one-time code, and you browser is paired. It's as simple as that.

---

## Why

Existing tools force users into a trap. Latch does everything, better.

- **PM2** is great but single-host, Node only and is CLI only.
- **Portainer / Coolify / Dokploy** are heavyweight — full PaaS platforms when all you wanted was to see and edit your processes.
- **pm2.io** is paid whilst seeing all of your data.

Latch is the missing middle: **lightweight, multi-VPS, runtime-agnostic** (Node, Python, or any binary), and **fully self-hosted**.

## How it works

Latch's root of trust is simple and one you already rely on

> **If you can SSH in, you can control it with Latch. If you can't, you can't.**

- **Self-hosted by design.** The panel is up *by Latch on your own box* — your browser talks to your machine, never to a Latch server. There is no Latch server.
- **Device-pairing, not passwords.** Run `latch up`, get a URL + a short one-time code (the SSH login hook reprints it every time you log in). Enter it in the panel to securely connect to your Latch Panel.


## Multi-VPS

One host runs the **hub** (panel); the rest run thin **agents** that join it with a hub-issued token — the k3s / Tailscale join pattern. One panel, view every machine.

