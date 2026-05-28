import { Task, Arrow, Node } from "./types";
import getTasksAtNode from './getTasksAtNode'

function main(): void {
    const a: Task = {
        id: "A",
        duration: 4,
        dependencies: []
    }

    let tasks: Task[] = [
        a,
        {
            id: "B",
            duration: 6,
            dependencies: [a]
        }
    ]

    let latestNodeNumber = 1

    // nodo inicial
    let origin: Node = {
        id: latestNodeNumber,
        earliestStartTime: -1,
        latestStartTime: -1,
        input: null,
        output: []
    }
}