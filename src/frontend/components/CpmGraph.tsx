import React, { useEffect, useRef, useState } from 'react'
import type { Node as CpmNode, Arrow, CpmResult } from '../../types'
import { toRoman } from '../utils/romanNumerals'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const MIN_SCALE = 0.2
const MAX_SCALE = 8

// Styling for the exported, standalone SVG (App.css isn't available in the file).
const EXPORT_CSS = `
text { font-family: sans-serif; }
.node-circle { fill: #fff; stroke: #333; stroke-width: 1.5; }
.node-divider { stroke: #333; stroke-width: 1; }
.node-text-id { font-size: 13px; font-weight: bold; fill: #111; }
.node-text-est, .node-text-lst { font-size: 11px; font-weight: 600; }
.node-text-est { fill: #1a8a1a; }
.node-text-lst { fill: #d12b2b; }
.arrow-line { stroke: #333; stroke-width: 1.5; fill: none; }
.arrow-line--dummy { stroke-dasharray: 6 4; }
.arrow-label-top, .arrow-label-bottom { font-size: 11px; fill: #222; stroke: #fff; stroke-width: 3px; paint-order: stroke; stroke-linejoin: round; }
.arrow-label-bottom { fill: #777; }
`

// ── Layout ────────────────────────────────────────────────────────────────────

const NODE_R      = 40
const LEVEL_GAP_X = 220
const ITEM_GAP_Y  = 150

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

