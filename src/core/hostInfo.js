const os = require('os');
const { execFile } = require('child_process');

const CACHE_MS = 5000;

function exec(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout) => resolve(err ? null : stdout));
  });
}

function cpuTimesSnapshot() {
  return os.cpus().map((c) => ({
    idle: c.times.idle,
    total: c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq,
  }));
}

let lastCpu = null;

function cpuUsagePercent() {
  const now = cpuTimesSnapshot();
  if (!lastCpu || lastCpu.length !== now.length) {
    lastCpu = now;
    return 0;
  }
  let idleDelta = 0;
  let totalDelta = 0;
  now.forEach((c, i) => {
    idleDelta += c.idle - lastCpu[i].idle;
    totalDelta += c.total - lastCpu[i].total;
  });
  lastCpu = now;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
}

async function diskUsage() {
  if (process.platform === 'win32') {
    const out = await exec('powershell', [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json',
    ]);
    if (!out) return [];
    try {
      const rows = JSON.parse(out);
      return (Array.isArray(rows) ? rows : [rows])
        .filter((r) => r.Size)
        .map((r) => ({ mount: r.DeviceID, total: Number(r.Size), free: Number(r.FreeSpace), used: Number(r.Size) - Number(r.FreeSpace) }));
    } catch {
      return [];
    }
  }
  const out = await exec('df', ['-kP']);
  if (!out) return [];
  return out
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length >= 6 && !/^(tmpfs|devtmpfs|udev)$/.test(cols[0]))
    .map((cols) => ({ mount: cols[5], total: Number(cols[1]) * 1024, used: Number(cols[2]) * 1024, free: Number(cols[3]) * 1024 }));
}

async function gpuInfo() {
  const out = await exec('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits']);
  if (!out) return [];
  return out
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, util, memUsed, memTotal] = line.split(',').map((s) => s.trim());
      return { name, usagePercent: Number(util), memUsedMB: Number(memUsed), memTotalMB: Number(memTotal) };
    });
}

let diskCache = { data: [], time: 0 };
let gpuCache = { data: [], time: 0 };

async function cached(cache, fn) {
  if (Date.now() - cache.time < CACHE_MS) return cache.data;
  const data = await fn();
  cache.data = data;
  cache.time = Date.now();
  return data;
}

async function snapshot() {
  const cpus = os.cpus();
  const [disks, gpus] = await Promise.all([cached(diskCache, diskUsage), cached(gpuCache, gpuInfo)]);
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    cpu: { model: (cpus[0]?.model || 'unknown').trim(), cores: cpus.length, usagePercent: cpuUsagePercent() },
    mem: { total: totalMem, used: totalMem - freeMem, free: freeMem },
    disks,
    gpus,
    uptimeSeconds: os.uptime(),
  };
}

module.exports = { snapshot };
