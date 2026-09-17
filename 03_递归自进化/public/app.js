(function () {
  'use strict';

  var listEl = document.getElementById('paper-list');
  var contentEl = document.getElementById('content');
  var metaPanel = document.getElementById('meta-panel');
  var overviewBtn = document.querySelector('[data-kind="overview"]');
  var variantSwitch = document.getElementById('variant-switch');
  var variantHint = document.getElementById('variant-hint');
  var papers = [];
  var current = null;          // currently open paper
  var currentBtn = null;       // its sidebar button
  var variant = localStorage.getItem('rsi-variant') === 'deep' ? 'deep' : 'plain';

  var VARIANT_HINT = {
    plain: '少公式、多类比，10 分钟读懂',
    deep: '完整方法、数字与出处，含批评意见'
  };

  /* ---------------- markdown renderer ---------------- */

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inline(s) {
    var out = esc(s);
    // inline code first so its content is not further transformed
    var codes = [];
    out = out.replace(/`([^`]+)`/g, function (_, c) {
      codes.push(c);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[\s(（])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    out = out.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return '<code>' + codes[Number(i)] + '</code>';
    });
    return out;
  }

  // Split a table row on unescaped pipes. LaTeX such as $\|x\|$ must survive intact.
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

      // fenced code block
      var fence = line.match(/^\s*```(\w*)\s*$/);
      if (fence) {
        closeLists();
        var buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // table: header row followed by a separator row
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        closeLists();
        var head = splitRow(line);
        i += 2;
        var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
        var t = '<table><thead><tr>';
        head.forEach(function (c) { t += '<th>' + inline(c) + '</th>'; });
        t += '</tr></thead><tbody>';
        rows.forEach(function (r) {
          t += '<tr>';
          r.forEach(function (c) { t += '<td>' + inline(c) + '</td>'; });
          t += '</tr>';
        });
        html.push(t + '</tbody></table>');
        continue;
      }

      // heading
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        closeLists();
        var lv = h[1].length;
        html.push('<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>');
        i++;
        continue;
      }

      // blockquote (consecutive lines)
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

      // horizontal rule
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        closeLists();
        html.push('<hr>');
        i++;
        continue;
      }

      // list item (unordered or ordered)
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

      // blank line
      if (!line.trim()) {
        closeLists();
        i++;
        continue;
      }

      // paragraph (gather until blank / block start)
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

  // KaTeX is loaded from a CDN; when unavailable the math stays as literal $...$ text.
  function typeset(el) {
    if (typeof window.renderMathInElement !== 'function') return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
        throwOnError: false
      });
    } catch (e) {
      /* leave raw math in place */
    }
  }

  /* ---------------- view ---------------- */

  function setActive(btn) {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (b) {
      b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
  }

  function fillMeta(p) {
    document.getElementById('meta-title').textContent = p.fullTitle;
    var a = document.getElementById('meta-arxiv');
    a.href = 'https://arxiv.org/abs/' + p.arxivId;
    a.textContent = 'arXiv ' + p.arxivId;
    var pdf = document.getElementById('meta-pdf');
    // local pdf absent -> fall back to the arXiv PDF
    pdf.href = p.pdfFile ? '/pdf/' + encodeURIComponent(p.pdfFile) : 'https://arxiv.org/pdf/' + p.arxivId;
    document.getElementById('meta-date').textContent = p.date;
    document.getElementById('meta-category').textContent = p.category;
    document.getElementById('meta-frozen').textContent = p.frozen;
    document.getElementById('meta-evolves').textContent = p.evolves;
    document.getElementById('meta-verifier').textContent = p.verifier;
    metaPanel.hidden = false;
  }

  function showError(msg) {
    contentEl.innerHTML = '<p class="error">' + esc(msg) + '</p>';
  }

  function syncVariantUI() {
    Array.prototype.forEach.call(variantSwitch.querySelectorAll('.variant-btn'), function (b) {
      var on = b.dataset.variant === variant;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    variantHint.textContent = VARIANT_HINT[variant] || '';
  }

  function openReport(p, btn) {
    current = p;
    currentBtn = btn || currentBtn;
    setActive(currentBtn);
    syncVariantUI();
    contentEl.innerHTML = '<p class="loading">正在加载 ' + esc(p.shortTitle) + '……</p>';
    fetch('/api/report/' + encodeURIComponent(p.id) + '?variant=' + variant)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) return showError('加载失败：' + d.error);
        contentEl.innerHTML = render(d.markdown);
        typeset(contentEl);
        window.scrollTo(0, 0);
        location.hash = p.id;
      })
      .catch(function (e) { showError('请求出错：' + e.message); });
  }

  function openOverview() {
    current = null;
    currentBtn = overviewBtn;
    setActive(overviewBtn);
    metaPanel.hidden = true;
    contentEl.innerHTML = '<p class="loading">正在加载综述……</p>';
    fetch('/api/overview')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) return showError('加载失败：' + d.error);
        contentEl.innerHTML = render(d.markdown);
        typeset(contentEl);
        window.scrollTo(0, 0);
        location.hash = 'overview';
      })
      .catch(function (e) { showError('请求出错：' + e.message); });
  }

  function buildList() {
    var groups = [];
    papers.forEach(function (p) {
      var g = groups[groups.length - 1];
      if (!g || g.name !== p.category) groups.push({ name: p.category, items: [p] });
      else g.items.push(p);
    });

    groups.forEach(function (g) {
      var label = document.createElement('div');
      label.className = 'group-label';
      label.textContent = g.name;
      listEl.appendChild(label);

      g.items.forEach(function (p) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item';
        btn.setAttribute('role', 'listitem');
        btn.innerHTML =
          '<span class="nav-title"><span class="tier-badge tier-' + esc(p.tier) + '">' + esc(p.tier) +
          '</span>' + esc(p.shortTitle) + '</span>' +
          '<span class="nav-meta">' + esc(p.date) + ' · ' + esc(p.arxivId) + '</span>' +
          '<span class="nav-one-line">' + esc(p.oneLine) + '</span>';
        btn.addEventListener('click', function () {
          fillMeta(p);
          openReport(p, btn);
        });
        btn.dataset.id = p.id;
        listEl.appendChild(btn);
      });
    });
  }

  variantSwitch.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.variant-btn');
    if (!btn) return;
    var next = btn.dataset.variant;
    if (next === variant) return;
    variant = next;
    localStorage.setItem('rsi-variant', variant);
    syncVariantUI();
    if (current) openReport(current, currentBtn);
  });

  overviewBtn.addEventListener('click', openOverview);

  fetch('/api/papers')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      papers = data;
      buildList();
      var want = location.hash.replace(/^#/, '');
      var hit = papers.filter(function (p) { return p.id === want; })[0];
      if (hit) {
        var btn = listEl.querySelector('[data-id="' + hit.id + '"]');
        fillMeta(hit);
        openReport(hit, btn);
      } else {
        openOverview();
      }
    })
    .catch(function (e) { showError('无法获取论文列表：' + e.message); });
})();
