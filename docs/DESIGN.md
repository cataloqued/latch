# Latch design

This is the v0 backend architecture — what's actually built, not aspirational. Update it as decisions change.

## Trust model

> If you can SSH into the box, you can control it from the panel. If you can't, you can't.

There is no username/password. The only way to create a session is to already have shell access to the machine (to read the pairing code) or to already hold a paired session (or API token — see below). This mirrors SSH's own trust model instead of inventing a new one.

## Processes

- **Hub** — the box running `latch up`. Serves the panel/API over HTTPS and terminates agent WebSocket connections.
- **Agent** — a box running `latch join`. Dials out to the hub; the hub never dials in. This means an agent behind NAT or a restrictive firewall needs zero inbound ports opened — only the one hub box needs to be reachable. It also runs its own loopback-only `/internal` server (same as the hub, minus the public panel/API/WS listener) so the local `latch` CLI works identically on an agent box as it does on a hub.
- **CLI** — every `latch <command>` invocation is its own short-lived process. Some commands (`up`, `join`) stay running in the foreground; others (`pair`, `ps`, `add`, `link`, `pull`, `agents`, `token create`, `token api`, `sessions`, `start`/`stop`/`restart`/`reload`, `logs`) do one thing and exit, talking to whichever long-running process (hub or agent) owns that box's `/internal` API.

## Pairing

1. `latch up` (or a fresh code request) generates an 8-character code from a mistake-resistant alphabet (`23456789ABCDEFGHJKMNPQRSTUVWXYZ` — no `0/O/1/I/L`), valid for 10 minutes, single-use.
2. Only the code's SHA-256 hash is ever written to `state.json`. The plaintext lives in the hub process's memory for as long as it's valid, so `latch pair` and the SSH login hook can reprint it — but a copy of the state file alone is useless for pairing.
3. Visiting `/pair` and submitting the code exchanges it (`POST /api/pair`) for a session: a random 32-byte token, only its hash persisted, set as an `httpOnly`, `Secure`, `SameSite=Lax` cookie.
4. Sessions carry an expiry (90 days) and are individually revocable (`GET /api/sessions`, `latch sessions revoke <id>`).

## TLS

Self-signed, generated on first boot via `selfsigned` (pure JS — no OpenSSL binary dependency) and cached in `~/.latch/certs`. This is trust-on-first-use, same as an SSH host key: the browser warns once, you accept it, and it's remembered from then on. There is deliberately no CA and no Let's Encrypt integration — Latch doesn't assume the box has a public DNS name.

## Multi-VPS: hub ↔ agent join

Because there's no CA, an agent can't validate the hub's cert the normal way. Instead:

