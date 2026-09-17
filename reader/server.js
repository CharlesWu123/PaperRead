// Unified reader for every paper-report collection under this repository root.
// No auth, listens on 0.0.0.0 by default; intended for local / same-subnet reading only.
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PAPER_ROOT = path.dirname(ROOT);
const PUBLIC_DIR = path.join(ROOT, 'public');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

function exists(rel) {
  return fs.existsSync(path.join(PAPER_ROOT, rel));
}

function ls(rel) {
  try {
    return fs.readdirSync(path.join(PAPER_ROOT, rel)).sort();
  } catch (e) {
    return [];
  }
}

// First "# heading" of a markdown file, plus the first prose line after it.
function mdHead(rel) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(PAPER_ROOT, rel), 'utf8').slice(0, 4000);
  } catch (e) {
    return { title: path.basename(rel, '.md'), lead: '' };
  }
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let title = '';
  let lead = '';
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^#\s+(.*)$/);
    if (h && !title) {
      title = h[1].trim();
      continue;
    }
    if (title && !lead) {
      const l = lines[i].trim();
      if (!l || /^[#>|`\-*\d]/.test(l)) continue;
      lead = l.replace(/\*\*/g, '').slice(0, 160);
      break;
    }
  }
  return { title: title || path.basename(rel, '.md'), lead };
}
function docId(rel) {
  return rel.replace(/\.md$/, '').replace(/[\/\s]+/g, '~');
}

function mdDoc(rel, extra) {
  const head = mdHead(rel);
  const doc = {
    id: docId(rel),
    kind: 'md',
    path: rel,
    title: head.title,
    subtitle: head.lead
  };
  return Object.assign(doc, extra || {});
}

// 01_视频编辑: overview docs (00_*.md) + six numbered category folders.
function buildVideoEdit() {
  const dir = '01_视频编辑';
  if (!exists(dir)) return null;
  const pdfDir = dir + '/论文原文';
  const pdfs = ls(pdfDir).filter((f) => f.endsWith('.pdf'));
  const stem = (name) => name.replace(/^\d+[_-]/, '').replace(/\.(md|pdf)$/, '');
  const pdfFor = (file) => {
    const hit = pdfs.find((p) => stem(p) === stem(file));
    return hit ? pdfDir + '/' + hit : null;
  };

  const groups = [];
  const overview = ls(dir).filter((f) => /^00_.*\.md$/.test(f));
  if (overview.length) {
    groups.push({
      name: '总览与阅读路线',
      docs: overview.map((f) => mdDoc(dir + '/' + f))
    });
  }
  ls(dir)
    .filter((f) => /^\d\d_/.test(f) && !f.endsWith('.md') && fs.statSync(path.join(PAPER_ROOT, dir, f)).isDirectory())
    .forEach((sub) => {
      const docs = ls(dir + '/' + sub)
        .filter((f) => f.endsWith('.md'))
        .map((f) => mdDoc(dir + '/' + sub + '/' + f, { pdf: pdfFor(f) }));
      if (docs.length) groups.push({ name: sub.replace(/^(\d\d)_/, '$1 · '), docs: docs });
    });
  return {
    key: 'video-edit',
    title: '视频编辑论文阅读整理',
    desc: '30 篇视频编辑论文的入门整理，六个主题分组 + 总览路线',
    groups: groups
  };
}
// 02_Agent自进化: reports/manifest.json ordered by priority, enriched by papers_metadata.json.
function buildAgentSkill() {
  const dir = '02_Agent自进化';
  const manifest = readJson(path.join(PAPER_ROOT, dir, 'reports/manifest.json'));
  if (!manifest) return null;
  const meta = readJson(path.join(PAPER_ROOT, dir, 'papers_metadata.json')) || [];
  const groups = [];
  if (exists(dir + '/reading_report.md')) {
    groups.push({ name: '总览', docs: [mdDoc(dir + '/reading_report.md')] });
  }
  const docs = manifest
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((item) => {
      const m = meta.find((p) => p.arxiv_id === item.arxivId) || {};
      const rel = dir + '/reports/' + item.reportFile;
      return mdDoc(rel, {
        title: item.shortTitle,
        subtitle: m.title || '',
        tag: item.category,
        arxivId: item.arxivId,
        year: m.year || null,
        citations: typeof m.citation_count_semantic_scholar === 'number' ? m.citation_count_semantic_scholar : null,
        tags: m.topic_tags || []
      });
    });
  groups.push({ name: '论文解读（按阅读优先级）', docs: docs });
  return {
    key: 'agent-skill',
    title: 'Agent Skill 自进化',
    desc: manifest.length + ' 篇 Agent skill / harness 自进化论文解读',
    groups: groups
  };
}
// 03_递归自进化: manifest with a plain-language variant per paper, grouped by category.
function buildRsi() {
  const dir = '03_递归自进化';
  const manifest = readJson(path.join(PAPER_ROOT, dir, 'reports/manifest.json'));
  if (!manifest) return null;
  const groups = [];
  if (exists(dir + '/时间线综述.md')) {
    groups.push({ name: '总览', docs: [mdDoc(dir + '/时间线综述.md')] });
  }
  manifest
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .forEach((item) => {
      const rel = dir + '/reports/' + item.reportFile;
      const plain = item.plainFile ? dir + '/reports/' + item.plainFile : null;
      const doc = mdDoc(rel, {
        title: item.shortTitle,
        subtitle: item.oneLine || item.fullTitle || '',
        fullTitle: item.fullTitle,
        tag: item.tier ? 'Tier ' + item.tier : null,
        arxivId: item.arxivId,
        date: item.date,
        plainPath: plain && exists(plain) ? plain : null,
        pdf: item.pdfFile && exists(dir + '/pdfs/' + item.pdfFile) ? dir + '/pdfs/' + item.pdfFile : null,
        facts: [
          ['冻结参数', item.frozen],
          ['演化对象', item.evolves],
          ['验证信号', item.verifier]
        ].filter((f) => f[1])
      });
      const g = groups.find((x) => x.name === item.category);
      if (g) g.docs.push(doc);
      else groups.push({ name: item.category, docs: [doc] });
    });
  return {
    key: 'rsi',
    title: '递归自进化 (RSI)',
    desc: manifest.length + ' 篇递归自进化论文，含通俗版 / 深度版双版本',
    groups: groups
  };
}
// Standalone HTML collection: a flat, ordered list of hand-picked pages.
function buildHtmlCollection(key, title, desc, items) {
  const docs = [];
  items.forEach((it) => {
    if (!exists(it[0])) return;
    docs.push({
      id: docId(it[0]),
      kind: 'html',
      path: it[0],
      title: it[1],
      subtitle: it[2] || ''
    });
  });
  if (!docs.length) return null;
  return { key: key, title: title, desc: desc, groups: [{ name: '解读', docs: docs }] };
}

