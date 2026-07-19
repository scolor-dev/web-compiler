import { describe, expect, it } from 'vitest'
import type { Diagnostic } from '../types/execution'
import { diagnosticSuggestion } from './diagnosticSuggestions'

const error = (message: string): Diagnostic => ({ severity: 'error', message, line: 1, column: 1 })

describe('diagnosticSuggestion', () => {
  it('Cの未定義識別子には宣言を提案する', () => {
    expect(diagnosticSuggestion('c', error("use of undeclared identifier 'total'"))).toContain('total')
    expect(diagnosticSuggestion('c', error("use of undeclared identifier 'total'"))).toContain('宣言')
  })

  it('JavaScriptの構文エラーには記号の対応確認を提案する', () => {
    expect(diagnosticSuggestion('javascript', error('Unexpected token (3:2)'))).toContain('括弧')
  })

  it('Whitespaceの未定義ラベルにはラベル修正を提案する', () => {
    expect(diagnosticSuggestion('whitespace', error('未定義のラベル `ST` です'))).toContain('ST')
  })

  it('未知のエラーにも言語別の改善案を返す', () => {
    expect(diagnosticSuggestion('react', error('unknown runtime failure'))).not.toBe('')
  })
})
