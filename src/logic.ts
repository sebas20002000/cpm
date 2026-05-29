import { Task, CpmResult, Node as CpmNode, Arrow } from './types'
import { getTasksAtNode, expandDependencies } from './utils'

export function calculateCPM(tasks: Task[]): CpmResult | null {
    // TODO: implement full CPM algorithm

    let currentID: number = 1

    const originNode: CpmNode = {
        id: currentID,
        earliestStartTime: -1,
        latestStartTime: -1,
        input: null,
        output: []
    }

    const nodes: CpmNode[] = [originNode]
    const arrows: Arrow[] = []

    nodes.forEach((node) => {
        const dep = getTasksAtNode(node)

        tasks.forEach((task) => {
            expandDependencies(task, nodes);

            if (task.dependencies === dep) {
                let newNode: CpmNode = {
                    id: currentID++,
                    earliestStartTime: -1,
                    latestStartTime: -1,
                    input: [],
                    output: []
                }
            }
        })
    })

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
