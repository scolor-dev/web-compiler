<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { autocompletion, closeBrackets } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { cpp } from '@codemirror/lang-cpp'
import { javascript } from '@codemirror/lang-javascript'
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint'
import { Compartment, EditorState } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  highlightTrailingWhitespace,
  keymap,
  lineNumbers,
  rectangularSelection,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Diagnostic, LanguageId } from '../types/execution'

const props = defineProps<{ modelValue: string; language: LanguageId; dark: boolean; diagnostics: Diagnostic[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; cursor: [line: number, column: number] }>()
const host = ref<HTMLDivElement>()
const languageCompartment = new Compartment()
const themeCompartment = new Compartment()
const whitespaceVisibilityCompartment = new Compartment()
let editor: EditorView | undefined

type WhitespaceKind = 'stack' | 'arithmetic' | 'heap' | 'flow' | 'io' | 'number' | 'label' | 'unknown'

function ignoredWhitespaceInfo(ch: string) {
  if (ch === '\u00a0') return { glyph: '⍽', label: 'NBSP (U+00A0): 命令として無視されます' }
  if (ch === '\u3000') return { glyph: '□', label: '全角スペース (U+3000): 命令として無視されます' }
  if (ch === '\v') return { glyph: '␋', label: 'Vertical Tab (U+000B): 命令として無視されます' }
  if (ch === '\f') return { glyph: '␌', label: 'Form Feed (U+000C): 命令として無視されます' }
  if (ch === '\r') return { glyph: '␍', label: 'CR (U+000D): 命令として無視されます' }
  if (ch === '\u200b') return { glyph: '▯', label: 'Zero Width Space (U+200B): 命令として無視されます' }
  if (ch === '\u2028') return { glyph: '↵', label: 'Line Separator (U+2028): 命令として無視されます' }
  if (ch === '\u2029') return { glyph: '¶', label: 'Paragraph Separator (U+2029): 命令として無視されます' }
  if (/^[\u1680\u2000-\u200a\u202f\u205f\ufeff]$/u.test(ch)) {
    return { glyph: '␠', label: `Unicodeスペース (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}): 命令として無視されます` }
  }
  return null
}

class LineBreakWidget extends WidgetType {
  constructor(private readonly kind: WhitespaceKind) { super() }
  eq(other: LineBreakWidget) { return other.kind === this.kind }
  toDOM() {
    const element = document.createElement('span')
    element.className = `cm-ws-newline cm-ws-${this.kind}`
    element.textContent = '↵'
    element.setAttribute('aria-hidden', 'true')
    return element
  }
  ignoreEvent() { return true }
}

class WhitespaceGlyphWidget extends WidgetType {
  constructor(
    private readonly glyph: string,
    private readonly kind: WhitespaceKind | 'ignored',
    private readonly character: 'space' | 'tab' | 'ignored',
    private readonly label: string,
    private readonly wide = false,
  ) { super() }
  eq(other: WhitespaceGlyphWidget) {
    return other.glyph === this.glyph && other.kind === this.kind && other.character === this.character && other.label === this.label && other.wide === this.wide
  }
  toDOM() {
    const element = document.createElement('span')
    element.className = `cm-ws-token cm-ws-${this.kind} cm-ws-token-${this.character}${this.wide ? ' cm-ws-token-wide' : ''}`
    element.textContent = this.glyph
    element.title = this.label
    element.setAttribute('aria-label', this.label)
    return element
  }
  ignoreEvent() { return true }
}

function analyzeWhitespace(text: string) {
  const tokens: { ch: string; position: number }[] = []
  for (let position = 0; position < text.length; position++) {
    const ch = text[position]!
    if (ch === ' ' || ch === '\t' || ch === '\n') tokens.push({ ch, position })
  }
  const kinds: WhitespaceKind[] = Array.from({ length: tokens.length }, () => 'unknown')
  let cursor = 0

  const take = () => cursor < tokens.length ? tokens[cursor++]!.ch : undefined
  const consumeOperand = () => {
    const start = cursor
    while (cursor < tokens.length) {
      if (take() === '\n') break
    }
    return start
  }
  const paint = (from: number, to: number, kind: WhitespaceKind) => {
    for (let index = from; index < to; index++) kinds[index] = kind
  }

  while (cursor < tokens.length) {
    const start = cursor
    const first = take()
    let kind: WhitespaceKind = 'unknown'
    let operandStart = -1
    let operandKind: WhitespaceKind = 'unknown'

    if (first === ' ') {
      kind = 'stack'
      const second = take()
      if (second === ' ') {
        operandStart = consumeOperand()
        operandKind = 'number'
      } else if (second === '\t') {
        const third = take()
        if (third === ' ' || third === '\n') {
          operandStart = consumeOperand()
          operandKind = 'number'
        }
      } else if (second === '\n') {
        take()
      }
    } else if (first === '\t') {
      const second = take()
      if (second === ' ') {
        kind = 'arithmetic'
        take(); take()
      } else if (second === '\t') {
        kind = 'heap'
        take()
      } else if (second === '\n') {
        kind = 'io'
        take(); take()
      }
    } else if (first === '\n') {
      kind = 'flow'
      const second = take()
      const third = take()
      if (second === ' ' || (second === '\t' && third !== '\n')) {
        operandStart = consumeOperand()
        operandKind = 'label'
      }
    }

    paint(start, cursor, kind)
    if (operandStart >= 0) paint(operandStart, cursor, operandKind)
  }

  return { tokens, kinds }
}

const whitespaceMarks = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(update: ViewUpdate) { if (update.docChanged) this.decorations = this.build(update.view) }
  build(view: EditorView) {
    const marks: { from: number; to: number; value: Decoration }[] = []
    const { tokens, kinds } = analyzeWhitespace(view.state.doc.toString())
    tokens.forEach((token, index) => {
      const kind = kinds[index] ?? 'unknown'
      if (token.ch === '\n') {
        marks.push({ from: token.position, to: token.position, value: Decoration.widget({ widget: new LineBreakWidget(kind), side: -1 }) })
      } else {
        marks.push({
          from: token.position,
          to: token.position + 1,
          value: Decoration.replace({
            widget: new WhitespaceGlyphWidget(
              token.ch === ' ' ? '·' : '⇥',
              kind,
              token.ch === ' ' ? 'space' : 'tab',
              token.ch === ' ' ? 'ASCII Space (U+0020)' : 'Tab (U+0009)',
            ),
          }),
        })
      }
    })
    for (let position = 0; position < view.state.doc.length; position++) {
      const info = ignoredWhitespaceInfo(view.state.doc.sliceString(position, position + 1))
      if (!info) continue
      marks.push({
        from: position,
        to: position + 1,
        value: Decoration.replace({
          widget: new WhitespaceGlyphWidget(info.glyph, 'ignored', 'ignored', info.label, view.state.doc.sliceString(position, position + 1) === '\u3000'),
        }),
      })
    }
    return Decoration.set(marks, true)
  }
}, { decorations: (plugin) => plugin.decorations })

