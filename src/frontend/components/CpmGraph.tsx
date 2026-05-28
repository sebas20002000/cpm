import React from 'react'
import type { Node as CpmNode, Arrow, CpmResult } from '../../types'
import { toRoman } from '../utils/romanNumerals'

// ── Mock data ─────────────────────────────────────────────────────────────────

function buildMockResult(): CpmResult {
    const n1: CpmNode = { id: 1, earliestStartTime: 0,  latestStartTime: 0,  input: null, output: [] }
    const n2: CpmNode = { id: 2, earliestStartTime: 3,  latestStartTime: 3,  input: [],   output: [] }
    const n3: CpmNode = { id: 3, earliestStartTime: 8,  latestStartTime: 9,  input: [],   output: [] }
    const n4: CpmNode = { id: 4, earliestStartTime: 10, latestStartTime: 10, input: [],   output: null }

    const a1: Arrow = { task: { id: 'A', duration: 3, dependencies: [] },    slack: 0, source: n1, destination: n2 }
    const a2: Arrow = { task: { id: 'B', duration: 5, dependencies: ['A'] }, slack: 0, source: n2, destination: n3 }
    const a3: Arrow = { task: { id: 'C', duration: 2, dependencies: ['B'] }, slack: 1, source: n3, destination: n4 }

    n1.output = [a1]
    n2.input  = [a1]; n2.output = [a2]
    n3.input  = [a2]; n3.output = [a3]
    n4.input  = [a3]

    return { nodes: [n1, n2, n3, n4], arrows: [a1, a2, a3] }
}

export const MOCK_RESULT: CpmResult = buildMockResult()

// ── Layout ────────────────────────────────────────────────────────────────────

const NODE_R      = 40
const LEVEL_GAP_X = 200
const ITEM_GAP_Y  = 120

function computeLayout(result: CpmResult): Map<number, { x: number; y: number }> {
    const inDegree = new Map<number, number>()
    const outEdges = new Map<number, number[]>()

    for (const node of result.nodes) {
        if (!inDegree.has(node.id)) inDegree.set(node.id, 0)
        if (!outEdges.has(node.id)) outEdges.set(node.id, [])
    }
    for (const arrow of result.arrows) {
        inDegree.set(arrow.destination.id, (inDegree.get(arrow.destination.id) ?? 0) + 1)
        outEdges.get(arrow.source.id)!.push(arrow.destination.id)
    }

    // Kahn's BFS — assign the maximum level to each node
    const level = new Map<number, number>()
    const queue: number[] = []
    const inDegreeCopy = new Map(inDegree)

    for (const [id, deg] of inDegreeCopy) {
        if (deg === 0) { queue.push(id); level.set(id, 0) }
    }

    while (queue.length) {
        const id = queue.shift()!
        for (const nextId of (outEdges.get(id) ?? [])) {
            const newLevel = (level.get(id) ?? 0) + 1
            if ((level.get(nextId) ?? -1) < newLevel) level.set(nextId, newLevel)
            const deg = (inDegreeCopy.get(nextId) ?? 1) - 1
            inDegreeCopy.set(nextId, deg)
            if (deg === 0) queue.push(nextId)
        }
    }

    // Group nodes by level, distribute vertically (centered around y = 0)
    const byLevel = new Map<number, number[]>()
    for (const [id, lv] of level) {
        if (!byLevel.has(lv)) byLevel.set(lv, [])
        byLevel.get(lv)!.push(id)
    }

    const positions = new Map<number, { x: number; y: number }>()
    const MARGIN_X = NODE_R + 60
    const MARGIN_Y = NODE_R + 60

    for (const [lv, ids] of byLevel) {
        const totalHeight = (ids.length - 1) * ITEM_GAP_Y
        ids.forEach((id, i) => {
            positions.set(id, {
                x: lv * LEVEL_GAP_X + MARGIN_X,
                y: i * ITEM_GAP_Y - totalHeight / 2 + MARGIN_Y,
            })
        })
    }

    return positions
}

