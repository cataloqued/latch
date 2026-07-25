const { exec } = require('child_process');

function openBrowser(url) {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function promptOpenBrowser(url, message = 'Press E̲N̲T̲E̲R̲ to open in your browser...') {
  if (!process.stdin.isTTY) return;
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(message, () => {
    rl.close();
    openBrowser(url);
  });
}

module.exports = { openBrowser, promptOpenBrowser };
