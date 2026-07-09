"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiClient, type TaskCreate } from "@/lib/api"
import { Loader2, Send } from "lucide-react"

interface TaskFormProps {
  onTaskCreated: (taskId: string) => void
}

export function TaskForm({ onTaskCreated }: TaskFormProps) {
  const [loading, setLoading] = useState(false)
  const [modes, setModes] = useState<Array<{ value: string; description: string; use_cases: string[] }>>([])
  const [formData, setFormData] = useState<TaskCreate>({
    description: "",
    complexity: "moderate",
    quality_threshold: 8.0,
    max_iterations: 3,
  })

  useEffect(() => {
    // Load available modes
    apiClient.getModes().then(({ modes }) => {
      setModes(modes)
    }).catch(console.error)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const task = await apiClient.createTask(formData)
      onTaskCreated(task.task_id)
      // Reset form
      setFormData({
        description: "",
        complexity: "moderate",
        quality_threshold: 8.0,
        max_iterations: 3,
        preferred_mode: undefined,
      })
    } catch (error) {
      console.error("Failed to create task:", error)
      alert("Failed to create task. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Task</CardTitle>
        <CardDescription>
          Submit a task to the Mega Agentic System for intelligent execution
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Task Description
            </label>
            <Textarea
              id="description"
              placeholder="Describe what you want the system to accomplish..."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              required
              rows={6}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="complexity" className="text-sm font-medium">
                Complexity
              </label>
              <Select
                value={formData.complexity}
                onValueChange={(value: "simple" | "moderate" | "complex" | "critical") =>
                  setFormData({ ...formData, complexity: value })
                }
              >
                <SelectTrigger id="complexity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="complex">Complex</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="mode" className="text-sm font-medium">
                Preferred Mode (Optional)
              </label>
              <Select
                value={formData.preferred_mode || "auto"}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    preferred_mode: value === "auto" ? undefined : value
                  })
                }
              >
                <SelectTrigger id="mode">
                  <SelectValue placeholder="Auto-select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-select</SelectItem>
                  {modes.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.preferred_mode && (() => {
                const m = modes.find((x) => x.value === formData.preferred_mode)
                if (!m) return null
                return (
                  <div className="rounded-md border border-indigo-500/30 bg-indigo-500/5 p-2 space-y-1">
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">{m.description}</p>
                    {m.use_cases?.length > 0 && (
                      <p className="text-xs text-zinc-500">
                        <span className="font-medium">Use cases: </span>{m.use_cases.join(" · ")}
                      </p>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="threshold" className="text-sm font-medium">
                Quality Threshold (0-10)
              </label>
              <Input
                id="threshold"
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={formData.quality_threshold}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    quality_threshold: parseFloat(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="iterations" className="text-sm font-medium">
                Max Iterations
              </label>
              <Input
                id="iterations"
                type="number"
                min="1"
                max="10"
                value={formData.max_iterations}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    max_iterations: parseInt(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={loading || !formData.description.trim()}
            className="w-full pulse-glow"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Launch Task
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

