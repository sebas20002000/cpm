import { Task, CpmResult, Node as CpmNode, Arrow } from './types'

type MNode = { id: number; est: number; lst: number; input: MArrow[]; output: MArrow[] }
type MArrow = { task: Task; slack: number; source: MNode; destination: MNode }

let _nid = 0
let _did = 0

function mkNode(): MNode {
    return { id: _nid++, est: 0, lst: Infinity, input: [], output: [] }
}

function link(task: Task, src: MNode, dst: MNode): MArrow {
    const a: MArrow = { task, slack: 0, source: src, destination: dst }
    src.output.push(a)
    dst.input.push(a)
    return a
}

function mkDummy(src: MNode, dst: MNode): MArrow {
    return link({ id: `Y${++_did}`, duration: 0, dependencies: [] }, src, dst)
}

function isDummy(a: MArrow): boolean {
    return a.task.duration === 0 && /^Y\d+$/.test(a.task.id)
}

// ── dependency helpers ──────────────────────────────────────────────────────

function allDeps(id: string, map: Map<string, Task>, cache: Map<string, Set<string>>): Set<string> {
    if (cache.has(id)) return cache.get(id)!
    const t = map.get(id)
    if (!t) { cache.set(id, new Set()); return new Set() }
    const s = new Set<string>()
    for (const d of t.dependencies) {
        s.add(d)
        allDeps(d, map, cache).forEach(x => s.add(x))
    }
    cache.set(id, s)
    return s
}

// Strips transitively redundant deps: keeps only deps that are not covered by
// another dep's transitive closure (e.g. if C→[A,B] and B→A, keeps only [B]).
function immediatePredsMap(tasks: Task[]): Map<string, string[]> {
    const map = new Map(tasks.map(t => [t.id, t]))
    const cache = new Map<string, Set<string>>()
    tasks.forEach(t => allDeps(t.id, map, cache))

    return new Map(tasks.map(t => [
        t.id,
        t.dependencies.filter(dep =>
            !t.dependencies.some(other => other !== dep && cache.get(other)!.has(dep))
        )
    ]))
}

function kahnTasks(tasks: Task[], preds: Map<string, string[]>): Task[] | null {
    const deg = new Map(tasks.map(t => [t.id, preds.get(t.id)!.length]))
    const taskMap = new Map(tasks.map(t => [t.id, t]))
    const q = tasks.filter(t => deg.get(t.id) === 0).map(t => t.id)
    const out: Task[] = []

    while (q.length) {
        const id = q.shift()!
        out.push(taskMap.get(id)!)
        for (const t of tasks) {
            if (preds.get(t.id)!.includes(id)) {
                const d = deg.get(t.id)! - 1
                deg.set(t.id, d)
                if (d === 0) q.push(t.id)
            }
        }
    }

    return out.length === tasks.length ? out : null
}

function kahnNodes(nodes: MNode[]): MNode[] {
    const deg = new Map(nodes.map(n => [n.id, n.input.length]))
    const q = nodes.filter(n => n.input.length === 0)
    const out: MNode[] = []

    while (q.length) {
        const n = q.shift()!
        out.push(n)
        for (const a of n.output) {
            const d = deg.get(a.destination.id)! - 1
            deg.set(a.destination.id, d)
            if (d === 0) q.push(a.destination)
        }
    }

    return out
}

// ── rule 2 optimization ─────────────────────────────────────────────────────
// A node whose only output is a dummy can be eliminated: redirect all its
// incoming arrows directly to the dummy's target, unless doing so would create
// two arrows between the same pair of nodes (rule 1 violation).

function applyRule2(nodes: MNode[], arrows: MArrow[], start: MNode, end: MNode): void {
    let changed = true
    while (changed) {
        changed = false
        for (const node of [...nodes]) {
            if (node === start || node === end) continue
            if (node.output.length !== 1 || !isDummy(node.output[0])) continue

            const dummyArrow = node.output[0]
            const target = dummyArrow.destination

            const canReroute = node.input.every(inp =>
                !inp.source.output.some(a => a !== inp && a.destination === target)
            )
            if (!canReroute) continue

            for (const inp of [...node.input]) {
                inp.destination = target
                target.input.push(inp)
            }
            target.input = target.input.filter(a => a !== dummyArrow)
            arrows.splice(arrows.indexOf(dummyArrow), 1)
            node.input = []
            node.output = []
            nodes.splice(nodes.indexOf(node), 1)
            changed = true
        }
    }
}

// ── main export ─────────────────────────────────────────────────────────────

