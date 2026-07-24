#!/usr/bin/env node
const { Command } = require('commander');
const config = require('../src/core/config');
const store = require('../src/core/store');
const tls = require('../src/core/tls');
const joinTokens = require('../src/core/joinTokens');
const localApi = require('../src/cli/localClient');
const { primaryAddress } = require('../src/cli/net');

const program = new Command();
program
  .name('latch')
  .description('A self-hosted panel to view and manage all your instances across systems.');

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
      console.error('Could not reach the hub. Is it running? Start it with `latch up`.');
      process.exitCode = 1;
    }
  });

program
  .command('token create')
  .description('mint a join token for an agent on another box')
  .option('--label <label>', 'name to remember this agent by')
  .action(async (opts) => {
    const token = await joinTokens.create(opts.label);
    const { cert } = tls.ensureCert();
    const fingerprint = tls.fingerprint(cert.toString());
    const addr = primaryAddress();
    console.log('Run this on the other box:');
    console.log('');
    console.log(
      `  latch join https://${addr}:${config.hubPort} --token ${token} --fingerprint ${fingerprint}` +
        (opts.label ? ` --name ${opts.label}` : ''),
    );
  });

program
  .command('join <hubUrl>')
  .description('run this box as an agent of a hub')
  .requiredOption('--token <token>', 'join token from `latch token create`')
  .requiredOption('--fingerprint <fingerprint>', "the hub's certificate fingerprint")
  .option('--name <name>', 'name to report to the hub')
  .action((hubUrl, opts) => {
    const { connect } = require('../src/agent/client');
    connect({ hubUrl, token: opts.token, fingerprint: opts.fingerprint, name: opts.name });
    console.log(`Joining ${hubUrl} as an agent...`);
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
  .description('register a new managed process, e.g. `latch add web --autorestart -- node server.js`')
  .allowUnknownOption()
  .action(async (name, command) => {
    const autorestart = command.includes('--autorestart');
    const rest = command.filter((t) => t !== '--autorestart');
    const argv = rest[0] === '--' ? rest.slice(1) : rest;
    await localApi.post('/processes', {
      name,
      command: argv[0],
      args: argv.slice(1),
      autorestart,
    });
    console.log(`Added "${name}". Start it with \`latch start ${name}\`.`);
  });

const PAST_TENSE = { start: 'started', stop: 'stopped', restart: 'restarted' };
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
      console.error(`Couldn't write ${dest} — try again with sudo. (${err.message})`);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
