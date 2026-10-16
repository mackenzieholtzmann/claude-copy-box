// a GitHub-styled page that renders a markdown copy box in the browser, free of terminal settings

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// the markdown rides in a json script tag; "</" is broken up so it can't close the tag early
const embed = (text: string) => JSON.stringify(text).replace(/<\//g, '<\\/')

const STYLES = `
    :root {
        --bg: #ffffff;
        --fg: #1f2328;
        --muted: #59636e;
        --border: #d1d9e0;
        --border-muted: #d1d9e0b3;
        --code-bg: #818b981f;
        --pre-bg: #f6f8fa;
        --link: #0969da;
    }

    @media (prefers-color-scheme: dark) {
        :root {
            --bg: #0d1117;
            --fg: #f0f6fc;
            --muted: #9198a1;
            --border: #3d444d;
            --border-muted: #3d444db3;
            --code-bg: #656c7633;
            --pre-bg: #151b23;
            --link: #4493f8;
        }
    }

    * { box-sizing: border-box; }

    body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
        font-size: 16px;
        line-height: 1.5;
    }

    .bar {
        position: sticky;
        top: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: .75rem 1.5rem;
        border-bottom: 1px solid var(--border);
        background: var(--pre-bg);
        font-size: 14px;
    }

    .bar p { margin: 0; color: var(--muted); }
    .bar strong { color: var(--fg); }

    .bar button {
        padding: .3rem .9rem;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--bg);
        color: var(--fg);
        font: inherit;
        font-weight: 500;
        cursor: pointer;
    }

    .page { max-width: 880px; margin: 2rem auto; padding: 0 1rem; }
    .comment { border: 1px solid var(--border); border-radius: 6px; padding: 1.5rem 2rem; }
    .comment > :first-child { margin-top: 0; }
    .comment > :last-child { margin-bottom: 0; }

    h1, h2, h3, h4 { margin: 1.5rem 0 1rem; font-weight: 600; line-height: 1.25; }
    h1, h2 { padding-bottom: .3em; border-bottom: 1px solid var(--border-muted); }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }

    p, ul, ol, table, pre, blockquote, details { margin: 0 0 1rem; }
    ul, ol { padding-left: 2em; }
    li + li { margin-top: .25em; }
    li > ul, li > ol { margin: .25em 0 0; }
    li:has(> input[type="checkbox"]) { list-style: none; margin-left: -1.4em; }

    blockquote { padding: 0 1em; border-left: .25em solid var(--border); color: var(--muted); }

    code {
        padding: .2em .4em;
        border-radius: 6px;
        background: var(--code-bg);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 85%;
    }

    pre { padding: 1rem; border-radius: 6px; background: var(--pre-bg); overflow: auto; font-size: 85%; line-height: 1.45; }
    pre code, pre code.hljs { padding: 0; background: none; font-size: 100%; }

    table { border-collapse: collapse; }
    th, td { padding: 6px 13px; border: 1px solid var(--border); }
    th { font-weight: 600; }
    tr:nth-child(2n) td { background: var(--pre-bg); }

    img { max-width: 100%; }
    hr { height: .25em; margin: 1.5rem 0; border: 0; background: var(--border); }
    summary { cursor: pointer; }

    a { color: var(--link); text-decoration: underline; text-underline-offset: .2rem; cursor: pointer; }
`

const SCRIPT = `
    const markdown = JSON.parse(document.getElementById('markdown').textContent);
    const body = document.getElementById('body');
    const button = document.getElementById('copy');

    if (window.marked) {
        body.innerHTML = marked.parse(markdown, { gfm: true });

        if (window.hljs) {
            hljs.highlightAll();
        }
    } else {
        const pre = document.createElement('pre');
        pre.textContent = markdown;
        body.replaceChildren(pre);
    }

    // the raw markdown, same as the box's Copy button
    button.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(markdown);
        } catch (error) {
            const field = document.createElement('textarea');
            field.value = markdown;
            document.body.append(field);
            field.select();
            document.execCommand('copy');
            field.remove();
        }

        button.textContent = 'Copied!';
        setTimeout(() => {
            button.textContent = 'Copy markdown';
        }, 1500);
    });
`

export const previewPage = (label: string, markdown: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(label)} - preview</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css" media="(prefers-color-scheme: dark)">
<style>${STYLES}</style>
</head>
<body>
<div class="bar">
    <p><strong>${escapeHtml(label)}</strong> - preview</p>
    <button type="button" id="copy">Copy markdown</button>
</div>
<main class="page">
    <article class="comment" id="body"></article>
</main>
<script type="application/json" id="markdown">${embed(markdown)}</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script>${SCRIPT}</script>
</body>
</html>
`
