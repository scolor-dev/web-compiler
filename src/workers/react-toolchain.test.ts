import { describe, expect, it } from 'vitest'
import { analyzeReact, lintReact } from './react-toolchain'

describe('React JSX toolchain', () => {
  it('transforms JSX and accepts React imports and the render entry point', () => {
    const result = analyzeReact(`
      import { useState } from 'react'
      function App() {
        const [count] = useState(2)
        return <p>Count: {count}</p>
      }
      render(<App />)
    `)
    expect(result.diagnostics).toEqual([])
    expect(result.code).toContain('__reactRuntime.createElement')
    expect(result.code).toContain('__moduleRuntime')
  })

  it('provides React and common hooks without requiring imports', () => {
    const result = lintReact(`
      function Counter() {
        const [count] = useState(0)
        const doubled = useMemo(() => count * 2, [count])
        return <p>{doubled}</p>
      }
      render(<Counter />)
    `)
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics).toEqual([])
  })

  it('reports JSX syntax errors and undefined identifiers', () => {
    expect(lintReact('render(<main>)').exitCode).toBe(1)
    expect(lintReact('render(<main>{missing}</main>)').diagnostics[0]?.message).toContain('missing')
  })

  it('rejects imports other than the local React runtime', () => {
    const result = lintReact("import Widget from './Widget'\nrender(<Widget />)")
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics[0]?.message).toContain('外部モジュール')
  })

  it('suggests the nearest defined CSS class for an unknown className', () => {
    const result = lintReact("const css = `.card { color: red }`; render(<div className=\"crad\">Hello</div>)")
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics[0]).toMatchObject({ severity: 'warning' })
    expect(result.diagnostics[0]?.message).toContain('「card」の可能性')
  })

  it('suggests adding a key to elements created by map', () => {
    const result = lintReact('const items = [1, 2]; render(<ul>{items.map((item) => <li>{item}</li>)}</ul>)')
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics.some(({ message }) => message.includes('key'))).toBe(true)
  })

  it('suggests wrapping an eagerly called state setter in an event handler function', () => {
    const result = lintReact(`
      import { useState } from 'react'
      function Counter() {
        const [count, setCount] = useState(0)
        return <button onClick={setCount(count + 1)}>{count}</button>
      }
      render(<Counter />)
    `)
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      message: expect.stringContaining('onClick={() => setCount(count + 1)}'),
    }))
  })

  it('suggests likely React attribute spelling corrections', () => {
    const result = lintReact('render(<label class="field" tabindex={0} onClik={() => 1}>Name</label>)')
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics.map(({ message }) => message)).toEqual(expect.arrayContaining([
      expect.stringContaining('className'),
      expect.stringContaining('tabIndex'),
      expect.stringContaining('onClick'),
    ]))
  })
})
