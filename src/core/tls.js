const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const config = require('./config');

const keyPath = path.join(config.certsDir, 'key.pem');
const certPath = path.join(config.certsDir, 'cert.pem');

// Trust-on-first-use: the browser will warn once on first pairing, the
// same way a new SSH host key does. There is no CA in the loop by design.
function ensureCert() {
  fs.mkdirSync(config.certsDir, { recursive: true });
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }
  const attrs = [{ name: 'commonName', value: 'latch.local' }];
  const pems = selfsigned.generate(attrs, { days: 3650, keySize: 2048 });
  fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
  fs.writeFileSync(certPath, pems.cert, { mode: 0o644 });
  return { key: pems.private, cert: pems.cert };
}

// Agents pin this instead of doing normal CA validation, since a
// self-signed cert has nothing else to check it against (TOFU).
function fingerprint(certPem) {
  const der = Buffer.from(
    certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, ''),
    'base64',
  );
  return crypto.createHash('sha256').update(der).digest('hex').match(/.{2}/g).join(':');
}

module.exports = { ensureCert, fingerprint };
