"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { apiClient, ApiError, type TaskResponse, type LogEvent, type AgentCard, type AgentEvent, type TaskLogs } from "@/lib/api"
import { Loader2, CheckCircle2, XCircle, Clock, ChevronRight } from "lucide-react"
import { MarkdownRenderer } from "@/components/markdown-renderer"

interface TaskDetailProps {
  taskId: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

function eventIcon(type: LogEvent["event_type"]): string {
  const icons: Record<string, string> = {
    phase: "🎯",
    plan: "📋",
    mode: "🚀",
    question: "❓",
    answer: "💬",
    breakthrough: "💡",
    complete: "✅",
    warning: "⚠️",
    learning: "📊",
    agent: "🤖",
    info: "ℹ️",
  }
  return icons[type] ?? "ℹ️"
}

function eventColor(type: LogEvent["event_type"]): string {
  const colors: Record<string, string> = {
    phase: "border-indigo-500/40 bg-indigo-500/5",
    plan: "border-blue-500/40 bg-blue-500/5",
    mode: "border-violet-500/40 bg-violet-500/5",
    question: "border-amber-500/40 bg-amber-500/5",
    answer: "border-teal-500/40 bg-teal-500/5",
    breakthrough: "border-emerald-500/60 bg-emerald-500/10",
    complete: "border-green-500/40 bg-green-500/5",
    warning: "border-orange-500/40 bg-orange-500/5",
    learning: "border-cyan-500/40 bg-cyan-500/5",
    agent: "border-pink-500/40 bg-pink-500/5",
    info: "border-zinc-400/30 bg-transparent",
  }
  return colors[type] ?? "border-zinc-400/30 bg-transparent"
}

// Agent roles are open-ended now: hierarchical mints them per task ("Security
// Architect", "Cloud Storage Engineer"), so match on keywords and fall back to
// a stable hash so every distinct role still gets its own colour.
// Order matters: the first match wins, so the most role-defining keyword has
// to come first. "Security Architect" is a security role, not a generic
// architect; "Lead API Designer" is a designer, not a generic planner.
const ROLE_KEYWORDS: [RegExp, string, string][] = [
  [/secur|red team/i,                    "from-rose-500 to-red-600",      "\u{1F6E1}"],
  [/blue team|defen/i,                   "from-blue-500 to-indigo-600",   "\u{1F6E1}"],
  [/architect|design/i,                  "from-sky-500 to-cyan-500",      "\u{1F4D0}"],
  [/plan|strateg|lead|principal/i,       "from-indigo-500 to-blue-500",   "\u{1F9E0}"],
  [/critic|oppos|review/i,               "from-orange-500 to-red-500",    "\u{1F50D}"],
  [/synthesi|mediat/i,                   "from-emerald-500 to-teal-500",  "\u{1F517}"],
  [/valid|test|qa/i,                     "from-pink-500 to-rose-500",     "✅"],
  [/research|analy/i,                    "from-amber-500 to-orange-500",  "\u{1F4CA}"],
  [/question|socrat/i,                   "from-yellow-500 to-amber-500",  "❓"],
  [/answer|author|writ/i,                "from-teal-500 to-emerald-500",  "✍"],
  [/engineer|infra|cloud|storage|data|integrat/i, "from-violet-500 to-purple-500", "⚙"],
  [/propos|advocate|negoti/i,            "from-fuchsia-500 to-pink-500",  "\u{1F4AC}"],
  [/execut|worker|async/i,               "from-lime-500 to-green-500",    "⚡"],
]

const FALLBACK_COLORS = [
  "from-zinc-500 to-zinc-600",
  "from-cyan-600 to-blue-600",
  "from-purple-600 to-indigo-600",
  "from-green-600 to-emerald-600",
]

function roleHash(role: string): number {
  let h = 0
  for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) >>> 0
  return h
}

function agentRoleColor(role: string): string {
  for (const [re, color] of ROLE_KEYWORDS) if (re.test(role)) return color
  return FALLBACK_COLORS[roleHash(role) % FALLBACK_COLORS.length]
}