1. `latch token create` mints a join token (persisted, hashed, like sessions) and prints a ready-to-paste `latch join` command that includes the **hub's certificate fingerprint** (SHA-256 of the DER-encoded cert).
2. `latch join <hubUrl> --token <token> --fingerprint <fp>` connects with `rejectUnauthorized: false` (there's no CA to check against anyway) but then manually compares the live peer certificate's fingerprint to the one it was given, and drops the connection on any mismatch.

This is TOFU with the "first use" pinned explicitly by the operator, rather than blindly trusting whatever cert answers on that IP — it's the same pattern as comparing an SSH host key fingerprint before typing "yes".

Once connected, the agent reports its managed process list every 4s (and immediately after handling a command) and accepts `start`/`stop`/`restart`/`reload` commands pushed from the hub over the same socket.

**Hub → agent dispatch**: `agent/hubSide.js` keeps a live, in-memory `Map` of connected agents' WebSocket handles (`liveSockets`, keyed by agent id — never persisted, meaningless across a restart). `sendCommand(agentId, action, name)` looks up the socket and pushes `{ type: 'command', action, name }`; it returns `false` if the agent isn't currently connected, since there's nowhere to send it. `POST /api/agents/:id/processes/:name/:action` (and the loopback `/internal` equivalent) is the HTTP surface over this. The agent's own `client.js` already listens for these messages and dispatches to its local `processManager`.

## State storage

Single JSON file (`~/.latch/state.json`): sessions, join tokens, agents, process configs. No database.

- `core/store.js` re-reads the file from disk on every call rather than caching in memory, because the hub (long-running) and CLI subcommands (separate, short-lived processes) both mutate it — a cache would mean the hub never notices a token a CLI invocation just created.
- Writes are atomic (write to `.tmp`, then rename) and serialized *within* a process via an in-memory promise queue. Two processes racing a write to the same key at the same instant isn't handled — acceptable for the expected scale (a person managing their own boxes), not for a multi-admin team tool.
- Live process handles (child PIDs, log ring buffers, WebSocket connections) are **not** in this file — they can't be, a PID from before a restart is meaningless. Only the declarative config (command, args, autorestart, port) persists.

## Process manager

Deliberately not PM2: no clustering, no ecosystem file format. Just spawn, capture stdout/stderr into a capped in-memory ring buffer (last 2000 lines) plus a log file, and restart-with-backoff if `autorestart` is set. `latch ps` / `latch logs` / `latch start|stop|restart|reload` all talk to the owning process's loopback-only `/internal` API rather than touching process state directly, since live process handles only exist inside that one process's memory.

`port` is purely operator-supplied metadata (`latch add web --port 3000 -- ...`) — Latch never binds, checks, or verifies it. It exists so the panel and `ps` can show what port a service is meant to be on without guessing.

**Log rotation**: each process's log file rotates to `.1` → `.2` → `.3` once it crosses 5MB, oldest dropped. `latch logs` only reads the live ring buffer or the current file — it doesn't chain across rotated backups.

**Reload**: `latch reload <name>` starts the replacement process first, waits 2s, then kills the old one — so there's no gap where nothing is running. This isn't true zero-downtime for a process that binds one fixed port (both instances briefly overlap, and the new one may hit `EADDRINUSE` unless the app itself sets `SO_REUSEPORT`), but it's the best a generic external supervisor can do without the app's cooperation, and it works cleanly for worker-style processes that don't bind a port at all.

## Git integration

`core/git.js` shells out to the system `git` binary (`execFile`, no library dependency) scoped to a process's `cwd`:

- **`info(cwd)`** — `null` if `cwd` isn't a git repo; otherwise fetches quietly and returns branch, short hash, subject, relative age, and how many commits behind `@{u}`.
- **`link(cwd, url)`** — if `cwd` is empty or missing, clones `url` into it; if `cwd` is already a repo with no `origin`, wires one up; otherwise refuses (a directory with unrelated content isn't something Latch will overwrite).
- **`pull(cwd)`** — `git pull --ff-only`. Deliberately not a real merge: a fast-forward-only pull fails loudly instead of creating a merge commit or conflict on a box nobody's watching.

Exposed as `GET/POST /processes/:name/git` and `POST /processes/:name/pull` on both `/api` (cookie/bearer-authed) and `/internal` (loopback-authed, for the CLI's `latch link`/`latch pull`). Only wired up for hub-local processes — an agent's filesystem isn't reachable from the hub, so remote git status/pull isn't available yet (see below).

## Web panel

`src/hub/public/panel.html` — a single static file, no build step, served at `/` once a valid session cookie is present (redirects to `/pair` otherwise). Terminal-native design: monospace throughout, click-to-operate action buttons per process, a command palette (`⌘K`/`/`), and vim-style keys (`j`/`k`/`r`/`s`/`l`) for anyone who wants them.

It polls `GET /api/processes` + `GET /api/agents` every 2s and re-renders — no WebSocket to the browser, kept deliberately simple. Actions POST straight to `/api/processes/:name/:action` for hub-local processes, or `/api/agents/:id/processes/:name/:action` for a remote agent's. Git info and log tailing are hub-local only right now (no relay mechanism from an agent to the hub for either) — the panel shows an honest "not available for remote agents yet" instead of pretending.

## Loopback-only API

`/internal/*` (pairing code, process list, logs, start/stop/restart/reload, git, agents) only answers requests from `127.0.0.1`/`::1`, on both a hub and an agent. It has no session-cookie auth of its own — shell access to the box is treated as at least as trusted as a paired browser session, which is the same trust model the pairing flow itself relies on.

## API tokens & the MCP server

`sessions.requireAuth` accepts either the browser's `latch_session` cookie or an `Authorization: Bearer <token>` header — same session store, same hashing, same revocation (`latch sessions` / `latch sessions revoke <id>`). `latch token api` mints one directly (no pairing flow needed — you already have shell access, which is the same root of trust) and prints ready-to-export `LATCH_URL` / `LATCH_TOKEN` / `LATCH_FINGERPRINT` env vars.

`bin/latch-mcp.js` is a standard MCP server over stdio (`@modelcontextprotocol/sdk`), meant to be pointed at from Claude Code, Claude Desktop, Codex, or any other MCP-speaking client, so an agentic tool can manage processes without shelling in. It reads those three env vars, pins the hub's cert fingerprint the same way an agent does (`src/mcp/client.js` mirrors `agent/client.js`'s TOFU-pinning pattern over plain HTTPS instead of WS), and exposes: `list_processes`, `start_process`/`stop_process`/`restart_process`/`reload_process` (each takes an optional `agent` id to target a remote process), `logs`, `git_status`, `link_repo`, `pull`, `add_process`, `remove_process`.

## Not built yet

- Plugin system (notifiers, auth providers, runtime detectors, log drivers, deploy hooks) — the README describes the intended shape, nothing is pluggable yet
- Remote log streaming and git status/pull for agent-hosted processes — the hub can start/stop/restart/reload an agent's processes, but reading their logs or git state would need a relay over the same WebSocket that doesn't exist yet
- Any test suite
