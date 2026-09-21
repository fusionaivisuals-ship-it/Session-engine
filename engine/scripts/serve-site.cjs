const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '..', 'dist', 'site');
const types = { '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(dir, p);
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
}).listen(5000, () => console.log('Site at http://localhost:5000'));
