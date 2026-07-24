const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');

const MAX_LOG_LINES = 2000;
const STOP_GRACE_MS = 5000;

// Live process handles can't be persisted (a pid is meaningless after a
// restart), so this lives only in memory. store.processes holds the
// declarative config (command/args/etc.) that survives a hub restart.
const running = new Map();

function logPath(name) {
  return path.join(config.logsDir, `${name}.log`);
}

function appendLog(name, line) {
  const entry = running.get(name);
  if (!entry) return;
  entry.logBuffer.push(line);
  if (entry.logBuffer.length > MAX_LOG_LINES) entry.logBuffer.shift();
  fs.appendFile(logPath(name), line + '\n', () => {});
}

async function add(name, { command, args = [], cwd, env, autorestart = false }) {
  await store.mutate((s) => {
    s.processes[name] = { command, args, cwd, env, autorestart };
  });
}

function start(name) {
  const proc = store.read().processes[name];
  if (!proc) throw new Error(`no such process: ${name}`);
  if (running.has(name) && running.get(name).child) return status(name);

  const child = spawn(proc.command, proc.args, {
    cwd: proc.cwd || process.cwd(),
    env: { ...process.env, ...(proc.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const entry = running.get(name) || { logBuffer: [], restarts: 0 };
  entry.child = child;
  entry.startedAt = Date.now();
  entry.status = 'running';
  running.set(name, entry);

  child.stdout.on('data', (buf) => appendLog(name, buf.toString()));
  child.stderr.on('data', (buf) => appendLog(name, buf.toString()));

  // Without this, a bad command (e.g. a typo'd binary) fires Node's
  // unhandled 'error' event and takes the whole hub process down with it —
  // one broken managed process must not be able to kill the supervisor.
  child.on('error', (err) => {
    entry.child = null;
    entry.status = 'stopped';
    entry.lastError = err.message;
    appendLog(name, `[latch] failed to start: ${err.message}\n`);
  });

  child.on('exit', (code, signal) => {
    entry.child = null;
    entry.status = 'stopped';
    entry.exitCode = code;
    entry.exitSignal = signal;
    if (proc.autorestart && !entry.stoppedByUser) {
      entry.restarts += 1;
      setTimeout(() => start(name), Math.min(1000 * 2 ** entry.restarts, 30_000));
    }
  });

  return status(name);
}

function stop(name) {
  const entry = running.get(name);
  if (!entry || !entry.child) return status(name);
  entry.stoppedByUser = true;
  entry.child.kill('SIGTERM');
  const child = entry.child;
  setTimeout(() => {
    if (entry.child === child) entry.child.kill('SIGKILL');
  }, STOP_GRACE_MS);
  return status(name);
}

function restart(name) {
  stop(name);
  setTimeout(() => start(name), STOP_GRACE_MS + 100);
}

async function remove(name) {
  stop(name);
  running.delete(name);
  await store.mutate((s) => {
    delete s.processes[name];
  });
}

function status(name) {
  const proc = store.read().processes[name];
  const entry = running.get(name);
  return {
    name,
    command: proc && `${proc.command} ${(proc.args || []).join(' ')}`.trim(),
    status: entry?.status || 'stopped',
    pid: entry?.child?.pid,
    startedAt: entry?.startedAt,
    exitCode: entry?.exitCode,
    restarts: entry?.restarts || 0,
    lastError: entry?.lastError,
  };
}

function list() {
  return Object.keys(store.read().processes).map(status);
}

function logs(name, { lines = 200 } = {}) {
  const entry = running.get(name);
  const buffered = entry ? entry.logBuffer.join('') : '';
  if (buffered) return buffered.split('\n').slice(-lines).join('\n');
  try {
    return fs.readFileSync(logPath(name), 'utf8').split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

module.exports = { add, start, stop, restart, remove, status, list, logs };
