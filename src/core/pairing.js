const crypto = require('crypto');
const config = require('./config');

// excludes mistakeable characters so codes cannot be misread
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function generateCode() {
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function hash(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// The plaintext code only ever lives in this process's memory — never
// written to disk — so a copy of state.json alone can't be used to pair.
// It's kept around (not just its hash) so the SSH login hook can reprint
// the same code on every login until it's used or expires.
let current = null;

function issue() {
  const code = generateCode();
  current = { code, hash: hash(code), expiresAt: Date.now() + config.pairingCodeTtlMs, used: false };
  return { code, expiresAt: current.expiresAt };
}

function active() {
  if (!current || current.used || Date.now() > current.expiresAt) return issue();
  return { code: current.code, expiresAt: current.expiresAt };
}

function consume(code) {
  if (!current || current.used) return false;
  if (Date.now() > current.expiresAt) return false;
  if (hash(code) !== current.hash) return false;
  current.used = true;
  return true;
}

module.exports = { issue, active, consume };
