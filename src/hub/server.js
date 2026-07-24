const path = require('path');
const cookie = require('cookie');
const https = require('https');
const express = require('express');
const { WebSocketServer } = require('ws');
const config = require('../core/config');
const tls = require('../core/tls');
const sessions = require('../core/sessions');
const api = require('./api');
const internal = require('./internal');
const pages = require('./pages');
const { attachAgentServer } = require('../agent/hubSide');

const PANEL_PATH = path.join(__dirname, 'public', 'panel.html');

function isLoopback(req) {
  return req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1' || req.socket.remoteAddress === '::ffff:127.0.0.1';
}


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
  app.get('*', (req, res) => {
    const cookies = cookie.parse(req.headers.cookie || '');
    const token = cookies[sessions.COOKIE_NAME];
    const session = token && sessions.findByToken(token);
    if (!session || session.expiresAt < Date.now()) {
      res.redirect('/pair');
      return;
    }
    res.sendFile(PANEL_PATH);
  });

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

function startInternal() {
  const { key, cert } = tls.ensureCert();
  const app = express();
  app.use('/internal', requireLoopback, internal);
  const server = https.createServer({ key, cert }, app);
  server.listen(config.hubPort);
  return server;
}

module.exports = { start, startInternal, createApp };
