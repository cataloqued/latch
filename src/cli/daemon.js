const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const config = require('../core/config');

const LATCH_ENTRY = path.join(__dirname, '..', '..', 'bin', 'latch.js');

function pidFile(name) {
  return path.join(config.dataDir, `${name}.pid`);
}

function logFile(name) {
  return path.join(config.dataDir, 'logs', `${name}.log`);
}

function readPid(name) {
  try {
    const pid = Number(fs.readFileSync(pidFile(name), 'utf8').trim());
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function status(name) {
  const pid = readPid(name);
  if (pid && isAlive(pid)) return { running: true, pid };
  return { running: false, pid: null };
}

function spawnDaemon(name, args) {
  fs.mkdirSync(path.dirname(logFile(name)), { recursive: true });
  const out = fs.openSync(logFile(name), 'a');
  const err = fs.openSync(logFile(name), 'a');
  const child = spawn(process.execPath, [LATCH_ENTRY, ...args], {
    detached: true,
    stdio: ['ignore', out, err],
    windowsHide: true,
  });
  fs.writeFileSync(pidFile(name), String(child.pid));
  child.unref();
  return child.pid;
}

function stopDaemon(name) {
  const pid = readPid(name);
  if (!pid || !isAlive(pid)) {
    fs.rmSync(pidFile(name), { force: true });
    return false;
  }
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
    } catch {}
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  }
  fs.rmSync(pidFile(name), { force: true });
  return true;
}

module.exports = { status, spawnDaemon, stopDaemon, readPid, isAlive, pidFile, logFile };
