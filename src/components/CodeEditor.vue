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
import { describeLogicLine } from '../utils/logicAnnotations'

const props = defineProps<{ modelValue: string; language: LanguageId; dark: boolean; diagnostics: Diagnostic[]; showLogic: boolean }>()
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

class LogicAnnotationWidget extends WidgetType {
  constructor(private readonly text: string) { super() }
  eq(other: LogicAnnotationWidget) { return other.text === this.text }
  toDOM() {
    const element = document.createElement('span')
    element.className = 'cm-logic-annotation'
    element.textContent = `// ${this.text}`
    element.setAttribute('aria-label', `処理解説: ${this.text}`)
    return element
  }
  ignoreEvent() { return true }
}

type WhitespaceToken = { ch: string, position: number }
type KnownValue = bigint | null

function describeCharacter(value: bigint | null) {
  if (value === null) return '文字を表示'
  const codePoint = Number(BigInt.asUintN(32, value))
  if (codePoint === 10) return '改行を表示'
  if (codePoint === 9) return 'タブを表示'
  if (codePoint === 32) return '空白を表示'
  if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return '「�」を表示'
  const character = String.fromCodePoint(codePoint)
  return /[\p{C}]/u.test(character) ? `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}を表示` : `「${character}」を表示`
}

function describeWhitespaceInstructions(tokens: WhitespaceToken[]) {
  const annotations: { position: number, side: number, text: string }[] = []
  const stack: KnownValue[] = []
  const heap = new Map<bigint, KnownValue>()
  let cursor = 0
  const take = () => tokens[cursor++]?.ch
  const pop = () => stack.pop() ?? null
  const readTerminated = () => {
    let bits = ''
    while (cursor < tokens.length) {
      const ch = take()
      if (ch === '\n') return { complete: true, bits }
      bits += ch === '\t' ? 'T' : 'S'
    }
    return { complete: false, bits }
  }
  const readNumber = () => {
    const sign = take()
    if (sign !== ' ' && sign !== '\t') return { complete: false, value: 0n }
    const operand = readTerminated()
    let value = 0n
    for (const bit of operand.bits) value = value * 2n + (bit === 'T' ? 1n : 0n)
    return { complete: operand.complete, value: sign === '\t' ? -value : value }
  }
  const readLabel = () => {
    const operand = readTerminated()
    return { ...operand, label: operand.bits || '空' }
  }
  const binary = (operator: string, calculate: (a: bigint, b: bigint) => bigint | null) => {
    const b = pop()
    const a = pop()
    const result = a !== null && b !== null ? calculate(a, b) : null
    stack.push(result)
    return result === null || a === null || b === null ? `スタック上位2値を${operator}` : `${operator}（${a}と${b} → ${result}）`
  }
  const add = (text: string) => {
    const last = tokens[cursor - 1]
    if (!last) return
    annotations.push({
      position: last.ch === '\n' ? last.position : last.position + 1,
      side: last.ch === '\n' ? -1 : 1,
      text,
    })
  }

  while (cursor < tokens.length) {
    const instructionStart = cursor
    const first = take()
    let text: string | null = null

    if (first === ' ') {
      const second = take()
      if (second === ' ') {
        const number = readNumber()
        if (number.complete) {
          stack.push(number.value)
          text = `${number.value}をスタックに積む`
        }
      } else if (second === '\n') {
        const third = take()
        if (third === ' ') {
          stack.push(stack.at(-1) ?? null)
          text = 'スタック最上位を複製'
        } else if (third === '\t') {
          const top = pop(); const next = pop()
          stack.push(top, next)
          text = 'スタック上位2値を交換'
        } else if (third === '\n') {
          pop()
          text = 'スタック最上位を破棄'
        }
      } else if (second === '\t') {
        const third = take()
        if (third === ' ' || third === '\n') {
          const number = readNumber()
          if (number.complete) {
            const count = Number(number.value < 0n ? 0n : number.value)
            if (third === ' ') {
              stack.push(stack.at(-1 - count) ?? null)
              text = `上から${count}番目の値を複製`
            } else {
              const top = pop()
              stack.splice(Math.max(0, stack.length - count), count)
              stack.push(top)
              text = `最上位を残して${count}個破棄`
            }
          }
        }
      }
    } else if (first === '\t') {
      const second = take()
      if (second === ' ') {
        const third = take(); const fourth = take()
        if (third === ' ' && fourth === ' ') text = binary('加算', (a, b) => a + b)
        else if (third === ' ' && fourth === '\t') text = binary('減算', (a, b) => a - b)
        else if (third === ' ' && fourth === '\n') text = binary('乗算', (a, b) => a * b)
        else if (third === '\t' && fourth === ' ') text = binary('除算', (a, b) => b === 0n ? null : a / b)
        else if (third === '\t' && fourth === '\t') text = binary('剰余', (a, b) => b === 0n ? null : a % b)
      } else if (second === '\t') {
        const third = take()
        if (third === ' ') {
          const value = pop(); const address = pop()
          if (address !== null) heap.set(address, value)
          text = address === null ? 'ヒープへ値を保存' : `ヒープ[${address}]へ値を保存`
        } else if (third === '\t') {
          const address = pop()
          stack.push(address === null ? null : (heap.get(address) ?? 0n))
          text = address === null ? 'ヒープから値を取得' : `ヒープ[${address}]から値を取得`
        }
      } else if (second === '\n') {
        const third = take(); const fourth = take()
        if (third === ' ' && fourth === ' ') text = describeCharacter(pop())
        else if (third === ' ' && fourth === '\t') {
          const value = pop()
          text = value === null ? '数値を表示' : `${value}を数値として表示`
        } else if (third === '\t' && fourth === ' ') {
          const address = pop()
          if (address !== null) heap.set(address, null)
          text = '1文字を入力してヒープへ保存'
        } else if (third === '\t' && fourth === '\t') {
          const address = pop()
          if (address !== null) heap.set(address, null)
          text = '数値を入力してヒープへ保存'
        }
      }
    } else if (first === '\n') {
      const second = take(); const third = take()
      if (second === ' ' && third === ' ') {
        const label = readLabel(); if (label.complete) text = `ラベル「${label.label}」を定義`
      } else if (second === ' ' && third === '\t') {
        const label = readLabel(); if (label.complete) text = `ラベル「${label.label}」を呼び出す`
      } else if (second === ' ' && third === '\n') {
        const label = readLabel(); if (label.complete) text = `ラベル「${label.label}」へ移動`
      } else if (second === '\t' && third === ' ') {
        const label = readLabel(); pop(); if (label.complete) text = `0ならラベル「${label.label}」へ移動`
      } else if (second === '\t' && third === '\t') {
        const label = readLabel(); pop(); if (label.complete) text = `負数ならラベル「${label.label}」へ移動`
      } else if (second === '\t' && third === '\n') text = '呼び出し元へ戻る'
      else if (second === '\n' && third === '\n') text = 'プログラムを終了'
    }

    if (text) add(text)
    if (cursor <= instructionStart) cursor = instructionStart + 1
  }
  return annotations
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

function whitespaceMarks(showLogic: boolean) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = this.build(view) }
    update(update: ViewUpdate) { if (update.docChanged) this.decorations = this.build(update.view) }
    build(view: EditorView) {
      const marks: { from: number; to: number; value: Decoration }[] = []
      const { tokens, kinds } = analyzeWhitespace(view.state.doc.toString())
      tokens.forEach((token, index) => {
        const kind = kinds[index] ?? 'unknown'
        if (token.ch === '\n') {
          marks.push({ from: token.position, to: token.position, value: Decoration.widget({ widget: new LineBreakWidget(kind), side: -2 }) })
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
        const character = view.state.doc.sliceString(position, position + 1)
        const info = ignoredWhitespaceInfo(character)
        if (!info) continue
        marks.push({
          from: position,
          to: position + 1,
          value: Decoration.replace({
            widget: new WhitespaceGlyphWidget(info.glyph, 'ignored', 'ignored', info.label, character === '\u3000'),
          }),
        })
      }
      if (showLogic) {
        for (const annotation of describeWhitespaceInstructions(tokens)) {
          marks.push({
            from: annotation.position,
            to: annotation.position,
            value: Decoration.widget({ widget: new LogicAnnotationWidget(annotation.text), side: annotation.side }),
          })
        }
      }
      return Decoration.set(marks, true)
    }
  }, { decorations: (plugin) => plugin.decorations })
}