function languageExtension(language: LanguageId) {
  if (language === 'c') return [cpp()]
  if (language === 'javascript') return [javascript()]
  return [whitespaceMarks]
}

function whitespaceVisibilityExtension(language: LanguageId) {
  return language === 'whitespace' ? [] : [highlightSpecialChars(), highlightTrailingWhitespace()]
}

function updateDiagnostics(items: Diagnostic[]) {
  if (!editor) return
  const mapped: CmDiagnostic[] = items.map((item) => {
    const lineNumber = Math.min(Math.max(item.line, 1), editor!.state.doc.lines)
    const line = editor!.state.doc.line(lineNumber)
    const from = Math.min(line.to, line.from + Math.max(0, item.column - 1))
    return { from, to: Math.min(line.to, from + 1), severity: item.severity, message: item.message }
  })
  editor.dispatch(setDiagnostics(editor.state, mapped))
}

onMounted(() => {
  editor = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(), highlightActiveLineGutter(), history(), drawSelection(), dropCursor(),
        EditorState.allowMultipleSelections.of(true), indentOnInput(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(), closeBrackets(), autocompletion(), rectangularSelection(), crosshairCursor(), highlightActiveLine(), highlightTrailingWhitespace(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorState.tabSize.of(2), languageCompartment.of(languageExtension(props.language)), whitespaceVisibilityCompartment.of(whitespaceVisibilityExtension(props.language)), themeCompartment.of(props.dark ? oneDark : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
          if (update.selectionSet || update.docChanged) {
            const position = update.state.doc.lineAt(update.state.selection.main.head)
            emit('cursor', position.number, update.state.selection.main.head - position.from + 1)
          }
        }),
      ],
    }),
  })
  updateDiagnostics(props.diagnostics)
})

watch(() => props.modelValue, (value) => {
  if (!editor || value === editor.state.doc.toString()) return
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
})
watch(() => props.language, (language) => editor?.dispatch({ effects: [
  languageCompartment.reconfigure(languageExtension(language)),
  whitespaceVisibilityCompartment.reconfigure(whitespaceVisibilityExtension(language)),
] }))
watch(() => props.dark, (dark) => editor?.dispatch({ effects: themeCompartment.reconfigure(dark ? oneDark : []) }))
watch(() => props.diagnostics, updateDiagnostics, { deep: true })
onBeforeUnmount(() => editor?.destroy())
</script>

<template><div ref="host" class="code-editor h-full min-h-0 overflow-hidden" :class="{ 'whitespace-mode': props.language === 'whitespace' }" /></template>
