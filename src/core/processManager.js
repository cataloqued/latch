const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');

const MAX_LOG_LINES = 2000;
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_LOG_BACKUPS = 3;
const STOP_GRACE_MS = 5000;
const RELOAD_GRACE_MS = 2000;

const running = new Map();

function logPath(name) {
  return path.join(config.logsDir, `${name}.log`);
}

function rotateLogFile(name) {
  const base = logPath(name);
  try {
    if (fs.existsSync(`${base}.${MAX_LOG_BACKUPS}`)) fs.rmSync(`${base}.${MAX_LOG_BACKUPS}`);
    for (let i = MAX_LOG_BACKUPS - 1; i >= 1; i--) {
      if (fs.existsSync(`${base}.${i}`)) fs.renameSync(`${base}.${i}`, `${base}.${i + 1}`);
    }
    if (fs.existsSync(base)) fs.renameSync(base, `${base}.1`);
  } catch {}
}

function appendLog(name, line) {
  const entry = running.get(name);
  if (!entry) return;
  entry.logBuffer.push(line);
  if (entry.logBuffer.length > MAX_LOG_LINES) entry.logBuffer.shift();

  entry.logBytes = (entry.logBytes || 0) + Buffer.byteLength(line);
  if (entry.logBytes > MAX_LOG_BYTES) {
    rotateLogFile(name);
    entry.logBytes = 0;
  }
  fs.appendFile(logPath(name), line + '\n', () => {});
}

async function add(name, { command, args = [], cwd, env, autorestart = false, port }) {
  await store.mutate((s) => {
    s.processes[name] = { command, args, cwd, env, autorestart, port: port ? Number(port) : undefined };
  });
}

function spawnChild(proc) {
  return spawn(proc.command, proc.args, {
    cwd: proc.cwd || process.cwd(),
    env: { ...process.env, ...(proc.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function wireLifecycle(name, child, entry, proc) {
  child.stdout.on('data', (buf) => appendLog(name, buf.toString()));
  child.stderr.on('data', (buf) => appendLog(name, buf.toString()));

  child.on('error', (err) => {
    if (entry.child !== child) return;
    entry.child = null;
    entry.status = 'stopped';
    entry.lastError = err.message;
    appendLog(name, `[latch] failed to start: ${err.message}\n`);
  });

  child.on('exit', (code, signal) => {
    if (entry.child !== child) return;
    entry.child = null;
    entry.status = 'stopped';
    entry.exitCode = code;
    entry.exitSignal = signal;
    if (proc.autorestart && !entry.stoppedByUser) {
      entry.restarts += 1;
      setTimeout(() => start(name), Math.min(1000 * 2 ** entry.restarts, 30_000));
    }
  });
}

function start(name) {
  const proc = store.read().processes[name];
  if (!proc) throw new Error(`no such process: ${name}`);
  if (running.has(name) && running.get(name).child) return status(name);

  const entry = running.get(name) || { logBuffer: [], restarts: 0 };
  const child = spawnChild(proc);
  entry.child = child;
  entry.startedAt = Date.now();
  entry.status = 'running';
  running.set(name, entry);

  wireLifecycle(name, child, entry, proc);
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

function reload(name) {
  const proc = store.read().processes[name];
  if (!proc) throw new Error(`no such process: ${name}`);
  const entry = running.get(name);
  if (!entry || !entry.child) return start(name);

  const oldChild = entry.child;
  const newChild = spawnChild(proc);

  setTimeout(() => {
    entry.child = newChild;
    entry.startedAt = Date.now();
    entry.status = 'running';
    wireLifecycle(name, newChild, entry, proc);
    oldChild.kill('SIGTERM');
    setTimeout(() => oldChild.kill('SIGKILL'), STOP_GRACE_MS);
  }, RELOAD_GRACE_MS);

  return status(name);
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
    port: proc?.port,
  };
}

function list() {
  return Object.keys(store.read().processes).map(status);
}

function stopAll() {
  for (const name of running.keys()) stop(name);
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

module.exports = { add, start, stop, restart, reload, remove, status, list, logs, stopAll };
