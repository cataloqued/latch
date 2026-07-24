const crypto = require('crypto');
const joinTokens = require('../core/joinTokens');
const store = require('../core/store');

const liveSockets = new Map();

function attachAgentServer(wss) {
  wss.on('connection', (ws) => {
    let agentId = null;

    ws.once('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.close(1008, 'bad handshake');
        return;
      }
      if (msg.type !== 'hello' || !msg.token) {
        ws.close(1008, 'bad handshake');
        return;
      }
      const tokenRecord = joinTokens.verify(msg.token);
      if (!tokenRecord) {
        ws.close(1008, 'invalid token');
        return;
      }

      agentId = crypto.randomBytes(8).toString('hex');
      liveSockets.set(agentId, ws);
      await store.mutate((s) => {
        s.agents[agentId] = {
          id: agentId,
          name: msg.name || tokenRecord.label,
          connectedAt: Date.now(),
          processes: [],
        };
      });

      ws.send(JSON.stringify({ type: 'welcome', agentId }));

      ws.on('message', (raw2) => {
        let m;
        try {
          m = JSON.parse(raw2.toString());
        } catch {
          return;
        }
        if (m.type === 'processList') {
          store.mutate((s) => {
            if (s.agents[agentId]) s.agents[agentId].processes = m.processes;
          });
        }
      });

      ws.on('close', () => {
        liveSockets.delete(agentId);
        store.mutate((s) => {
          if (s.agents[agentId]) s.agents[agentId].connectedAt = null;
        });
      });
    });
  });
}

function listAgents() {
  return Object.values(store.read().agents).map((a) => ({ ...a, online: liveSockets.has(a.id) }));
}

function sendCommand(agentId, action, name) {
  const ws = liveSockets.get(agentId);
  if (!ws || ws.readyState !== ws.OPEN) return false;
  ws.send(JSON.stringify({ type: 'command', action, name }));
  return true;
}

module.exports = { attachAgentServer, listAgents, sendCommand };
