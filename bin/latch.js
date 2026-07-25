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

// half-block truecolor render of the Latch mark, next to a plain wordmark
const BANNER_LINES = [
  "   \x1b[38;2;87;200;104m\x1b[49m▄\x1b[38;2;136;215;153m\x1b[48;2;62;195;80m▀\x1b[38;2;100;201;117m\x1b[49m▄    \x1b[0m",
  "  \x1b[38;2;84;191;101m\x1b[48;2;85;192;102m▀\x1b[38;2;77;196;95m\x1b[48;2;117;201;134m▀\x1b[38;2;114;200;131m\x1b[48;2;98;197;115m▀\x1b[38;2;64;189;81m\x1b[48;2;135;207;151m▀\x1b[38;2;86;201;104m\x1b[48;2;81;194;98m▀\x1b[38;2;83;195;101m\x1b[49m▄  \x1b[0m",
  " \x1b[38;2;105;197;122m\x1b[49m▄\x1b[38;2;88;201;105m\x1b[48;2;90;210;109m▀\x1b[38;2;79;190;95m\x1b[48;2;86;192;103m▀\x1b[38;2;79;192;96m\x1b[49m▀\x1b[38;2;74;196;92m\x1b[48;2;114;200;130m▀\x1b[38;2;123;203;139m\x1b[48;2;81;198;98m▀\x1b[38;2;91;205;109m\x1b[48;2;93;200;111m▀\x1b[38;2;101;196;118m\x1b[48;2;91;194;107m▀ \x1b[0m",
  " \x1b[38;2;134;208;151m\x1b[48;2;120;204;136m▀\x1b[38;2;138;226;156m\x1b[48;2;90;216;109m▀\x1b[38;2;119;202;135m\x1b[48;2;153;214;168m▀  \x1b[38;2;131;208;148m\x1b[49m▀\x1b[38;2;78;198;96m\x1b[48;2;81;190;97m▀\x1b[38;2;82;190;98m\x1b[48;2;70;191;88m▀ \x1b[0m",
  " \x1b[38;2;90;194;107m\x1b[48;2;83;190;100m▀\x1b[38;2;87;212;106m\x1b[48;2;77;200;95m▀    \x1b[38;2;113;200;130m\x1b[48;2;136;208;153m▀\x1b[38;2;131;214;148m\x1b[48;2;127;214;144m▀ \x1b[0m",
  " \x1b[38;2;81;190;97m\x1b[48;2;78;190;94m▀\x1b[38;2;74;189;91m\x1b[48;2;75;188;92m▀    \x1b[38;2;133;207;150m\x1b[48;2;80;191;97m▀\x1b[38;2;142;223;156m\x1b[48;2;65;203;83m▀\x1b[38;2;101;196;120m\x1b[49m▄\x1b[0m",
  " \x1b[38;2;75;189;92m\x1b[48;2;73;189;90m▀\x1b[38;2;79;189;95m\x1b[48;2;83;191;100m▀    \x1b[38;2;130;206;146m\x1b[48;2;97;200;115m▀\x1b[38;2;136;221;149m\x1b[48;2;89;196;106m▀\x1b[38;2;134;206;150m\x1b[48;2;104;198;120m▀\x1b[0m   \x1b[32m\x1b[1m _       _       _\x1b[0m",
  " \x1b[38;2;76;198;93m\x1b[48;2;77;205;95m▀\x1b[38;2;87;192;103m\x1b[48;2;91;192;108m▀    \x1b[38;2;68;189;86m\x1b[48;2;72;190;90m▀\x1b[38;2;54;185;71m\x1b[48;2;60;187;77m▀\x1b[38;2;83;191;99m\x1b[48;2;86;192;102m▀\x1b[0m   \x1b[32m\x1b[1m| | __ _| |_ ___| |__\x1b[0m",
  "\x1b[38;2;102;197;116m\x1b[49m▄\x1b[38;2;77;208;96m\x1b[48;2;78;209;97m▀\x1b[38;2;97;196;114m\x1b[49m▀    \x1b[38;2;81;196;99m\x1b[48;2;133;208;148m▀\x1b[38;2;66;189;84m\x1b[48;2;138;218;152m▀\x1b[38;2;92;194;108m\x1b[48;2;134;208;150m▀\x1b[0m   \x1b[32m\x1b[1m| |/ _\` | __/ __| '_ \\\x1b[0m",
  "\x1b[38;2;93;194;111m\x1b[48;2;88;192;104m▀\x1b[38;2;77;207;96m\x1b[48;2;77;202;95m▀     \x1b[38;2;99;195;116m\x1b[48;2;135;208;150m▀\x1b[38;2;98;212;113m\x1b[48;2;140;219;155m▀\x1b[38;2;115;200;132m\x1b[49m▀\x1b[0m   \x1b[32m\x1b[1m| | (_| | || (__| | | |\x1b[0m",
  "\x1b[38;2;80;191;96m\x1b[48;2;106;199;123m▀\x1b[38;2;83;204;101m\x1b[48;2;82;208;101m▀\x1b[38;2;133;207;151m\x1b[49m▄    \x1b[38;2;108;199;125m\x1b[48;2;132;206;148m▀\x1b[38;2;87;204;106m\x1b[48;2;128;217;145m▀ \x1b[0m   \x1b[32m\x1b[1m|_|\\__,_|\\__\\___|_| |_|\x1b[0m",
  "\x1b[38;2;133;207;149m\x1b[48;2;113;200;129m▀\x1b[38;2;121;218;139m\x1b[48;2;111;210;128m▀\x1b[38;2;113;201;130m\x1b[48;2;89;193;105m▀    \x1b[38;2;126;205;141m\x1b[48;2;89;193;105m▀\x1b[38;2;140;219;157m\x1b[48;2;93;206;111m▀ \x1b[0m",
  " \x1b[38;2;65;187;82m\x1b[48;2;84;191;101m▀\x1b[38;2;71;196;89m\x1b[48;2;76;197;94m▀\x1b[38;2;94;195;110m\x1b[49m▄   \x1b[38;2;77;187;93m\x1b[48;2;80;197;97m▀\x1b[38;2;66;193;84m\x1b[48;2;76;188;93m▀ \x1b[0m",
  " \x1b[38;2;91;193;108m\x1b[49m▀\x1b[38;2;90;200;107m\x1b[48;2;79;200;97m▀\x1b[38;2;92;202;110m\x1b[48;2;109;199;126m▀\x1b[38;2;107;200;124m\x1b[48;2;79;190;96m▀\x1b[38;2;86;193;103m\x1b[49m▄\x1b[38;2;99;197;116m\x1b[48;2;78;192;95m▀\x1b[38;2;85;202;103m\x1b[48;2;100;203;117m▀\x1b[38;2;87;192;104m\x1b[48;2;87;192;104m▀ \x1b[0m",
  "  \x1b[38;2;95;194;113m\x1b[49m▀\x1b[38;2;84;198;101m\x1b[48;2;79;195;97m▀\x1b[38;2;121;202;137m\x1b[48;2;87;194;105m▀\x1b[38;2;80;191;96m\x1b[48;2;132;206;148m▀\x1b[38;2;128;205;143m\x1b[48;2;73;191;90m▀\x1b[38;2;83;202;101m\x1b[48;2;81;192;98m▀\x1b[38;2;108;198;125m\x1b[49m▀ \x1b[0m",
  "   \x1b[38;2;123;202;138m\x1b[49m▀\x1b[38;2;77;205;95m\x1b[48;2;131;208;148m▀\x1b[38;2;62;191;80m\x1b[48;2;131;210;148m▀\x1b[38;2;90;201;107m\x1b[49m▀\x1b[38;2;132;204;147m\x1b[49m▀  \x1b[0m",
];

