const WebSocket = require('ws');
const tls = require('../core/tls');
const processManager = require('../core/processManager');
const hostInfo = require('../core/hostInfo');

const REPORT_INTERVAL_MS = 4_000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

function toWsUrl(hubUrl) {
  return hubUrl.replace(/^https:/, 'wss:').replace(/\/?$/, '/agent/join');
}

function connect({ hubUrl, token, name, fingerprint }) {
  let attempt = 0;

  function dial() {
    const ws = new WebSocket(toWsUrl(hubUrl), { rejectUnauthorized: false });
    let reportTimer;

    ws.on('upgrade', (res) => {
      const cert = res.socket.getPeerCertificate?.();
      const actual = cert?.fingerprint256?.toLowerCase();
      if (!actual || actual !== fingerprint.toLowerCase()) {
        ws.terminate();
      }
    });

    const reportList = async () => {
      const host = await hostInfo.snapshot();
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'processList', processes: processManager.list(), host }));
    };

    ws.on('open', () => {
      attempt = 0;
      ws.send(JSON.stringify({ type: 'hello', token, name }));
      reportList();
      reportTimer = setInterval(reportList, REPORT_INTERVAL_MS);
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'command') {
        (async () => {
          if (msg.action === 'add') {
            await processManager.add(msg.name, msg.config || {});
            processManager.start(msg.name);
          }
          if (msg.action === 'start') processManager.start(msg.name);
          if (msg.action === 'stop') processManager.stop(msg.name);
          if (msg.action === 'restart') processManager.restart(msg.name);
          if (msg.action === 'reload') processManager.reload(msg.name);
          if (msg.action === 'remove') await processManager.remove(msg.name);
          setTimeout(reportList, 300);
        })();
      }
    });

    ws.on('close', () => {
      clearInterval(reportTimer);
      attempt += 1;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
      setTimeout(dial, delay);
    });

    ws.on('error', () => ws.close());
  }

  dial();
}

module.exports = { connect, toWsUrl };
