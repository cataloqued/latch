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
