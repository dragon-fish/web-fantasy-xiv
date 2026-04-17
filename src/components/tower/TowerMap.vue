<script setup lang="ts">
import { computed, watch } from 'vue'
import { VueFlow, useVueFlow, type Node as FlowNode, type Edge as FlowEdge } from '@vue-flow/core'
import type { NodeMouseEvent } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import { useTowerStore } from '@/stores/tower'
import type { TowerNode } from '@/tower/types'
import { K_SCHEDULE, TOTAL_STEPS } from '@/tower/graph/k-schedule'
import TowerMapNode from './TowerMapNode.vue'

const tower = useTowerStore()

const STEP_SPACING_Y = 110
const SLOT_SPACING_X = 140
const DEFAULT_ZOOM = 1.0

const { setCenter, onPaneReady } = useVueFlow()

type NodeState = 'current' | 'completed' | 'reachable' | 'unreachable'

function computeState(node: TowerNode): NodeState {
  const run = tower.run
  if (!run) return 'unreachable'
  if (node.id === run.currentNodeId) return 'current'
  if (run.completedNodes.includes(node.id)) return 'completed'
  const current = run.towerGraph.nodes[run.currentNodeId]
  if (current?.next.includes(node.id)) return 'reachable'
  return 'unreachable'
}

const flowNodes = computed<FlowNode[]>(() => {
  if (!tower.run) return []
  return (Object.values(tower.run.towerGraph.nodes) as TowerNode[]).map((node) => {
    const K = K_SCHEDULE[node.step]
    const x = (node.slot - (K - 1) / 2) * SLOT_SPACING_X
    const y = node.step * STEP_SPACING_Y
    return {
      id: String(node.id),
      type: 'tower',
      position: { x, y },
      data: { node, state: computeState(node) },
      draggable: false,
      selectable: false,
      connectable: false,
    }
  })
})

const flowEdges = computed<FlowEdge[]>(() => {
  if (!tower.run) return []
  const run = tower.run
  const completedSet = new Set(run.completedNodes)
  const edges: FlowEdge[] = []
  for (const from of Object.values(run.towerGraph.nodes) as TowerNode[]) {
    for (const toId of from.next) {
      const walked =
        completedSet.has(from.id) &&
        (completedSet.has(toId) || toId === run.currentNodeId)
      const available = from.id === run.currentNodeId
      edges.push({
        id: `e-${from.id}-${toId}`,
        source: String(from.id),
        target: String(toId),
        type: 'default',
        class: walked ? 'edge-walked' : available ? 'edge-available' : 'edge-dormant',
      })
    }
  }
  return edges
})

function focusOnCurrent(duration = 400) {
  if (!tower.run) return
  const current = tower.run.towerGraph.nodes[tower.run.currentNodeId]
  if (!current) return
  const K = K_SCHEDULE[current.step]
  const x = (current.slot - (K - 1) / 2) * SLOT_SPACING_X
  const y = current.step * STEP_SPACING_Y
  setCenter(x, y, { zoom: DEFAULT_ZOOM, duration })
}

// Initial center (no animation) once Vue Flow pane is ready
onPaneReady(() => focusOnCurrent(0))

// Re-center with animation whenever the player advances
watch(
  () => tower.run?.currentNodeId,
  () => focusOnCurrent(400),
)

const maxK = Math.max(...K_SCHEDULE)
const minX = -((maxK - 1) / 2) * SLOT_SPACING_X - 400
const maxX = ((maxK - 1) / 2) * SLOT_SPACING_X + 400
const minY = -400
const maxY = (TOTAL_STEPS - 1) * STEP_SPACING_Y + 400

const translateExtent: [[number, number], [number, number]] = [
  [minX, minY],
  [maxX, maxY],
]

function onNodeClick({ node }: NodeMouseEvent) {
  tower.advanceTo(Number(node.id))
}
</script>

<template lang="pug">
.tower-map-wrapper(v-if="tower.run")
  VueFlow(
    :nodes="flowNodes"
    :edges="flowEdges"
    :nodes-draggable="false"
    :nodes-connectable="false"
    :elements-selectable="false"
    :pan-on-drag="true"
    :zoom-on-scroll="true"
    :min-zoom="0.7"
    :max-zoom="1.4"
    :translate-extent="translateExtent"
    @node-click="onNodeClick"
  )
    template(#node-tower="nodeProps")
      TowerMapNode(
        :node="nodeProps.data.node"
        :state="nodeProps.data.state"
      )
  button.locate-btn(
    type="button"
    @click="focusOnCurrent(400)"
    title="定位到当前位置"
  ) 🎯 定位
</template>

<style lang="scss" scoped>
.tower-map-wrapper {
  position: relative;
  width: 100%;
  height: calc(100vh - 160px);
  min-height: 480px;
  background: #0a0a0a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  overflow: hidden;
}

.locate-btn {
  position: absolute;
  bottom: 16px;
  right: 16px;
  padding: 8px 12px;
  font-size: 12px;
  color: #ddd;
  background: rgba(26, 26, 26, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  cursor: pointer;
  z-index: 5;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: rgba(40, 40, 40, 0.95);
    border-color: rgba(255, 255, 255, 0.35);
  }
}

// Vue Flow theme overrides — keep project dark theme, suppress default light style
:deep(.vue-flow) {
  background: transparent;
}
:deep(.vue-flow__pane) {
  cursor: grab;
  &:active { cursor: grabbing; }
}
:deep(.vue-flow__edge-path) {
  stroke: rgba(255, 255, 255, 0.3);
  stroke-width: 1.5;
  fill: none;
}
:deep(.edge-walked .vue-flow__edge-path) {
  stroke: rgba(255, 209, 102, 0.6);
  stroke-width: 2;
}
:deep(.edge-available .vue-flow__edge-path) {
  stroke: rgba(255, 255, 255, 0.85);
  stroke-width: 2;
}
:deep(.vue-flow__handle) {
  // Hide connection handles (players cannot connect edges)
  opacity: 0;
  pointer-events: none;
}
:deep(.vue-flow__node) {
  // Let custom node size be fully determined by TowerMapNode
  padding: 0;
  border: none;
  background: transparent;
  width: auto;
  height: auto;
}
</style>
