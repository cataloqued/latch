const fs = require('fs');
const path = require('path');
const config = require('./config');

const empty = () => ({
  sessions: {},
  joinTokens: {},
  agents: {},
  processes: {},
});

function ensureDataDir() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.certsDir, { recursive: true });
  fs.mkdirSync(config.logsDir, { recursive: true });
}

// The hub (long-running) and CLI subcommands (short-lived, separate
// processes) both touch this file, so every read goes back to disk instead
// of trusting an in-memory copy — otherwise the hub would never notice a
// join token a `latch token create` invocation just wrote. This assumes a
// single writer at a time, which is fine at hobby scale; concurrent writers
// racing each other isn't handled.
function read() {
  ensureDataDir();
  if (!fs.existsSync(config.statePath)) return empty();
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(config.statePath, 'utf8')) };
  } catch {
    return empty();
  }
}

function write(state) {
  const tmpPath = `${config.statePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, config.statePath);
}

// Serializes mutate() calls within this one process; see the note above
// about cross-process writes.
let queue = Promise.resolve();

function mutate(fn) {
  queue = queue.then(() => {
    const state = read();
    const result = fn(state);
    write(state);
    return result;
  });
  return queue;
}

module.exports = { read, mutate };
