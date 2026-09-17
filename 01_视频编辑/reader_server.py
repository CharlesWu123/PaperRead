#!/usr/bin/env python3
"""Serve the paper library with rendered Markdown and inline PDFs."""

from __future__ import annotations

import argparse
import html
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

import markdown


BASE_DIR = Path(__file__).resolve().parent
MERMAID_BLOCK = re.compile(
    r'<pre><code class="language-mermaid">(.*?)</code></pre>', re.DOTALL
)

PAGE_STYLE = """
:root{--bg:#f7f8fa;--paper:#fff;--text:#18202a;--muted:#687384;--border:#dfe4ea;--blue:#1769aa;--ink:#253649}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif;line-height:1.78;letter-spacing:0}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.toolbar{position:sticky;top:0;z-index:4;background:#182938;color:#fff;padding:.7rem 1rem;display:flex;gap:1rem;align-items:center}.toolbar a{color:#fff}.toolbar .path{color:#bcd0df;font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
main{max-width:920px;margin:0 auto;padding:2rem 1.4rem 4rem;background:var(--paper);min-height:calc(100vh - 48px)}
h1{font-size:2rem;line-height:1.3;margin:.5rem 0 1.5rem;letter-spacing:0}h2{font-size:1.4rem;margin:2.6rem 0 .8rem;padding-bottom:.35rem;border-bottom:1px solid var(--border);color:var(--ink);letter-spacing:0}h3{font-size:1.12rem;margin:1.7rem 0 .5rem;letter-spacing:0}
p{margin:.9rem 0}ul,ol{padding-left:1.4rem}li{margin:.3rem 0}
blockquote{margin:1.2rem 0;padding:.65rem 1rem;border-left:4px solid var(--blue);background:#eef6ff}
pre{overflow:auto;background:#f1f4f7;border:1px solid var(--border);border-radius:6px;padding:1rem;line-height:1.5}code{font-family:"SFMono-Regular",Consolas,monospace;font-size:.88em}p code,li code,td code{background:#eef2f5;padding:.12rem .3rem;border-radius:3px}
table{width:100%;border-collapse:collapse;margin:1.2rem 0;font-size:.9rem}th,td{border:1px solid var(--border);padding:.55rem .7rem;text-align:left;vertical-align:top}th{background:#eef2f6}
.library{max-width:1080px}.folder{margin:1.8rem 0}.folder h2{display:flex;justify-content:space-between}.files{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem}.file{border:1px solid var(--border);border-radius:5px;padding:.7rem .8rem;background:#fff}.file small{display:block;color:var(--muted)}
@media(max-width:650px){main{padding:1.2rem .9rem 3rem}h1{font-size:1.55rem}.files{grid-template-columns:1fr}table{display:block;overflow-x:auto}}
"""


def wrap_page(title: str, body: str, current_path: str = "") -> bytes:
    safe_title = html.escape(title)
    safe_path = html.escape(current_path)
    page = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{safe_title}</title><style>{PAGE_STYLE}</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>mermaid.initialize({{startOnLoad:true,theme:'neutral',securityLevel:'loose'}});</script>
</head><body>
<div class="toolbar"><a href="/00_%E5%BC%80%E5%A7%8B%E9%98%85%E8%AF%BB.html">总导航</a><a href="/library">全部文件</a><span class="path">{safe_path}</span></div>
<main>{body}</main></body></html>"""
    return page.encode("utf-8")


def render_markdown(path: Path) -> bytes:
    source = path.read_text(encoding="utf-8")
    rendered = markdown.markdown(
        source,
        extensions=["extra", "fenced_code", "tables", "toc", "sane_lists"],
        output_format="html5",
    )
    rendered = MERMAID_BLOCK.sub(
        lambda match: f'<pre class="mermaid">{html.unescape(match.group(1))}</pre>',
        rendered,
    )
    return wrap_page(path.stem, rendered, str(path.relative_to(BASE_DIR)))


def file_kind(path: Path) -> str:
    if path.suffix.lower() == ".md":
        return "Markdown 解读"
    if path.suffix.lower() == ".html":
        return "HTML 导航"
    if path.suffix.lower() == ".pdf":
        return "PDF 原文"
    return path.suffix.lstrip(".").upper() or "文件"


def library_page() -> bytes:
    sections = []
    roots = [p for p in sorted(BASE_DIR.iterdir()) if p.is_dir() and not p.name.startswith(".")]
    top_files = [
        p for p in sorted(BASE_DIR.iterdir())
        if p.is_file() and p.suffix.lower() in {".md", ".html"}
    ]
    if top_files:
        roots.insert(0, BASE_DIR)

    for folder in roots:
        if folder == BASE_DIR:
            files = top_files
            label = "总览与速查"
        else:
            files = [
                p for p in sorted(folder.iterdir())
                if p.is_file() or p.is_symlink()
            ]
            files = [p for p in files if p.suffix.lower() in {".md", ".html", ".pdf"}]
            label = folder.name
        if not files:
            continue
        entries = []
        for path in files:
            rel = path.relative_to(BASE_DIR).as_posix()
            href = "/" + quote(rel, safe="/")
            entries.append(
                f'<a class="file" href="{href}"><strong>{html.escape(path.stem)}</strong>'
                f'<small>{file_kind(path)}</small></a>'
            )
        sections.append(
            f'<section class="folder"><h2>{html.escape(label)}<small>{len(files)} 个文件</small></h2>'
            f'<div class="files">{"".join(entries)}</div></section>'
        )

    body = (
        '<div class="library"><h1>视频编辑论文资料库</h1>'
        '<p>Markdown 将自动渲染为网页，PDF 默认在浏览器内打开。</p>'
        + "".join(sections)
        + "</div>"
    )
    return wrap_page("视频编辑论文资料库", body, "全部文件")


class ReaderHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".md": "text/markdown; charset=utf-8",
        ".pdf": "application/pdf",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self) -> None:
        request_path = unquote(urlsplit(self.path).path)
        if request_path == "/":
            self.send_response(302)
            self.send_header("Location", "/00_%E5%BC%80%E5%A7%8B%E9%98%85%E8%AF%BB.html")
            self.end_headers()
            return
        if request_path.rstrip("/") == "/library":
            self.send_html(library_page())
            return
        if request_path.lower().endswith(".md"):
            path = self.safe_local_path(request_path)
            if path is None or not path.is_file():
                self.send_error(404, "Markdown file not found")
                return
            try:
                self.send_html(render_markdown(path))
            except (OSError, UnicodeError) as exc:
                self.send_error(500, f"Cannot render Markdown: {exc}")
            return
        super().do_GET()

    def safe_local_path(self, request_path: str) -> Path | None:
        candidate = (BASE_DIR / request_path.lstrip("/")).resolve()
        try:
            candidate.relative_to(BASE_DIR)
        except ValueError:
            return None
        return candidate

    def send_html(self, payload: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(payload)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), ReaderHandler)
    print(f"Serving {BASE_DIR} at http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
