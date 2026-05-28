import { Task, CpmResult, Node as CpmNode, Arrow } from './types'

export function calculateCPM(_tasks: Task[]): CpmResult | null {
    // TODO: implement full CPM algorithm
    return null
}

export function flattenGraph(origin: CpmNode): CpmResult {
    const nodes: CpmNode[] = []
    const arrows: Arrow[] = []
    const visited = new Set<number>()

    function traverse(node: CpmNode) {
        if (visited.has(node.id)) return
        visited.add(node.id)
        nodes.push(node)
        node.output?.forEach(arrow => {
            arrows.push(arrow)
            traverse(arrow.destination)
        })
    }

    traverse(origin)
    return { nodes, arrows }
}
