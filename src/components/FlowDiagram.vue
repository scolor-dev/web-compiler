<script setup lang="ts">
import { computed } from 'vue'
import type { FlowEdge, FlowGraph, FlowNode } from '../types/flow'
import { resolveFlowColumns } from '../utils/flowLayout'

const props = defineProps<{ graph: FlowGraph }>()
const columnWidth = 430
const rowHeight = 122
const indices = computed(() => new Map(props.graph.nodes.map((node, index) => [node.id, index])))
const ranks = computed(() => {
  const result = new Map<string, number>([['start', 0]])
  const forward = props.graph.edges.filter((edge) => {
    const from = indices.value.get(edge.from) ?? 0
    const to = indices.value.get(edge.to) ?? 0
    return edge.direction !== 'back' && to > from
  })
  for (let pass = 0; pass < props.graph.nodes.length; pass++) {
    let changed = false
    for (const edge of forward) {
      const fromRank = result.get(edge.from)
      if (fromRank === undefined) continue
      const candidate = fromRank + 1
      if ((result.get(edge.to) ?? -1) < candidate) {
        result.set(edge.to, candidate)
        changed = true
      }
    }
    if (!changed) break
  }
  let fallback = 0
  for (const node of props.graph.nodes) {
    if (!result.has(node.id)) result.set(node.id, ++fallback)
    else fallback = Math.max(fallback, result.get(node.id)!)
  }
  return result
})
const layoutColumns = computed(() => resolveFlowColumns(props.graph.nodes, ranks.value))
const backEdges = computed(() => props.graph.edges.filter((edge) => {
  const fromRank = ranks.value.get(edge.from) ?? 0
  const toRank = ranks.value.get(edge.to) ?? 0
  return edge.direction === 'back' || toRank <= fromRank
}))
const backEdgeOrder = computed(() => new Map(backEdges.value.map((edge, index) => [edge, index])))
const leftGutter = computed(() => 240 + Math.max(0, backEdges.value.length - 1) * 30)
const columns = computed(() => {
  const values = props.graph.nodes.map((node) => layoutColumns.value.get(node.id) ?? 0)
  return { min: Math.min(0, ...values), max: Math.max(0, ...values) }
})
const diagramWidth = computed(() => leftGutter.value + 240 + (columns.value.max - columns.value.min) * columnWidth)
const centerX = computed(() => leftGutter.value - columns.value.min * columnWidth)
const maxRank = computed(() => Math.max(0, ...ranks.value.values()))
const height = computed(() => Math.max(220, 116 + maxRank.value * rowHeight))
const nodeX = (node: FlowNode) => centerX.value + (layoutColumns.value.get(node.id) ?? 0) * columnWidth
const nodeY = (node: FlowNode) => 58 + (ranks.value.get(node.id) ?? 0) * rowHeight

function labelLines(label: string) {
  if (label.length <= 24) return [label]
  const split = Math.min(24, Math.max(12, Math.floor(label.length / 2)))
  return [label.slice(0, split), label.slice(split, split + 24)]
}

function nodeHalfWidth(node: FlowNode) {
  if (node.kind === 'decision') return 194
  if (node.kind === 'start' || node.kind === 'end') return 112
  return 174
}

function edgePath(edge: FlowEdge) {
  const fromIndex = indices.value.get(edge.from) ?? 0
  const toIndex = indices.value.get(edge.to) ?? fromIndex + 1
  const fromNode = props.graph.nodes[fromIndex]!
  const toNode = props.graph.nodes[toIndex]!
  const fromRank = ranks.value.get(edge.from) ?? fromIndex
  const toRank = ranks.value.get(edge.to) ?? toIndex
  const fromY = nodeY(fromNode)
  const toY = nodeY(toNode)
  const fromX = nodeX(fromNode)
  const toX = nodeX(toNode)
  const isBack = edge.direction === 'back' || toRank <= fromRank
  if (toRank === fromRank + 1 && !isBack) return `M ${fromX} ${fromY + 42} L ${toX} ${toY - 42}`
  if (isBack) {
    const laneX = 28 + (backEdgeOrder.value.get(edge) ?? 0) * 30
    const fromLeft = fromX - nodeHalfWidth(fromNode)
    const toLeft = toX - nodeHalfWidth(toNode)
    const direction = toY < fromY ? -1 : 1
    return `M ${fromLeft} ${fromY} L ${laneX + 12} ${fromY} Q ${laneX} ${fromY} ${laneX} ${fromY + direction * 12} L ${laneX} ${toY - direction * 12} Q ${laneX} ${toY} ${laneX + 12} ${toY} L ${toLeft} ${toY}`
  }
  const sideX = diagramWidth.value - 34
  return `M ${fromX} ${fromY + 42} C ${sideX} ${fromY}, ${sideX} ${toY}, ${toX} ${toY - 42}`
}

