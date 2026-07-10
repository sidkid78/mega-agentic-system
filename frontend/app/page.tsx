"use client"

import { useState } from "react"
import { TaskForm } from "@/components/task-form"
import { TaskList } from "@/components/task-list"
import { TaskDetail } from "@/components/task-detail"
import { MetricsDashboard } from "@/components/metrics-dashboard"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"

export default function Home() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleTaskCreated = (taskId: string) => {
    setSelectedTaskId(taskId)
    setRefreshTrigger((prev) => prev + 1)
  }

  const handleTaskSelect = (taskId: string) => {
    setSelectedTaskId(taskId)
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background */}
      <div className="mega-bg fixed inset-0" />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-12 flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight gradient-text mb-2">
              MEGA AGENTIC SYSTEM
            </h1>
            <div className="flex items-center gap-3">
              <div className="hidden sm:block h-1 w-12 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full" />
              <p className="text-base sm:text-lg md:text-xl text-zinc-700 dark:text-zinc-300 font-medium">
                Ultimate Multi-Pattern AI Orchestration Platform
              </p>
              <div className="hidden sm:block h-1 w-12 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full" />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <div className="px-3 py-1 rounded-full bg-indigo-500/20 dark:bg-indigo-500/30 border border-indigo-500/50">
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  ⚡ ACTIVE
                </span>
              </div>
              <div className="px-3 py-1 rounded-full bg-emerald-500/20 dark:bg-emerald-500/30 border border-emerald-500/50">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  🚀 POWERED BY GEMINI
                </span>
              </div>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="glass-card p-1.5 gap-1 flex-wrap">
            <TabsTrigger value="dashboard">
              📊 Dashboard
            </TabsTrigger>
            <TabsTrigger value="tasks">
              ⚡ Tasks
            </TabsTrigger>
            <TabsTrigger value="metrics">
              📈 Metrics
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap gap-3">
            <a
              href="/images"
              className="px-4 py-2 rounded-lg glass-card border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:scale-105 transition-all text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              🎨 Image Generation
            </a>
            <a
              href="/videos"
              className="px-4 py-2 rounded-lg glass-card border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:scale-105 transition-all text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              🎬 Video Generation
            </a>
            <a
              href="/music"
              className="px-4 py-2 rounded-lg glass-card border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:scale-105 transition-all text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              🎵 Music Generation
            </a>
            <a
              href="/speech"
              className="px-4 py-2 rounded-lg glass-card border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:scale-105 transition-all text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              🔊 Speech Generation
            </a>
            <a
              href="/documents"
              className="px-4 py-2 rounded-lg glass-card border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:scale-105 transition-all text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              📄 Document Generation
            </a>
            <a
              href="/code"
              className="px-4 py-2 rounded-lg glass-card border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:scale-105 transition-all text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              💻 Code Generation
            </a>
            <a
              href="/research"
              className="px-4 py-2 rounded-lg glass-card border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:scale-105 transition-all text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              🔬 Research Platform
            </a>
            <a
              href="/workflows"
              className="px-4 py-2 rounded-lg glass-card border border-indigo-500/50 dark:border-indigo-500/50 bg-indigo-500/10 hover:scale-105 transition-all text-sm font-bold text-indigo-600 dark:text-indigo-400"
            >
              🚀 Workflow Patterns
            </a>
            <a
              href="/search"
              className="px-4 py-2 rounded-lg glass-card border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:scale-105 transition-all text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              🔎 Search Tools
            </a>
            <a
              href="/rag"
              className="px-4 py-2 rounded-lg glass-card border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:scale-105 transition-all text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              📚 RAG KB
            </a>
            <a
              href="/csv"
              className="px-4 py-2 rounded-lg glass-card border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:scale-105 transition-all text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              📊 CSV Completion
            </a>
            <a
              href="/orchestrators"
              className="px-4 py-2 rounded-lg glass-card border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:scale-105 transition-all text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              🤖 Orchestrators
            </a>
          </div>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-6">
                <TaskForm onTaskCreated={handleTaskCreated} />
                <TaskList
                  refreshTrigger={refreshTrigger}
                  onTaskSelect={handleTaskSelect}
                />
              </div>
              <div>
                {selectedTaskId ? (
                  <TaskDetail taskId={selectedTaskId} />
                ) : (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500/20 to-emerald-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center mb-4">
                        <span className="text-2xl">📋</span>
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">
                          Select a task to view details
                        </p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          Or create a new task to get started
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <TaskForm onTaskCreated={handleTaskCreated} />
              <TaskList
                refreshTrigger={refreshTrigger}
                onTaskSelect={handleTaskSelect}
              />
            </div>
            {selectedTaskId && (
              <TaskDetail taskId={selectedTaskId} />
            )}
          </TabsContent>

          <TabsContent value="metrics">
            <MetricsDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
