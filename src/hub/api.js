const os = require('os');
const express = require('express');
const pairing = require('../core/pairing');
const sessions = require('../core/sessions');
const processManager = require('../core/processManager');
const git = require('../core/git');
const hostInfo = require('../core/hostInfo');
const store = require('../core/store');
const tls = require('../core/tls');
const joinTokens = require('../core/joinTokens');
const { listAgents, sendCommand } = require('../agent/hubSide');
const { primaryAddress } = require('../cli/net');

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

router.get('/hub', async (_req, res) => {
  const { cert } = tls.ensureCert();
  res.json({
    hostname: os.hostname(),
    address: primaryAddress(),
    fingerprint: tls.fingerprint(cert.toString()),
    host: await hostInfo.snapshot(),
  });
});

router.post('/tokens', async (req, res) => {
  const token = await joinTokens.create(req.body?.label);
  res.json({ token });
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

router.delete('/processes/:name', async (req, res) => {
  await processManager.remove(req.params.name);
  res.json({ ok: true });
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

router.post('/agents/:id/processes', (req, res) => {
  const { name, command, args, cwd, env, autorestart, port } = req.body || {};
  if (!name || !command) {
    res.status(400).json({ error: 'name and command required' });
    return;
  }
  const config = { command, args, cwd, env, autorestart, port };
  if (!sendCommand(req.params.id, 'add', name, { config })) {
    res.status(404).json({ error: 'agent not connected' });
    return;
  }
  res.json({ ok: true });
});

router.post('/shutdown', (_req, res) => {
  res.json({ ok: true });
  setTimeout(() => {
    processManager.stopAll();
    try {
      const daemon = require('../cli/daemon');
      require('fs').rmSync(daemon.pidFile('hub'), { force: true });
    } catch {}
    process.exit(0);
  }, 200);
});

router.post('/agents/:id/processes/:name/:action', (req, res) => {
  const { id, name, action } = req.params;
  if (!['start', 'stop', 'restart', 'reload', 'remove'].includes(action)) {
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
