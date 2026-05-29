import { Node, Task } from './types'

export function getTasksAtNode(node: Node): Task['dependencies'] {
    let tasks: Set<string> = new Set()

    node.input?.forEach((value) => {
        value.task.dependencies.forEach((dep) => {
            tasks.add(dep)
        })

        getTasksAtNode(value.source).forEach((dep) => {
            tasks.add(dep)
        })
    })

    return [...tasks];
}

export function expandDependencies(task: Task, nodeList: Node[]): void {
    nodeList.forEach((node) => {
        if (node.input?.every((value) => value.task === task)) {
            task.dependencies = getTasksAtNode(node)
            return
        }
    })
}

export function buildNode(id: number, task: Task, source: Node): Node {
    let newNode: Node = {
        id: id,
        earliestStartTime: -1,
        latestStartTime: -1,
        input: [],
        output: []
    }
}