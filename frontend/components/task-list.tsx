"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiClient, type TaskResponse } from "@/lib/api"
import { Clock, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface TaskListProps {
  refreshTrigger?: number
  onTaskSelect?: (taskId: string) => void
}

export function TaskList({ refreshTrigger, onTaskSelect }: TaskListProps) {
  const [tasks, setTasks] = useState<TaskResponse[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTasks = async () => {
    try {
      setLoading(true)
      const data = await apiClient.listTasks(20, 0)
      setTasks(data)
    } catch (error) {
      console.error("Failed to fetch tasks:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [refreshTrigger])

  useEffect(() => {
    // Poll for updates on running tasks
    const interval = setInterval(() => {
      const hasRunningTasks = tasks.some(
        (t) => t.status === "pending" || t.status === "running"
      )
      if (hasRunningTasks) {
        fetchTasks()
      }
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(interval)
  }, [tasks])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        )
      case "running":
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Running
          </Badge>
        )
      case "pending":
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        )
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        )
      default:
        return <Badge>{status}</Badge>
    }
  }

  if (loading && tasks.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="relative">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <div className="absolute inset-0 animate-ping">
              <Loader2 className="h-8 w-8 text-indigo-500/30" />
            </div>
          </div>
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading tasks...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Tasks</CardTitle>
          <CardDescription>View and monitor task executions</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchTasks}
          className="glass-card hover:scale-110 transition-all"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-linear-to-r from-indigo-500/20 to-emerald-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl">⚡</span>
            </div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              No tasks yet
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Create your first task to get started!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.task_id}
                className="group rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 p-4 hover:bg-linear-to-r hover:from-indigo-50/50 hover:to-emerald-50/50 dark:hover:from-indigo-950/30 dark:hover:to-emerald-950/30 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg glow-border"
                onClick={() => onTaskSelect?.(task.task_id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusBadge(task.status)}
                      <Badge variant="outline">{task.complexity}</Badge>
                      {task.mode_used && (
                        <Badge variant="outline">{task.mode_used}</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">
                      {task.description}
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>
                        {formatDistanceToNow(new Date(task.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                      {task.quality_score != null && (
                        <span>Quality: {task.quality_score.toFixed(1)}/10</span>
                      )}
                      {task.execution_time != null && (
                        <span>Time: {task.execution_time.toFixed(1)}s</span>
                      )}
                      {task.agents_involved != null && (
                        <span>{task.agents_involved} agents</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

