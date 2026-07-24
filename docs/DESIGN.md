# Latch design

This is the v0 backend architecture — what's actually built, not aspirational. Update it as decisions change.

## Trust model

> If you can SSH into the box, you can control it from the panel. If you can't, you can't.

There is no username/password. The only way to create a session is to already have shell access to the machine (to read the pairing code) or to already hold a paired session. This mirrors SSH's own trust model instead of inventing a new one.

## Processes

- **Hub** — the box running `latch up`. Serves the panel/API over HTTPS and terminates agent WebSocket connections.
- **Agent** — a box running `latch join`. Dials out to the hub; the hub never dials in. This means an agent behind NAT or a restrictive firewall needs zero inbound ports opened — only the one hub box needs to be reachable.
- **CLI** — every `latch <command>` invocation is its own short-lived process. Some commands (`up`, `join`) stay running in the foreground; others (`pair`, `ps`, `token create`, `add`, `start`/`stop`/`restart`, `logs`) do one thing and exit.

## Pairing

1. `latch up` (or a fresh code request) generates an 8-character code from a mistake-resistant alphabet (`23456789ABCDEFGHJKMNPQRSTUVWXYZ` — no `0/O/1/I/L`), valid for 10 minutes, single-use.
2. Only the code's SHA-256 hash is ever written to `state.json`. The plaintext lives in the hub process's memory for as long as it's valid, so `latch pair` and the SSH login hook can reprint it — but a copy of the state file alone is useless for pairing.
3. Visiting `/pair` and submitting the code exchanges it (`POST /api/pair`) for a session: a random 32-byte token, only its hash persisted, set as an `httpOnly`, `Secure`, `SameSite=Lax` cookie.
4. Sessions carry an expiry (90 days) and are individually revocable (`GET/DELETE /api/sessions`) — the "sessions page" the README promises.

## TLS

Self-signed, generated on first boot via `selfsigned` (pure JS — no OpenSSL binary dependency) and cached in `~/.latch/certs`. This is trust-on-first-use, same as an SSH host key: the browser warns once, you accept it, and it's remembered from then on. There is deliberately no CA and no Let's Encrypt integration — Latch doesn't assume the box has a public DNS name.

## Multi-VPS: hub ↔ agent join

Because there's no CA, an agent can't validate the hub's cert the normal way. Instead:

1. `latch token create` mints a join token (persisted, hashed, like sessions) and prints a ready-to-paste `latch join` command that includes the **hub's certificate fingerprint** (SHA-256 of the DER-encoded cert).
2. `latch join <hubUrl> --token <token> --fingerprint <fp>` connects with `rejectUnauthorized: false` (there's no CA to check against anyway) but then manually compares the live peer certificate's fingerprint to the one it was given, and drops the connection on any mismatch.

This is TOFU with the "first use" pinned explicitly by the operator, rather than blindly trusting whatever cert answers on that IP — it's the same pattern as comparing an SSH host key fingerprint before typing "yes".

Once connected, the agent reports its managed process list every 15s and accepts `start`/`stop`/`restart` commands pushed from the hub.

## State storage

Single JSON file (`~/.latch/state.json`): sessions, join tokens, agents, process configs. No database.

- `core/store.js` re-reads the file from disk on every call rather than caching in memory, because the hub (long-running) and CLI subcommands (separate, short-lived processes) both mutate it — a cache would mean the hub never notices a token a CLI invocation just created.
- Writes are atomic (write to `.tmp`, then rename) and serialized *within* a process via an in-memory promise queue. Two processes racing a write to the same key at the same instant isn't handled — acceptable for the expected scale (a person managing their own boxes), not for a multi-admin team tool.
- Live process handles (child PIDs, log ring buffers, WebSocket connections) are **not** in this file — they can't be, a PID from before a restart is meaningless. Only the declarative config (command, args, autorestart) persists.

## Process manager

Deliberately not PM2: no clustering, no zero-downtime reload, no ecosystem file format. Just spawn, capture stdout/stderr into a capped in-memory ring buffer (last 2000 lines) plus an append-only log file, and restart-with-backoff if `autorestart` is set. `latch ps` / `latch logs` / `latch start|stop|restart` all talk to the hub's loopback-only `/internal` API rather than touching process state directly, since live process handles only exist inside the hub's own memory.

## Loopback-only API

`/internal/*` (pairing code, process list, logs, start/stop/restart) only answers requests from `127.0.0.1`/`::1`. It has no session-cookie auth of its own — shell access to the box is treated as at least as trusted as a paired browser session, which is the same trust model the pairing flow itself relies on.

## Not built yet

- Web panel UI (backend-only right now; `/` serves a placeholder page)
- Plugin system (notifiers, auth providers, runtime detectors, log drivers, deploy hooks) — the README describes the intended shape, nothing is pluggable yet
- Log rotation (the append-only log file grows unbounded)
- Any test suite
