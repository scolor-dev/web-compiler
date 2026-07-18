import { describe, expect, it } from 'vitest'
import type { FlowNode } from '../types/flow'
import { resolveFlowColumns } from './flowLayout'

function node(id: string, column = 0): FlowNode {
  return { id, column, label: id, kind: 'process' }
}

describe('resolveFlowColumns', () => {
  it('同じ段・同じ列のノードを空いている列へ分散する', () => {
    const nodes = [node('condition'), node('yes'), node('no'), node('nested')]
    const ranks = new Map([
      ['condition', 0],
      ['yes', 1],
      ['no', 1],
      ['nested', 1],
    ])

    const result = resolveFlowColumns(nodes, ranks)

    expect(result.get('condition')).toBe(0)
    expect(new Set(['yes', 'no', 'nested'].map((id) => result.get(id))).size).toBe(3)
  })

  it('衝突しない希望列は維持する', () => {
    const nodes = [node('left', -1), node('right', 1)]
    const ranks = new Map(nodes.map((item) => [item.id, 2]))

    expect(resolveFlowColumns(nodes, ranks)).toEqual(new Map([['left', -1], ['right', 1]]))
  })

  it('別の段では同じ列を再利用できる', () => {
    const nodes = [node('first'), node('second')]
    const ranks = new Map([['first', 1], ['second', 2]])

    expect(resolveFlowColumns(nodes, ranks)).toEqual(new Map([['first', 0], ['second', 0]]))
  })
})
