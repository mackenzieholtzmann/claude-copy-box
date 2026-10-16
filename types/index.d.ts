export type CopyBoxTab = 'raw' | 'preview'

declare module 'claude-code' {
  interface PluginState {
    'copy-box': {
      tabs: Record<string, CopyBoxTab>
      copiedButtons: Record<string, true>
    }
  }
}
