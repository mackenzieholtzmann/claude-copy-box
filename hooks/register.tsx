import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CopyBoxTab } from '../types'
import { previewPage } from './preview-page'
import { RICH_COPY_SCRIPT, toSlackHtml } from './slack'

// where the browser previews are written
const PREVIEW_DIR = '/private/tmp/copy-box-previews'

// the browser setting is the app `open -a` starts; the button names it without the edition
const browserLabel = (app: string) => app.replace(/^Google /, '').replace(/ (Nightly|Developer Edition)$/, '')

// the color setting: lavender is the theme's inline code color, the rest are fixed colors
const COLORS: Record<string, string> = {
  lavender: 'permission',
  aqua: '#78faff',
  grey: '#9aa3b8',
  orange: '#e07a5f',
  green: '#7dd3c0',
}

// copy-ready text the model wraps in <copy label="..." format="markdown"> and </copy> lines,
// drawn as a box; format="markdown" adds Raw / Preview tabs
const COPY_BLOCK = /^<copy((?:\s+\w+="[^"]*")*)>[ \t]*\n([\s\S]*?)\n<\/copy>[ \t]*$/gm
const COPY_ATTR = /(\w+)="([^"]*)"/g

// what Claude is told, at the end of its system prompt
const INSTRUCTIONS = `# Copy boxes

When you give the person text they will paste somewhere else (a command, a code snippet, a commit message, a PR description, a Slack message, a config value), put it in a copy block instead of a fenced code block or a blockquote. The copy-box plugin draws each copy block as a box with a Copy button.

A copy block is a line \`<copy label="Short name">\`, then the text exactly as it should be pasted, then a line \`</copy>\`. Each marker sits on its own line with nothing else on it. Inside the block, keep each paragraph on one line, since every line break is copied as typed.

When the text is markdown (a PR description, an issue comment, a Slack post), add \`format="markdown"\` to the opening line, like \`<copy label="PR description" format="markdown">\`. The box then gets Raw / Preview tabs, a browser preview and a Copy for Slack button. Headings, lists, tables and code fences inside a markdown copy block are fine.

Wrap only the part to be pasted, never a whole explanation.`

type CopyPart = { kind: 'copy'; label: string; isMarkdown: boolean; text: string }
type Part = { kind: 'text'; text: string } | CopyPart

// which tab each markdown box shows, by `<message id>:<box index>`; raw unless picked
const tabs = atom({ plugin: 'copy-box', key: 'tabs' } as const, {})

// copy buttons showing "Copied" right now, by `<message id>:<button key>`
const copiedButtons = atom({ plugin: 'copy-box', key: 'copiedButtons' } as const, {})
const COPIED_MS = 2000

const splitCopies = (text: string): Part[] => {
  const parts: Part[] = []
  let last = 0

  for (const match of text.matchAll(COPY_BLOCK)) {
    const start = match.index ?? 0

    if (start > last) {
      parts.push({ kind: 'text', text: text.slice(last, start) })
    }

    const attrs: Record<string, string> = {}

    for (const [, name, value] of match[1].matchAll(COPY_ATTR)) {
      attrs[name] = value
    }

    parts.push({ kind: 'copy', label: attrs.label || 'Copy', isMarkdown: attrs.format === 'markdown', text: match[2] })
    last = start + match[0].length
  }

  if (last < text.length) {
    parts.push({ kind: 'text', text: text.slice(last) })
  }

  return parts
    .map(part => (part.kind === 'text' ? { ...part, text: part.text.trim() } : part))
    .filter(part => part.kind === 'copy' || part.text !== '')
}

// every copy block in the conversation, oldest first
const allCopies = async ($: EngineInterface) => {
  const messages = await $.session.messages()

  return messages
    .filter(message => message.role === 'assistant')
    .flatMap(message => splitCopies(message.text))
    .filter((part): part is CopyPart => part.kind === 'copy')
}

