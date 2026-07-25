
const { Command } = require('commander');
const config = require('../src/core/config');
const store = require('../src/core/store');
const tls = require('../src/core/tls');
const joinTokens = require('../src/core/joinTokens');
const sessions = require('../src/core/sessions');
const localApi = require('../src/cli/localClient');
const { primaryAddress } = require('../src/cli/net');

const program = new Command();
program
  .name('latch')
  .description('Latch is a self-hosted panel to view and manage all your instances across systems.');

program
  .command('up')
  .description('start the hub (panel + API) on this box')
  .action(async () => {
    const { start } = require('../src/hub/server');
    const pairing = require('../src/core/pairing');
    start();

    const addr = primaryAddress();
    const base = `https://${addr}:${config.hubPort}`;
    const hasSessions = Object.keys(store.read().sessions).length > 0;

    console.log(`Latch is up on ${base}`);
    if (!hasSessions) {
      const { code } = pairing.issue();
      console.log('');
      console.log('No paired browser yet. Pair one now:');
      console.log(`  ${base}/pair`);
      console.log(`  code: ${code}`);
      console.log('');
      console.log("(this also prints on SSH login once you run `latch hook install`)");
    }
  });

program
  .command('pair')
  .description('print the current pairing link and one-time code')
  .action(async () => {
    try {
      const { code, expiresAt } = await localApi.get('/pairing-code');
      const addr = primaryAddress();
      console.log(`  https://${addr}:${config.hubPort}/pair`);
      if (code) console.log(`  code: ${code}  (expires ${new Date(expiresAt).toLocaleTimeString()})`);
    } catch {
      console.error('Could not reach the hub Is it running? Start it with `latch up`.');
      process.exitCode = 1;
    }
  });

const tokenCmd = program.command('token').description('manage join tokens and API tokens');

tokenCmd
  .command('create')
  .description('mint a join token for an agent on another box')
  .option('--label <label>', 'name to refer to this agent as')
  .action(async (opts) => {
    const token = await joinTokens.create(opts.label);
    const { cert } = tls.ensureCert();
    const fingerprint = tls.fingerprint(cert.toString());
    const addr = primaryAddress();
    console.log('Run this on your other server:');
    console.log('');
    console.log(
      `  latch join https://${addr}:${config.hubPort} --token ${token} --fingerprint ${fingerprint}` +
        (opts.label ? ` --name ${opts.label}` : ''),
    );
  });

tokenCmd
  .command('api')
  .description('mint a long-lived API token for scripts, the MCP server, etc.')
  .option('--label <label>', 'name to remember this token by')
  .action(async (opts) => {
    const { token } = await sessions.create({ label: opts.label || 'api token' });
    const { cert } = tls.ensureCert();
    const fingerprint = tls.fingerprint(cert.toString());
    const addr = primaryAddress();
    console.log('API token (shown once - store it securely):');
    console.log('');
    console.log(`  ${token}`);
    console.log('');
    console.log('Environment for `latch-mcp` or your own scripts:');
    console.log('');
    console.log(`  LATCH_URL=https://${addr}:${config.hubPort}`);
    console.log(`  LATCH_TOKEN=${token}`);
    console.log(`  LATCH_FINGERPRINT=${fingerprint}`);
    console.log('');
    console.log('Revoke it any time with `latch sessions revoke <id>`.');
  });

const sessionsCmd = program
  .command('sessions')
  .description('list paired browsers and API tokens')
  .action(() => {
    const rows = sessions.list();
    if (!rows.length) { console.log('No sessions yet.'); return; }
    for (const s of rows) {
      console.log(`${s.id}  ${s.label.padEnd(20)} last seen ${new Date(s.lastSeenAt).toLocaleString()}`);
    }
  });

sessionsCmd
  .command('revoke <id>')
  .description('revoke a paired browser or API token')
  .action(async (id) => {
    await sessions.revoke(id);
    console.log(`Revoked ${id}.`);
  });

program
  .command('join <hubUrl>')
  .description('run this box as an agent of a hub')
  .requiredOption('--token <token>', 'join token from `latch token create`')
  .requiredOption('--fingerprint <fingerprint>', "the hub's certificate fingerprint")
  .option('--name <name>', 'name to report to the hub')
  .action((hubUrl, opts) => {
    const { connect } = require('../src/agent/client');
    const { startInternal } = require('../src/hub/server');
    startInternal();
    connect({ hubUrl, token: opts.token, fingerprint: opts.fingerprint, name: opts.name });
    console.log(`Joining ${hubUrl} as an agent...`);
    console.log(`Local CLI (add/ps/start/stop/logs) works on this box same as on a hub.`);
  });

