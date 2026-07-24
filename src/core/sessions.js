const crypto = require('crypto');
const cookie = require('cookie');
const store = require('./store');
const config = require('./config');

const COOKIE_NAME = 'latch_session';

function hash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function create(meta = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const id = crypto.randomBytes(8).toString('hex');
  const record = {
    id,
    tokenHash: hash(token),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    expiresAt: Date.now() + config.sessionTtlMs,
    label: meta.label || 'unnamed device',
    ip: meta.ip,
  };
  await store.mutate((s) => {
    s.sessions[id] = record;
  });
  return { token, record };
}

function findByToken(token) {
  const tokenHash = hash(token);
  const { sessions } = store.read();
  return Object.values(sessions).find((s) => s.tokenHash === tokenHash) || null;
}

async function touch(id) {
  await store.mutate((s) => {
    if (s.sessions[id]) s.sessions[id].lastSeenAt = Date.now();
  });
}

async function revoke(id) {
  await store.mutate((s) => {
    delete s.sessions[id];
  });
}

function list() {
  return Object.values(store.read().sessions).map(({ tokenHash, ...rest }) => rest);
}

function setCookie(res, token) {
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlMs / 1000,
  }));
}

function requireAuth(req, res, next) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  const session = token && findByToken(token);
  if (!session || session.expiresAt < Date.now()) {
    res.status(401).json({ error: 'not paired' });
    return;
  }
  req.session = session;
  touch(session.id);
  next();
}

module.exports = { create, findByToken, touch, revoke, list, setCookie, requireAuth, COOKIE_NAME };
