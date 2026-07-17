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
let editor: EditorView | undefined

const whitespaceMarks = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view) }
  build(view: EditorView) {
    const marks: { from: number; to: number; value: Decoration }[] = []
    for (const range of view.visibleRanges) {
      const text = view.state.doc.sliceString(range.from, range.to)
      for (let index = 0; index < text.length; index++) {
        const ch = text[index]
        if (ch === ' ' || ch === '\t') marks.push({ from: range.from + index, to: range.from + index + 1, value: Decoration.mark({ class: ch === ' ' ? 'cm-ws-space' : 'cm-ws-tab' }) })
      }
    }
    return Decoration.set(marks, true)
  }
}, { decorations: (plugin) => plugin.decorations })

function languageExtension(language: LanguageId) {
  if (language === 'c') return [cpp()]
  if (language === 'javascript') return [javascript()]
  return [whitespaceMarks]
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
        lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(), dropCursor(),
        EditorState.allowMultipleSelections.of(true), indentOnInput(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(), closeBrackets(), autocompletion(), rectangularSelection(), crosshairCursor(), highlightActiveLine(), highlightTrailingWhitespace(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorState.tabSize.of(2), languageCompartment.of(languageExtension(props.language)), themeCompartment.of(props.dark ? oneDark : []),
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
watch(() => props.language, (language) => editor?.dispatch({ effects: languageCompartment.reconfigure(languageExtension(language)) }))
watch(() => props.dark, (dark) => editor?.dispatch({ effects: themeCompartment.reconfigure(dark ? oneDark : []) }))
watch(() => props.diagnostics, updateDiagnostics, { deep: true })
onBeforeUnmount(() => editor?.destroy())
</script>

<template><div ref="host" class="code-editor h-full min-h-0 overflow-hidden" /></template>