function agentRoleIcon(role: string): string {
  for (const [re, , icon] of ROLE_KEYWORDS) if (re.test(role)) return icon
  return "\u{1F916}"
}

const KIND_STYLE: Record<AgentEvent["kind"], { icon: string; color: string; label: string }> = {
  decompose:  { icon: "\u{1F9E9}", color: "border-cyan-500/40 bg-cyan-500/5",       label: "Decomposition" },
  agent_step: { icon: "\u{1F916}", color: "border-emerald-500/40 bg-emerald-500/5", label: "Agent step" },
  synthesis:  { icon: "\u{1F517}", color: "border-violet-500/40 bg-violet-500/5",   label: "Synthesis" },
  score:      { icon: "\u{1F4CA}", color: "border-amber-500/40 bg-amber-500/5",     label: "Score" },
  phase:      { icon: "\u{1F3AF}", color: "border-indigo-500/40 bg-indigo-500/5",   label: "Phase" },
}

const ORIGIN_LABEL: Record<string, string> = {
  dynamic: "minted for this task",
  pool: "from shared pool",
  inline: "mode role",
}

function formatDuration(ms: number): string {
  if (!ms) return ""
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/** Group consecutive events that share a dependency batch.
 *  Events with no batch (decomposition, synthesis, scoring) become their own
 *  group, so rendered order always matches execution order. */
function groupByBatch(events: AgentEvent[]): { batch: number | null; events: AgentEvent[] }[] {
  const groups: { batch: number | null; events: AgentEvent[] }[] = []
  for (const event of events) {
    const last = groups[groups.length - 1]
    if (last && last.batch === event.batch && event.batch !== null) {
      last.events.push(event)
    } else {
      groups.push({ batch: event.batch, events: [event] })
    }
  }
  return groups
}

function shortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  } catch {
    return ""
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export function TaskDetail({ taskId }: TaskDetailProps) {
  const [task, setTask] = useState<TaskResponse | null>(null)
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [agents, setAgents] = useState<AgentCard[]>([])
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [loading, setLoading] = useState(true)
  // Which timeline events are expanded to show the full agent message.
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const timelineRef = useRef<HTMLDivElement>(null)

  // Separate expansion state for structured agent events (keyed by seq, which
  // is stable across polls) vs. raw log lines (keyed by array index).
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set())

  const toggleAgentEvent = (seq: number) =>
    setExpandedEvents((prev) => {
      const next = new Set(prev)
      if (next.has(seq)) next.delete(seq)
      else next.add(seq)
      return next
    })

  const toggleEvent = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  // ── fetch logs (only when we know the task exists) ──
  const fetchLogs = async () => {
    try {
      const data: TaskLogs = await apiClient.getTaskLogs(taskId)
      setLogs(data.logs)
      if (data.agents?.length) setAgents(data.agents)
      if (data.events?.length) setEvents(data.events)
    } catch (e) {
      // Suppress 404s — task may not have any logs yet
      if (!(e instanceof ApiError && e.status === 404)) {
        console.error("Failed to fetch logs:", e)
      }
    }
  }

  // ── fetch task (then logs once we confirm it exists) ──
  const fetchTask = async () => {
    try {
      const data = await apiClient.getTask(taskId)
      setTask(data)
      // Only fetch logs after we know the task is in the store
      await fetchLogs()
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) {
        console.error("Failed to fetch task:", e)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTask()
  }, [taskId])

  // poll task status + logs while running
  useEffect(() => {
    if (!task) return
    if (task.status !== "pending" && task.status !== "running") return

    const interval = setInterval(() => {
      fetchTask() // fetchLogs is called inside fetchTask after task is confirmed
    }, 1500)
    return () => clearInterval(interval)
  }, [taskId, task?.status])

  // auto-scroll timeline
  useEffect(() => {
    if (timelineRef.current && (task?.status === "pending" || task?.status === "running")) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight
    }
  }, [logs.length, task?.status])

  // ── loading state ──
  if (loading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="relative">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <div className="absolute inset-0 animate-ping">
              <Loader2 className="h-8 w-8 text-indigo-500/30" />
            </div>
          </div>
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading task details...</p>
        </CardContent>
      </Card>
    )
  }

  if (!task) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-red-500/20 to-orange-500/20 border-2 border-dashed border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-6 w-6 text-red-500" />
          </div>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Task not found</p>
        </CardContent>
      </Card>
    )
  }

  const isRunning = task.status === "pending" || task.status === "running"
  const progress = task.quality_score != null
    ? (task.quality_score / 10) * 100
    : isRunning ? 50
      : task.status === "completed" ? 100 : 0

  return (
    <div className="space-y-4">
      {/* ── Status card ── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="mb-2">Task Details</CardTitle>
              <CardDescription className="font-mono text-xs">{task.task_id}</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Badge variant="outline">{task.complexity}</Badge>
              {task.mode_used && <Badge variant="outline">{task.mode_used}</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-gradient-to-r from-indigo-500/10 to-emerald-500/10 border border-indigo-500/20">
            <h3 className="text-sm font-semibold mb-3 text-indigo-600 dark:text-indigo-400">Status</h3>
            <div className="flex items-center gap-3">
              {task.status === "completed" && (
                <div className="p-2 rounded-full bg-green-500/20">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
              )}
              {task.status === "failed" && (
                <div className="p-2 rounded-full bg-red-500/20">
                  <XCircle className="h-6 w-6 text-red-500" />
                </div>
              )}
              {isRunning && (
                <div className="p-2 rounded-full bg-blue-500/20">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              )}
              <span className="text-base font-bold capitalize bg-gradient-to-r from-indigo-600 to-emerald-600 bg-clip-text text-transparent">
                {task.status}
              </span>
            </div>
            {isRunning && (
              <div className="mt-4">
                <Progress value={progress} className="mt-2" />
                <p className="text-xs text-zinc-500 mt-1">Processing…</p>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Description</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{task.description}</p>
          </div>

          {task.quality_score != null && (
            <div className="p-4 rounded-lg bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
              <h3 className="text-sm font-semibold mb-3 text-emerald-600 dark:text-emerald-400">Quality Score</h3>
              <div className="flex items-center gap-3">
                <Progress value={progress} className="flex-1" />
                <span className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  {task.quality_score.toFixed(1)}/10
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {task.execution_time != null && (
              <div>
                <h3 className="text-xs font-medium mb-1 text-zinc-500">Exec Time</h3>
                <p className="text-sm font-semibold">{task.execution_time.toFixed(2)}s</p>
              </div>
            )}
            {task.agents_involved != null && (
              <div>
                <h3 className="text-xs font-medium mb-1 text-zinc-500">Agents</h3>
                <p className="text-sm font-semibold">{task.agents_involved}</p>
              </div>
            )}
            {task.iterations != null && (
              <div>
                <h3 className="text-xs font-medium mb-1 text-zinc-500">Iterations</h3>
                <p className="text-sm font-semibold">{task.iterations}</p>
              </div>
            )}
          </div>

          {task.total_tokens != null && task.total_tokens > 0 && (
            <div className="p-4 rounded-lg bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-violet-600 dark:text-violet-400">Token Usage</h3>
                <span className="text-lg font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                  {task.total_tokens.toLocaleString()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-medium mb-1 text-zinc-500">Input (prompt)</h4>
                  <p className="text-sm font-semibold">{(task.prompt_tokens ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <h4 className="text-xs font-medium mb-1 text-zinc-500">Output</h4>
                  <p className="text-sm font-semibold">{(task.output_tokens ?? 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}

          {task.error && (
            <div className="rounded-lg bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <h3 className="text-sm font-semibold text-red-900 dark:text-red-100">Error</h3>
              </div>
              <p className="text-sm text-red-800 dark:text-red-200 ml-7">{task.error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Agents card ── */}
      {agents.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">🤖 Agents Involved</CardTitle>
            <CardDescription>{agents.length} agent{agents.length !== 1 ? "s" : ""} deployed for this task</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="relative overflow-hidden rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 p-4 hover:scale-[1.02] transition-all"
                >
                  {/* gradient strip */}
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${agentRoleColor(agent.role)}`} />

                  <div className="flex items-start gap-3 mt-1">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${agentRoleColor(agent.role)} flex items-center justify-center text-lg flex-shrink-0 shadow-lg`}>
                      {agentRoleIcon(agent.role)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{agent.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{agent.role}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {agent.mode}
                        </Badge>
                        {agent.origin && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {ORIGIN_LABEL[agent.origin] ?? agent.origin}
                          </Badge>
                        )}
                        {typeof agent.batch === "number" && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            batch {agent.batch}
                          </Badge>
                        )}
                        {typeof agent.steps === "number" && agent.steps > 0 && (
                          <span className="text-[10px] text-zinc-400">
                            {agent.steps} step{agent.steps !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {agent.subtasks && agent.subtasks.length > 0 && (
                        <p className="text-[10px] text-zinc-400 mt-1 truncate">
                          {agent.subtasks.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Agent Activity (structured) ── */}
      {events.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">🧠 Agent Activity</CardTitle>
                <CardDescription>
                  {events.filter((e) => e.kind === "agent_step").length} agent step
                  {events.filter((e) => e.kind === "agent_step").length !== 1 ? "s" : ""} across{" "}
                  {events.length} event{events.length !== 1 ? "s" : ""}
                </CardDescription>
              </div>
              {isRunning && (
                <div className="flex items-center gap-1.5 text-xs text-indigo-500">
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  Live
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {groupByBatch(events).map((group, gi) => (
              <div key={gi} className={group.batch !== null ? "rounded-xl border border-emerald-500/30 bg-emerald-500/[0.03] p-3" : ""}>
                {group.batch !== null && (
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">Batch {group.batch}</Badge>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {group.events.filter((e) => e.kind === "agent_step").length > 1
                        ? `${group.events.filter((e) => e.kind === "agent_step").length} agents in parallel`
                        : "sequential step"}
                    </span>
                  </div>
                )}

                <div className="space-y-1.5">
                  {group.events.map((event) => {
                    const style = KIND_STYLE[event.kind] ?? KIND_STYLE.phase
                    const key = `ev-${event.seq}`
                    const isOpen = expandedEvents.has(event.seq)
                    const hasDetail = Boolean(event.prompt || event.response)
                    return (
                      <div
                        key={key}
                        className={`rounded-lg border px-3 py-2 text-xs transition-all animate-in fade-in duration-300 ${style.color}`}
                      >
                        <div
                          onClick={hasDetail ? () => toggleAgentEvent(event.seq) : undefined}
                          role={hasDetail ? "button" : undefined}
                          tabIndex={hasDetail ? 0 : undefined}
                          onKeyDown={
                            hasDetail
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault()
                                    toggleAgentEvent(event.seq)
                                  }
                                }
                              : undefined
                          }
                          className={`flex items-start gap-2 ${
                            hasDetail ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded" : ""
                          }`}
                        >
                          {hasDetail ? (
                            <ChevronRight
                              className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-zinc-400 transition-transform ${
                                isOpen ? "rotate-90" : ""
                              }`}
                            />
                          ) : (
                            <span className="text-sm leading-none mt-0.5 flex-shrink-0">{style.icon}</span>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                                {event.agent_name ?? event.phase}
                              </span>
                              {event.agent_role && event.agent_name && (
                                <span className="text-zinc-500 dark:text-zinc-400">{event.agent_role}</span>
                              )}
                              {event.agent_origin && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  {ORIGIN_LABEL[event.agent_origin] ?? event.agent_origin}
                                </Badge>
                              )}
                              {event.score !== null && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  {event.score.toFixed(1)}/10
                                </Badge>
                              )}
                            </div>

                            <p className="text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono text-[11px]">
                              {event.agent_name ? event.phase : style.label}
                              {event.subtask_id && ` · ${event.subtask_id}`}
                              {event.duration_ms > 0 && ` · ${formatDuration(event.duration_ms)}`}
                              {` · ${shortTime(event.timestamp)}`}
                            </p>

                            {event.depends_on.length > 0 && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                                depends on: {event.depends_on.join(", ")}
                              </p>
                            )}

                            {!isOpen && event.response && (
                              <p className="text-zinc-700 dark:text-zinc-300 mt-1 line-clamp-2 leading-snug break-words">
                                {event.response}
                              </p>
                            )}
                          </div>
                        </div>

                        {isOpen && (
                          <div className="mt-2 space-y-2 pl-5">
                            {event.prompt && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                                  Prompt
                                </p>
                                <pre className="whitespace-pre-wrap break-words rounded bg-zinc-100 dark:bg-zinc-900 p-2 text-[11px] leading-snug max-h-48 overflow-y-auto">
                                  {event.prompt}
                                </pre>
                              </div>
                            )}
                            {event.response && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                                  Response
                                </p>
                                {event.kind === "decompose" ? (
                                  // Decomposition responses are raw JSON - markdown
                                  // would mangle them, so keep monospace.
                                  <pre className="whitespace-pre-wrap break-words rounded bg-zinc-100 dark:bg-zinc-900 p-2 text-[11px] leading-snug max-h-96 overflow-y-auto">
                                    {event.response}
                                  </pre>
                                ) : (
                                  <div className="rounded bg-zinc-100 dark:bg-zinc-900 p-3 max-h-96 overflow-y-auto prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-2 prose-headings:text-sm prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-2">
                                    <MarkdownRenderer>{event.response}</MarkdownRenderer>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-zinc-400 px-1 py-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for next agent step…
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Execution Timeline ── */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">⚡ Raw Log Stream</CardTitle>
                <CardDescription>{logs.length} log lines captured</CardDescription>
              </div>
              {isRunning && (
                <div className="flex items-center gap-1.5 text-xs text-indigo-500">
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  Live
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div
              ref={timelineRef}
              className="max-h-80 overflow-y-auto px-4 pb-4 space-y-1.5 scroll-smooth"
            >
              {logs.map((event, i) => {
                const isExpandable = event.message.length > 100 || event.message.includes("\n")
                const isOpen = expanded.has(i)
                return (
                  <div
                    key={i}
                    onClick={isExpandable ? () => toggleEvent(i) : undefined}
                    role={isExpandable ? "button" : undefined}
                    tabIndex={isExpandable ? 0 : undefined}
                    onKeyDown={
                      isExpandable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              toggleEvent(i)
                            }
                          }
                        : undefined
                    }
                    className={`flex gap-3 rounded-lg border px-3 py-2 text-xs transition-all animate-in fade-in duration-300 ${eventColor(event.event_type)} ${
                      isExpandable ? "cursor-pointer hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" : ""
                    }`}
                  >
                    {isExpandable ? (
                      <ChevronRight
                        className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-zinc-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                    ) : (
                      <span className="text-base leading-none mt-0.5 flex-shrink-0">{eventIcon(event.event_type)}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-zinc-800 dark:text-zinc-200 leading-snug break-words ${
                          isOpen ? "whitespace-pre-wrap" : "line-clamp-2"
                        }`}
                      >
                        {event.message}
                      </p>
                      <p className="text-zinc-400 dark:text-zinc-500 mt-0.5 font-mono">
                        {shortTime(event.timestamp)}
                        {isExpandable && !isOpen && <span className="ml-2 text-indigo-400">· tap to expand</span>}
                      </p>
                    </div>
                  </div>
                )
              })}
              {isRunning && (
                <div className="flex items-center gap-2 text-xs text-zinc-400 px-3 py-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for next event…
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Output ── */}
      {task.output && (
        <Card className="scan-line">
          <CardHeader className="border-b border-zinc-200/50 dark:border-zinc-800/50">
            <CardTitle>Output</CardTitle>
            <CardDescription>Generated result from the system</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:bg-gradient-to-r prose-headings:from-indigo-600 prose-headings:to-emerald-600 prose-headings:bg-clip-text prose-headings:text-transparent prose-code:bg-zinc-100 dark:prose-code:bg-zinc-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm">
              <MarkdownRenderer>{task.output}</MarkdownRenderer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
