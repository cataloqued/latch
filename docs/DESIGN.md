# Latch design

Backend architecture as currently implemented. Not aspirational — if it's described here, it exists in the code.

## Command reference

| `latch up` - Start the hub (panel + API) on this server, daemonized in the background
| `latch down` - Stop the background hub or agent process
| `latch status` - Check whether Latch is running on this server
| `latch pair` - Print the current pairing link and one-time code
| `latch token create [--label <name>]` - Create a join token for connecting another server as an agent
| `latch token api [--label <name>]` - Create a long-lived API token (for scripts, the MCP server)
| `latch sessions` - List paired browsers and API tokens
| `latch sessions revoke <id>` - Revoke a session or token
| `latch join <hubUrl> --token <t> --fingerprint <fp> [--name <name>]` - Run this server as an agent of the panel, daemonized in the background
| `latch ps` - List processes managed on this server
| `latch start <command...> [--name <name>] [--autorestart] [--port <n>] [--agent <id>]` - Register and start a new process (or just start an existing one by name), e.g. `latch start index.js --name web`
| `latch stop <name>` - Stop a process
| `latch restart <name>` - Restart a process
| `latch reload <name>` - Reloads the process (Starts a new one then removes the old one)
| `latch logs <name> [--lines <n>]` - Print recent output from the selected process (default 200 lines)
| `latch link <name> <url>` - Link a process's working directory to a git repo
| `latch pull <name> [--reload]` - Git pull in the working directory, optional reloading afterwards
| `latch agents` - List connected agents (servers)
| `latch hook install` - Reprint the pairing link on every SSH login (Linux only)

## Trust model

The only way to create a session is to have shell access to the machine (to read the pairing code) or to already hold a paired session or API token. There is no username/password. This is the same trust model as SSH: physical/shell access to the box is the credential.

## Processes

- **Hub** — the box running `latch up`. Serves the panel and API over HTTPS, and terminates agent WebSocket connections.
- **Agent** — a box running `latch join`. Connects outbound to the hub; the hub never connects to the agent. An agent behind NAT or a firewall needs no inbound ports open — only the hub needs to be reachable. An agent also runs its own loopback-only `/internal` server, identical in shape to the hub's, so the local `latch` CLI (`add`, `ps`, `start`, `stop`, `logs`, ...) works the same on an agent box as on a hub.
- **CLI** — every `latch <command>` is a separate short-lived process. `up` and `join` daemonize by default (see below); everything else runs, talks to whichever local `/internal` server owns that box (hub or agent), and exits.

**Daemonization**: `latch up`/`latch join` spawn a detached child process (`--foreground`, an internal flag) that runs the actual server, write its PID to `~/.latch/{hub,agent}.pid`, and the parent exits once the child is confirmed alive — the terminal is free immediately, same shape as `pm2 start`. The child's stdout/stderr redirect to `~/.latch/logs/{hub,agent}.log` rather than the terminal. `latch down` reads the PID file and kills the whole process tree (`taskkill /T /F` on Windows, `kill` on the negative/group PID on POSIX, since the daemon is its own process group leader) — this matters because a hub's managed child processes would otherwise be orphaned by killing just the hub PID. `latch status` reports whether a PID file points at a still-live process. Running `up`/`join` again while already running refuses instead of hitting `EADDRINUSE`.

## Pairing

1. `latch up` (or a fresh code request) generates an 8-character code, drawn from an alphabet with no `0/O/1/I/L` to avoid transcription errors, valid for 10 minutes, single-use.
2. Only the code's SHA-256 hash is written to `state.json`. The plaintext exists only in the hub process's memory, which is why `latch pair` and the SSH login hook can reprint it but a stolen copy of the state file cannot be used to pair.
3. Submitting the code at `/pair` (`POST /api/pair`) exchanges it for a session: a random 32-byte token, only its hash persisted, set as an `httpOnly`, `Secure`, `SameSite=Lax` cookie.
4. Sessions expire after 90 days and can be revoked individually (`latch sessions`, `latch sessions revoke <id>`).

## TLS

Self-signed, generated on first boot via `selfsigned` (pure JS, no OpenSSL dependency) and cached in `~/.latch/certs`. Trust-on-first-use: the browser warns once on first connection, and the certificate is then remembered. There is no CA and no Let's Encrypt integration — Latch does not assume the box has a public DNS name.

## Multi-VPS: hub ↔ agent join

An agent cannot validate the hub's certificate through a CA, since there isn't one. Instead:

1. `latch token create` mints a join token and prints a `latch join` command that includes the hub's certificate fingerprint (SHA-256 of the DER-encoded cert).
2. `latch join <hubUrl> --token <t> --fingerprint <fp>` connects with certificate validation disabled at the TLS layer, then manually compares the live peer certificate's fingerprint against the one supplied on the command line. Any mismatch drops the connection.

This pins trust to a fingerprint chosen explicitly by the operator at connection time, rather than trusting whatever certificate answers on that IP.

Once connected, an agent reports its process list every 4 seconds, and again immediately after handling a command. The hub can push `start`/`stop`/`restart`/`reload` commands to a connected agent over the same socket.

**Dispatch mechanism**: `agent/hubSide.js` holds an in-memory `Map` of connected agents' WebSocket handles, keyed by agent id. This map is not persisted — it has no meaning across a hub restart. `sendCommand(agentId, action, name)` looks up the socket and sends `{ type: 'command', action, name }`; it returns `false` if the agent is not currently connected. `POST /api/agents/:id/processes/:name/:action` (and the loopback `/internal` equivalent) is the HTTP surface over this.

