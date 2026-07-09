"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiClient, type CsvAnalysis } from "@/lib/api"
import { Loader2, Upload, FileText } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

export default function CsvPage() {
  const [tab, setTab] = useState<"upload" | "paste">("upload")
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<CsvAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null); setAnalysis(null); setLoading(true)
    try {
      if (tab === "upload") {
        if (!file) return
        const r = await apiClient.csvAnalyzeUpload(file)
        setAnalysis(r.analysis)
      } else {
        if (!text.trim()) return
        const r = await apiClient.csvAnalyzeText(text)
        setAnalysis(r.analysis)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed")
    } finally { setLoading(false) }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="mega-bg fixed inset-0" />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text mb-2">
              CSV Completion
            </h1>
            <p className="text-lg text-zinc-700 dark:text-zinc-300">
              Find missing cells in a CSV and get AI-generated questions to fill them
            </p>
          </div>
          <ThemeToggle />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Input</CardTitle>
            <CardDescription>Upload a .csv file or paste contents inline.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "upload" | "paste")}>
              <TabsList className="mb-4">
                <TabsTrigger value="upload"><Upload className="mr-2 h-4 w-4" />Upload</TabsTrigger>
                <TabsTrigger value="paste"><FileText className="mr-2 h-4 w-4" />Paste</TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="space-y-4">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file && <p className="text-xs text-zinc-500">{file.name} · {file.size.toLocaleString()} bytes</p>}
              </TabsContent>
              <TabsContent value="paste" className="space-y-4">
                <Textarea
                  rows={10}
                  placeholder={"date,symbol,price\n2024-01-01,ETH,\n2024-01-02,,2500"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="font-mono text-xs resize-none"
                />
              </TabsContent>
            </Tabs>
            <Button onClick={handleSubmit} disabled={loading || (tab === "upload" ? !file : !text.trim())} className="w-full pulse-glow mt-4">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing…</> : "Analyze"}
            </Button>
          </CardContent>
        </Card>

        {analysis && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Analysis</CardTitle>
              <CardDescription>
                {analysis.total_missing} missing cell{analysis.total_missing === 1 ? "" : "s"} · completion {(analysis.completion_rate * 100).toFixed(1)}%
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysis.missing_cells.length === 0 ? (
                <p className="text-sm text-zinc-500">No missing values — your CSV is complete.</p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {analysis.missing_cells.map((cell, i) => (
                    <div key={i} className="p-3 rounded bg-zinc-100 dark:bg-zinc-800 space-y-1">
                      <div className="text-xs text-zinc-500">row {cell.row} · column {cell.column}</div>
                      <div className="text-sm font-medium">{cell.question}</div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">{cell.context}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="mt-6 border-red-500/30">
            <CardContent className="pt-6">
              <p className="text-sm text-red-500">{error}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
