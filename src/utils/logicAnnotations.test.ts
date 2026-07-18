import { describe, expect, it } from 'vitest'
import { describeLogicLine } from './logicAnnotations'

describe('logic annotations', () => {
  it('describes C control flow and output', () => {
    expect(describeLogicLine('c', 'for (int i = 0; i < 5; i++) {')).toContain('繰り返す')
    expect(describeLogicLine('c', 'puts("Hello");')).toBe('「Hello」を出力して改行')
  })

  it('describes JavaScript declarations and output', () => {
    expect(describeLogicLine('javascript', 'const answer = 42')).toContain('変数answer')
    expect(describeLogicLine('javascript', "console.log('Hello')")).toBe('「Hello」をコンソールへ表示')
  })
})