const PLAIN_WORDMARK = [
  ' _       _       _',
  '| | __ _| |_ ___| |__',
  "| |/ _` | __/ __| '_ \\",
  '| | (_| | || (__| | | |',
  '|_|\\__,_|\\__\\___|_| |_|',
].join('\n');

function banner() {
  return process.stdout.isTTY ? BANNER_LINES.join('\n') : PLAIN_WORDMARK;
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
      console.log('Use `latch kill` to stop it, or `latch status` to check.');
      return;
    }

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

    console.log(banner());
    console.log('');
    console.log(`Latch is up on ${base} (pid ${pid}, running in the background)`);
    console.log(`Logs: ${daemon.logFile('hub')}`);
    console.log('Use `latch kill` to stop it, `latch status` to check on it.');

    if (!hasSessions) {
      // the daemon just booted in its own process - ask it for the pairing code
      // it actually issued, rather than generating one here that it would never see
      const { code } = await localApi.get('/pairing-code');
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
  .command('kill')
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
  .action(async () => {
    const daemon = require('../src/cli/daemon');
    const hub = daemon.status('hub');
    if (hub.running) {
      console.log(`Running as hub (pid ${hub.pid}).`);
      const addr = primaryAddress();
      const base = `https://${addr}:${config.hubPort}`;
      try {
        const { code, expiresAt } = await localApi.get('/pairing-code');
        if (code) {
          console.log(`  ${base}/pair?code=${code}  (expires ${new Date(expiresAt).toLocaleTimeString()})`);
        } else {
          console.log(`  ${base}`);
        }
      } catch {
        console.log(`  ${base}`);
      }
      return;
    }
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
      console.log('Use `latch kill` to stop it, or `latch status` to check.');
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
    console.log('Use `latch kill` to stop it, `latch status` to check on it');
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

program.parseAsync(process.argv).catch((err) => {
  if (err.code === 'ECONNREFUSED') {
    console.error('Could not reach Latch on this server. Is it running? Start it with `latch up`.');
  } else {
    console.error(err.message || String(err));
  }
  process.exitCode = 1;
});
