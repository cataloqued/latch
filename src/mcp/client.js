const https = require('https');

function request({ url, token, fingerprint }, method, urlPath, body) {
  const target = new URL(url.replace(/\/$/, '') + '/api' + urlPath);
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method,
        rejectUnauthorized: false,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        if (fingerprint) {
          const cert = res.socket.getPeerCertificate?.();
          const actual = cert?.fingerprint256?.toLowerCase();
          if (!actual || actual !== fingerprint.toLowerCase()) {
            req.destroy();
            reject(new Error('certificate fingerprint mismatch — refusing to talk to this host'));
            return;
          }
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`latch returned ${res.statusCode}: ${data}`));
            return;
          }
          const ct = res.headers['content-type'] || '';
          resolve(ct.includes('application/json') ? JSON.parse(data || 'null') : data);
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function client(opts) {
  return {
    get: (p) => request(opts, 'GET', p),
    post: (p, body) => request(opts, 'POST', p, body),
    del: (p) => request(opts, 'DELETE', p),
  };
}

module.exports = { client };
