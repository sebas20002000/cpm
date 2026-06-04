import React, { useMemo, useState } from 'react'
import type { Task } from '../types'
import { calculateCPM, analyzeCpm } from '../logic'
import TaskInput from './components/TaskInput'
import CpmGraph from './components/CpmGraph'

const DEFAULT_TASKS: Task[] = [
    { id: 'A', duration: 3, dependencies: [] },
    { id: 'B', duration: 5, dependencies: ['A'] },
]

export default function App() {
    const [tasks, setTasks] = useState<Task[]>(DEFAULT_TASKS)
    const [showInput, setShowInput] = useState(true)

    // Recompute the graph live whenever the tasks change. calculateCPM may throw
    // or return null for incomplete / cyclic input — fall back to an error state.
    const { result, error } = useMemo(() => {
        const valid = tasks.filter(t => t.id.trim().length > 0)
        if (valid.length === 0) return { result: null, error: null }
        try {
            const r = calculateCPM(valid)
            return r
                ? { result: r, error: null }
                : { result: null, error: 'Could not build a graph (check for cycles or missing dependencies).' }
        } catch {
            return { result: null, error: 'Could not build a graph (check for cycles or missing dependencies).' }
        }
    }, [tasks])

    const analysis = useMemo(() => (result ? analyzeCpm(result) : null), [result])

    return (
        <div className="app">
            <div className="app-header">
                <h1>CPM Calculator</h1>
                <button onClick={() => setShowInput(s => !s)}>
                    {showInput ? '◀ Hide input' : '▶ Show input'}
                </button>
            </div>

            <div className="workspace">
                {showInput && (
                    <aside className="workspace-panel">
                        <TaskInput tasks={tasks} setTasks={setTasks} />
                    </aside>
                )}

                <main className="workspace-graph">
                    {result ? (
                        <CpmGraph result={result} />
                    ) : (
                        <div className="not-implemented">
                            <p>{error ?? 'Add a task to see the critical-path graph.'}</p>
                        </div>
                    )}

                    {result && analysis && (
                        <div className="cpm-summary">
                            <div className="cpm-summary-row">
                                <span className="cpm-summary-label">Project duration:</span>{' '}
                                <span className="cpm-summary-duration">{analysis.duration}</span>
                            </div>
                            <div className="cpm-summary-row">
                                <span className="cpm-summary-label">
                                    Critical path{analysis.criticalPaths.length > 1 ? 's' : ''}:
                                </span>
                                {analysis.criticalPaths.length === 0 ? (
                                    <span> none</span>
                                ) : (
                                    <div className="cpm-paths">
                                        {analysis.criticalPaths.map((path, i) => (
                                            <div key={i} className="cpm-path">{path.join(', ')}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}
