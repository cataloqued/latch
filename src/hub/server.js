const https = require('https');
const express = require('express');
const { WebSocketServer } = require('ws');
const config = require('../core/config');
const tls = require('../core/tls');
const api = require('./api');
const internal = require('./internal');
const pages = require('./pages');
const { attachAgentServer } = require('../agent/hubSide');

function isLoopback(req) {
  return req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1' || req.socket.remoteAddress === '::ffff:127.0.0.1';
}

// Loopback-only: covers the SSH login hook (reprints the pairing code) and
// the `latch` CLI's own ps/logs/start/stop commands. Never reachable from
// outside the box — shell access here is already the same root of trust a
// paired browser session relies on.
function requireLoopback(req, res, next) {
  if (!isLoopback(req)) {
    res.status(403).end();
    return;
  }
  next();
}

function createApp() {
  const app = express();

  app.get('/pair', (_req, res) => res.send(pages.pairPage()));
  app.use('/api', api);
  app.use('/internal', requireLoopback, internal);
  app.get('*', (_req, res) => res.send(pages.panelStub()));

  return app;
}

function start() {
  const { key, cert } = tls.ensureCert();
  const app = createApp();
  const server = https.createServer({ key, cert }, app);
  const wss = new WebSocketServer({ server, path: '/agent/join' });
  attachAgentServer(wss);

  server.listen(config.hubPort);
  return server;
}

module.exports = { start, createApp };
