const os = require('os');
const path = require('path');

const dataDir = process.env.LATCH_HOME || path.join(os.homedir(), '.latch');

module.exports = {
  dataDir,
  certsDir: path.join(dataDir, 'certs'),
  logsDir: path.join(dataDir, 'logs'),
  statePath: path.join(dataDir, 'state.json'),
  hubPort: Number(process.env.LATCH_PORT || 9443),
  pairingCodeTtlMs: 10 * 60 * 1000,
  sessionTtlMs: 90 * 24 * 60 * 60 * 1000,
};