function computeViewBox(positions: Map<number, { x: number; y: number }>): string {
    const PAD = NODE_R + 70
    const xs = [...positions.values()].map(p => p.x)
    const ys = [...positions.values()].map(p => p.y)
    const minX = Math.min(...xs) - PAD
    const minY = Math.min(...ys) - PAD
    const width  = Math.max(...xs) - minX + PAD
    const height = Math.max(...ys) - minY + PAD
    return `${minX} ${minY} ${width} ${height}`
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function circleEdgePoint(
    cx: number, cy: number, r: number,
    toX: number, toY: number
): { x: number; y: number } {
    const angle = Math.atan2(toY - cy, toX - cx)
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

/** Perpendicular unit vector (rotated 90° CCW) for a line from (x1,y1) to (x2,y2) */
function perpUnit(x1: number, y1: number, x2: number, y2: number): { dx: number; dy: number } {
    const len = Math.hypot(x2 - x1, y2 - y1)
    if (len === 0) return { dx: 0, dy: -1 }
    return { dx: -(y2 - y1) / len, dy: (x2 - x1) / len }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NodeShape({ node, cx, cy }: { node: CpmNode; cx: number; cy: number }) {
    const R = NODE_R
    return (
        <g>
            <circle cx={cx} cy={cy} r={R} className="node-circle" />
            {/* horizontal diameter */}
            <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} className="node-divider" />
            {/* vertical through lower half */}
            <line x1={cx} y1={cy} x2={cx} y2={cy + R} className="node-divider" />
            {/* top: Roman numeral ID */}
            <text
                x={cx} y={cy - R * 0.28}
                textAnchor="middle" dominantBaseline="middle"
                className="node-text-id"
            >
                {toRoman(node.id)}
            </text>
            {/* bottom-left: earliestStartTime */}
            <text
                x={cx - R * 0.32} y={cy + R * 0.55}
                textAnchor="middle" dominantBaseline="middle"
                className="node-text-est"
            >
                {node.earliestStartTime}
            </text>
            {/* bottom-right: latestStartTime */}
            <text
                x={cx + R * 0.32} y={cy + R * 0.55}
                textAnchor="middle" dominantBaseline="middle"
                className="node-text-lst"
            >
                {node.latestStartTime}
            </text>
        </g>
    )
}

interface ArrowShapeProps {
    arrow: Arrow
    srcPos: { x: number; y: number }
    dstPos: { x: number; y: number }
    levelDiff: number
}

function ArrowShape({ arrow, srcPos, dstPos, levelDiff }: ArrowShapeProps) {
    const R = NODE_R
    const LABEL_OFFSET = 16

    const exit  = circleEdgePoint(srcPos.x, srcPos.y, R + 2, dstPos.x, dstPos.y)
    const entry = circleEdgePoint(dstPos.x, dstPos.y, R + 2, srcPos.x, srcPos.y)

    const mx = (exit.x + entry.x) / 2
    const my = (exit.y + entry.y) / 2
    const { dx, dy } = perpUnit(exit.x, exit.y, entry.x, entry.y)

    const topLabel    = `${arrow.task.id}, ${arrow.task.duration}`
    const bottomLabel = `slack: ${arrow.slack}`

    let pathD: string
    if (levelDiff <= 1) {
        pathD = `M ${exit.x} ${exit.y} L ${entry.x} ${entry.y}`
    } else {
        const hOffset = Math.abs(entry.x - exit.x) * 0.45
        pathD = `M ${exit.x} ${exit.y} C ${exit.x + hOffset} ${exit.y}, ${entry.x - hOffset} ${entry.y}, ${entry.x} ${entry.y}`
    }

    return (
        <g>
            <path
                d={pathD}
                className="arrow-line"
                markerEnd="url(#arrowhead)"
            />
            <text
                x={mx + dx * LABEL_OFFSET}
                y={my + dy * LABEL_OFFSET}
                textAnchor="middle"
                dominantBaseline="middle"
                className="arrow-label-top"
            >
                {topLabel}
            </text>
            <text
                x={mx - dx * LABEL_OFFSET}
                y={my - dy * LABEL_OFFSET}
                textAnchor="middle"
                dominantBaseline="middle"
                className="arrow-label-bottom"
            >
                {bottomLabel}
            </text>
        </g>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
    result: CpmResult
}

export default function CpmGraph({ result }: Props) {
    const positions = computeLayout(result)
    const viewBox = computeViewBox(positions)

    // Build a level map for routing decisions
    const levelMap = new Map<number, number>()
    for (const [id, pos] of positions) {
        levelMap.set(id, Math.round((pos.x - (NODE_R + 60)) / LEVEL_GAP_X))
    }

    return (
        <div className="graph-container">
            <svg
                viewBox={viewBox}
                width="100%"
                style={{ minHeight: 300 }}
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <marker
                        id="arrowhead"
                        markerWidth="10"
                        markerHeight="7"
                        refX="9"
                        refY="3.5"
                        orient="auto"
                    >
                        <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
                    </marker>
                </defs>

                {/* Arrows (rendered first so nodes appear on top) */}
                {result.arrows.map((arrow, i) => {
                    const srcPos = positions.get(arrow.source.id)
                    const dstPos = positions.get(arrow.destination.id)
                    if (!srcPos || !dstPos) return null
                    const srcLevel = levelMap.get(arrow.source.id) ?? 0
                    const dstLevel = levelMap.get(arrow.destination.id) ?? 0
                    return (
                        <ArrowShape
                            key={i}
                            arrow={arrow}
                            srcPos={srcPos}
                            dstPos={dstPos}
                            levelDiff={dstLevel - srcLevel}
                        />
                    )
                })}

                {/* Nodes */}
                {result.nodes.map(node => {
                    const pos = positions.get(node.id)
                    if (!pos) return null
                    return (
                        <NodeShape key={node.id} node={node} cx={pos.x} cy={pos.y} />
                    )
                })}
            </svg>
        </div>
    )
}
