"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiClient } from "@/lib/api"
import { Loader2, Bot, GitBranch, MessageSquare, Send, RefreshCw } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { MarkdownRenderer } from "@/components/markdown-renderer"

type Tab = "agentic" | "spb" | "assistant"

export default function OrchestratorsPage() {
  const [tab, setTab] = useState<Tab>("agentic")

  // Agentic orchestrator
  const [agenticTask, setAgenticTask] = useState("")
  const [agenticStream, setAgenticStream] = useState(true)
  const [agenticOutput, setAgenticOutput] = useState("")
  const [agenticLoading, setAgenticLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Scout-Plan-Build
  const [spbRequest, setSpbRequest] = useState("")
  const [spbRoot, setSpbRoot] = useState(".")
  const [spbDocs, setSpbDocs] = useState("")
  const [spbLoading, setSpbLoading] = useState(false)
  const [spbResult, setSpbResult] = useState<unknown>(null)

  // Assistant chat
  const [assistantInput, setAssistantInput] = useState("")
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantHistory, setAssistantHistory] = useState<Array<{ role: string; content: string }>>([])
  // The reply currently being streamed, kept out of history until it lands.
  const [streamingReply, setStreamingReply] = useState("")
  // What the assistant is doing right now, e.g. "search_arxiv". Cleared when
  // text starts arriving, since by then the tools are done.
  const [toolActivity, setToolActivity] = useState<string[]>([])

  const [error, setError] = useState<string | null>(null)

  const refreshHistory = async () => {
    try {
      const r = await apiClient.assistantHistory()
      setAssistantHistory(r.history)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "History unavailable")
    }
  }

  useEffect(() => { if (tab === "assistant") refreshHistory() }, [tab])

  const runAgentic = async () => {
    if (!agenticTask.trim()) return
    setError(null); setAgenticOutput(""); setAgenticLoading(true)
    try {
      if (agenticStream) {
        abortRef.current = new AbortController()
        const res = await apiClient.streamAgenticOrchestrator(agenticTask, abortRef.current.signal)
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) throw new Error("No response body")
        let buf = ""
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split("\n")
          buf = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6)
            if (data === "[DONE]") continue
            try {
              const obj = JSON.parse(data)
              if (obj.chunk) setAgenticOutput((p) => p + obj.chunk)
              if (obj.error) setError(obj.error)
            } catch { /* ignore non-JSON keep-alives */ }
          }
        }
      } else {
        const r = await apiClient.runAgenticOrchestrator(agenticTask)
        setAgenticOutput(r.result)
      }
    } catch (e: unknown) {
      if ((e as { name?: string }).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Orchestrator failed")
      }
    } finally { setAgenticLoading(false); abortRef.current = null }
  }

  const stopAgentic = () => { abortRef.current?.abort() }

  const runSpb = async () => {
    if (!spbRequest.trim()) return
    setError(null); setSpbResult(null); setSpbLoading(true)
    try {
      const r = await apiClient.scoutPlanBuild({
        user_request: spbRequest,
        codebase_root: spbRoot || ".",
        documentation_urls: spbDocs.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) || undefined,
      })
      setSpbResult(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Scout/Plan/Build failed")
    } finally { setSpbLoading(false) }
  }

  const sendAssistant = async () => {
    if (!assistantInput.trim()) return
    const msg = assistantInput
    setAssistantInput("")
    setAssistantHistory((p) => [...p, { role: "user", content: msg }])
    setAssistantLoading(true); setError(null)
    setStreamingReply(""); setToolActivity([])

    // Streamed rather than a single POST: a research answer can take minutes,
    // and the proxy cuts a silent request at ~64s. Streaming also shows the
    // tool calls while they run instead of only the finished answer.
    let text = ""
    try {
      for await (const ev of apiClient.streamAssistantChat(msg)) {
        if (ev.type === "text") {
          text += ev.delta
          setStreamingReply(text)
        } else if (ev.type === "tool_call") {
          setToolActivity((p) => [...p, ev.name])
        } else if (ev.type === "done") {
          text = ev.text || text
        } else if (ev.type === "error") {
          setError(ev.message)
        }
      }
      if (text) setAssistantHistory((p) => [...p, { role: "model", content: text }])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Chat failed")
      // Keep whatever streamed before the failure rather than discarding it.
      if (text) setAssistantHistory((p) => [...p, { role: "model", content: text }])
    } finally {
      setAssistantLoading(false)
      setStreamingReply("")
      setToolActivity([])
    }
  }

  const resetAssistant = async () => {
    try {
      // Two conversations exist: the legacy chat session and the streaming
      // one (which lives in previous_interaction_id server-side). Reset both
      // or the assistant keeps remembering through a "cleared" screen.
      await Promise.all([apiClient.assistantReset(), apiClient.resetAssistantStream()])
      setAssistantHistory([])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reset failed")
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="mega-bg fixed inset-0" />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text mb-2">
              Orchestrators
            </h1>
            <p className="text-lg text-zinc-700 dark:text-zinc-300">
              Standalone agent workflows: tool-using agent, Scout→Plan→Build, persistent research chat
            </p>
          </div>
          <ThemeToggle />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-6">
          <TabsList className="glass-card p-1.5 gap-1">
            <TabsTrigger value="agentic"><Bot className="mr-2 h-4 w-4" />Agentic</TabsTrigger>
            <TabsTrigger value="spb"><GitBranch className="mr-2 h-4 w-4" />Scout→Plan→Build</TabsTrigger>
            <TabsTrigger value="assistant"><MessageSquare className="mr-2 h-4 w-4" />Assistant</TabsTrigger>
          </TabsList>

          <TabsContent value="agentic" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Agentic Orchestrator</CardTitle>
                <CardDescription>
                  Gemini agent with access to arxiv/pubmed/wikipedia search, grounding, image/document/code gen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  rows={5}
                  placeholder="Find recent papers on transformers and summarize the top 3."
                  value={agenticTask}
                  onChange={(e) => setAgenticTask(e.target.value)}
                  className="resize-none"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={agenticStream} onChange={(e) => setAgenticStream(e.target.checked)} />
                  Stream response (SSE)
                </label>
                <div className="flex gap-2">
                  <Button onClick={runAgentic} disabled={agenticLoading || !agenticTask.trim()} className="flex-1 pulse-glow">
                    {agenticLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running…</> : <><Send className="mr-2 h-4 w-4" />Run</>}
                  </Button>
                  {agenticLoading && agenticStream && (
                    <Button variant="outline" onClick={stopAgentic}>Stop</Button>
                  )}
                </div>
              </CardContent>
            </Card>
            {agenticOutput && (
              <Card>
                <CardHeader><CardTitle>Output</CardTitle></CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                    <MarkdownRenderer>{agenticOutput}</MarkdownRenderer>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="spb" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Scout → Plan → Build</CardTitle>
                <CardDescription>
                  Long-running coding workflow. Writes relevant_files.md, plan.md, build_log.md to your codebase root.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  rows={4}
                  placeholder="Add a dark-mode toggle to the web application"
                  value={spbRequest}
                  onChange={(e) => setSpbRequest(e.target.value)}
                  className="resize-none"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500">Codebase root</label>
                    <Input value={spbRoot} onChange={(e) => setSpbRoot(e.target.value)} placeholder="." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500">Documentation URLs (one per line)</label>
                    <Textarea rows={2} value={spbDocs} onChange={(e) => setSpbDocs(e.target.value)} className="resize-none" />
                  </div>
                </div>
                <Button onClick={runSpb} disabled={spbLoading || !spbRequest.trim()} className="w-full pulse-glow">
                  {spbLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running (may take minutes)…</> : "Run workflow"}
                </Button>
              </CardContent>
            </Card>
            {spbResult ? (
              <Card>
                <CardHeader><CardTitle>Result</CardTitle></CardHeader>
                <CardContent>
                  <pre className="text-xs overflow-auto max-h-[600px] p-3 bg-zinc-100 dark:bg-zinc-800 rounded">
                    {JSON.stringify(spbResult, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="assistant" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Research Assistant</CardTitle>
                  <CardDescription>Persistent multi-turn chat with arXiv/PubMed/Wikipedia/Google tools.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={refreshHistory}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
                  <Button variant="outline" size="sm" onClick={resetAssistant}>Reset</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 max-h-[500px] overflow-y-auto p-2 rounded bg-zinc-50 dark:bg-zinc-900">
                  {assistantHistory.length === 0 && !assistantLoading
                    ? <p className="text-sm text-zinc-500 text-center py-8">No conversation yet.</p>
                    : assistantHistory.map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-lg p-3 text-sm ${m.role === "user" ? "bg-indigo-500/20" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                          <MarkdownRenderer>{m.content}</MarkdownRenderer>
                        </div>
                      </div>
                    ))}

                  {/* The reply as it streams in, plus what the assistant is
                      doing to produce it. */}
                  {assistantLoading && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg p-3 text-sm bg-zinc-100 dark:bg-zinc-800 space-y-2">
                        {toolActivity.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {toolActivity.map((name, i) => (
                              <span
                                key={`${name}-${i}`}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                        {streamingReply
                          ? <MarkdownRenderer>{streamingReply}</MarkdownRenderer>
                          : (
                            <span className="flex items-center gap-2 text-zinc-500">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {toolActivity.length > 0 ? "researching…" : "thinking…"}
                            </span>
                          )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    rows={2}
                    placeholder="Type a message… (Ctrl/Cmd+Enter to send)"
                    value={assistantInput}
                    onChange={(e) => setAssistantInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendAssistant() }}
                    className="resize-none"
                  />
                  <Button onClick={sendAssistant} disabled={assistantLoading || !assistantInput.trim()}>
                    {assistantLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {error && (
            <Card className="border-red-500/30">
              <CardContent className="pt-6">
                <p className="text-sm text-red-500">{error}</p>
              </CardContent>
            </Card>
          )}
        </Tabs>
      </div>
    </div>
  )
}
