import React, { useState } from 'react'
import type { Task, CpmResult } from '../types'
import { calculateCPM } from '../logic'
import TaskInput from './components/TaskInput'
import CpmGraph, { MOCK_RESULT } from './components/CpmGraph'

type View = 'input' | 'graph'

const DEFAULT_TASKS: Task[] = [
    { id: 'A', duration: 3, dependencies: [] },
    { id: 'B', duration: 5, dependencies: ['A'] },
]

export default function App() {
    const [view, setView]     = useState<View>('input')
    const [tasks, setTasks]   = useState<Task[]>(DEFAULT_TASKS)
    const [result, setResult] = useState<CpmResult | null>(null)

    function handleCalculate() {
        setResult(calculateCPM(tasks))
        setView('graph')
    }

    function handleBack() {
        setView('input')
        setResult(null)
    }

    function handleLoadExample() {
        setResult(MOCK_RESULT)
    }

    return (
        <div className="app">
            <h1>CPM Calculator</h1>

            {view === 'input' && (
                <TaskInput
                    tasks={tasks}
                    setTasks={setTasks}
                    onCalculate={handleCalculate}
                />
            )}

            {view === 'graph' && (
                <div className="graph-view">
                    <div className="graph-toolbar">
                        <button onClick={handleBack}>← Back</button>
                        <h2>Critical Path Graph</h2>
                    </div>

                    {result === null ? (
                        <div className="not-implemented">
                            <p>Logic not yet implemented.</p>
                            <button className="btn-primary" onClick={handleLoadExample}>
                                Load example
                            </button>
                        </div>
                    ) : (
                        <CpmGraph result={result} />
                    )}
                </div>
            )}
        </div>
    )
}
