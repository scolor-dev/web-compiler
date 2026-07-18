import { describe, expect, it } from 'vitest'
import { buildFlowGraph } from './flowGraph'

describe('flow graph generation', () => {
  it('creates decision branches and loop-back edges for C', () => {
    const graph = buildFlowGraph('c', `int main(void) {
      for (int i = 0; i < 3; i++) {
        puts("Hi");
      }
      return 0;
    }`)
    expect(graph.nodes.some((node) => node.kind === 'decision')).toBe(true)
    expect(graph.nodes.some((node) => node.kind === 'io')).toBe(true)
    expect(graph.edges.some((edge) => edge.direction === 'back')).toBe(true)
  })

  it('creates JavaScript output nodes', () => {
    const graph = buildFlowGraph('javascript', "const value = 1\nconsole.log(value)")
    expect(graph.nodes.some((node) => node.kind === 'io')).toBe(true)
  })

  it('labels conditions and lays out if/else branches in separate columns', () => {
    const graph = buildFlowGraph('javascript', `while (left < right) {
      if (values[left] <= values[right]) {
        result.push(values[left])
        left++
      } else {
        result.push(values[right])
        right++
      }
    }`)
    expect(graph.nodes.some((node) => node.label === 'while (left < right)')).toBe(true)
    expect(graph.nodes.some((node) => node.label === 'if (values[left] <= values[right])')).toBe(true)
    expect(graph.nodes.some((node) => node.column === -1)).toBe(true)
    expect(graph.nodes.some((node) => node.column === 1)).toBe(true)
  })

  it('decodes Whitespace character output', () => {
    const graph = buildFlowGraph('whitespace', '   \t     \t\n\t\n  \n\n\n')
    expect(graph.nodes.some((node) => node.label === '「A」を表示')).toBe(true)
  })

  it('places Whitespace conditional paths in separate columns', () => {
    // Push 0, jump-zero to label S, output number, label S, end.
    const graph = buildFlowGraph('whitespace', '   \n' + '\n\t  \n' + '\t\n \t' + '\n   \n' + '\n\n\n')
    const decision = graph.nodes.find((node) => node.kind === 'decision')
    const branches = graph.edges.filter((edge) => edge.from === decision?.id)
    expect(branches).toHaveLength(2)
    expect(branches.map((edge) => graph.nodes.find((node) => node.id === edge.to)?.column)).toEqual(expect.arrayContaining([-1, 1]))
  })
})
