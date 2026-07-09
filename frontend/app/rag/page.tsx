"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { apiClient } from "@/lib/api"
import { Loader2, BookOpen, Trash2, Plus, Search, Upload, FileText, ChevronDown, ChevronUp } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { MarkdownRenderer } from "@/components/markdown-renderer"

interface RagChunk {
  id: string; text: string; title: string; source: string;
  chunk_index: number; score: number; added_at: string;
}
interface RagSource {
  index: number; title: string; source: string; score: number; snippet: string;
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color =
    score >= 0.8 ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" :
    score >= 0.5 ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-400" :
                   "bg-zinc-500/20 border-zinc-500/40 text-zinc-400"
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${color}`}>
      {pct}%
    </span>
  )
}

export default function RagPage() {
  // Stats
  const [stats, setStats] = useState<{ document_count: number; unique_sources: number; embedding_model: string } | null>(null)

  // Add text
  const [docsInput, setDocsInput] = useState("")
  const [titleInput, setTitleInput] = useState("")
  const [sourceInput, setSourceInput] = useState("")

  // PDF upload
  const fileRef = useRef<HTMLInputElement>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfTitle, setPdfTitle] = useState("")
  const [pdfSource, setPdfSource] = useState("")

  // Retrieve
  const [retrieveQuery, setRetrieveQuery] = useState("")
  const [topK, setTopK] = useState(5)
  const [minScore, setMinScore] = useState(0)
  const [retrieved, setRetrieved] = useState<RagChunk[] | null>(null)
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({})

  // Answer
  const [question, setQuestion] = useState("")
  const [answerResult, setAnswerResult] = useState<{ answer: string; sources: RagSource[] } | null>(null)

  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshStats = async () => {
    try {
      const r = await apiClient.ragStats()
      setStats(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Stats unavailable")
    }
  }

  useEffect(() => { refreshStats() }, [])

  const handleAdd = async () => {
    const docs = docsInput.split(/\n\n+/).map((s) => s.trim()).filter(Boolean)
    if (docs.length === 0) return
    setLoading("add"); setError(null)
    try {
      await apiClient.ragAddDocuments(
        docs,
        titleInput ? docs.map(() => titleInput) : undefined,
        sourceInput ? docs.map(() => sourceInput) : undefined,
      )
      setDocsInput(""); setTitleInput(""); setSourceInput("")
      await refreshStats()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Add failed")
    } finally { setLoading(null) }
  }

  const handlePdfUpload = async () => {
    if (!pdfFile) return
    setLoading("pdf"); setError(null)
    try {
      await apiClient.ragUploadPdf(pdfFile, pdfTitle, pdfSource)
      setPdfFile(null); setPdfTitle(""); setPdfSource("")
      if (fileRef.current) fileRef.current.value = ""
      await refreshStats()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF upload failed")
    } finally { setLoading(null) }
  }

  const handleClear = async () => {
    if (!confirm("Clear the entire knowledge base?")) return
    setLoading("clear"); setError(null)
    try {
      await apiClient.ragClear()
      setRetrieved(null); setAnswerResult(null)
      await refreshStats()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Clear failed")
    } finally { setLoading(null) }
  }

  const handleRetrieve = async () => {
    if (!retrieveQuery.trim()) return
    setLoading("retrieve"); setError(null); setRetrieved(null); setExpandedChunks({})
    try {
      const r = await apiClient.ragRetrieve(retrieveQuery, topK, minScore)
      setRetrieved(r.results)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Retrieval failed")
    } finally { setLoading(null) }
  }

  const handleAnswer = async () => {
    if (!question.trim()) return
    setLoading("answer"); setError(null); setAnswerResult(null)
    try {
      const r = await apiClient.ragAnswer(question, topK)
      setAnswerResult({ answer: r.answer, sources: r.sources })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Answer failed")
    } finally { setLoading(null) }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="mega-bg fixed inset-0" />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text mb-2">
              📚 RAG Knowledge Base
            </h1>
            <p className="text-lg text-zinc-700 dark:text-zinc-300">
              gemini-embedding-2 · chunked retrieval · PDF ingestion · cited answers
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* ── Stats bar ── */}
        <Card className="mb-6">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex gap-6 flex-wrap text-sm">
                <span>
                  <span className="text-zinc-500 dark:text-zinc-400">Chunks indexed: </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {stats === null ? "…" : stats.document_count}
                  </span>
                </span>
                <span>
                  <span className="text-zinc-500 dark:text-zinc-400">Sources: </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {stats === null ? "…" : stats.unique_sources}
                  </span>
                </span>
                {stats?.embedding_model && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-500">
                    {stats.embedding_model}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={refreshStats}>Refresh</Button>
                <Button variant="outline" size="sm" onClick={handleClear}
                  disabled={loading === "clear" || stats?.document_count === 0}>
                  {loading === "clear"
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Trash2 className="mr-2 h-4 w-4" />Clear KB</>}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Ingest row ── */}
        <div className="grid gap-6 md:grid-cols-2 mb-6">

          {/* Add text documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />Add Text</CardTitle>
              <CardDescription>Paste documents separated by a blank line. Long docs are auto-chunked.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={6} placeholder={"Document one…\n\nDocument two…"}
                value={docsInput} onChange={(e) => setDocsInput(e.target.value)} className="resize-none font-mono text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Title (optional)" value={titleInput} onChange={(e) => setTitleInput(e.target.value)} />
                <Input placeholder="Source URL (optional)" value={sourceInput} onChange={(e) => setSourceInput(e.target.value)} />
              </div>
              <Button onClick={handleAdd} disabled={loading === "add" || !docsInput.trim()} className="w-full pulse-glow">
                {loading === "add"
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Embedding…</>
                  : <><Plus className="mr-2 h-4 w-4" />Add Documents</>}
              </Button>
            </CardContent>
          </Card>

          {/* PDF upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" />Upload PDF</CardTitle>
              <CardDescription>Gemini reads the PDF natively (up to 50 MB / 1 000 pages), extracts text, then embeds chunks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-indigo-500/50 transition-colors"
              >
                <FileText className="h-8 w-8 text-zinc-400" />
                <p className="text-sm text-zinc-500">
                  {pdfFile ? pdfFile.name : "Click to select a PDF"}
                </p>
                <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Title (optional)" value={pdfTitle} onChange={(e) => setPdfTitle(e.target.value)} />
                <Input placeholder="Source URL (optional)" value={pdfSource} onChange={(e) => setPdfSource(e.target.value)} />
              </div>
              <Button onClick={handlePdfUpload} disabled={loading === "pdf" || !pdfFile} className="w-full pulse-glow">
                {loading === "pdf"
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing PDF…</>
                  : <><Upload className="mr-2 h-4 w-4" />Upload & Embed</>}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── Retrieve ── */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Search className="h-4 w-4" />Retrieve Chunks</CardTitle>
            <CardDescription>Pure vector retrieval — no LLM call.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[1fr_80px_120px] gap-3">
              <Input placeholder="Search query…" value={retrieveQuery}
                onChange={(e) => setRetrieveQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRetrieve()} />
              <Input type="number" min={1} max={20} value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value) || 1)}
                title="Top K" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 whitespace-nowrap">Min score</span>
                <Input type="number" min={0} max={1} step={0.05} value={minScore}
                  onChange={(e) => setMinScore(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <Button onClick={handleRetrieve} disabled={loading === "retrieve" || !retrieveQuery.trim()} className="w-full">
              {loading === "retrieve"
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Retrieving…</>
                : <><Search className="mr-2 h-4 w-4" />Retrieve</>}
            </Button>

            {retrieved && (
              <div className="space-y-2">
                {retrieved.length === 0
                  ? <p className="text-sm text-zinc-500">No matches above threshold.</p>
                  : retrieved.map((chunk) => (
                    <div key={chunk.id} className="rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-900/50 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <ScoreBadge score={chunk.score} />
                          {chunk.title && <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{chunk.title}</span>}
                          {chunk.source && <a href={chunk.source} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline truncate">{chunk.source}</a>}
                          <span className="text-xs text-zinc-400">chunk {chunk.chunk_index}</span>
                        </div>
                        <button onClick={() => setExpandedChunks(p => ({ ...p, [chunk.id]: !p[chunk.id] }))}
                          className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                          {expandedChunks[chunk.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className={`px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 ${expandedChunks[chunk.id] ? "" : "line-clamp-2"}`}>
                        {chunk.text}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Ask (RAG-grounded) ── */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" />Ask (RAG-grounded)</CardTitle>
            <CardDescription>Retrieves relevant chunks, then Gemini answers with inline citations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea rows={3} placeholder="Ask anything against your knowledge base…"
              value={question} onChange={(e) => setQuestion(e.target.value)} className="resize-none" />
            <Button onClick={handleAnswer} disabled={loading === "answer" || !question.trim()} className="w-full pulse-glow">
              {loading === "answer"
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Answering…</>
                : <><BookOpen className="mr-2 h-4 w-4" />Answer</>}
            </Button>

            {answerResult && (
              <div className="space-y-4">
                <div className="prose prose-sm dark:prose-invert max-w-none rounded-lg bg-zinc-50 dark:bg-zinc-900/50 p-4">
                  <MarkdownRenderer>{answerResult.answer}</MarkdownRenderer>
                </div>

                {answerResult.sources.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Sources used</p>
                    <div className="space-y-2">
                      {answerResult.sources.map((s) => (
                        <div key={s.index} className="flex gap-3 rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 p-3 text-sm">
                          <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-indigo-500/20 text-indigo-500 text-xs font-bold">
                            {s.index}
                          </span>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">{s.title}</span>
                              <ScoreBadge score={s.score} />
                              {s.source && (
                                <a href={s.source} target="_blank" rel="noreferrer"
                                  className="text-xs text-indigo-500 hover:underline truncate">{s.source}</a>
                              )}
                            </div>
                            <p className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed">{s.snippet}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <Card className="border-red-500/30">
            <CardContent className="pt-6">
              <p className="text-sm text-red-500">{error}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
