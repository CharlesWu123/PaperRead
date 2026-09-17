const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const REPORT_DIR = path.join(ROOT, 'reports');
const PDF_DIR = path.join(ROOT, 'pdfs');
const MANIFEST_FILE = path.join(REPORT_DIR, 'manifest.json');
const OVERVIEW_FILE = path.join(ROOT, '时间线综述.md');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8848);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml'
};

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'))
    .sort((a, b) => a.priority - b.priority);
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, body, type = 'text/plain; charset=utf-8', status = 200) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

// Resolve a caller-supplied name strictly inside baseDir; returns null when it escapes.
function safeResolve(baseDir, name) {
  const target = path.resolve(baseDir, name);
  const base = path.resolve(baseDir) + path.sep;
  return target.startsWith(base) ? target : null;
}

function serveStatic(reqPath, res) {
  const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
  const filePath = safeResolve(PUBLIC_DIR, rel);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 'Not Found', 'text/plain; charset=utf-8', 404);
    return;
  }
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
}

// variant: 'deep' (default) reads reportFile, 'plain' reads the plain-language rewrite.
function serveReport(id, variant, res) {
  const paper = loadManifest().find((p) => p.id === id);
  if (!paper) return sendJson(res, { error: 'unknown report id' }, 404);
  const rel = variant === 'plain' ? paper.plainFile : paper.reportFile;
  if (!rel) return sendJson(res, { error: 'variant not available' }, 404);
  const file = safeResolve(REPORT_DIR, rel);
  if (!file || !fs.existsSync(file)) return sendJson(res, { error: 'report file missing' }, 404);
  sendJson(res, { paper, variant: variant === 'plain' ? 'plain' : 'deep', markdown: fs.readFileSync(file, 'utf8') });
}

function servePdf(name, res) {
  const file = safeResolve(PDF_DIR, name);
  if (!file || !fs.existsSync(file)) return sendText(res, 'Not Found', 'text/plain; charset=utf-8', 404);
  res.writeHead(200, { 'Content-Type': MIME['.pdf'] });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  if (pathname === '/api/papers') {
    return sendJson(res, loadManifest());
  }
  if (pathname === '/api/overview') {
    if (!fs.existsSync(OVERVIEW_FILE)) return sendJson(res, { error: 'overview missing' }, 404);
    return sendJson(res, { markdown: fs.readFileSync(OVERVIEW_FILE, 'utf8') });
  }
  if (pathname.startsWith('/api/report/')) {
    return serveReport(
      decodeURIComponent(pathname.slice('/api/report/'.length)),
      parsed.searchParams.get('variant'),
      res
    );
  }
  if (pathname.startsWith('/pdf/')) {
    return servePdf(decodeURIComponent(pathname.slice('/pdf/'.length)), res);
  }
  return serveStatic(pathname, res);
});

server.listen(PORT, HOST, () => {
  console.log(`RSI skill-evolution reader running at http://${HOST}:${PORT}`);
  console.log(`reports: ${loadManifest().length}`);
});
