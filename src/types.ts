export interface Node {
    id: number,
    earliestStartTime: number,
    latestStartTime: number,
    input: Arrow[] | null,
    output: Arrow[] | null
}

export interface Task {
    id: string,
    duration: number,
    dependencies: Task[]
}

export interface Arrow {
    task: Task,
    totalMargin: number,
    source: Node,
    destination: Node
}