import type { Diagnostic } from '../types/execution'

function position(code: string, index: number) {
  const before = code.slice(0, index)
  const lines = before.split('\n')
  return { line: lines.length, column: lines.at(-1)!.length + 1 }
}

function warning(code: string, index: number, message: string): Diagnostic {
  return { severity: 'warning', message, ...position(code, index) }
}

function editDistance(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    let previous = row[0]!
    row[0] = i
    for (let j = 1; j <= right.length; j++) {
      const old = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1))
      previous = old
    }
  }
  return row[right.length]!
}

function classNameSuggestions(code: string) {
  const definitions = new Set<string>()
  for (const match of code.matchAll(/\.([A-Za-z_][\w-]*)\s*\{/g)) definitions.add(match[1]!)
  if (!definitions.size) return []

  const results: Diagnostic[] = []
  const attribute = /\bclassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["']([^"']*)["']\s*\})/g
  for (const match of code.matchAll(attribute)) {
    const classes = (match[1] ?? match[2] ?? match[3] ?? '').split(/\s+/).filter(Boolean)
    for (const name of classes) {
      if (definitions.has(name)) continue
      const nearest = [...definitions]
        .map((candidate) => ({ candidate, distance: editDistance(name, candidate) }))
        .sort((a, b) => a.distance - b.distance)[0]
      const suggestion = nearest && nearest.distance <= Math.max(2, Math.floor(name.length / 3))
        ? `「${nearest.candidate}」の可能性はありませんか？`
        : '定義済みのクラス名を確認してください。'
      results.push(warning(code, match.index! + match[0].indexOf(name), `クラス「${name}」に対応するスタイル定義が見つかりません。${suggestion}`))
    }
  }
  return results
}

function missingKeySuggestions(code: string) {
  const results: Diagnostic[] = []
  const mappedElement = /\.map\s*\([\s\S]*?=>\s*\(?\s*<([A-Za-z][\w.]*)\b([^>]*)>/g
  for (const match of code.matchAll(mappedElement)) {
    if (!/\bkey\s*=/.test(match[2]!)) {
      const tagIndex = match.index! + match[0].lastIndexOf(`<${match[1]}`)
      results.push(warning(code, tagIndex, `map()で生成する <${match[1]}> に key がありません。一意な値を key に設定してはどうでしょうか？`))
    }
  }
  return results
}

const reactAttributes = [
  'accept', 'action', 'alt', 'autoComplete', 'autoFocus', 'checked', 'children', 'className', 'colSpan',
  'disabled', 'form', 'height', 'href', 'htmlFor', 'id', 'key', 'max', 'maxLength', 'method', 'min',
  'multiple', 'name', 'onBlur', 'onChange', 'onClick', 'onFocus', 'onInput', 'onKeyDown', 'onKeyUp',
  'onMouseDown', 'onMouseEnter', 'onMouseLeave', 'onMouseMove', 'onMouseUp', 'onSubmit', 'placeholder',
  'readOnly', 'required', 'role', 'rowSpan', 'selected', 'src', 'step', 'style', 'tabIndex', 'target', 'title',
  'type', 'value', 'width',
]

const attributeAliases = new Map([
  ['class', 'className'], ['for', 'htmlFor'], ['readonly', 'readOnly'], ['tabindex', 'tabIndex'],
  ['maxlength', 'maxLength'], ['colspan', 'colSpan'], ['rowspan', 'rowSpan'], ['autofocus', 'autoFocus'],
])

function attributeNameSuggestions(code: string) {
  const results: Diagnostic[] = []
  const openingTag = /<([a-z][\w-]*)\b([^<>]*)>/g
  for (const tag of code.matchAll(openingTag)) {
    const attributes = tag[2]!
    for (const attribute of attributes.matchAll(/\b([A-Za-z][\w:-]*)\s*=/g)) {
      const name = attribute[1]!
      if (name.startsWith('data-') || name.startsWith('aria-') || reactAttributes.includes(name)) continue
      const alias = attributeAliases.get(name.toLowerCase())
      const caseMatch = reactAttributes.find((candidate) => candidate.toLowerCase() === name.toLowerCase())
      const nearest = reactAttributes
        .map((candidate) => ({ candidate, distance: editDistance(name, candidate) }))
        .sort((a, b) => a.distance - b.distance)[0]
      const suggested = alias ?? caseMatch ?? (nearest && nearest.distance <= 1 ? nearest.candidate : undefined)
      if (!suggested || suggested === name) continue
      const index = tag.index! + tag[0].indexOf(attributes) + attribute.index!
      results.push(warning(code, index, `React属性「${name}」は「${suggested}」の綴りではありませんか？`))
    }
  }
  return results
}

function eagerEventHandlerSuggestions(code: string) {
  const results: Diagnostic[] = []
  const eagerSetter = /\b(on[A-Z][A-Za-z]*)\s*=\s*\{\s*(set[A-Z][A-Za-z0-9_$]*)\s*\(([^{};]*?)\)\s*\}/g
  for (const match of code.matchAll(eagerSetter)) {
    const eventName = match[1]!
    const setter = match[2]!
    const argument = match[3]!.trim()
    results.push(warning(
      code,
      match.index!,
      `${eventName}で「${setter}」を描画中に実行しています。クリック時に実行するなら ${eventName}={() => ${setter}(${argument})} ではありませんか？`,
    ))
  }
  return results
}

export function reactSuggestions(code: string) {
  return [
    ...classNameSuggestions(code),
    ...missingKeySuggestions(code),
    ...attributeNameSuggestions(code),
    ...eagerEventHandlerSuggestions(code),
  ]
}
