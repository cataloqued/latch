#!/usr/bin/env node
const path = require('path');
const { Command } = require('commander');
const config = require('../src/core/config');
const store = require('../src/core/store');
const tls = require('../src/core/tls');
const joinTokens = require('../src/core/joinTokens');
const sessions = require('../src/core/sessions');
const localApi = require('../src/cli/localClient');
const { primaryAddress } = require('../src/cli/net');

function underline(text) {
  return [...text].map((ch) => ch + '̲').join('');
}

const program = new Command();
program
  .name('latch')
  .description('Latch is a self-hosted panel to view and manage all your instances across systems.');

program
  .command('up')
  .description('Start the hub (panel + API) on this server')
  .option('--foreground', 'run attached to this terminal instead of in the background')
  .action(async (opts) => {
    if (opts.foreground) {
      const { start } = require('../src/hub/server');
      start();
      console.log(`[${new Date().toISOString()}] hub started`);
      return;
    }

    const daemon = require('../src/cli/daemon');
    const existing = daemon.status('hub');
    if (existing.running) {
      console.log(`Latch is already running (pid ${existing.pid}).`);
      console.log('Use `latch down` to stop it, or `latch status` to check.');
      return;
    }

    const pairing = require('../src/core/pairing');
    const { promptOpenBrowser } = require('../src/cli/openBrowser');
    const addr = primaryAddress();
    const base = `https://${addr}:${config.hubPort}`;
    const hasSessions = Object.keys(store.read().sessions).length > 0;

    const pid = daemon.spawnDaemon('hub', ['up', '--foreground']);
    await new Promise((r) => setTimeout(r, 500));
    if (!daemon.isAlive(pid)) {
      console.error('Latch failed to start. Check the log:');
      console.error(`  ${daemon.logFile('hub')}`);
      process.exitCode = 1;
      return;
    }




    if (!hasSessions) {
      const { code } = pairing.issue();
      const link = `${base}/pair?code=${code}`;
      console.log('');
      console.log(underline('Open this link to pair and use Latch:'));
      console.log(`  ${link}`);
      console.log('');
      console.log('If this is a remote server, you may need to allow inbound traffic on this port in its firewall/security group.');
      console.log(`  (use code ${code} at ${base}/pair if you want to use Latch on another device)`);
      console.log('');
      console.log("(the link also prints on SSH login once you run `latch hook install`)");
      promptOpenBrowser(link);
    }
  });

program
  .command('down')
  .description('Stop the background Latch hub or agent process')
  .action(() => {
    const daemon = require('../src/cli/daemon');
    const hub = daemon.status('hub');
    if (hub.running) {
      daemon.stopDaemon('hub');
      console.log(`Stopped Latch hub (pid ${hub.pid}).`);
      return;
    }
    const agent = daemon.status('agent');
    if (agent.running) {
      daemon.stopDaemon('agent');
      console.log(`Stopped Latch agent (pid ${agent.pid}).`);
      return;
    }
    console.log('Latch is not running.');
  });

program
  .command('status')
  .description('Check whether Latch is running on this server')
  .action(() => {
    const daemon = require('../src/cli/daemon');
    const hub = daemon.status('hub');
    if (hub.running) { console.log(`Running as hub (pid ${hub.pid}).`); return; }
    const agent = daemon.status('agent');
    if (agent.running) { console.log(`Running as agent (pid ${agent.pid}).`); return; }
    console.log('Latch is not running. Start it with `latch up` or `latch join`.');
  });

program
  .command('pair')
  .description('Print the current pairing link and one-time code')
  .action(async () => {
    try {
      const { code, expiresAt } = await localApi.get('/pairing-code');
      const addr = primaryAddress();
      const base = `https://${addr}:${config.hubPort}`;
      if (code) {
        const link = `${base}/pair?code=${code}`;
        console.log(`  ${link}`);
        console.log(`  (expires ${new Date(expiresAt).toLocaleTimeString()} - or enter code ${code} manually)`);
        const { promptOpenBrowser } = require('../src/cli/openBrowser');
        promptOpenBrowser(link);
      } else {
        console.log(`  ${base}/pair`);
      }
    } catch {
      console.error('Could not reach the hub Is it running? Start it with `latch up`.');
      process.exitCode = 1;
    }
  });

const tokenCmd = program.command('token').description('manage join tokens and API tokens');

tokenCmd
  .command('create')
  .description('Create a join token for connecting another server as an agent')
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
  .description('Create a long-lived API token (for scripts, the MCP server)')
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
  .description('List paired browsers and API tokens')
  .action(() => {
    const rows = sessions.list();
    if (!rows.length) { console.log('No sessions yet.'); return; }
    for (const s of rows) {
      console.log(`${s.id}  ${s.label.padEnd(20)} last seen ${new Date(s.lastSeenAt).toLocaleString()}`);
    }
  });

sessionsCmd
  .command('revoke <id>')
  .description('Revoke a session or token')
  .action(async (id) => {
    await sessions.revoke(id);
    console.log(`Revoked ${id}.`);
  });

