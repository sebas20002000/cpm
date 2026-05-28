import React from 'react'
import type { Task } from '../../types'

interface Props {
    tasks: Task[]
    setTasks: (tasks: Task[]) => void
    onCalculate: () => void
}

export default function TaskInput({ tasks, setTasks, onCalculate }: Props) {
    function updateTask(index: number, patch: Partial<Task>) {
        setTasks(tasks.map((t, i) => i === index ? { ...t, ...patch } : t))
    }

    function addTask() {
        setTasks([...tasks, { id: '', duration: 0, dependencies: [] }])
    }

    function removeTask(index: number) {
        setTasks(tasks.filter((_, i) => i !== index))
    }

    function parseDeps(raw: string): string[] {
        return raw.split(',').map(s => s.trim()).filter(s => s.length > 0)
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
                                    onChange={e => updateTask(i, { duration: Number(e.target.value) })}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={task.dependencies.join(', ')}
                                    placeholder="e.g. A, B"
                                    onChange={e => updateTask(i, { dependencies: parseDeps(e.target.value) })}
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
                <button className="btn-primary" onClick={onCalculate}>Calculate</button>
            </div>
        </div>
    )
}