program
  .command('ps')
  .description('list processes managed on this box')
  .action(async () => {
    const rows = await localApi.get('/processes');
    if (!rows.length) {
      console.log('No processes yet. Add one with `latch add <name> <command...>`.');
      return;
    }
    for (const p of rows) {
      console.log(`${p.status.padEnd(8)} ${p.name.padEnd(20)} ${p.command || ''}`);
    }
  });

program
  .command('add <name> <command...>')
  .description('register a new managed process, e.g. `latch add web --autorestart --port 3000 -- node server.js`')
  .allowUnknownOption()
  .action(async (name, command) => {
    const autorestart = command.includes('--autorestart');
    const portIdx = command.indexOf('--port');
    const port = portIdx !== -1 ? command[portIdx + 1] : undefined;
    const rest = command.filter((t, i) => t !== '--autorestart' && (portIdx === -1 || (i !== portIdx && i !== portIdx + 1)));
    const argv = rest[0] === '--' ? rest.slice(1) : rest;
    await localApi.post('/processes', {
      name,
      command: argv[0],
      args: argv.slice(1),
      autorestart,
      port,
    });
    console.log(`Added "${name}". Start it with \`latch start ${name}\`.`);
  });

const PAST_TENSE = { start: 'started', stop: 'stopped', restart: 'restarted', reload: 'reloaded' };
for (const action of Object.keys(PAST_TENSE)) {
  program
    .command(`${action} <name>`)
    .description(`${action} a managed process`)
    .action(async (name) => {
      await localApi.post(`/processes/${encodeURIComponent(name)}/${action}`);
      console.log(`${name}: ${PAST_TENSE[action]}`);
    });
}

program
  .command('logs <name>')
  .description('show recent output from a managed process')
  .option('--lines <n>', 'number of lines', '200')
  .action(async (name, opts) => {
    const text = await localApi.get(`/processes/${encodeURIComponent(name)}/logs?lines=${opts.lines}`);
    console.log(text);
  });

program
  .command('link <name> <url>')
  .description('link a process\'s working directory to a git repo')
  .action(async (name, url) => {
    const info = await localApi.post(`/processes/${encodeURIComponent(name)}/git`, { url });
    console.log(`Linked ${name} to ${info.repo} (${info.branch} @ ${info.hash})`);
  });

program
  .command('pull <name>')
  .description('git pull in a process\'s working directory')
  .option('--reload', 'reload the process after pulling')
  .action(async (name, opts) => {
    const info = await localApi.post(`/processes/${encodeURIComponent(name)}/pull`);
    console.log(`${name}: ${info.hash} ${info.message} (${info.behind} behind)`);
    if (opts.reload) {
      await localApi.post(`/processes/${encodeURIComponent(name)}/reload`);
      console.log(`${name}: reloaded`);
    }
  });

program
  .command('agents')
  .description('list connected agents')
  .action(async () => {
    const rows = await localApi.get('/agents');
    if (!rows.length) {
      console.log('No agents connected. Mint a token with `latch token create`.');
      return;
    }
    for (const a of rows) {
      console.log(`${(a.online ? 'online' : 'offline').padEnd(8)} ${a.name.padEnd(20)} ${a.processes.length} process(es)`);
    }
  });

program
  .command('hook install')
  .description('reprint the pairing link on every SSH login (Linux only)')
  .action(() => {
    const fs = require('fs');
    const path = require('path');
    if (process.platform !== 'linux') {
      console.error('`latch hook install` only supports Linux (/etc/profile.d) right now.');
      process.exitCode = 1;
      return;
    }
    const dest = '/etc/profile.d/latch-pair.sh';
    try {
      const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ssh-login-hook.sh'));
      fs.writeFileSync(dest, src, { mode: 0o755 });
      console.log(`Installed. New SSH logins will reprint the pairing link. (${dest})`);
    } catch (err) {
      console.error(`Couldn't write ${dest} - try again with sudo. (${err.message})`);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
