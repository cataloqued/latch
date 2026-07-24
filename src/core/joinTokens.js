const crypto = require('crypto');
const store = require('./store');

function hash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function create(label) {
  const token = crypto.randomBytes(24).toString('base64url');
  const id = crypto.randomBytes(8).toString('hex');
  await store.mutate((s) => {
    s.joinTokens[id] = { tokenHash: hash(token), label: label || 'agent', createdAt: Date.now() };
  });
  return token;
}

function verify(token) {
  const tokenHash = hash(token);
  return Object.values(store.read().joinTokens).find((t) => t.tokenHash === tokenHash) || null;
}

module.exports = { create, verify };