// Bounds for the whole drawing. Unlike a node-only box, this also folds in each
// arrow's curve control points (which bound the cubic) and its label anchors, so
// bows and labels that reach well outside the node band are never clipped — this
// is what the SVG export pins its width/height to.
function computeBounds(
    nodes: CpmNode[],
    positions: Map<number, { x: number; y: number }>,
    geometries: ArrowGeometry[],
): ViewBox {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const ext = (x: number, y: number) => {
        minX = Math.min(minX, x); minY = Math.min(minY, y)
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
    for (const n of nodes) {
        const p = positions.get(n.id)
        if (!p) continue
        ext(p.x - NODE_R, p.y - NODE_R)
        ext(p.x + NODE_R, p.y + NODE_R)
    }
    for (const g of geometries) {
        for (const pt of g.points) ext(pt.x, pt.y)
        ext(g.tx, g.ty)
        ext(g.sx, g.sy)
    }
    const PAD = 30
    return { x: minX - PAD, y: minY - PAD, w: maxX - minX + 2 * PAD, h: maxY - minY + 2 * PAD }
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

type Pt = { x: number; y: number }

/** Point on a cubic Bézier at parameter t ∈ [0,1]. */
function cubicAt(t: number, p0: Pt, p1: Pt, p2: Pt, p3: Pt): Pt {
    const u = 1 - t
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
    return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y }
}

/** True when no sampled point of the cubic comes within `minDist` of any obstacle. */
function curveClears(p0: Pt, p1: Pt, p2: Pt, p3: Pt, obstacles: Pt[], minDist: number): boolean {
    const SAMPLES = 24
    for (const o of obstacles)
        for (let i = 0; i <= SAMPLES; i++) {
            const pt = cubicAt(i / SAMPLES, p0, p1, p2, p3)
            if (Math.hypot(pt.x - o.x, pt.y - o.y) < minDist) return false
        }
    return true
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

const LABEL_OFFSET = 13

interface ArrowGeometry {
    pathD: string
    taskLabel: string
    slackLabel: string
    /** task-label anchor (above the line) */
    tx: number; ty: number
    /** slack-label anchor (below the line) */
    sx: number; sy: number
    dummy: boolean
    /** the path's defining points (endpoints + control points) — used to bound
     *  the drawing for the viewBox/export. */
    points: Pt[]
}

function arrowGeometry(
    arrow: Arrow,
    srcPos: { x: number; y: number },
    dstPos: { x: number; y: number },
    levelDiff: number,
    centerY: number,
    dummy: boolean,
    obstacles: Pt[],
): ArrowGeometry {
    const R = NODE_R

    let pathD: string
    let mx: number
    let my: number
    let tangent: { x1: number; y1: number; x2: number; y2: number }
    let points: Pt[]

    if (levelDiff <= 1) {
        // Straight segment: endpoints aim at each other's centre.
        const exit  = circleEdgePoint(srcPos.x, srcPos.y, R + 2, dstPos.x, dstPos.y)
        const entry = circleEdgePoint(dstPos.x, dstPos.y, R + 2, srcPos.x, srcPos.y)
        pathD = `M ${exit.x} ${exit.y} L ${entry.x} ${entry.y}`
        // Shift the label off the midpoint for diagonal arrows so that crossing
        // pairs (e.g. A→D and B→C between the same two levels) don't stack their
        // labels at the same position. Downward arrows use t=0.33, upward t=0.67.
        const ydiff = dstPos.y - srcPos.y
        const tLbl = Math.abs(ydiff) < 1 ? 0.5 : ydiff > 0 ? 0.33 : 0.67
        mx = exit.x + (entry.x - exit.x) * tLbl
        my = exit.y + (entry.y - exit.y) * tLbl
        tangent = { x1: exit.x, y1: exit.y, x2: entry.x, y2: entry.y }
        points = [exit, entry]
    } else {
        // Multi-level: bow vertically away from the centreline to clear the
        // intermediate nodes. The starting bow scales with levelDiff; if the
        // curve still grazes an in-between node we grow the bow and recompute
        // until it clears (collision-aware routing), so arrows never disappear
        // behind a node they merely pass over.
        const bowDir = (srcPos.y + dstPos.y) / 2 < centerY ? -1 : 1
        const hOffset = Math.abs(dstPos.x - srcPos.x) * 0.35
        const clearance = R + 8

        let exit!: Pt, entry!: Pt, c1!: Pt, c2!: Pt
        let bowMag = 35 * levelDiff
        for (let iter = 0; iter < 14; iter++) {
            const bow = bowDir * bowMag
            c1 = { x: srcPos.x + hOffset, y: srcPos.y + bow }
            c2 = { x: dstPos.x - hOffset, y: dstPos.y + bow }
            exit  = circleEdgePoint(srcPos.x, srcPos.y, R + 2, c1.x, c1.y)
            entry = circleEdgePoint(dstPos.x, dstPos.y, R + 2, c2.x, c2.y)
            if (curveClears(exit, c1, c2, entry, obstacles, clearance)) break
            bowMag += 28
        }

        pathD = `M ${exit.x} ${exit.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${entry.x} ${entry.y}`
        // Cubic midpoint (t = 0.5) for label placement.
        mx = 0.125 * exit.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * entry.x
        my = 0.125 * exit.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * entry.y
        tangent = { x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y }
        points = [exit, c1, c2, entry]
    }

    // Perpendicular pointing "down" in screen space, so the task label always
    // sits above the arrow and the slack value below it.
    let { dx, dy } = perpUnit(tangent.x1, tangent.y1, tangent.x2, tangent.y2)
    if (dy < 0) { dx = -dx; dy = -dy }

    return {
        pathD,
        taskLabel:  `${arrow.task.id}, ${arrow.task.duration}`,
        slackLabel: `${arrow.slack}`,
        tx: mx - dx * LABEL_OFFSET, ty: my - dy * LABEL_OFFSET,
        sx: mx + dx * LABEL_OFFSET, sy: my + dy * LABEL_OFFSET,
        dummy,
        points,
    }
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
    result: CpmResult
}

interface ViewBox { x: number; y: number; w: number; h: number }

/** Convert a client (screen) coordinate to the svg's user coordinate space. */
function clientToSvg(svg: SVGSVGElement, cx: number, cy: number): { x: number; y: number } {
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const inv = ctm.inverse()
    return { x: inv.a * cx + inv.c * cy + inv.e, y: inv.b * cx + inv.d * cy + inv.f }
}

export default function CpmGraph({ result }: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const svgRef = useRef<SVGSVGElement>(null)
    const panRef = useRef<{ x: number; y: number } | null>(null)

    // Layout + arrow geometry only depend on the result; memoise them.
    const { geometries, positions, baseVB } = React.useMemo(() => {
        const positions = computeLayout(result)

        const levelMap = new Map<number, number>()
        for (const [id, pos] of positions)
            levelMap.set(id, Math.round((pos.x - (NODE_R + 60)) / LEVEL_GAP_X))

        const ys = [...positions.values()].map(p => p.y)
        const centerY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0

        const geometries = result.arrows.flatMap(arrow => {
            const srcPos = positions.get(arrow.source.id)
            const dstPos = positions.get(arrow.destination.id)
            if (!srcPos || !dstPos) return []
            const srcLevel = levelMap.get(arrow.source.id) ?? 0
            const dstLevel = levelMap.get(arrow.destination.id) ?? 0
            const isDummy = arrow.task.duration === 0 && /^Y\d+$/.test(arrow.task.id)
            // Every node except this arrow's own endpoints is an obstacle the
            // curve must steer clear of.
            const obstacles = result.nodes.flatMap(n => {
                if (n.id === arrow.source.id || n.id === arrow.destination.id) return []
                const p = positions.get(n.id)
                return p ? [p] : []
            })
            return [arrowGeometry(arrow, srcPos, dstPos, dstLevel - srcLevel, centerY, isDummy, obstacles)]
        })

        return { geometries, positions, baseVB: computeBounds(result.nodes, positions, geometries) }
    }, [result])

    const [vb, setVB] = useState<ViewBox>(baseVB)
    const [isFullscreen, setIsFullscreen] = useState(false)

    // Reset the view whenever a new graph is computed.
    useEffect(() => { setVB(baseVB) }, [baseVB])

    // Track fullscreen state so we can swap the button label / styling.
    useEffect(() => {
        const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current)
        document.addEventListener('fullscreenchange', onChange)
        return () => document.removeEventListener('fullscreenchange', onChange)
    }, [])

    // Wheel-to-zoom, anchored on the cursor. Registered natively so we can
    // preventDefault (React's onWheel is passive and would scroll the page).
    useEffect(() => {
        const svg = svgRef.current
        if (!svg) return
        function onWheel(e: WheelEvent) {
            e.preventDefault()
            const p = clientToSvg(svg!, e.clientX, e.clientY)
            setVB(prev => {
                const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85
                const scale = clamp(baseVB.w / (prev.w * factor), MIN_SCALE, MAX_SCALE)
                const w = baseVB.w / scale
                const h = baseVB.h / scale
                const fx = (p.x - prev.x) / prev.w
                const fy = (p.y - prev.y) / prev.h
                return { x: p.x - fx * w, y: p.y - fy * h, w, h }
            })
        }
        svg.addEventListener('wheel', onWheel, { passive: false })
        return () => svg.removeEventListener('wheel', onWheel)
    }, [baseVB])

    function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
        panRef.current = { x: e.clientX, y: e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
    }
    function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
        if (!panRef.current || !svgRef.current) return
        const ctm = svgRef.current.getScreenCTM()
        if (!ctm) return
        const dx = (e.clientX - panRef.current.x) / ctm.a
        const dy = (e.clientY - panRef.current.y) / ctm.d
        panRef.current = { x: e.clientX, y: e.clientY }
        setVB(prev => ({ ...prev, x: prev.x - dx, y: prev.y - dy }))
    }
    function endPan(e: React.PointerEvent<SVGSVGElement>) {
        panRef.current = null
        if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId)
    }

    function zoomBy(factor: number) {
        setVB(prev => {
            const scale = clamp(baseVB.w / (prev.w * factor), MIN_SCALE, MAX_SCALE)
            const w = baseVB.w / scale
            const h = baseVB.h / scale
            const cx = prev.x + prev.w / 2
            const cy = prev.y + prev.h / 2
            return { x: cx - w / 2, y: cy - h / 2, w, h }
        })
    }

    function toggleFullscreen() {
        if (document.fullscreenElement === containerRef.current) document.exitFullscreen()
        else containerRef.current?.requestFullscreen()
    }

    function downloadSvg() {
        const svg = svgRef.current
        if (!svg) return
        const SVG_NS = 'http://www.w3.org/2000/svg'

        // Clone and export the *full* graph (base view), independent of zoom/pan.
        const clone = svg.cloneNode(true) as SVGSVGElement
        clone.setAttribute('xmlns', SVG_NS)
        clone.setAttribute('viewBox', `${baseVB.x} ${baseVB.y} ${baseVB.w} ${baseVB.h}`)
        clone.setAttribute('width', String(Math.round(baseVB.w)))
        clone.setAttribute('height', String(Math.round(baseVB.h)))
        clone.removeAttribute('class')

        const style = document.createElementNS(SVG_NS, 'style')
        style.textContent = EXPORT_CSS
        clone.insertBefore(style, clone.firstChild)

        const bg = document.createElementNS(SVG_NS, 'rect')
        bg.setAttribute('x', String(baseVB.x))
        bg.setAttribute('y', String(baseVB.y))
        bg.setAttribute('width', String(baseVB.w))
        bg.setAttribute('height', String(baseVB.h))
        bg.setAttribute('fill', '#fff')
        clone.insertBefore(bg, style.nextSibling)

        const xml = new XMLSerializer().serializeToString(clone)
        const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n`, xml], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'cpm-graph.svg'
        a.click()
        URL.revokeObjectURL(url)
    }

    const viewBox = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`

    return (
        <div
            ref={containerRef}
            className={`graph-container${isFullscreen ? ' graph-container--fullscreen' : ''}`}
        >
            <div className="graph-toolbar-overlay">
                <button title="Zoom in" onClick={() => zoomBy(0.8)}>＋</button>
                <button title="Zoom out" onClick={() => zoomBy(1 / 0.8)}>－</button>
                <button title="Reset view" onClick={() => setVB(baseVB)}>⟳</button>
                <button title="Download SVG" onClick={downloadSvg}>⭳</button>
                <button title="Fullscreen" onClick={toggleFullscreen}>
                    {isFullscreen ? '⤡' : '⛶'}
                </button>
            </div>

            <svg
                ref={svgRef}
                viewBox={viewBox}
                width="100%"
                height="100%"
                preserveAspectRatio="xMidYMid meet"
                className="graph-svg"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPan}
                onPointerLeave={endPan}
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

                {/* Layer 1: arrow paths (drawn under the nodes) */}
                {geometries.map((g, i) => (
                    <path
                        key={i}
                        d={g.pathD}
                        className={g.dummy ? 'arrow-line arrow-line--dummy' : 'arrow-line'}
                        markerEnd="url(#arrowhead)"
                    />
                ))}

                {/* Layer 2: nodes */}
                {result.nodes.map(node => {
                    const pos = positions.get(node.id)
                    if (!pos) return null
                    return (
                        <NodeShape key={node.id} node={node} cx={pos.x} cy={pos.y} />
                    )
                })}

                {/* Layer 3: arrow labels (on top so nodes never obscure them) */}
                {geometries.map((g, i) => (
                    <g key={i}>
                        <text x={g.tx} y={g.ty} textAnchor="middle" dominantBaseline="middle" className="arrow-label-top">
                            {g.taskLabel}
                        </text>
                        <text x={g.sx} y={g.sy} textAnchor="middle" dominantBaseline="middle" className="arrow-label-bottom">
                            {g.slackLabel}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    )
}