function edgeLabelPosition(edge: FlowEdge) {
  const fromIndex = indices.value.get(edge.from) ?? 0
  const toIndex = indices.value.get(edge.to) ?? fromIndex + 1
  const fromNode = props.graph.nodes[fromIndex]!
  const toNode = props.graph.nodes[toIndex]!
  const fromRank = ranks.value.get(edge.from) ?? fromIndex
  const toRank = ranks.value.get(edge.to) ?? toIndex
  const fromX = nodeX(fromNode)
  const toX = nodeX(toNode)
  if (toRank === fromRank + 1 && edge.direction !== 'back') return { x: (fromX + toX) / 2 + 12, y: (nodeY(fromNode) + nodeY(toNode)) / 2 }
  if (edge.direction === 'back' || toRank <= fromRank) {
    const laneX = 28 + (backEdgeOrder.value.get(edge) ?? 0) * 30
    return { x: laneX + 8, y: (nodeY(fromNode) + nodeY(toNode)) / 2 }
  }
  return { x: diagramWidth.value - 46, y: (nodeY(fromNode) + nodeY(toNode)) / 2 }
}

function nodeClass(node: FlowNode) { return `flow-node flow-node-${node.kind}` }
</script>

<template>
  <div class="flow-diagram min-h-0 flex-1 overflow-auto p-4 sm:p-5">
    <svg :viewBox="`0 0 ${diagramWidth} ${height}`" class="mx-auto block" :style="{ minWidth: `${Math.max(760, diagramWidth * 0.82)}px`, maxWidth: `${diagramWidth}px` }" role="img" aria-label="コードから生成した処理フロー図">
      <title>コードの処理フロー</title>
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" class="flow-arrow-head" />
        </marker>
      </defs>

      <g class="flow-edges">
        <g v-for="(edge, index) in graph.edges" :key="`${edge.from}-${edge.to}-${index}`">
          <path :d="edgePath(edge)" class="flow-edge" marker-end="url(#flow-arrow)" />
          <text v-if="edge.label" :x="edgeLabelPosition(edge).x" :y="edgeLabelPosition(edge).y" class="flow-edge-label">{{ edge.label }}</text>
        </g>
      </g>

      <g v-for="node in graph.nodes" :key="node.id" :transform="`translate(${nodeX(node)} ${nodeY(node)})`" :class="nodeClass(node)">
        <rect v-if="node.kind === 'start' || node.kind === 'end'" x="-112" y="-32" width="224" height="64" rx="32" class="flow-node-shape" />
        <polygon v-else-if="node.kind === 'decision'" points="0,-45 194,0 0,45 -194,0" class="flow-node-shape" />
        <polygon v-else-if="node.kind === 'io'" points="-150,-36 174,-36 150,36 -174,36" class="flow-node-shape" />
        <rect v-else x="-174" y="-36" width="348" height="72" rx="12" class="flow-node-shape" />
        <text class="flow-node-label" text-anchor="middle">
          <tspan v-for="(line, lineIndex) in labelLines(node.label)" :key="lineIndex" x="0" :y="labelLines(node.label).length === 1 ? -2 : -12 + lineIndex * 17">{{ line }}</tspan>
          <tspan v-if="node.detail" x="0" :y="labelLines(node.label).length === 1 ? 17 : 25" class="flow-node-detail">{{ node.detail }}</tspan>
        </text>
      </g>
    </svg>
  </div>
</template>
