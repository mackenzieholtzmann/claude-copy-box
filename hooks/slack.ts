// github markdown to the rich text slack keeps on paste (what a copy from a web page carries):
// bold, italic, strike, code, links and lists. slack's composer ignores typed markup on paste, so
// *bold* and <url|text> only work as html. slack has no headings or tables: headings come out
// bold and tables keep their shape in a code block

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// one stretch of text outside inline code, already escaped. links are set aside first so an
// underscore or asterisk in a url can't turn into formatting
const convertInline = (text: string) => {
  const links: string[] = []

  return text
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
      links.push(`<a href="${url}">${label}</a>`)

      return `\u0001${links.length - 1}\u0001`
    })
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '<b>$2</b>')
    .replace(/(^|[^*\w])\*(?=\S)([^*]+?)(?<=\S)\*(?![*\w])/g, '$1<i>$2</i>')
    .replace(/(^|[^_\w])_(?=\S)([^_]+?)(?<=\S)_(?![_\w])/g, '$1<i>$2</i>')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<s>$1</s>')
    .replace(/\u0001(\d+)\u0001/g, (match, index: string) => links[Number(index)])
}

// a line's text with its `inline code` kept as code
const inline = (line: string) =>
  line
    .split(/(`[^`]*`)/)
    .map(piece =>
      piece.startsWith('`') && piece.endsWith('`') && piece.length > 1
        ? `<code>${escapeHtml(piece.slice(1, -1))}</code>`
        : convertInline(escapeHtml(piece)),
    )
    .join('')

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const TASK = /^\[([ xX])\]\s+(.*)$/

export const toSlackHtml = (markdown: string) => {
  const out: string[] = []
  const lists: Array<{ tag: 'ul' | 'ol'; indent: number }> = []
  let block: string[] | null = null

  const closeLists = (toIndent = -1) => {
    while (lists.length && lists[lists.length - 1].indent > toIndent) {
      out.push(`</li></${lists.pop()!.tag}>`)
    }
  }

  const closeBlock = () => {
    if (block) {
      out.push(`<pre>${escapeHtml(block.join('\n'))}</pre>`)
      block = null
    }
  }

  let isInFence = false

  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      if (isInFence) {
        closeBlock()
      } else {
        closeLists()
        closeBlock()
        block = []
      }

      isInFence = !isInFence
      continue
    }

    if (isInFence) {
      block!.push(line)
      continue
    }

    // a table rides in a code block of its own
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeLists()

      if (!block) {
        block = []
      }

      block.push(line.trim())
      continue
    }

    closeBlock()

    if (line.trim() === '') {
      closeLists()
      out.push('<br>')
      continue
    }

    const heading = line.match(/^\s*#{1,6}\s+(.*)$/)
    const summary = line.match(/^\s*<summary>(.*)<\/summary>\s*$/)

    if (heading || summary) {
      closeLists()
      out.push(`<div><b>${inline((heading || summary)![1])}</b></div>`)
      continue
    }

    if (/^\s*<\/?details>\s*$/.test(line)) {
      continue
    }

    const item = line.match(LIST_ITEM)

    if (item) {
      const indent = item[1].length
      const task = item[3].match(TASK)

      // a checklist line reads as a box and its text, not as a bullet. both are emoji so they come
      // out the same size: ⬜ is slack's :white_large_square:, ☑️ its :ballot_box_with_check:
      if (task && item[2].length === 1) {
        closeLists()
        out.push(`<div>${task[1] === ' ' ? '⬜' : '☑️'} ${inline(task[2])}</div>`)
        continue
      }

      const tag = /\d/.test(item[2]) ? 'ol' : 'ul'
      const top = lists[lists.length - 1]

      if (!top || indent > top.indent) {
        out.push(`<${tag}><li>`)
        lists.push({ tag, indent })
      } else {
        closeLists(indent)
        out.push('</li><li>')
      }

      out.push(inline(item[3]))
      continue
    }

    closeLists()
    out.push(`<div>${inline(line.trim())}</div>`)
  }

  closeBlock()
  closeLists()

  return out.join('')
}

// puts html and its plain fallback on the mac clipboard together, so slack pastes the formatting
// and a plain text field still gets the markdown
export const RICH_COPY_SCRIPT = `
ObjC.import('AppKit');
function run(argv) {
    const board = $.NSPasteboard.generalPasteboard;
    board.clearContents;
    board.setStringForType($(argv[0]), $.NSPasteboardTypeHTML);
    board.setStringForType($(argv[1]), $.NSPasteboardTypeString);
}
`
