const https = require('https');
const config = require('../core/config');


function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port: config.hubPort,
        path: `/internal${urlPath}`,
        method,
        rejectUnauthorized: false,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`hub returned ${res.statusCode}: ${data}`));
            return;
          }
          const contentType = res.headers['content-type'] || '';
          resolve(contentType.includes('application/json') ? JSON.parse(data || '{}') : data);
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = {
  get: (p) => request('GET', p),
  post: (p, body) => request('POST', p, body),
  del: (p) => request('DELETE', p),
};