export const register: Register = (on, options) => {
  // the person's settings, from the install screen or /config
  const accent = COLORS[String(options.color)] || COLORS.lavender
  const browserApp = String(options.browser || 'Google Chrome')
  const browserName = browserLabel(browserApp)

  // teaches Claude the copy markers, so anyone who installs the mod gets boxes with no setup
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return { ...composed, sections: [...composed.sections, { id: 'copy-box', text: INSTRUCTIONS, scope: 'session' }] }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'grab',
      description: 'Copy the newest copy box to the clipboard (/grab 2 for the one before it)',
    })

    return next(e)
  })

  on('command.run', { command: 'grab' }, async ($, e) => {
    const copies = await allCopies($)
    const back = Math.max(1, parseInt(e.args, 10) || 1)
    const picked = copies[copies.length - back]

    if (!picked) {
      return { text: copies.length ? `There are only ${copies.length} copy boxes so far.` : 'No copy boxes yet.' }
    }

    const copied = await $.ui.copy({ text: picked.text })

    return { text: copied.isCopied ? `Copied "${picked.label}".` : `Couldn't copy "${picked.label}" (${copied.reason}).` }
  })

  // a reply block holding copy blocks is drawn here: its text as markdown, each copy block as a box
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const parts = splitCopies(e.props.text)

    if (!parts.some(part => part.kind === 'copy')) {
      return next(e)
    }

    const columns = e.viewport?.columns
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const picked: Record<string, CopyBoxTab> = await read($, tabs)
    const justCopied: Record<string, true> = await read($, copiedButtons)

    // each control lights on its own: without a scope of its own, hovering anywhere in the keyed
    // box would light every control in it
    const scope = (control: string, index: number) => `${control}-${index}-${e.requestId.slice(-40)}`

    // each writer copies its own way and answers why it failed, or null once copied
    const copyPlain = (part: CopyPart) => async () => {
      const copied = await $.ui.copy({ text: part.text, surface: e.surface })

      return copied.isCopied ? null : copied.reason
    }

    // html plus the markdown as its plain fallback, through the mac's own clipboard
    const copyForSlack = (part: CopyPart) => async () => {
      try {
        const ran = await $.process.run(['osascript', '-l', 'JavaScript', '-e', RICH_COPY_SCRIPT, toSlackHtml(part.text), part.text])

        return ran.exitCode === 0 ? null : ran.stderr.trim() || `osascript exited ${ran.exitCode}`
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    }

    // copies, then shows "Copied" on the button that did it for a couple of seconds
    const copy = async (part: CopyPart, button: string, write: () => Promise<string | null>) => {
      const failed = await write()

      if (failed) {
        $.ui.toast(`Couldn't copy "${part.label}" (${failed})`)

        return
      }

      await update($, copiedButtons, all => ({ ...all, [button]: true }))
      $.clock.after(COPIED_MS, () => {
        void update($, copiedButtons, all => {
          const { [button]: done, ...rest } = all

          return rest
        })
      })
    }

    const copyButton = (part: CopyPart, index: number, name: string, label: string, write: () => Promise<string | null>) => {
      const button = `${name}-button-${index}`
      const id = `${e.requestId}:${button}`

      return (
        <Button
          key={button}
          label={justCopied[id] ? 'Copied' : label}
          variant={name === 'copy' ? 'primary' : undefined}
          hover={{ scope: scope(name, index), inverse: true }}
          onPress={() => copy(part, id, write)}
        />
      )
    }

    // writes the box as a GitHub-styled page and opens it in the browser
    const openInBrowser = async (part: CopyPart, index: number) => {
      const path = `${PREVIEW_DIR}/${e.requestId.replace(/[^\w-]/g, '')}-${index}.html`

      try {
        await $.fs.write(path, previewPage(part.label, part.text))
        const opened = await $.process.run(['open', '-a', browserApp, path])

        $.ui.toast(
          opened.exitCode === 0
            ? `Opened "${part.label}" in ${browserName}`
            : `Couldn't open ${browserApp}: ${opened.stderr.trim()}`,
        )
      } catch (error) {
        $.ui.toast(`Couldn't open ${browserApp}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const pick = (id: string, tab: CopyBoxTab) => update($, tabs, all => ({ ...all, [id]: tab }))

    // a tab is a plain button; the open one is bold and underlined in the box's color
    const tab = (id: string, index: number, name: CopyBoxTab, title: string) => {
      const isOpen = (picked[id] || 'raw') === name

      return (
        <Button key={`tab-${name}-${index}`} plain onPress={() => pick(id, name)}>
          <Text
            bold={isOpen}
            underline={isOpen}
            color={isOpen ? accent : 'subtle'}
            hover={{ scope: scope(`tab-${name}`, index), color: accent, underline: true }}
          >
            {title}
          </Text>
        </Button>
      )
    }

    return (
      <Box flexDirection="row">
        <Box width={2} flexShrink={0}>
          <Text>{e.props.isFirstOfReply ? '●' : ' '}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} rowGap={1}>
          {parts.map((part, index) =>
            part.kind === 'text' ? (
              <Markdown key={`text-${index}`} text={part.text} />
            ) : (
              <Box key={`copy-${index}`} flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
                <Box flexDirection="row" justifyContent="space-between">
                  <Box flexDirection="row" columnGap={2}>
                    <Text bold>{part.label}</Text>
                    {part.isMarkdown && tab(`${e.requestId}:${index}`, index, 'raw', 'Raw')}
                    {part.isMarkdown && tab(`${e.requestId}:${index}`, index, 'preview', 'Preview')}
                    {part.isMarkdown && (
                      <Button
                        key={`browser-button-${index}`}
                        label={`Preview in ${browserName}`}
                        hover={{ scope: scope('browser', index), inverse: true }}
                        onPress={() => openInBrowser(part, index)}
                      />
                    )}
                  </Box>
                  <Box flexDirection="row" columnGap={1}>
                    {part.isMarkdown && copyButton(part, index, 'slack', 'Copy for Slack', copyForSlack(part))}
                    {copyButton(part, index, 'copy', 'Copy', copyPlain(part))}
                  </Box>
                </Box>
                <Text color={accent} dimColor wrap="truncate">
                  {'─'.repeat(Math.max(10, (columns ?? 100) - 10))}
                </Text>
                {part.isMarkdown && picked[`${e.requestId}:${index}`] === 'preview' ? (
                  <Markdown key={`preview-${index}`} text={part.text} />
                ) : (
                  <Text>{part.text}</Text>
                )}
              </Box>
            ),
          )}
        </Box>
      </Box>
    )
  })
}
