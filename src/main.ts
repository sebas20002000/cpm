import { Task, Arrow, Node } from "./types";
import getTasksAtNode from './getTasksAtNode'

function main(): void {
    let tasks: Task[] = [
        {
            id: "A",
            duration: 4,
            dependencies: []
        },
        {
            id: "B",
            duration: 6,
            dependencies: ["A"]
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