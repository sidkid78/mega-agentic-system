"use client"

import { useEffect, useRef, useState } from "react"
import { apiClient, ApiError, type AgentEvent, type TaskResponse } from "@/lib/api"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Loader2, Play, Square, ChevronRight, AlertTriangle } from "lucide-react"
import type { WorkflowType } from "@/components/workflow-visualizer"

/** Every card on the Workflows page maps to a backend AgentMode.
 *  The names line up except for `orchestrator`, which the backend calls
 *  `hierarchical`. Keep this exhaustive so a new card cannot silently
 *  render a Deploy button that posts an unknown mode. */
export const WORKFLOW_TO_MODE: Record<WorkflowType, string | null> = {
  // orch5 describes a MultiTeamOrchestrator that does not exist in the
  // backend. Deliberately null rather than aliased to hierarchical: pointing
  // it at a different pattern would run something the diagram above does not
  // describe, which is worse than saying it is not built yet.
  orch5: null,
  chain: "chain",
  routing: "routing",
  parallel: "parallel",
  orchestrator: "hierarchical",
  evaluator: "evaluator",
  swarm: "swarm",
  debate: "debate",
  negotiate: "negotiate",
  red_blue: "red_blue",
  socratic: "socratic",
  meta_learning: "meta_learning",
  reflective: "reflective",
  background: "background",
}

/** A starting prompt per pattern, chosen to show off what the pattern does.
 *  Editable before running — it is a starting point, not a fixed demo. */
const SUGGESTED_TASK: Record<WorkflowType, string> = {
  orch5: "",
  chain: "Write onboarding docs for a new engineer joining a FastAPI project.",
  routing: "My Postgres query got slow after I added a few million rows. What now?",
  parallel: "Assess moving a monolith to microservices: cost, risk, timeline, staffing.",
  orchestrator: "Design a rate-limited public REST API for a photo sharing service.",
  evaluator: "Write a function that parses ISO-8601 durations, with edge cases handled.",
  swarm: "How should a small team pick between Postgres, MongoDB and DynamoDB?",
  debate: "Should a startup write end-to-end tests before product-market fit?",
  negotiate: "Choose a CI provider balancing cost, speed, reliability and lock-in.",
  red_blue: "Review this auth design: JWTs in localStorage, 30-day expiry, no refresh.",
  socratic: "Why do distributed systems need consensus algorithms?",
  meta_learning: "Summarise the trade-offs of event sourcing.",
  reflective: "Explain database sharding to a junior engineer.",
  background: "List three benefits of unit testing.",
}

const KIND_STYLE: Record<AgentEvent["kind"], { icon: string; color: string }> = {
  decompose:  { icon: "\u{1F9E9}", color: "border-cyan-500/40 bg-cyan-500/5" },
  agent_step: { icon: "\u{1F916}", color: "border-emerald-500/40 bg-emerald-500/5" },
  synthesis:  { icon: "\u{1F517}", color: "border-violet-500/40 bg-violet-500/5" },
  score:      { icon: "\u{1F4CA}", color: "border-amber-500/40 bg-amber-500/5" },
  phase:      { icon: "\u{1F3AF}", color: "border-indigo-500/40 bg-indigo-500/5" },
}