// 04_Agent_Harness与验证: harness survey + two papers, each in up to three depth variants.
function buildHarness() {
  return buildHtmlCollection(
    'harness',
    'Agent Harness 与验证',
    'Harness 工程综述，以及 LLM-as-a-Verifier、RewardHarness 的三档解读',
    [
      ['04_Agent_Harness与验证/agent_harness_analysis.html', 'Agent Harness Engineering: A Survey', '深度解读'],
      ['04_Agent_Harness与验证/LLMasaVerifier_academic.html', 'LLM-as-a-Verifier · 学术深度解读', 'arXiv:2607.05391'],
      ['04_Agent_Harness与验证/LLMasaVerifier_concise.html', 'LLM-as-a-Verifier · 精炼解读', 'arXiv:2607.05391'],
      ['04_Agent_Harness与验证/LLMasaVerifier_storytelling.html', 'LLM-as-a-Verifier · 故事解读', 'arXiv:2607.05391'],
      ['04_Agent_Harness与验证/RewardHarness_academic.html', 'RewardHarness · 学术深度解读', 'arXiv:2605.08703'],
      ['04_Agent_Harness与验证/RewardHarness_concise.html', 'RewardHarness · 精炼解读', 'arXiv:2605.08703'],
      ['04_Agent_Harness与验证/RewardHarness_storytelling.html', 'RewardHarness · 故事解读', 'arXiv:2605.08703']
    ]
  );
}

// 05_图像生成_MACRO: two independent write-ups of the same paper.
function buildMacro() {
  return buildHtmlCollection(
    'macro',
    'MACRO（多参考图生成）',
    'MACRO 论文的两份独立解读，内容互不重叠',
    [
      ['05_图像生成_MACRO/2603.25319v1_reading_report.html', 'MACRO · 完整阅读报告', '含源码对应关系与结论'],
      ['05_图像生成_MACRO/macro_analysis.html', 'MACRO · 方法分析', 'arXiv:2603.25319']
    ]
  );
}

