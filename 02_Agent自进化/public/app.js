const state = {
  papers: [],
  activeId: null,
  query: '',
  category: 'all'
};

const els = {
  summaryText: document.getElementById('summaryText'),
  searchInput: document.getElementById('searchInput'),
  categorySelect: document.getElementById('categorySelect'),
  paperList: document.getElementById('paperList'),
  paperMeta: document.getElementById('paperMeta'),
  paperTitle: document.getElementById('paperTitle'),
  paperWhy: document.getElementById('paperWhy'),
  linkBar: document.getElementById('linkBar'),
  statsRow: document.getElementById('statsRow'),
  reportContent: document.getElementById('reportContent')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function markdownToHtml(markdown) {
  const lines = markdown.split('\n');
  let html = '';
  let inList = false;
  let inCode = false;
  let codeLang = '';
  let codeLines = [];

  const closeList = () => {
    if (inList) { html += '</ul>'; inList = false; }
  };

  const flushCode = () => {
    const code = codeLines.join('\n');
    if (codeLang === 'mermaid') {
      html += `<div class="diagram-wrap"><pre class="mermaid">${escapeHtml(code)}</pre></div>`;
    } else {
      html += `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
    inCode = false;
    codeLang = '';
    codeLines = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trimEnd();

    if (line.startsWith('```')) {
      if (inCode) {
        flushCode();
      } else {
        closeList();
        inCode = true;
        codeLang = line.slice(3).trim().toLowerCase();
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (line.trim() === '$$') {
      closeList();
      const mathLines = [];
      while (i + 1 < lines.length && lines[i + 1].trim() !== '$$') {
        i += 1;
        mathLines.push(lines[i]);
      }
      if (i + 1 < lines.length) i += 1;
      html += `<div class="math-block">$$\n${escapeHtml(mathLines.join('\n'))}\n$$</div>`;
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      closeList();
      const headers = splitTableRow(line);
      i += 1;
      const rows = [];
      while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim()) {
        i += 1;
        rows.push(splitTableRow(lines[i]));
      }
      html += '<div class="table-wrap"><table><thead><tr>';
      html += headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('');
      html += '</tr></thead><tbody>';
      html += rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('');
      html += '</tbody></table></div>';
      continue;
    }

    if (line.startsWith('# ')) {
      closeList();
      html += `<h1>${inlineMarkdown(line.slice(2))}</h1>`;
    } else if (line.startsWith('## ')) {
      closeList();
      html += `<h2>${inlineMarkdown(line.slice(3))}</h2>`;
    } else if (line.startsWith('### ')) {
      closeList();
      html += `<h3>${inlineMarkdown(line.slice(4))}</h3>`;
    } else if (line.startsWith('- ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inlineMarkdown(line.slice(2))}</li>`;
    } else {
      closeList();
      html += `<p>${inlineMarkdown(line)}</p>`;
    }
  }
  if (inCode) flushCode();
  closeList();
  return html;
}

function matchesPaper(paper) {
  const haystack = [
    paper.title,
    paper.shortTitle,
    paper.category,
    paper.venue,
    paper.year,
    ...(paper.authors || []),
    ...(paper.topic_tags || [])
  ].join(' ').toLowerCase();
  const queryOk = !state.query || haystack.includes(state.query.toLowerCase());
  const categoryOk = state.category === 'all' || paper.category === state.category;
  return queryOk && categoryOk;
}

function renderList() {
  const filtered = state.papers.filter(matchesPaper);
  els.paperList.innerHTML = filtered.map((paper) => `
    <button class="paper-item ${paper.id === state.activeId ? 'active' : ''}" data-id="${paper.id}">
      <div class="paper-item-title">${paper.priority}. ${escapeHtml(paper.shortTitle || paper.title)}</div>
      <div class="paper-item-meta">
        <span>${escapeHtml(paper.year)}</span>
        <span>${escapeHtml(paper.category)}</span>
        <span>${escapeHtml((paper.citation_count_semantic_scholar ?? '-') + ' citations')}</span>
      </div>
    </button>
  `).join('') || '<p class="empty-state">没有匹配的论文。</p>';

  els.paperList.querySelectorAll('.paper-item').forEach((button) => {
    button.addEventListener('click', () => loadReport(button.dataset.id));
  });
}

function renderStats(paper) {
  const stats = [
    ['年份', paper.year || '-'],
    ['Venue', paper.venue || '-'],
    ['引用数', paper.citation_count_semantic_scholar ?? '-'],
    ['arXiv', paper.arxiv_id || '-']
  ];
  els.statsRow.innerHTML = stats.map(([label, value]) => `
    <div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${escapeHtml(value)}</div></div>
  `).join('');
}

function renderLinks(paper) {
  const links = [];
  if (paper.pdf_url) links.push(['PDF', paper.pdf_url]);
  if (paper.arxiv_abs_url) links.push(['arXiv', paper.arxiv_abs_url]);
  if (paper.code_url) links.push(['Code', paper.code_url]);
  els.linkBar.innerHTML = links.map(([label, href]) => `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`).join('');
}

async function loadReport(id) {
  const res = await fetch(`/api/reports/${id}`);
  if (!res.ok) throw new Error('report load failed');
  const { paper, markdown } = await res.json();
  state.activeId = id;
  els.paperMeta.textContent = `${paper.category} · ${paper.year} · 推荐顺序 ${paper.priority}`;
  els.paperTitle.textContent = paper.title;
  els.paperWhy.textContent = paper.why_read || '独立阅读报告';
  renderStats(paper);
  renderLinks(paper);
  els.reportContent.innerHTML = markdownToHtml(markdown);
  if (window.mermaid) {
    window.mermaid.run({ querySelector: '.mermaid' }).catch(() => {});
  }
  if (window.renderMathInElement) {
    window.renderMathInElement(els.reportContent, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false
    });
  }
  renderList();
}

async function init() {
  const [papersRes, summaryRes] = await Promise.all([fetch('/api/papers'), fetch('/api/summary')]);
  state.papers = await papersRes.json();
  const summary = await summaryRes.json();
  els.summaryText.textContent = `${summary.count} 篇论文 · ${summary.categories.length} 个方向`;

  summary.categories.forEach((category) => {
    const opt = document.createElement('option');
    opt.value = category;
    opt.textContent = category;
    els.categorySelect.appendChild(opt);
  });

  els.searchInput.addEventListener('input', (event) => {
    state.query = event.target.value;
    renderList();
  });
  els.categorySelect.addEventListener('change', (event) => {
    state.category = event.target.value;
    renderList();
  });

  renderList();
  if (state.papers[0]) loadReport(state.papers[0].id);
}

init().catch((err) => {
  els.reportContent.innerHTML = `<p class="empty-state">加载失败：${escapeHtml(err.message)}</p>`;
});
