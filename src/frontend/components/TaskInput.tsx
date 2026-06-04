import React, { useState } from 'react'
import type { Task } from '../../types'

interface Props {
    tasks: Task[]
    setTasks: (tasks: Task[]) => void
}

// Suggests the next single-letter id: starts just after the last task's letter
// (A → B) and skips any already in use. Returns '' once A–Z is exhausted.
function nextTaskId(tasks: Task[]): string {
    const used = new Set(tasks.map(t => t.id.trim().toUpperCase()).filter(Boolean))
    const last = (tasks[tasks.length - 1]?.id ?? '').trim().toUpperCase()
    const start = /^[A-Z]$/.test(last) ? last.charCodeAt(0) + 1 : 'A'.charCodeAt(0)
    for (let code = start; code <= 'Z'.charCodeAt(0); code++) {
        const letter = String.fromCharCode(code)
        if (!used.has(letter)) return letter
    }
    return ''
}

export default function TaskInput({ tasks, setTasks }: Props) {
    // Raw dep strings let users type commas freely; parsing into the task happens
    // on every keystroke so the graph updates live.
    const [rawDeps, setRawDeps] = useState<string[]>(() =>
        tasks.map(t => t.dependencies.join(', '))
    )

    function parseDeps(raw: string): string[] {
        return raw.split(',').map(s => s.trim()).filter(s => s.length > 0)
    }

    function updateTask(index: number, patch: Partial<Task>) {
        setTasks(tasks.map((t, i) => i === index ? { ...t, ...patch } : t))
    }

    function updateRawDep(index: number, value: string) {
        setRawDeps(rawDeps.map((r, i) => i === index ? value : r))
        updateTask(index, { dependencies: parseDeps(value) })
    }

    function addTask() {
        setTasks([...tasks, { id: nextTaskId(tasks), duration: 0, dependencies: [] }])
        setRawDeps([...rawDeps, ''])
    }

    function removeTask(index: number) {
        setTasks(tasks.filter((_, i) => i !== index))
        setRawDeps(rawDeps.filter((_, i) => i !== index))
    }

    return (
        <div className="task-input">
            <table className="task-table">
                <thead>
                    <tr>
                        <th style={{ width: '12%' }}>ID</th>
                        <th style={{ width: '14%' }}>Duration</th>
                        <th>Dependencies (comma-separated)</th>
                        <th className="remove-col" />
                    </tr>
                </thead>
                <tbody>
                    {tasks.map((task, i) => (
                        <tr key={i}>
                            <td>
                                <input
                                    type="text"
                                    value={task.id}
                                    placeholder="e.g. A"
                                    onChange={e => updateTask(i, { id: e.target.value })}
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    value={task.duration}
                                    min={0}
                                    onFocus={e => e.target.select()}
                                    onChange={e => updateTask(i, { duration: Number(e.target.value) })}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={rawDeps[i] ?? task.dependencies.join(', ')}
                                    placeholder="e.g. A, B"
                                    onChange={e => updateRawDep(i, e.target.value)}
                                />
                            </td>
                            <td className="remove-col">
                                <button
                                    className="btn-remove"
                                    title="Remove row"
                                    disabled={tasks.length === 1}
                                    onClick={() => removeTask(i)}
                                >
                                    ✕
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="task-input-actions">
                <button onClick={addTask}>+ Add task</button>
            </div>
        </div>
    )
}