function sourceLogicMarks(language: LanguageId) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = this.build(view) }
    update(update: ViewUpdate) { if (update.docChanged) this.decorations = this.build(update.view) }
    build(view: EditorView) {
      const marks: { from: number; to: number; value: Decoration }[] = []
      for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber++) {
        const line = view.state.doc.line(lineNumber)
        const text = describeLogicLine(language, line.text)
        if (text) marks.push({
          from: line.to,
          to: line.to,
          value: Decoration.widget({ widget: new LogicAnnotationWidget(text), side: -1 }),
        })
      }
      return Decoration.set(marks, true)
    }
  }, { decorations: (plugin) => plugin.decorations })
}

function languageExtension(language: LanguageId, showLogic: boolean) {
  if (language === 'c') return [cpp(), showLogic ? sourceLogicMarks(language) : []]
  if (language === 'javascript') return [javascript(), showLogic ? sourceLogicMarks(language) : []]
  return [whitespaceMarks(showLogic)]
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
        EditorState.tabSize.of(2), languageCompartment.of(languageExtension(props.language, props.showLogic)), whitespaceVisibilityCompartment.of(whitespaceVisibilityExtension(props.language)), themeCompartment.of(props.dark ? oneDark : []),
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
  languageCompartment.reconfigure(languageExtension(language, props.showLogic)),
  whitespaceVisibilityCompartment.reconfigure(whitespaceVisibilityExtension(language)),
] }))
watch(() => props.showLogic, (showLogic) => editor?.dispatch({ effects: languageCompartment.reconfigure(languageExtension(props.language, showLogic)) }))
watch(() => props.dark, (dark) => editor?.dispatch({ effects: themeCompartment.reconfigure(dark ? oneDark : []) }))
watch(() => props.diagnostics, updateDiagnostics, { deep: true })
onBeforeUnmount(() => editor?.destroy())
</script>

<template><div ref="host" class="code-editor h-full min-h-0 overflow-hidden" :class="{ 'whitespace-mode': props.language === 'whitespace' }" /></template>
