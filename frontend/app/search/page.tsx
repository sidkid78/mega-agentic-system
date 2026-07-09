"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiClient } from "@/lib/api"
import { Loader2, Search, Microscope, BookOpen, Globe, ExternalLink, Users, Calendar, FlaskConical, Tag, Link } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { MarkdownRenderer } from "@/components/markdown-renderer"

type Tab = "arxiv" | "pubmed" | "wikipedia" | "grounded"

export default function SearchPage() {
  const [tab, setTab] = useState<Tab>("arxiv")
  const [query, setQuery] = useState("")
  const [maxResults, setMaxResults] = useState(5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [arxiv, setArxiv] = useState<Array<{
    title: string; authors: string[]; summary: string; url: string;
    published: string; arxiv_id: string; categories: string[];
  }> | null>(null)
  const [arxivExpanded, setArxivExpanded] = useState<Record<string, boolean>>({})
  const [pubmed, setPubmed] = useState<Array<{
    pmid: string; title: string; authors: string[]; abstract: string;
    journal: string; year: string; doi: string; url: string; doi_url: string;
  }> | null>(null)
  const [pubmedExpanded, setPubmedExpanded] = useState<Record<string, boolean>>({})
  const [wiki, setWiki] = useState<{ title?: string; summary?: string; url?: string; content?: string; error?: string; disambiguation_note?: string } | null>(null)
  const [grounded, setGrounded] = useState<{
    answer: string;
    search_queries: string[];
    sources: Array<{ title: string; url: string }>;
  } | null>(null)

  const reset = () => {
    setError(null)
    setArxiv(null)
    setPubmed(null)
    setWiki(null)
    setGrounded(null)
  }

  const handleSubmit = async () => {
    if (!query.trim()) return
    setLoading(true)
    reset()
    try {
      if (tab === "arxiv") {
        const r = await apiClient.searchArxiv(query, maxResults)
        setArxiv(r.results)
        setArxivExpanded({})
      } else if (tab === "pubmed") {
        const r = await apiClient.searchPubmed(query, maxResults)
        setPubmed(r.articles)
        setPubmedExpanded({})
      } else if (tab === "wikipedia") {
        const r = await apiClient.searchWikipedia(query)
        setWiki(r.article)
      } else {
        const r = await apiClient.groundedQuery(query)
        setGrounded({
          answer: r.result.answer ?? "",
          search_queries: r.result.search_queries ?? [],
          sources: r.result.sources ?? [],
        })
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="mega-bg fixed inset-0" />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text mb-2">
              Search Tools
            </h1>
            <p className="text-lg text-zinc-700 dark:text-zinc-300">
              arXiv, PubMed, Wikipedia, and Gemini Google-Search grounding
            </p>
          </div>
          <ThemeToggle />
        </div>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); reset() }} className="space-y-6">
          <TabsList className="glass-card p-1.5 gap-1">
            <TabsTrigger value="arxiv"><Microscope className="mr-2 h-4 w-4" />arXiv</TabsTrigger>
            <TabsTrigger value="pubmed"><BookOpen className="mr-2 h-4 w-4" />PubMed</TabsTrigger>
            <TabsTrigger value="wikipedia"><Globe className="mr-2 h-4 w-4" />Wikipedia</TabsTrigger>
            <TabsTrigger value="grounded"><Search className="mr-2 h-4 w-4" />Grounded</TabsTrigger>
          </TabsList>

          <Card>
            <CardHeader>
              <CardTitle>Query</CardTitle>
              <CardDescription>
                {tab === "arxiv" && "Search academic papers on arXiv."}
                {tab === "pubmed" && "Search PubMed (returns matching IDs)."}
                {tab === "wikipedia" && "Fetch a Wikipedia article (no max_results)."}
                {tab === "grounded" && "Ask Gemini with live Google-Search grounding."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
                <Input
                  placeholder={tab === "wikipedia" ? "Article title…" : "Search query…"}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
                {tab !== "wikipedia" && tab !== "grounded" && (
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={maxResults}
                    onChange={(e) => setMaxResults(parseInt(e.target.value) || 1)}
                  />
                )}
              </div>
              <Button onClick={handleSubmit} disabled={loading || !query.trim()} className="w-full pulse-glow">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Searching…</> : <><Search className="mr-2 h-4 w-4" />Search</>}
              </Button>
            </CardContent>
          </Card>

          <TabsContent value="arxiv" className="space-y-3">
            {arxiv && arxiv.length === 0 && <p className="text-sm text-zinc-500">No results.</p>}
            {arxiv?.map((p, i) => (
              <Card key={i} className="border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/40 transition-colors">
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-100">{p.title}</h3>
                    <span className="shrink-0 text-xs font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400">
                      {p.arxiv_id}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {p.authors.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {p.authors.slice(0, 4).join(", ")}{p.authors.length > 4 && ` +${p.authors.length - 4} more`}
                      </span>
                    )}
                    {p.published && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{p.published}
                      </span>
                    )}
                    {p.categories?.slice(0, 3).map(c => (
                      <span key={c} className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />{c}
                      </span>
                    ))}
                  </div>
                  <div>
                    <p className={`text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed ${arxivExpanded[p.arxiv_id] ? "" : "line-clamp-3"}`}>
                      {p.summary}
                    </p>
                    {p.summary.length > 300 && (
                      <button
                        onClick={() => setArxivExpanded(prev => ({ ...prev, [p.arxiv_id]: !prev[p.arxiv_id] }))}
                        className="text-xs text-indigo-500 hover:text-indigo-400 mt-1"
                      >
                        {arxivExpanded[p.arxiv_id] ? "Show less ↑" : "Read more ↓"}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3 pt-1">
                    <a href={p.url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-400 transition-colors">
                      <ExternalLink className="h-3 w-3" />PDF
                    </a>
                    <a href={`https://arxiv.org/abs/${p.arxiv_id}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors">
                      <ExternalLink className="h-3 w-3" />Abstract
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="pubmed" className="space-y-3">
            {pubmed && pubmed.length === 0 && (
              <p className="text-sm text-zinc-500">No results found.</p>
            )}
            {pubmed?.map((article) => (
              <Card key={article.pmid} className="border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/40 transition-colors">
                <CardContent className="pt-5 space-y-3">
                  {/* Title + PMID badge */}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
                      {article.title}
                    </h3>
                    <span className="shrink-0 text-xs font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400">
                      PMID {article.pmid}
                    </span>
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {article.authors.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {article.authors.slice(0, 4).join(", ")}
                        {article.authors.length > 4 && ` +${article.authors.length - 4} more`}
                      </span>
                    )}
                    {article.journal && (
                      <span className="flex items-center gap-1">
                        <FlaskConical className="h-3 w-3" />
                        <em>{article.journal}</em>
                      </span>
                    )}
                    {article.year && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {article.year}
                      </span>
                    )}
                  </div>

                  {/* Abstract (collapsible) */}
                  {article.abstract && (
                    <div>
                      <p className={`text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed ${pubmedExpanded[article.pmid] ? "" : "line-clamp-3"}`}>
                        {article.abstract}
                      </p>
                      {article.abstract.length > 300 && (
                        <button
                          onClick={() => setPubmedExpanded(prev => ({ ...prev, [article.pmid]: !prev[article.pmid] }))}
                          className="text-xs text-indigo-500 hover:text-indigo-400 mt-1"
                        >
                          {pubmedExpanded[article.pmid] ? "Show less ↑" : "Read more ↓"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Links */}
                  <div className="flex gap-3 pt-1">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-400 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      PubMed
                    </a>
                    {article.doi_url && (
                      <a
                        href={article.doi_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        DOI: {article.doi}
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="wikipedia">
            {wiki && (
              <Card>
                <CardHeader>
                  <CardTitle>{wiki.title ?? "Result"}</CardTitle>
                  {wiki.url && <CardDescription><a className="text-indigo-500 underline" target="_blank" rel="noreferrer" href={wiki.url}>{wiki.url}</a></CardDescription>}
                </CardHeader>
                <CardContent>
                  {wiki.error ? <p className="text-red-500 text-sm">{wiki.error}</p> : (
                    <div className="space-y-3">
                      {wiki.disambiguation_note && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                          ℹ️ {wiki.disambiguation_note}
                        </p>
                      )}
                      {wiki.summary && <p className="text-sm leading-relaxed">{wiki.summary}</p>}
                      {wiki.content && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-indigo-500 hover:text-indigo-400 mb-2">Full article excerpt ↓</summary>
                          <pre className="whitespace-pre-wrap text-zinc-600 dark:text-zinc-400 leading-relaxed">{wiki.content}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="grounded" className="space-y-3">
            {grounded && (
              <>
                <Card>
                  <CardHeader><CardTitle>Answer</CardTitle></CardHeader>
                  <CardContent>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MarkdownRenderer>{grounded.answer}</MarkdownRenderer>
                    </div>
                  </CardContent>
                </Card>

                {grounded.search_queries.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">Search Queries Used</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {grounded.search_queries.map((q, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50">
                            🔍 {q}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {grounded.sources.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">Sources</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5">
                        {grounded.sources.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Link className="h-3.5 w-3.5 mt-0.5 shrink-0 text-zinc-400" />
                            <a href={s.url} target="_blank" rel="noreferrer"
                              className="text-indigo-500 hover:text-indigo-400 hover:underline leading-snug">
                              {s.title || s.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
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
