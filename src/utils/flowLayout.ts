import type { FlowNode } from '../types/flow'

/**
 * Prevent nodes that share a rank and preferred column from occupying the
 * same position. The preferred column is kept whenever it is available.
 */
export function resolveFlowColumns(nodes: FlowNode[], ranks: Map<string, number>) {
  const resolved = new Map<string, number>()
  const nodesByRank = new Map<number, FlowNode[]>()

  for (const node of nodes) {
    const rank = ranks.get(node.id) ?? 0
    const group = nodesByRank.get(rank) ?? []
    group.push(node)
    nodesByRank.set(rank, group)
  }

  for (const group of nodesByRank.values()) {
    const used = new Set<number>()
    const ordered = group
      .map((node, index) => ({ node, index }))
      .sort((a, b) => (a.node.column ?? 0) - (b.node.column ?? 0) || a.index - b.index)

    for (const { node } of ordered) {
      const preferred = node.column ?? 0
      let column = preferred

      for (let distance = 1; used.has(column); distance++) {
        const left = preferred - distance
        const right = preferred + distance
        column = !used.has(left) ? left : right
      }

      used.add(column)
      resolved.set(node.id, column)
    }
  }

  return resolved
}
