"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiClient, type SystemMetrics } from "@/lib/api"
import { TrendingUp, Clock, Target, Zap, RefreshCw, Coins } from "lucide-react"

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k"
  return String(n)
}

export function MetricsDashboard() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const data = await apiClient.getMetrics()
      setMetrics(data)
    } catch (error) {
      console.error("Failed to fetch metrics:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleResetUsage = async () => {
    try {
      await apiClient.resetUsage()
      await fetchMetrics()
    } catch (error) {
      console.error("Failed to reset usage:", error)
    }
  }

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
  }, [])

  if (loading || !metrics) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="relative">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500/20 border-t-indigo-500"></div>
            <div className="absolute inset-0 animate-ping rounded-full h-8 w-8 border border-indigo-500/30"></div>
          </div>
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading metrics...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>System Performance</CardTitle>
            <CardDescription>Overall system metrics and statistics</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchMetrics}
            className="glass-card hover:scale-110 transition-all"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1 p-4 rounded-lg bg-linear-to-br from-indigo-500/10 to-emerald-500/10 border border-indigo-500/20">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Zap className="h-4 w-4 text-indigo-500" />
                Total Executions
              </div>
              <div className="text-3xl font-bold bg-linear-to-r from-indigo-600 to-emerald-600 bg-clip-text text-transparent">
                {metrics.total_executions}
              </div>
            </div>
            <div className="space-y-1 p-4 rounded-lg bg-linear-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Target className="h-4 w-4 text-emerald-500" />
                Avg Quality
              </div>
              <div className="text-3xl font-bold bg-linear-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                {metrics.avg_quality.toFixed(1)}/10
              </div>
            </div>
            <div className="space-y-1 p-4 rounded-lg bg-linear-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Clock className="h-4 w-4 text-blue-500" />
                Avg Time
              </div>
              <div className="text-3xl font-bold bg-linear-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                {metrics.avg_execution_time.toFixed(1)}s
              </div>
            </div>
            <div className="space-y-1 p-4 rounded-lg bg-linear-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <TrendingUp className="h-4 w-4 text-green-500" />
                Success Rate
              </div>
              <div className="text-3xl font-bold bg-linear-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                {(metrics.success_rate * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {metrics.token_usage && metrics.token_usage.total.total_tokens > 0 && (() => {
        const usage = metrics.token_usage
        const labelEntries = Object.entries(usage.by_label)
          .sort((a, b) => b[1].total_tokens - a[1].total_tokens)
        const maxLabel = labelEntries.length ? labelEntries[0][1].total_tokens : 0
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Token Usage</CardTitle>
                <CardDescription>Cumulative Gemini tokens since server start</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetUsage}
                className="glass-card hover:scale-105 transition-all text-xs"
              >
                Reset
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1 p-4 rounded-lg bg-linear-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <Coins className="h-4 w-4 text-violet-500" />
                    Total Tokens
                  </div>
                  <div
                    className="text-3xl font-bold bg-linear-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent"
                    title={usage.total.total_tokens.toLocaleString()}
                  >
                    {fmtCompact(usage.total.total_tokens)}
                  </div>
                </div>
                <div className="space-y-1 p-4 rounded-lg bg-linear-to-br from-indigo-500/10 to-blue-500/10 border border-indigo-500/20">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">Input</div>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400" title={usage.total.prompt_tokens.toLocaleString()}>
                    {fmtCompact(usage.total.prompt_tokens)}
                  </div>
                </div>
                <div className="space-y-1 p-4 rounded-lg bg-linear-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">Output</div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400" title={usage.total.output_tokens.toLocaleString()}>
                    {fmtCompact(usage.total.output_tokens)}
                  </div>
                </div>
                <div className="space-y-1 p-4 rounded-lg bg-linear-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">API Calls</div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {usage.total.calls.toLocaleString()}
                  </div>
                </div>
              </div>

              {labelEntries.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">By feature</h4>
                  {labelEntries.map(([label, b]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 truncate text-xs font-mono text-zinc-600 dark:text-zinc-400" title={label}>
                        {label}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500"
                          style={{ width: `${maxLabel ? (b.total_tokens / maxLabel) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums" title={b.total_tokens.toLocaleString()}>
                        {fmtCompact(b.total_tokens)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {Object.keys(metrics.mode_performance).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Mode Performance</CardTitle>
            <CardDescription>Performance metrics by execution mode</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(metrics.mode_performance).map(([mode, perf], index) => {
                const colors = [
                  "from-indigo-500/20 to-emerald-500/20 border-indigo-500/30",
                  "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
                  "from-blue-500/20 to-cyan-500/20 border-blue-500/30",
                  "from-green-500/20 to-emerald-500/20 border-green-500/30",
                ]
                const colorClass = colors[index % colors.length]
                return (
                  <div
                    key={mode}
                    className={`flex items-center justify-between p-4 rounded-lg bg-linear-to-r ${colorClass} border hover:scale-[1.02] transition-all cursor-pointer glow-border`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline" className="font-bold">{mode}</Badge>
                        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                          {perf.executions} executions
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-medium">
                        <span className="text-indigo-600 dark:text-indigo-400">Quality: {perf.avg_quality.toFixed(1)}/10</span>
                        <span className="text-emerald-600 dark:text-emerald-400">Time: {perf.avg_time.toFixed(1)}s</span>
                        <span className="text-green-600 dark:text-green-400">Success: {(perf.success_rate * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {metrics.recent_executions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Executions</CardTitle>
            <CardDescription>Latest task execution results</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.recent_executions.map((exec, index) => {
                const colors = [
                  "from-indigo-500/10 to-emerald-500/10 border-indigo-500/20",
                  "from-emerald-500/10 to-teal-500/10 border-emerald-500/20",
                  "from-blue-500/10 to-cyan-500/10 border-blue-500/20",
                ]
                const colorClass = colors[index % colors.length]
                return (
                  <div
                    key={exec.task_id}
                    className={`flex items-center justify-between p-3 rounded-lg bg-linear-to-r ${colorClass} border text-sm hover:scale-[1.02] transition-all`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-semibold">{exec.mode}</Badge>
                      <span className="text-zinc-600 dark:text-zinc-400 truncate font-mono text-xs">{exec.task_id}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-medium">
                      <span className="text-indigo-600 dark:text-indigo-400">Q: {exec.quality.toFixed(1)}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{exec.time.toFixed(1)}s</span>
                      <span className="text-blue-600 dark:text-blue-400">{exec.agents} agents</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