// Loose material inside 01_视频编辑: legacy single-paper reports plus the visual entry page.
function buildMisc() {
  const groups = [];
  const mdDocs = [];
  const looseDir = '01_视频编辑/补充阅读';
  ls(looseDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .forEach((f) => {
      const rel = looseDir + '/' + f;
      const pdf = looseDir + '/' + f.replace(/_report\.md$/, '.pdf');
      mdDocs.push(mdDoc(rel, { pdf: exists(pdf) ? pdf : null }));
    });
  if (mdDocs.length) groups.push({ name: '单篇阅读报告', docs: mdDocs });

  const htmlDocs = [];
  const htmlFrom = (rel, title, subtitle) => {
    if (!exists(rel)) return;
    htmlDocs.push({
      id: docId(rel),
      kind: 'html',
      path: rel,
      title: title || path.basename(rel, '.html'),
      subtitle: subtitle || ''
    });
  };
  htmlFrom('01_视频编辑/00_开始阅读.html', '视频编辑 · 开始阅读（可视化路线）', '01_视频编辑/');
  htmlFrom(
    '01_视频编辑/补充阅读/video_editing_papers_report.html',
    '视频编辑论文综合报告（历史版）',
    '01_视频编辑/补充阅读/'
  );
  if (htmlDocs.length) groups.push({ name: 'HTML 页面（新窗口打开）', docs: htmlDocs });

  if (!groups.length) return null;
  return {
    key: 'misc',
    title: '视频编辑 · 其他材料',
    desc: '01_视频编辑 下的历史单篇报告与可视化入口',
    groups: groups
  };
}

function buildIndex() {
  return [buildVideoEdit(), buildAgentSkill(), buildRsi(), buildHarness(), buildMacro(), buildMisc()]
    .filter(Boolean)
    .map((c) => {
      c.count = c.groups.reduce((n, g) => n + g.docs.length, 0);
      c.groups.forEach((g) => g.docs.forEach((d) => { d.collection = c.key; }));
      return c;
    });
}

function allDocs(index) {
  const out = [];
  index.forEach((c) => c.groups.forEach((g) => g.docs.forEach((d) => {
    out.push(Object.assign({ collectionTitle: c.title, group: g.name }, d));
  })));
  return out;
}
function safeRel(rel) {
  const abs = path.normalize(path.join(PAPER_ROOT, rel));
  return abs.startsWith(PAPER_ROOT + path.sep) ? abs : null;
}

function search(index, q) {
  const needle = q.toLowerCase();
  const hits = [];
  allDocs(index).forEach((d) => {
    if (d.kind !== 'md') return;
    const abs = safeRel(d.path);
    if (!abs) return;
    let text = '';
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      return;
    }
    const lower = text.toLowerCase();
    const titleHit = (d.title + ' ' + (d.subtitle || '')).toLowerCase().indexOf(needle) >= 0;
    const at = lower.indexOf(needle);
    if (!titleHit && at < 0) return;
    let snippet = '';
    if (at >= 0) {
      snippet = text.slice(Math.max(0, at - 60), at + needle.length + 90).replace(/\s+/g, ' ');
    }
    let count = 0;
    let from = 0;
    while (at >= 0) {
      const next = lower.indexOf(needle, from);
      if (next < 0) break;
      count++;
      from = next + needle.length;
    }
    hits.push({
      id: d.id,
      title: d.title,
      collection: d.collection,
      collectionTitle: d.collectionTitle,
      group: d.group,
      snippet: snippet,
      count: count
    });
  });
  return hits.sort((a, b) => b.count - a.count).slice(0, 60);
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sendBody(res, body, type, status = 200) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function serveStatic(reqPath, res) {
  const rel = reqPath === '/' ? '/index.html' : reqPath;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    sendBody(res, 'Not found', 'text/plain; charset=utf-8', 404);
    return;
  }
  sendBody(res, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
}

// Serve raw files (PDF, legacy HTML) straight out of the paper tree.
function serveFile(rel, res) {
  const abs = safeRel(rel);
  if (!abs || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    sendBody(res, 'Not found', 'text/plain; charset=utf-8', 404);
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  if (!MIME[ext]) {
    sendBody(res, 'Unsupported file type', 'text/plain; charset=utf-8', 415);
    return;
  }
  sendBody(res, fs.readFileSync(abs), MIME[ext]);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  if (pathname === '/api/index') {
    sendJson(res, { collections: buildIndex(), generatedAt: new Date().toISOString() });
    return;
  }

  if (pathname === '/api/search') {
    const q = (parsed.query.q || '').trim();
    if (q.length < 2) {
      sendJson(res, { query: q, hits: [] });
      return;
    }
    sendJson(res, { query: q, hits: search(buildIndex(), q) });
    return;
  }

  if (pathname === '/api/doc') {
    const index = buildIndex();
    const docs = allDocs(index);
    let doc = null;
    if (parsed.query.id) doc = docs.find((d) => d.id === parsed.query.id);
    else if (parsed.query.path) doc = docs.find((d) => d.path === parsed.query.path);
    if (!doc) {
      sendJson(res, { error: '未找到文档' }, 404);
      return;
    }
    const wantPlain = parsed.query.variant === 'plain' && doc.plainPath;
    const rel = wantPlain ? doc.plainPath : doc.path;
    const abs = safeRel(rel);
    if (!abs || !fs.existsSync(abs)) {
      sendJson(res, { error: '文件缺失：' + rel }, 404);
      return;
    }
    sendJson(res, {
      doc: doc,
      variant: wantPlain ? 'plain' : 'deep',
      markdown: fs.readFileSync(abs, 'utf8')
    });
    return;
  }

  if (pathname.startsWith('/file/')) {
    serveFile(pathname.slice('/file/'.length), res);
    return;
  }

  serveStatic(pathname, res);
});

// 默认只绑本机：该服务无鉴权，绑 0.0.0.0 会让同网段任何人都能读到全部资料。
// 需要手机 / 同网段另一台设备访问时，显式设置 HOST=0.0.0.0。
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8912);
server.listen(port, host, () => {
  console.log('论文解读统一阅读器: http://' + (host === '0.0.0.0' ? '127.0.0.1' : host) + ':' + port);
  if (host === '0.0.0.0') console.log('注意：已绑定 0.0.0.0，同网段设备均可无鉴权访问。');
});
