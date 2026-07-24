const express = require('express');
const pairing = require('../core/pairing');
const processManager = require('../core/processManager');

// Everything here assumes the caller is on the box (see the loopback check
// in server.js) — local shell access is treated as the same root of trust
// as SSH, which is what a paired browser session relies on too.
const router = express.Router();

router.use(express.json());

router.get('/pairing-code', (_req, res) => {
  res.json(pairing.active());
});

router.get('/processes', (_req, res) => {
  res.json(processManager.list());
});

router.post('/processes', async (req, res) => {
  const { name, command, args, cwd, env, autorestart } = req.body || {};
  if (!name || !command) {
    res.status(400).json({ error: 'name and command are required' });
    return;
  }
  await processManager.add(name, { command, args, cwd, env, autorestart });
  res.json(processManager.status(name));
});

router.post('/processes/:name/start', (req, res) => {
  try {
    res.json(processManager.start(req.params.name));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/processes/:name/stop', (req, res) => {
  res.json(processManager.stop(req.params.name));
});

router.post('/processes/:name/restart', (req, res) => {
  processManager.restart(req.params.name);
  res.json({ ok: true });
});

router.get('/processes/:name/logs', (req, res) => {
  res.type('text/plain').send(processManager.logs(req.params.name, { lines: Number(req.query.lines) || 200 }));
});

module.exports = router;
