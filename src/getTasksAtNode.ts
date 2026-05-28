import { Node, Task } from './types'

export default function getTasksAtNode(node: Node): Task[] {
    let tasks: Task[] = []

    node.input?.forEach((value) => {
        tasks.push(value.task);
        tasks = tasks.concat(getTasksAtNode(value.source));
    })

    return tasks;
}