const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const REPORT_DIR = path.join(ROOT, 'reports');
const METADATA_FILE = path.join(ROOT, 'papers_metadata.json');
const MANIFEST_FILE = path.join(REPORT_DIR, 'manifest.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadPapers() {
  const metadata = readJson(METADATA_FILE);
  const manifest = readJson(MANIFEST_FILE);
  return manifest.map((item) => {
    const meta = metadata.find((paper) => paper.arxiv_id === item.arxivId) || {};
    return {
      ...meta,
      id: item.id,
      shortTitle: item.shortTitle,
      category: item.category,
      priority: item.priority,
      reportFile: item.reportFile,
      arxiv_abs_url: item.arxivId ? `https://arxiv.org/abs/${item.arxivId}` : null
    };
  }).sort((a, b) => a.priority - b.priority);
}

function reportFor(id) {
  const paper = loadPapers().find((item) => item.id === id);
  if (!paper) return null;
  const markdown = fs.readFileSync(path.join(REPORT_DIR, paper.reportFile), 'utf8');
  return { paper, markdown };
}

function sendJson(res, payload, status = 200) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendText(res, body, type = 'text/plain; charset=utf-8', status = 200) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveStatic(reqPath, res) {
  const safePath = reqPath === '/' ? '/index.html' : reqPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 'Forbidden', 'text/plain; charset=utf-8', 403);
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 'Not found', 'text/plain; charset=utf-8', 404);
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };
  sendText(res, fs.readFileSync(filePath), types[ext] || 'application/octet-stream');
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  if (pathname === '/api/papers') {
    sendJson(res, loadPapers());
    return;
  }

  if (pathname === '/api/summary') {
    const papers = loadPapers();
    const categories = [...new Set(papers.map((p) => p.category))];
    const tags = [...new Set(papers.flatMap((p) => p.topic_tags || []))].sort();
    sendJson(res, { count: papers.length, categories, tags, generatedAt: new Date().toISOString() });
    return;
  }

  const match = pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (match) {
    const report = reportFor(match[1]);
    if (!report) sendJson(res, { error: 'Report not found' }, 404);
    else sendJson(res, report);
    return;
  }

  serveStatic(pathname, res);
});

const port = Number(process.env.PORT || 8876);
server.listen(port, '0.0.0.0', () => {
  console.log(`Agent self-evolution paper reader: http://127.0.0.1:${port}`);
});
