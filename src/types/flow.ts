export type FlowNodeKind = 'start' | 'process' | 'decision' | 'io' | 'end'

export interface FlowNode {
  id: string
  label: string
  detail?: string
  kind: FlowNodeKind
  line?: number
  column?: number
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
  direction?: 'forward' | 'back'
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}
