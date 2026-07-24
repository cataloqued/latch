const express = require('express');
const pairing = require('../core/pairing');
const sessions = require('../core/sessions');
const processManager = require('../core/processManager');

const router = express.Router();

router.post('/pair', express.urlencoded({ extended: false }), express.json(), async (req, res) => {
  const code = (req.body?.code || '').trim().toUpperCase();
  if (!pairing.consume(code)) {
    res.status(400).json({ error: 'invalid or expired code' });
    return;
  }
  const { token } = await sessions.create({ ip: req.ip });
  sessions.setCookie(res, token);
  res.json({ ok: true });
});

router.use(express.json());
router.use(sessions.requireAuth);

router.get('/session', (req, res) => {
  res.json({ id: req.session.id, label: req.session.label, createdAt: req.session.createdAt });
});

router.get('/sessions', (_req, res) => {
  res.json(sessions.list());
});

router.delete('/sessions/:id', async (req, res) => {
  await sessions.revoke(req.params.id);
  res.json({ ok: true });
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

router.delete('/processes/:name', async (req, res) => {
  await processManager.remove(req.params.name);
  res.json({ ok: true });
});

router.get('/processes/:name/logs', (req, res) => {
  res.type('text/plain').send(processManager.logs(req.params.name, { lines: Number(req.query.lines) || 200 }));
});

module.exports = router;
