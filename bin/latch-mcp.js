#!/usr/bin/env node
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { client } = require('../src/mcp/client');

const url = process.env.LATCH_URL;
const token = process.env.LATCH_TOKEN;
const fingerprint = process.env.LATCH_FINGERPRINT;

if (!url || !token) {
  console.error('LATCH_URL and LATCH_TOKEN are required. Run `latch token api` on the hub to get both (plus a fingerprint).');
  process.exit(1);
}

const api = client({ url, token, fingerprint });

function text(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function errorText(err) {
  return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
}

function actionPath(name, agent, action) {
  return agent
    ? `/agents/${encodeURIComponent(agent)}/processes/${encodeURIComponent(name)}/${action}`
    : `/processes/${encodeURIComponent(name)}/${action}`;
}

const server = new McpServer({ name: 'latch', version: '0.1.0' });

server.tool(
  'list_processes',
  'List every process Latch knows about across the hub and every connected agent, with status, pid, and restart counts.',
  {},
  async () => {
    try {
      const [processes, agents] = await Promise.all([api.get('/processes'), api.get('/agents')]);
      return text({ hub: processes, agents });
    } catch (err) {
      return errorText(err);
    }
  },
);

for (const [action, verb] of Object.entries({ start: 'Start', stop: 'Stop', restart: 'Restart', reload: 'Zero-gap reload' })) {
  server.tool(
    action + '_process',
    `${verb} a managed process. Pass "agent" (its id from list_processes) to target a process on a remote agent instead of the hub.`,
    { name: z.string(), agent: z.string().optional() },
    async ({ name, agent }) => {
      try {
        return text(await api.post(actionPath(name, agent, action)));
      } catch (err) {
        return errorText(err);
      }
    },
  );
}

server.tool(
  'logs',
  'Get recent output from a hub-local process. Not available for processes running on remote agents yet.',
  { name: z.string(), lines: z.number().optional() },
  async ({ name, lines }) => {
    try {
      const out = await api.get(`/processes/${encodeURIComponent(name)}/logs?lines=${lines || 200}`);
      return text(out || '(no output)');
    } catch (err) {
      return errorText(err);
    }
  },
);

server.tool(
  'git_status',
  "Check a hub-local process's linked git repo: branch, latest commit, and how many commits behind origin.",
  { name: z.string() },
  async ({ name }) => {
    try {
      return text(await api.get(`/processes/${encodeURIComponent(name)}/git`));
    } catch (err) {
      return errorText(err);
    }
  },
);

server.tool(
  'link_repo',
  "Link a hub-local process's working directory to a git repo (clones it if the directory is empty).",
  { name: z.string(), url: z.string() },
  async ({ name, url: repoUrl }) => {
    try {
      return text(await api.post(`/processes/${encodeURIComponent(name)}/git`, { url: repoUrl }));
    } catch (err) {
      return errorText(err);
    }
  },
);

server.tool(
  'pull',
  "Git pull in a hub-local process's working directory, optionally reloading it afterward with zero downtime.",
  { name: z.string(), reload: z.boolean().optional() },
  async ({ name, reload }) => {
    try {
      const info = await api.post(`/processes/${encodeURIComponent(name)}/pull`);
      if (reload) await api.post(`/processes/${encodeURIComponent(name)}/reload`);
      return text(info);
    } catch (err) {
      return errorText(err);
    }
  },
);

server.tool(
  'add_process',
  'Register a new managed process on the hub.',
  {
    name: z.string(),
    command: z.string(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    port: z.number().optional(),
    autorestart: z.boolean().optional(),
  },
  async (input) => {
    try {
      return text(await api.post('/processes', input));
    } catch (err) {
      return errorText(err);
    }
  },
);

server.tool(
  'remove_process',
  'Remove a hub-local managed process.',
  { name: z.string() },
  async ({ name }) => {
    try {
      await api.del(`/processes/${encodeURIComponent(name)}`);
      return text(`Removed ${name}`);
    } catch (err) {
      return errorText(err);
    }
  },
);

const transport = new StdioServerTransport();
server.connect(transport);