## State storage

A single JSON file, `~/.latch/state.json`: sessions, join tokens, agents, process configs. No database.

- `core/store.js` reads the file from disk on every call rather than caching in memory. The hub (long-running) and CLI invocations (separate, short-lived processes) both write to this file; caching would mean the hub misses writes made by a CLI command.
- Writes are atomic (write to `.tmp`, rename over the target) and serialized within a process via an in-memory promise queue. Two separate processes writing to the same key at the same instant is not handled — acceptable at the scale Latch targets (a single operator managing their own boxes), not a guarantee for concurrent multi-admin use.
- Live process handles — child PIDs, log buffers, WebSocket connections — are never written to this file. Only declarative config (command, args, autorestart, port) persists.

## Process manager

Single-box process supervision: no clustering, no ecosystem file. Spawns a child process, captures stdout/stderr into a 2000-line in-memory ring buffer plus a log file on disk, and restarts with exponential backoff if `autorestart` is set. `latch ps` / `latch logs` / `latch start|stop|restart|reload` all go through the owning process's loopback-only `/internal` API — live process handles only exist in that process's memory, so nothing else can touch them directly.

`port` is operator-supplied metadata only (`latch start server.js --name web --port 3000`). Latch does not bind, check, or verify it; it exists so the panel and `ps` can display what port a service is meant to be running on.

`start` also does light interpreter auto-detection by file extension (`.js`/`.mjs`/`.cjs` → `node`, `.py` → `python`, `.rb` → `ruby`, `.sh` → `bash`), so `latch start index.js` works without spelling out the interpreter. Anything without a recognized extension (or already the interpreter itself, e.g. `latch start node index.js`) is run exactly as given.

**Log rotation**: a log file rotates to `.1` → `.2` → `.3` once it exceeds 5MB; the oldest backup is dropped. `latch logs` reads only the live ring buffer or the current file, not the rotated backups.

**Reload**: `latch reload <name>` starts the replacement process, waits 2 seconds, then kills the old one. There is no gap where nothing is running. This is not true zero-downtime for a process bound to a fixed port — both instances briefly overlap, and the replacement can hit `EADDRINUSE` unless the application itself sets `SO_REUSEPORT`. It works cleanly for worker-style processes that don't bind a port.

## Git integration

`core/git.js` shells out to the system `git` binary, scoped to a process's working directory:

- `info(cwd)` — returns `null` if `cwd` is not a git repository; otherwise returns branch, short commit hash, subject, relative age, and commits behind the upstream.
- `link(cwd, url)` — clones `url` into `cwd` if it is empty or missing; adds `origin` if `cwd` is an existing repo with no remote configured; refuses otherwise.
- `pull(cwd)` — runs `git pull --ff-only`. A pull that can't fast-forward fails rather than producing a merge commit.

Exposed as `GET/POST /processes/:name/git` and `POST /processes/:name/pull`, on both `/api` (cookie or bearer token) and `/internal` (loopback, used by `latch link` / `latch pull`). Only implemented for hub-local processes — an agent's filesystem is not reachable from the hub, so git status and pull are not yet available for agent-hosted processes.

## Web panel

`src/hub/public/panel.html` — a single static file with no build step, served at `/` when a valid session cookie is present, redirecting to `/pair` otherwise.

The panel polls `GET /api/processes` and `GET /api/agents` every 2 seconds and re-renders; there is no WebSocket connection to the browser. Actions POST to `/api/processes/:name/:action` for hub-local processes, or `/api/agents/:id/processes/:name/:action` for a process on a remote agent. Git status and log tailing are hub-local only — the panel marks these as unavailable for agent-hosted processes rather than showing incorrect data.

## Loopback-only API

`/internal/*` — pairing code, process list, logs, start/stop/restart/reload, git, agents — only accepts requests from `127.0.0.1`/`::1`, on both a hub and an agent. It has no session-cookie check of its own; shell access to the box is treated as at least as trusted as a paired browser session.

## API tokens and the MCP server

`sessions.requireAuth` accepts either the `latch_session` cookie or an `Authorization: Bearer <token>` header, against the same session store, same hashing, same revocation path (`latch sessions`, `latch sessions revoke <id>`). `latch token api` mints a bearer token directly and prints `LATCH_URL` / `LATCH_TOKEN` / `LATCH_FINGERPRINT` for export.

`bin/latch-mcp.js` is an MCP server over stdio, built on `@modelcontextprotocol/sdk`, for use from Claude Code, Claude Desktop, Codex, or any other MCP client. It reads the three env vars above, pins the hub's certificate fingerprint the same way an agent does (`src/mcp/client.js` mirrors the TOFU-pinning logic in `agent/client.js`, over HTTPS instead of WebSocket), and exposes these tools: `list_processes`, `start_process`, `stop_process`, `restart_process`, `reload_process` (each accepts an optional `agent` id to target a remote process), `logs`, `git_status`, `link_repo`, `pull`, `add_process`, `remove_process`.

## Not built yet

- Plugin system (notifiers, auth providers, runtime detectors, log drivers, deploy hooks) — described in the README as intended shape, not implemented
- Remote log streaming and git status/pull for agent-hosted processes — the hub can start/stop/restart/reload an agent's processes, but reading their logs or git state needs a relay over the WebSocket that doesn't exist yet
- Automated test suite