program
  .command('join <hubUrl>')
  .description('Run this server as an agent of the panel')
  .requiredOption('--token <token>', 'join token from `latch token create`')
  .requiredOption('--fingerprint <fingerprint>', "the hub's certificate fingerprint")
  .option('--name <name>', 'name to report to the hub')
  .option('--foreground', 'run attached to this terminal instead of in the background')
  .action(async (hubUrl, opts) => {
    if (opts.foreground) {
      const { connect } = require('../src/agent/client');
      const { startInternal } = require('../src/hub/server');
      startInternal();
      connect({ hubUrl, token: opts.token, fingerprint: opts.fingerprint, name: opts.name });
      console.log(`[${new Date().toISOString()}] agent connecting to ${hubUrl}`);
      return;
    }

    const daemon = require('../src/cli/daemon');
    const existing = daemon.status('agent');
    if (existing.running) {
      console.log(`Already running as an agent (pid ${existing.pid}).`);
      console.log('Use `latch down` to stop it, or `latch status` to check.');
      return;
    }

    const args = ['join', hubUrl, '--token', opts.token, '--fingerprint', opts.fingerprint, '--foreground'];
    if (opts.name) args.push('--name', opts.name);
    const pid = daemon.spawnDaemon('agent', args);
    await new Promise((r) => setTimeout(r, 500));
    if (!daemon.isAlive(pid)) {
      console.error('Failed to join. Check the log:');
      console.error(`  ${daemon.logFile('agent')}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Joining ${hubUrl} as an agent... (pid ${pid})`);
    console.log('Local CLI (add/ps/start/stop/logs) works on this box same as on a hub');
    console.log(`Logs: ${daemon.logFile('agent')}`);
    console.log('Use `latch down` to stop it, `latch status` to check on it');
  });

program
  .command('ps')
  .description('List processes managed on this server')
  .action(async () => {
    const rows = await localApi.get('/processes');
    if (!rows.length) {
      console.log('No processes yet. Add one with `latch start <command...> --name <name>`.');
      return;
    }
    for (const p of rows) {
      console.log(`${p.status.padEnd(8)} ${p.name.padEnd(20)} ${p.command || ''}`);
    }
  });

const INTERPRETERS = { '.js': 'node', '.mjs': 'node', '.cjs': 'node', '.py': 'python', '.rb': 'ruby', '.sh': 'bash' };

program
  .command('start <command...>')
  .description('Start a process - registers it first if new, e.g. `latch start index.js --name web`')
  .option('--name <name>', 'name to register this process under (defaults to the script name)')
  .option('--cwd <dir>', 'working directory to run this process in (defaults to your current directory)')
  .option('--agent <id>', 'run this on a connected agent instead of the local hub')
  .allowUnknownOption()
  .action(async (command, opts) => {
    if (command.length === 1 && !opts.name && !opts.agent) {
      const existing = await localApi.get('/processes').catch(() => []);
      if (existing.some((p) => p.name === command[0])) {
        await localApi.post(`/processes/${encodeURIComponent(command[0])}/start`);
        console.log(`${command[0]}: started`);
        return;
      }
    }

    const autorestart = command.includes('--autorestart');
    const portIdx = command.indexOf('--port');
    const port = portIdx !== -1 ? command[portIdx + 1] : undefined;
    const rest = command.filter((t, i) => t !== '--autorestart' && (portIdx === -1 || (i !== portIdx && i !== portIdx + 1)));
    const argv = rest[0] === '--' ? rest.slice(1) : rest;

    let [cmd, ...args] = argv;
    const ext = path.extname(cmd || '').toLowerCase();
    if (INTERPRETERS[ext]) { args = [cmd, ...args]; cmd = INTERPRETERS[ext]; }

    const name = opts.name || path.basename(argv[0], path.extname(argv[0]));
    // for a remote agent, this box's cwd is meaningless - only default it for the local hub
    const cwd = opts.cwd || (opts.agent ? undefined : process.cwd());
    const body = { name, command: cmd, args, autorestart, port, cwd };

    if (opts.agent) {
      await localApi.post(`/agents/${encodeURIComponent(opts.agent)}/processes`, body);
      console.log(`${name}: added and started on agent ${opts.agent}`);
    } else {
      await localApi.post('/processes', body);
      await localApi.post(`/processes/${encodeURIComponent(name)}/start`);
      console.log(`${name}: started`);
    }
  });

const PAST_TENSE = { stop: 'stopped', restart: 'restarted', reload: 'reloaded' };
const ACTION_DESCRIPTIONS = {
  stop: 'Stop a process',
  restart: 'Restart a process',
  reload: 'Reloads the process (Starts a new one then removes the old one)',
};
for (const action of Object.keys(PAST_TENSE)) {
  program
    .command(`${action} <name>`)
    .description(ACTION_DESCRIPTIONS[action])
    .action(async (name) => {
      await localApi.post(`/processes/${encodeURIComponent(name)}/${action}`);
      console.log(`${name}: ${PAST_TENSE[action]}`);
    });
}

program
  .command('logs <name>')
  .description('Print recent output from the selected process (default 200 lines)')
  .option('--lines <n>', 'number of lines', '200')
  .action(async (name, opts) => {
    const text = await localApi.get(`/processes/${encodeURIComponent(name)}/logs?lines=${opts.lines}`);
    console.log(text);
  });

program
  .command('link <name> <url>')
  .description('Link a process\'s working directory to a git repo')
  .action(async (name, url) => {
    const info = await localApi.post(`/processes/${encodeURIComponent(name)}/git`, { url });
    console.log(`Linked ${name} to ${info.repo} (${info.branch} @ ${info.hash})`);
  });

program
  .command('pull <name>')
  .description('Git pull in the working directory, optional reloading afterwards')
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
  .description('List connected agents (servers)')
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
  .description('Reprint the pairing link on every SSH login (Linux only)')
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
