# Latch user guide

```bash
npm install -g latchup        # install
latch up                      # start the hub, prints a pairing link - open it
latch start <file> --name <name>   # register + start a process
latch ps                      # list processes
latch stop/restart/reload <name>
latch logs <name> --lines 50
latch link <name> <url>       # link a git repo
latch pull <name> --reload    # pull + zero-downtime reload
latch token create --label x  # mint a join command for another server
latch join <hubUrl> --token <t> --fingerprint <fp>   # run as an agent
latch agents                  # list connected agents
latch token api --label x     # create an API token for MCP/scripts
latch sessions / sessions revoke <id>
latch down                    # stop
latch status                  # is it running
```

## Troubleshooting

**`npm error EACCES`** - your system npm folder is root-owned. Either `sudo npm install -g latchup`, or fix it permanently:
```bash
mkdir ~/.npm-global && npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc && source ~/.bashrc
```

**`latch: command not found`** - you installed without `-g`. Run `npm install -g latchup`.

**Browser cert warning** - expected, self-signed by design (same trust model as SSH). Accept it once.

**`latch join` fails on the same box as `latch up`** - don't; the hub already has full local CLI access, agents are for *other* servers.