export function calculateCPM(tasks: Task[]): CpmResult | null {
    if (!tasks.length) return null

    _nid = 0
    _did = 0

    const preds = immediatePredsMap(tasks)
    const sorted = kahnTasks(tasks, preds)
    if (!sorted) return null // cycle detected

    const nodes: MNode[] = []
    const arrows: MArrow[] = []

    const start = mkNode()
    nodes.push(start)

    const headOf = new Map<string, MNode>() // taskId → node where task's arrow ends
    const joinFor = new Map<string, MNode>() // predecessor-set key → join node
    const joinSets: { set: Set<string>; node: MNode }[] = [] // join nodes + their pred-sets

    for (const task of sorted) {
        const ps = preds.get(task.id)!
        let tail: MNode

        if (ps.length === 0) {
            tail = start
        } else if (ps.length === 1) {
            tail = headOf.get(ps[0])!
        } else {
            // Multiple predecessors: find or create a join node and wire dummies to it.
            const key = [...ps].sort().join('\0')
            if (!joinFor.has(key)) {
                const jn = mkNode()
                nodes.push(jn)
                joinFor.set(key, jn)

                // Chain onto existing join nodes whose predecessor-set is a subset
                // of this one, instead of re-fanning a dummy from every predecessor.
                // e.g. {E,C} ⊂ {D,E,C}: run one dummy from the {E,C} join into the
                // {D,E,C} join rather than wiring E and C in a second time. Subsets
                // are taken greedily largest-first and kept disjoint.
                const uncovered = new Set(ps)
                const subsets = joinSets
                    .filter(j => j.set.size < ps.length && [...j.set].every(x => uncovered.has(x)))
                    .sort((a, b) => b.set.size - a.set.size)
                for (const cand of subsets) {
                    if (![...cand.set].every(x => uncovered.has(x))) continue // overlapped by an earlier pick
                    if (!cand.node.output.some(a => a.destination === jn))
                        arrows.push(mkDummy(cand.node, jn))
                    cand.set.forEach(x => uncovered.delete(x))
                }
                for (const p of uncovered) {
                    const ph = headOf.get(p)!
                    if (!ph.output.some(a => a.destination === jn))
                        arrows.push(mkDummy(ph, jn))
                }

                joinSets.push({ set: new Set(ps), node: jn })
            }
            tail = joinFor.get(key)!
        }

        const head = mkNode()
        nodes.push(head)
        arrows.push(link(task, tail, head))
        headOf.set(task.id, head)
    }

    // Single end node: every sink (no outputs) feeds into it via a dummy.
    const end = mkNode()
    nodes.push(end)
    for (const n of [...nodes]) {
        if (n !== end && n.output.length === 0)
            arrows.push(mkDummy(n, end))
    }

    applyRule2(nodes, arrows, start, end)

    // Rule-2 elimination removes some dummies, leaving gaps in their numbering
    // (Y1, Y4, Y5…). Renumber the survivors sequentially so they read Y1, Y2, Y3…
    let dummyCount = 0
    for (const a of arrows)
        if (isDummy(a)) a.task = { ...a.task, id: `Y${++dummyCount}` }

    // ── timing ─────────────────────────────────────────────────────────────────

    const order = kahnNodes(nodes)

    // Node creation + rule-2 elimination leave gaps in the ids (0, 1, 2, 5…).
    // Renumber in topological order starting at 1 (i < j for every arrow i→j).
    order.forEach((n, i) => { n.id = i + 1 })

    // Forward pass: EST
    start.est = 0
    for (const n of order)
        for (const a of n.output)
            a.destination.est = Math.max(a.destination.est, n.est + a.task.duration)

    // Backward pass: LST
    end.lst = end.est
    for (const n of [...order].reverse())
        for (const a of n.output)
            // a.source === n
            n.lst = Math.min(n.lst, a.destination.lst - a.task.duration)

    // Slack per arrow: dest.LST − duration − src.EST
    for (const a of arrows)
        a.slack = a.destination.lst - a.task.duration - a.source.est

    // ── convert to public types ─────────────────────────────────────────────────

    const nodeMap = new Map<number, CpmNode>()
    for (const n of nodes)
        nodeMap.set(n.id, {
            id: n.id,
            earliestStartTime: n.est,
            latestStartTime: n.lst === Infinity ? n.est : n.lst,
            input: [],
            output: []
        })

    const result: CpmResult = { nodes: Array.from(nodeMap.values()), arrows: [] }

    for (const a of arrows) {
        const arrow: Arrow = {
            task: a.task,
            slack: a.slack,
            source: nodeMap.get(a.source.id)!,
            destination: nodeMap.get(a.destination.id)!
        }
        nodeMap.get(a.source.id)!.output!.push(arrow)
        nodeMap.get(a.destination.id)!.input!.push(arrow)
        result.arrows.push(arrow)
    }

    return result
}

// ── analysis ─────────────────────────────────────────────────────────────────

export interface CpmAnalysis {
    /** total project duration = earliest finish of the end node */
    duration: number
    /** every critical route, each as an ordered list of real (non-dummy) task ids */
    criticalPaths: string[][]
}

function isDummyArrow(a: Arrow): boolean {
    return a.task.duration === 0 && /^Y\d+$/.test(a.task.id)
}

/** Project duration and the critical path(s) — routes start→end using only
 *  zero-slack arrows. */
export function analyzeCpm(result: CpmResult): CpmAnalysis {
    const hasIn = new Set<number>()
    const hasOut = new Set<number>()
    for (const a of result.arrows) { hasIn.add(a.destination.id); hasOut.add(a.source.id) }

    const startNodes = result.nodes.filter(n => !hasIn.has(n.id))
    const endNodes = result.nodes.filter(n => !hasOut.has(n.id))
    const duration = endNodes.reduce((m, n) => Math.max(m, n.earliestStartTime), 0)
    const endIds = new Set(endNodes.map(n => n.id))

    // Adjacency over critical (zero-slack) arrows only.
    const critOut = new Map<number, Arrow[]>()
    for (const a of result.arrows)
        if (a.slack === 0) (critOut.get(a.source.id) ?? critOut.set(a.source.id, []).get(a.source.id)!).push(a)

    const paths: string[][] = []
    const seen = new Set<string>()

    function dfs(nodeId: number, acc: string[]) {
        if (endIds.has(nodeId)) {
            const key = acc.join('\0')
            if (acc.length && !seen.has(key)) { seen.add(key); paths.push(acc) }
            return
        }
        for (const a of critOut.get(nodeId) ?? [])
            dfs(a.destination.id, [...acc, a.task.id])
    }
    for (const s of startNodes) dfs(s.id, [])

    return { duration, criticalPaths: paths }
}