function formatDuration(ms: number): string {
  if (!ms) return ""
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

interface WorkflowRunnerProps {
  workflow: WorkflowType
  title: string
}

export function WorkflowRunner({ workflow, title }: WorkflowRunnerProps) {
  const [description, setDescription] = useState(SUGGESTED_TASK[workflow])
  const [taskId, setTaskId] = useState<string | null>(null)
  const [task, setTask] = useState<TaskResponse | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<HTMLDivElement>(null)

  // Switching pattern resets the panel: the previous run's steps belong to a
  // different diagram and would be misleading next to this one.
  useEffect(() => {
    setDescription(SUGGESTED_TASK[workflow])
    setTaskId(null)
    setTask(null)
    setEvents([])
    setExpanded(new Set())
    setError(null)
  }, [workflow])

  const mode = WORKFLOW_TO_MODE[workflow]
  const isRunning = task?.status === "pending" || task?.status === "running"

  useEffect(() => {
    if (!taskId) return
    // Stop polling once the run reaches a terminal state. Reads task?.status
    // rather than task so the effect's deps stay exhaustive.
    if (task?.status && !isRunning) return

    let cancelled = false
    const poll = async () => {
      try {
        const [t, logs] = await Promise.all([
          apiClient.getTask(taskId),
          apiClient.getTaskLogs(taskId),
        ])
        if (cancelled) return
        setTask(t)
        setEvents(logs.events ?? [])
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) {
          console.error("Workflow poll failed:", e)
        }
      }
    }
    poll()
    const id = setInterval(poll, 1500)
    return () => { cancelled = true; clearInterval(id) }
  }, [taskId, task?.status, isRunning])

  // Follow the stream while it is being written, but leave scrolling alone
  // once the run finishes so a reader can look back through it.
  useEffect(() => {
    if (isRunning && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [events.length, isRunning])

  const deploy = async () => {
    if (!description.trim()) return
    setStarting(true)
    setError(null)
    setEvents([])
    setTask(null)
    setExpanded(new Set())
    try {
      const created = await apiClient.createTask({
        description: description.trim(),
        complexity: "moderate",
        preferred_mode: mode as never,
      })
      setTaskId(created.task_id)
      setTask(created)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start this run")
    } finally {
      setStarting(false)
    }
  }

  const toggle = (seq: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(seq)) next.delete(seq)
      else next.add(seq)
      return next
    })

  const agentSteps = events.filter((e) => e.kind === "agent_step").length

  if (!mode) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-500">
          Not implemented
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
          {title} is described here as an architecture, but has no backend mode
          to run. The other patterns on this page deploy against the live
          orchestrator.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="workflow-task" className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
          Task for {title}
        </label>
        <textarea
          id="workflow-task"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={isRunning}
          className="w-full rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/5 px-3 py-2 text-sm leading-snug resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60"
        />
      </div>

      <button
        onClick={deploy}
        disabled={starting || isRunning || !description.trim()}
        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:hover:bg-indigo-600 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
      >
        {starting || isRunning ? (
          <><Loader2 className="w-4 h-4 animate-spin" />{isRunning ? "Running…" : "Starting…"}</>
        ) : (
          <><Play className="w-4 h-4" />Deploy {title}</>
        )}
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {task && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          <span className={isRunning ? "text-indigo-400" : task.status === "failed" ? "text-red-400" : "text-emerald-400"}>
            {task.status}
          </span>
          <span>{agentSteps} agent step{agentSteps !== 1 ? "s" : ""}</span>
          {task.agents_involved != null && <span>{task.agents_involved} agents</span>}
          {task.quality_score != null && <span>quality {task.quality_score.toFixed(1)}/10</span>}
          {task.execution_time != null && <span>{task.execution_time.toFixed(1)}s</span>}
        </div>
      )}

      {events.length > 0 && (
        <div ref={streamRef} className="max-h-96 overflow-y-auto space-y-1.5 pr-1 scroll-smooth">
          {events.map((event) => {
            const style = KIND_STYLE[event.kind] ?? KIND_STYLE.phase
            const open = expanded.has(event.seq)
            const hasDetail = Boolean(event.prompt || event.response)
            return (
              <div key={event.seq} className={`rounded-lg border px-3 py-2 text-xs ${style.color}`}>
                <div
                  onClick={hasDetail ? () => toggle(event.seq) : undefined}
                  role={hasDetail ? "button" : undefined}
                  tabIndex={hasDetail ? 0 : undefined}
                  onKeyDown={hasDetail ? (e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(event.seq) }
                  } : undefined}
                  className={`flex items-start gap-2 ${hasDetail ? "cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/50" : ""}`}
                >
                  {hasDetail ? (
                    <ChevronRight className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} />
                  ) : (
                    <span className="text-sm leading-none mt-0.5 shrink-0">{style.icon}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                        {event.agent_name ?? event.phase}
                      </span>
                      {event.agent_name && event.agent_role && (
                        <span className="text-zinc-500">{event.agent_role}</span>
                      )}
                      {event.batch != null && (
                        <span className="text-[10px] px-1 rounded border border-emerald-500/40 text-emerald-500">
                          batch {event.batch}
                        </span>
                      )}
                      {event.score != null && (
                        <span className="text-[10px] text-amber-500">{event.score.toFixed(1)}/10</span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                      {event.agent_name ? event.phase : event.kind}
                      {event.subtask_id && ` · ${event.subtask_id}`}
                      {event.duration_ms > 0 && ` · ${formatDuration(event.duration_ms)}`}
                    </p>
                    {!open && event.response && (
                      <p className="mt-1 line-clamp-2 leading-snug break-words text-zinc-700 dark:text-zinc-300">
                        {event.response}
                      </p>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="mt-2 space-y-2 pl-5">
                    {event.prompt && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Prompt</p>
                        <pre className="whitespace-pre-wrap break-words rounded bg-zinc-100 dark:bg-zinc-900 p-2 text-[11px] leading-snug max-h-48 overflow-y-auto">
                          {event.prompt}
                        </pre>
                      </div>
                    )}
                    {event.response && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Response</p>
                        {event.kind === "decompose" ? (
                          <pre className="whitespace-pre-wrap break-words rounded bg-zinc-100 dark:bg-zinc-900 p-2 text-[11px] leading-snug max-h-80 overflow-y-auto">
                            {event.response}
                          </pre>
                        ) : (
                          <div className="rounded bg-zinc-100 dark:bg-zinc-900 p-3 max-h-80 overflow-y-auto prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-2 prose-headings:text-sm prose-ul:my-2 prose-li:my-0.5">
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
          {isRunning && (
            <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              waiting for next step…
            </div>
          )}
        </div>
      )}

      {task?.status === "completed" && task.output && (
        <details className="rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 p-3">
          <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            Final output
          </summary>
          <div className="mt-3 max-h-96 overflow-y-auto prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer>{task.output}</MarkdownRenderer>
          </div>
        </details>
      )}

      {task?.status === "failed" && task.error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
          <Square className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{task.error}</span>
        </div>
      )}
    </div>
  )
}
