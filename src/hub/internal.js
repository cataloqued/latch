const express = require('express');
const pairing = require('../core/pairing');
const processManager = require('../core/processManager');
const git = require('../core/git');
const store = require('../core/store');
const { listAgents, sendCommand } = require('../agent/hubSide');

const router = express.Router();

router.use(express.json());

router.get('/pairing-code', (_req, res) => {
  res.json(pairing.active());
});

router.get('/processes', (_req, res) => {
  res.json(processManager.list());
});

router.post('/processes', async (req, res) => {
  const { name, command, args, cwd, env, autorestart, port } = req.body || {};
  if (!name || !command) {
    res.status(400).json({ error: 'name and command required' });
    return;
  }
  await processManager.add(name, { command, args, cwd, env, autorestart, port });
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

router.post('/processes/:name/reload', (req, res) => {
  try {
    res.json(processManager.reload(req.params.name));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.get('/processes/:name/logs', (req, res) => {
  res.type('text/plain').send(processManager.logs(req.params.name, { lines: Number(req.query.lines) || 200 }));
});

router.get('/processes/:name/git', async (req, res) => {
  const proc = store.read().processes[req.params.name];
  if (!proc) { res.status(404).json({ error: 'no such process' }); return; }
  res.json(await git.info(proc.cwd));
});

router.post('/processes/:name/git', async (req, res) => {
  const proc = store.read().processes[req.params.name];
  if (!proc || !proc.cwd) { res.status(400).json({ error: 'process has no cwd to link a repo into' }); return; }
  try {
    res.json(await git.link(proc.cwd, req.body?.url || ''));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/processes/:name/pull', async (req, res) => {
  const proc = store.read().processes[req.params.name];
  if (!proc) { res.status(404).json({ error: 'no such process' }); return; }
  try {
    await git.pull(proc.cwd);
    res.json(await git.info(proc.cwd));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/agents', (_req, res) => {
  res.json(listAgents());
});

router.post('/agents/:id/processes/:name/:action', (req, res) => {
  const { id, name, action } = req.params;
  if (!['start', 'stop', 'restart', 'reload'].includes(action)) {
    res.status(400).json({ error: 'unknown action' });
    return;
  }
  if (!sendCommand(id, action, name)) {
    res.status(404).json({ error: 'agent not connected' });
    return;
  }
  res.json({ ok: true });
});

module.exports = router;
