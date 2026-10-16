import { expect, test } from 'claude-code/testing'

import { toSlackHtml } from './slack'

const SURFACES = ['terminal', 'desktop'] as const

test('a copy block draws as a box with a Copy button and its text kept whole', async $ => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'copy-box',
      surface,
      component: 'AssistantMessage',
      requestId: 'msg-2',
      viewport: { columns: 200, rows: 50 },
      props: {
        text: `Run this:\n\n<copy label="Command">\nCLAUDE_CODE_NO_FLICKER=1 claude\n</copy>`,
        isFirstOfReply: true,
      },
    })

    expect(await ui.find({ type: 'Button', key: 'copy-button-1' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'CLAUDE_CODE_NO_FLICKER=1 claude' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Command' })).toBeDefined()
    await ui.unmount()
  }
})

test('a block with no copy blocks is left to the engine', async ($, on) => {
  let seen = ''

  // stands in for the engine's own drawing of the block
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    seen = e.props.text
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  const ui = await $.ui.mount({
    plugin: 'copy-box',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'msg-plain',
    props: { text: 'just text', isFirstOfReply: true },
  })

  expect(seen).toBe('just text')
  await ui.unmount()
})

test('a markdown copy box opens on Raw and switches to Preview when the tab is pressed', async $ => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'copy-box',
      surface,
      component: 'AssistantMessage',
      requestId: `msg-md-${surface}`,
      viewport: { columns: 200, rows: 50 },
      props: {
        text: `Here:\n\n<copy label="PR" format="markdown">\n## summary\n- one\n</copy>`,
        isFirstOfReply: true,
      },
    })

    expect(await ui.find({ type: 'Text', text: '## summary\n- one' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'browser-button-1' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'slack-button-1' })).toBeDefined()
    await ui.press({ key: 'tab-preview-1' })
    expect(await ui.find({ type: 'Markdown', key: 'preview-1' })).toBeDefined()
    await ui.press({ key: 'tab-raw-1' })
    expect(await ui.find({ type: 'Markdown', key: 'preview-1' })).toBeUndefined()
    await ui.unmount()
  }
})

test('slack conversion handles headings, bold, italic, links, lists, tables and code', async () => {
  const markdown = [
    '## summary',
    'swaps **bold** and *italic* and `**not this**`',
    '- [x] done',
    '- [ ] todo',
    '- one',
    '  - nested',
    '- two',
    'see [docs](https://example.com/a_b_c)',
    '| a | b |',
    '| --- | --- |',
    '```scss',
    '.x { **y** }',
    '```',
  ].join('\n')

  expect(toSlackHtml(markdown)).toBe(
    [
      '<div><b>summary</b></div>',
      '<div>swaps <b>bold</b> and <i>italic</i> and <code>**not this**</code></div>',
      '<div>☑️ done</div>',
      '<div>⬜ todo</div>',
      '<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul>',
      '<div>see <a href="https://example.com/a_b_c">docs</a></div>',
      '<pre>| a | b |\n| --- | --- |</pre>',
      '<pre>.x { **y** }</pre>',
    ].join(''),
  )
})

test('a copy button reads Copied after a press', async ($, on) => {
  on('ui.copy', () => ({ value: { isCopied: true } }))

  const ui = await $.ui.mount({
    plugin: 'copy-box',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'msg-copied',
    viewport: { columns: 200, rows: 50 },
    props: { text: `<copy label="One">\nhello\n</copy>`, isFirstOfReply: true },
  })

  await ui.press({ key: 'copy-button-0' })
  expect((await ui.find({ type: 'Button', key: 'copy-button-0' }))?.props.label).toBe('Copied')
  await ui.unmount()
})

test('the browser setting names the preview button', { options: { browser: 'Firefox Nightly', color: 'aqua' } }, async $ => {
  const ui = await $.ui.mount({
    plugin: 'copy-box',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'msg-browser',
    viewport: { columns: 200, rows: 50 },
    props: { text: `<copy label="PR" format="markdown">\n## hi\n</copy>`, isFirstOfReply: true },
  })

  expect((await ui.find({ type: 'Button', key: 'browser-button-0' }))?.props.label).toBe('Preview in Firefox')
  await ui.unmount()
})

test('Claude is taught the copy markers at the end of its system prompt', async ($, on) => {
  // stands in for the engine's own sections
  on('prompt.compose', () => ({ sections: [{ id: 'core', text: 'core', scope: 'shared' }] }))

  const { sections } = await $.prompt.compose({
    model: 'claude-opus-5-5',
    promptModel: 'claude-opus-5-5',
    surfaces: ['terminal'],
    tools: [],
    outputStyle: null,
    traits: [],
    sections: [],
  })
  const last = sections[sections.length - 1]

  expect(last.id).toBe('copy-box')
  expect(last.scope).toBe('session')
  expect(last.text).toContain('<copy label="Short name">')
})
