const crypto = require('crypto');
const config = require('./config');

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
