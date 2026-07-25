const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 15000, windowsHide: true }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

function repoName(url) {
  const stripped = url.replace(/\.git$/, '');
  const m = stripped.match(/[:/]([^/:]+\/[^/:]+)$/);
  return m ? m[1] : stripped;
}

async function isRepo(cwd) {
  if (!cwd || !fs.existsSync(cwd)) return false;
  try {
    return (await run(cwd, ['rev-parse', '--is-inside-work-tree'])) === 'true';
  } catch {
    return false;
  }
}

async function info(cwd) {
  if (!(await isRepo(cwd))) return null;
  try {
    await run(cwd, ['fetch', '--quiet']).catch(() => {});
    const branch = await run(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const [hash, message, when] = (await run(cwd, ['log', '-1', '--format=%h\x1f%s\x1f%cr'])).split('\x1f');
    let remote = null;
    try { remote = await run(cwd, ['remote', 'get-url', 'origin']); } catch {}
    let behind = 0;
    try { behind = Number(await run(cwd, ['rev-list', '--count', `HEAD..@{u}`])); } catch {}
    return { repo: remote ? repoName(remote) : path.basename(cwd), branch, hash, message, when, behind };
  } catch {
    return null;
  }
}

async function pull(cwd) {
  if (!(await isRepo(cwd))) throw new Error('not a git repository');
  return run(cwd, ['pull', '--ff-only']);
}

async function link(cwd, url) {
  const exists = fs.existsSync(cwd);
  const empty = !exists || fs.readdirSync(cwd).length === 0;
  if (empty) {
    fs.mkdirSync(path.dirname(cwd), { recursive: true });
    await run(path.dirname(cwd), ['clone', url, cwd]);
    return info(cwd);
  }
  if (await isRepo(cwd)) {
    try {
      await run(cwd, ['remote', 'get-url', 'origin']);
      throw new Error('this directory already has an origin remote');
    } catch (err) {
      if (err.message.includes('already has an origin')) throw err;
      await run(cwd, ['remote', 'add', 'origin', url]);
      return info(cwd);
    }
  }
  throw new Error('cwd has existing content and is not a git repository - link manually');
}

module.exports = { info, pull, link, isRepo };
