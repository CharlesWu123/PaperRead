#!/usr/bin/env node
// 把动态阅读器的索引固化成静态文件，供 GitHub Pages 使用。
//
// 复用 reader/server.js 里的 buildIndex()，避免本地服务和静态站点两套逻辑日后跑偏。
// 产出：
//   site/index.json   合集 / 分组 / 文档结构（等价于 /api/index）
//   site/search.json  全部 Markdown 正文，供前端做客户端检索（等价于 /api/search）
//
// 与本地服务的差异：PDF 不在仓库里，因此每个 doc 的 pdf 字段会被删掉，
// 前端据此隐藏「本地 PDF」按钮，只保留 arXiv 链接。

const fs = require('fs');
const path = require('path');
const { buildIndex, allDocs } = require('../reader/server.js');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');

const index = buildIndex();

// PDF 不入库，去掉指向本地 PDF 的字段
index.forEach((c) =>
  c.groups.forEach((g) =>
    g.docs.forEach((d) => {
      delete d.pdf;
    })
  )
);

const searchDocs = allDocs(index)
  .filter((d) => d.kind === 'md')
  .map((d) => {
    let text = '';
    try {
      text = fs.readFileSync(path.join(ROOT, d.path), 'utf8');
    } catch (e) {
      console.warn('  警告：读不到 ' + d.path);
    }
    return {
      id: d.id,
      path: d.path,
      title: d.title,
      subtitle: d.subtitle || '',
      collectionTitle: d.collectionTitle,
      group: d.group,
      text: text
    };
  });

fs.mkdirSync(SITE, { recursive: true });
fs.writeFileSync(path.join(SITE, 'index.json'), JSON.stringify({ collections: index }, null, 1));
fs.writeFileSync(path.join(SITE, 'search.json'), JSON.stringify(searchDocs));

const total = index.reduce((n, c) => n + c.count, 0);
const size = (f) => (fs.statSync(path.join(SITE, f)).size / 1024).toFixed(0) + ' KB';
console.log('site/index.json   ' + index.length + ' 个合集 / ' + total + ' 篇文档   ' + size('index.json'));
console.log('site/search.json  ' + searchDocs.length + ' 篇正文             ' + size('search.json'));
index.forEach((c) => console.log('  [' + c.key + '] ' + c.title + ' — ' + c.count + ' 篇'));
