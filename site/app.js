// 静态版阅读器：数据来自 site/index.json 与 site/search.json，正文直接取仓库里的 .md 文件。
// 与 reader/public/app.js 的差别只有四处数据来源：索引、正文、检索、文件链接。
// 检索索引（约 1MB）在首次搜索时才加载，不拖慢首屏。
(function () {
  'use strict';

  var SITE = 'site/';

  var listEl = document.getElementById('doc-list');
  var tabsEl = document.getElementById('collection-tabs');
  var contentEl = document.getElementById('content');
  var metaPanel = document.getElementById('meta-panel');
  var searchInput = document.getElementById('search-input');
  var variantRow = document.getElementById('variant-row');
  var variantSwitch = document.getElementById('variant-switch');
  var variantHint = document.getElementById('variant-hint');

  var collections = [];
  var docsById = {};
  var docsByPath = {};
  var activeCollection = null;
  var current = null;
  var variant = localStorage.getItem('paper-reader-variant') === 'deep' ? 'deep' : 'plain';
  var mermaidSeq = 0;
  var searchData = null;
  var searchLoading = null;

  if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
  }

  function encPath(p) {
    return String(p).split('/').map(encodeURIComponent).join('/');
  }

  /* ---------------- markdown renderer ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inline(s) {
    var out = esc(s);
    var codes = [];
    out = out.replace(/`([^`]+)`/g, function (_, c) {
      codes.push(c);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[\s(（])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, text, href) {
      if (/\.md(#.*)?$/.test(href) && !/^https?:/.test(href)) {
        return '<a href="#" class="md-link" data-href="' + esc(href) + '">' + text + '</a>';
      }
      return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + text + '</a>';
    });
    out = out.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return '<code>' + esc(codes[Number(i)]) + '</code>';
    });
    return out;
  }

  function splitRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
      .replace(/\\\|/g, '\u0001')
      .split('|')
      .map(function (c) { return c.trim().replace(/\u0001/g, '\\|'); });
  }
  function render(md) {
    var lines = md.replace(/\r\n/g, '\n').split('\n');
    var html = [];
    var i = 0;
    var listStack = [];

    function closeLists() {
      while (listStack.length) html.push('</' + listStack.pop() + '>');
    }

    while (i < lines.length) {
      var line = lines[i];

      var fence = line.match(/^\s*```(\w*)\s*$/);
      if (fence) {
        closeLists();
        var lang = fence[1];
        var buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        if (lang === 'mermaid') {
          html.push('<div class="mermaid-block" data-src="' + esc(buf.join('\n')) + '"></div>');
        } else {
          html.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
        }
        continue;
      }

      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        closeLists();
        var head = splitRow(line);
        i += 2;
        var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
        var t = '<div class="table-wrap"><table><thead><tr>';
        head.forEach(function (c) { t += '<th>' + inline(c) + '</th>'; });
        t += '</tr></thead><tbody>';
        rows.forEach(function (r) {
          t += '<tr>';
          r.forEach(function (c) { t += '<td>' + inline(c) + '</td>'; });
          t += '</tr>';
        });
        html.push(t + '</tbody></table></div>');
        continue;
      }
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        closeLists();
        var lv = h[1].length;
        html.push('<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>');
        i++;
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        closeLists();
        var q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          q.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        html.push('<blockquote><p>' + inline(q.join(' ')) + '</p></blockquote>');
        continue;
      }

      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        closeLists();
        html.push('<hr>');
        i++;
        continue;
      }

      var li = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
      if (li) {
        var want = /^\d+\./.test(li[2]) ? 'ol' : 'ul';
        var depth = Math.floor(li[1].length / 2) + 1;
        while (listStack.length > depth) html.push('</' + listStack.pop() + '>');
        if (listStack.length < depth) {
          while (listStack.length < depth) { html.push('<' + want + '>'); listStack.push(want); }
        } else if (listStack.length && listStack[listStack.length - 1] !== want) {
          html.push('</' + listStack.pop() + '>');
          html.push('<' + want + '>');
          listStack.push(want);
        }
        html.push('<li>' + inline(li[3]) + '</li>');
        i++;
        continue;
      }

      if (!line.trim()) {
        closeLists();
        i++;
        continue;
      }

      var para = [];
      while (i < lines.length && lines[i].trim() &&
             !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|\s*>|\s*```|\s*\|)/.test(lines[i]) &&
             !/^\s*(-{3,}|\*{3,})\s*$/.test(lines[i])) {
        para.push(lines[i++]);
      }
      if (para.length) {
        closeLists();
        html.push('<p>' + inline(para.join(' ')) + '</p>');
      } else {
        i++;
      }
    }
    closeLists();
    return html.join('\n');
  }

  // KaTeX / mermaid 走 CDN；无网络时原始文本仍可读。
  function typeset(el) {
    if (typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
          throwOnError: false
        });
      } catch (e) { /* keep raw math */ }
    }
    if (!window.mermaid) return;
    Array.prototype.forEach.call(el.querySelectorAll('.mermaid-block'), function (box) {
      var src = box.dataset.src || '';
      var id = 'mmd-' + (mermaidSeq++);
      try {
        window.mermaid.render(id, src, function (svg) { box.innerHTML = svg; });
      } catch (e) {
        box.innerHTML = '<pre><code>' + esc(src) + '</code></pre>';
      }
    });
  }

  function showError(msg) {
    contentEl.innerHTML = '<p class="error">' + esc(msg) + '</p>';
  }

  function syncVariantUI(doc) {
    var hasPlain = !!(doc && doc.plainPath);
    variantRow.hidden = !hasPlain;
    if (!hasPlain) return;
    Array.prototype.forEach.call(variantSwitch.querySelectorAll('.variant-btn'), function (b) {
      var on = b.dataset.variant === variant;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    variantHint.textContent = variant === 'plain' ? '少公式、多类比' : '完整方法、数字与批评';
  }

  function fillMeta(doc) {
    document.getElementById('meta-title').textContent = doc.fullTitle || doc.title;
    document.getElementById('meta-sub').textContent = doc.subtitle || '';
    var links = [];
    if (doc.arxivId) {
      links.push('<a class="btn" target="_blank" rel="noopener" href="https://arxiv.org/abs/' +
        esc(doc.arxivId) + '">arXiv ' + esc(doc.arxivId) + '</a>');
    }
    links.push('<a class="btn" target="_blank" rel="noopener" href="' + encPath(doc.path) + '">源文件</a>');
    document.getElementById('meta-links').innerHTML = links.join('');

    var facts = [];
    if (doc.date) facts.push(['日期', doc.date]);
    if (doc.year) facts.push(['年份', doc.year]);
    if (doc.tag) facts.push(['分类', doc.tag]);
    if (doc.citations != null) facts.push(['引用数', doc.citations]);
    (doc.facts || []).forEach(function (f) { facts.push(f); });
    document.getElementById('meta-facts').innerHTML = facts.map(function (f) {
      return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>';
    }).join('');
    metaPanel.hidden = false;
  }
  function setActive(id) {
    Array.prototype.forEach.call(listEl.querySelectorAll('.nav-item'), function (b) {
      b.classList.toggle('active', b.dataset.id === id);
    });
  }

  // 独立 HTML 报告（04 / 05 专题）：内嵌在正文区显示，不再弹新窗口。
  // 这些页面是自带样式的完整文档（无 position:fixed / height:100%），
  // 且与阅读器同源，因此可以直接量出内容高度把 iframe 撑满，避免出现双滚动条。
  function openHtmlDoc(doc, opts) {
    current = doc;
    setActive(doc.id);
    variantRow.hidden = true;
    document.getElementById('meta-title').textContent = doc.fullTitle || doc.title;
    document.getElementById('meta-sub').textContent = doc.subtitle || '';
    document.getElementById('meta-links').innerHTML =
      '<a class="btn" target="_blank" rel="noopener" href="' + esc(encPath(doc.path)) + '">新窗口打开</a>';
    document.getElementById('meta-facts').innerHTML = '';
    metaPanel.hidden = false;

    contentEl.innerHTML = '';
    var frame = document.createElement('iframe');
    frame.className = 'html-embed';
    frame.setAttribute('title', doc.title);
    frame.src = encPath(doc.path);
    frame.addEventListener('load', function () {
      try {
        var d = frame.contentDocument;
        if (!d) return;
        var h = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight);
        if (h > 0) frame.style.height = (h + 28) + 'px';
      } catch (e) { /* 量不到就保留 CSS 里的兜底高度 */ }
    });
    contentEl.appendChild(frame);

    if (!opts || !opts.keepScroll) {
      document.querySelector('.reader').scrollTop = 0;
      window.scrollTo(0, 0);
    }
    location.hash = doc.id;
  }

  function openDoc(doc, opts) {
    if (!doc) return;
    if (doc.kind === 'html') {
      openHtmlDoc(doc, opts);
      return;
    }
    current = doc;
    setActive(doc.id);
    fillMeta(doc);
    syncVariantUI(doc);
    contentEl.innerHTML = '<p class="loading">正在加载 ' + esc(doc.title) + '……</p>';
    var wantPlain = doc.plainPath && variant === 'plain';
    var target = wantPlain ? doc.plainPath : doc.path;
    fetch(encPath(target))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (md) {
        contentEl.innerHTML = render(md);
        typeset(contentEl);
        if (!opts || !opts.keepScroll) {
          document.querySelector('.reader').scrollTop = 0;
          window.scrollTo(0, 0);
        }
        location.hash = doc.id;
      })
      .catch(function (e) { showError('加载失败：' + e.message + '（' + target + '）'); });
  }

  // 正文里的相对 .md 链接跳到对应文档
  contentEl.addEventListener('click', function (ev) {
    var a = ev.target.closest ? ev.target.closest('.md-link') : null;
    if (!a) return;
    ev.preventDefault();
    var href = (a.dataset.href || '').split('#')[0];
    var base = current ? current.path.split('/').slice(0, -1) : [];
    href.split('/').forEach(function (part) {
      if (part === '.' || part === '') return;
      if (part === '..') base.pop();
      else base.push(part);
    });
    var target = docsByPath[base.join('/')];
    if (target) {
      switchCollection(target.collection, target.id);
    } else {
      showError('未在索引中找到链接目标：' + base.join('/'));
    }
  });

  function navItem(doc) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-item' + (doc.kind === 'html' ? ' is-html' : '');
    btn.dataset.id = doc.id;
    btn.innerHTML =
      '<span class="nav-title">' + esc(doc.title) + (doc.kind === 'html' ? ' <span class="ext">↗</span>' : '') + '</span>' +
      (doc.tag ? '<span class="nav-tag">' + esc(doc.tag) + '</span>' : '') +
      (doc.subtitle ? '<span class="nav-sub">' + esc(doc.subtitle) + '</span>' : '');
    btn.addEventListener('click', function () { openDoc(doc); });
    return btn;
  }
  function renderList(collection) {
    listEl.innerHTML = '';
    collection.groups.forEach(function (g) {
      var label = document.createElement('div');
      label.className = 'group-label';
      label.textContent = g.name + ' · ' + g.docs.length;
      listEl.appendChild(label);
      g.docs.forEach(function (d) { listEl.appendChild(navItem(d)); });
    });
  }

  function switchCollection(key, openId) {
    var c = collections.filter(function (x) { return x.key === key; })[0];
    if (!c) return;
    activeCollection = c;
    Array.prototype.forEach.call(tabsEl.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('active', t.dataset.key === key);
      t.setAttribute('aria-selected', t.dataset.key === key ? 'true' : 'false');
    });
    renderList(c);
    var first = c.groups[0] && c.groups[0].docs[0];
    var target = openId ? docsById[openId] : first;
    if (target) openDoc(target);
  }

  function renderSearch(hits, q) {
    listEl.innerHTML = '';
    var label = document.createElement('div');
    label.className = 'group-label';
    label.textContent = '搜索 “' + q + '” · ' + hits.length + ' 个结果';
    listEl.appendChild(label);
    hits.forEach(function (h) {
      var doc = docsById[h.id];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-item';
      btn.dataset.id = h.id;
      btn.innerHTML =
        '<span class="nav-title">' + esc(h.title) + '</span>' +
        '<span class="nav-tag">' + esc(h.collectionTitle) + ' · 命中 ' + h.count + '</span>' +
        (h.snippet ? '<span class="nav-sub">' + esc(h.snippet) + '</span>' : '');
      btn.addEventListener('click', function () { openDoc(doc); });
      listEl.appendChild(btn);
    });
  }

  // 索引约 1MB，首次搜索时才拉取，之后走内存
  function ensureSearch() {
    if (searchData) return Promise.resolve(searchData);
    if (!searchLoading) {
      searchLoading = fetch(SITE + 'search.json')
        .then(function (r) { return r.json(); })
        .then(function (d) { searchData = d; return d; });
    }
    return searchLoading;
  }

  function searchDocs(q) {
    var needle = q.toLowerCase();
    var hits = [];
    searchData.forEach(function (d) {
      var lower = d.text.toLowerCase();
      var titleHit = (d.title + ' ' + (d.subtitle || '')).toLowerCase().indexOf(needle) >= 0;
      var at = lower.indexOf(needle);
      if (!titleHit && at < 0) return;
      var snippet = '';
      if (at >= 0) {
        snippet = d.text.slice(Math.max(0, at - 60), at + needle.length + 90).replace(/\s+/g, ' ');
      }
      var count = 0;
      var from = 0;
      var next;
      while ((next = lower.indexOf(needle, from)) >= 0) {
        count++;
        from = next + needle.length;
      }
      hits.push({
        id: d.id,
        title: d.title,
        collectionTitle: d.collectionTitle,
        snippet: snippet,
        count: count
      });
    });
    return hits.sort(function (a, b) { return b.count - a.count; }).slice(0, 60);
  }

  var searchTimer = null;
  searchInput.addEventListener('input', function () {
    var q = searchInput.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) {
      if (activeCollection) renderList(activeCollection);
      return;
    }
    searchTimer = setTimeout(function () {
      var first = !searchData;
      if (first) renderSearchPending(q);
      ensureSearch()
        .then(function () { renderSearch(searchDocs(q), q); })
        .catch(function (e) { showError('搜索索引加载失败：' + e.message); });
    }, 220);
  });

  function renderSearchPending(q) {
    listEl.innerHTML = '';
    var label = document.createElement('div');
    label.className = 'group-label';
    label.textContent = '首次搜索需加载索引……';
    listEl.appendChild(label);
  }

  variantSwitch.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.variant-btn');
    if (!btn || btn.dataset.variant === variant) return;
    variant = btn.dataset.variant;
    localStorage.setItem('paper-reader-variant', variant);
    syncVariantUI(current);
    if (current) openDoc(current, { keepScroll: true });
  });

  fetch(SITE + 'index.json')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      collections = d.collections || [];
      var total = 0;
      collections.forEach(function (c) {
        total += c.count;
        c.groups.forEach(function (g) {
          g.docs.forEach(function (doc) {
            docsById[doc.id] = doc;
            docsByPath[doc.path] = doc;
          });
        });
        var tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'tab';
        tab.dataset.key = c.key;
        tab.setAttribute('role', 'tab');
        tab.title = c.desc || '';
        tab.innerHTML = esc(c.title) + '<span class="tab-count">' + c.count + '</span>';
        tab.addEventListener('click', function () {
          searchInput.value = '';
          switchCollection(c.key);
        });
        tabsEl.appendChild(tab);
      });
      document.getElementById('brand-sub').textContent =
        collections.length + ' 个合集 · ' + total + ' 篇文档';

      var want = decodeURIComponent(location.hash.replace(/^#/, ''));
      var hit = docsById[want];
      if (hit) switchCollection(hit.collection, hit.id);
      else if (collections.length) switchCollection(collections[0].key);
      else showError('索引为空。');
    })
    .catch(function (e) { showError('无法获取索引：' + e.message); });
})();
