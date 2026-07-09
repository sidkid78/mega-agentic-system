"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiClient } from "@/lib/api"
import { Loader2, FileText, Sparkles, CheckCircle2, Globe, ArrowUpRight, Wand2, Languages, Search } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { MarkdownRenderer } from "@/components/markdown-renderer"

interface DocumentAnalysis {
  readability_score: number
  tone: string
  target_audience: string
}

export default function DocumentsPage() {
  // Generate tab state
  const [topic, setTopic] = useState("")
  const [length, setLength] = useState("medium")
  const [style, setStyle] = useState("formal")
  const [targetAudience, setTargetAudience] = useState("general")
  const [includeCitations, setIncludeCitations] = useState(false)
  const [loading, setLoading] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  // Summarize tab state
  const [summarizeContent, setSummarizeContent] = useState("")
  const [summaryLength, setSummaryLength] = useState("moderate")
  const [summarizing, setSummarizing] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)

  // Expand tab state
  const [expandContent, setExpandContent] = useState("")
  const [expansionFactor, setExpansionFactor] = useState("1.5")
  const [focusAreas, setFocusAreas] = useState("")
  const [expanding, setExpanding] = useState(false)
  const [expandedContent, setExpandedContent] = useState<string | null>(null)

  // Translate tab state
  const [translateContent, setTranslateContent] = useState("")
  const [targetLanguage, setTargetLanguage] = useState("Spanish")
  const [translating, setTranslating] = useState(false)
  const [translatedContent, setTranslatedContent] = useState<string | null>(null)

  // Improve tab state
  const [improveContent, setImproveContent] = useState("")
  const [improvements, setImprovements] = useState("")
  const [improving, setImproving] = useState(false)
  const [improvedContent, setImprovedContent] = useState<string | null>(null)

  // Research tab state
  const [researchTopic, setResearchTopic] = useState("")
  const [useGrounding, setUseGrounding] = useState(true)
  const [researching, setResearching] = useState(false)
  const [researchContent, setResearchContent] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!topic.trim()) return
    setLoading(true)
    setError(null)
    setGeneratedContent(null)
    setAnalysis(null)

    try {
      const result = await apiClient.generateDocument({ topic, length, style, target_audience: targetAudience, include_citations: includeCitations })
      setGeneratedContent(result.content)
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to generate document")
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyze = async () => {
    if (!generatedContent) return
    setAnalyzing(true)
    setError(null)

    try {
      const result = await apiClient.analyzeDocument(generatedContent)
      setAnalysis(result.analysis)
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to analyze document")
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSummarize = async () => {
    if (!summarizeContent.trim()) return
    setSummarizing(true)
    setError(null)
    setSummary(null)

    try {
      const result = await apiClient.summarizeDocument(summarizeContent, summaryLength)
      setSummary(result.summary)
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to summarize document")
    } finally {
      setSummarizing(false)
    }
  }

  const handleExpand = async () => {
    if (!expandContent.trim()) return
    setExpanding(true)
    setError(null)
    setExpandedContent(null)

    try {
      const areas = focusAreas.split(",").map(a => a.trim()).filter(a => a)
      const result = await apiClient.expandDocument(expandContent, parseFloat(expansionFactor), areas.length > 0 ? areas : undefined)
      setExpandedContent(result.expanded_content)
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to expand document")
    } finally {
      setExpanding(false)
    }
  }

  const handleTranslate = async () => {
    if (!translateContent.trim()) return
    setTranslating(true)
    setError(null)
    setTranslatedContent(null)

    try {
      const result = await apiClient.translateDocument(translateContent, targetLanguage)
      setTranslatedContent(result.translated_content)
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to translate document")
    } finally {
      setTranslating(false)
    }
  }

  const handleImprove = async () => {
    if (!improveContent.trim() || !improvements.trim()) return
    setImproving(true)
    setError(null)
    setImprovedContent(null)

    try {
      const improvementList = improvements.split(",").map(i => i.trim()).filter(i => i)
      const result = await apiClient.improveDocument(improveContent, improvementList)
      setImprovedContent(result.improved_content)
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to improve document")
    } finally {
      setImproving(false)
    }
  }

  const handleResearch = async () => {
    if (!researchTopic.trim()) return
    setResearching(true)
    setError(null)
    setResearchContent(null)

    try {
      const result = await apiClient.researchDocument(researchTopic, useGrounding)
      setResearchContent(result.content)
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to research document")
    } finally {
      setResearching(false)
    }
  }

  const DocumentPreview = ({ content, title }: { content: string; title?: string }) => (
    <div className="space-y-2">
      {title && <div className="text-sm font-medium text-zinc-400">{title}</div>}
      <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-emerald-500">
        <MarkdownRenderer>{content}</MarkdownRenderer>
      </div>
    </div>
  )

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="mega-bg fixed inset-0" />

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text mb-2">
              📄 Document Generation
            </h1>
            <p className="text-lg text-zinc-700 dark:text-zinc-300">
              Create, edit, translate, and enhance documents with AI
            </p>
          </div>
          <ThemeToggle />
        </div>

        <Tabs defaultValue="generate" className="space-y-6">
          <TabsList className="glass-card p-1.5 gap-1 flex-wrap">
            <TabsTrigger value="generate">
              <FileText className="h-4 w-4 mr-2" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="summarize">
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Summarize
            </TabsTrigger>
            <TabsTrigger value="expand">
              <ArrowUpRight className="h-4 w-4 mr-2 rotate-180" />
              Expand
            </TabsTrigger>
            <TabsTrigger value="translate">
              <Languages className="h-4 w-4 mr-2" />
              Translate
            </TabsTrigger>
            <TabsTrigger value="improve">
              <Wand2 className="h-4 w-4 mr-2" />
              Improve
            </TabsTrigger>
            <TabsTrigger value="research">
              <Search className="h-4 w-4 mr-2" />
              Research
            </TabsTrigger>
          </TabsList>

          {error && (
            <div className="rounded-lg bg-red-500/20 border border-red-500/30 p-4">
              <p className="text-sm text-red-100">{error}</p>
            </div>
          )}

          {/* Generate Tab */}
          <TabsContent value="generate">
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="md:col-span-1">
                <CardHeader>
                  <CardTitle>Settings</CardTitle>
                  <CardDescription>Configure document generation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Topic *</label>
                    <Textarea placeholder="Enter the document topic..." value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} className="resize-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Length</label>
                    <Select value={length} onValueChange={setLength}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short (~500 words)</SelectItem>
                        <SelectItem value="medium">Medium (~1500 words)</SelectItem>
                        <SelectItem value="long">Long (~3000 words)</SelectItem>
                        <SelectItem value="comprehensive">Comprehensive (~5000+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Style</label>
                    <Select value={style} onValueChange={setStyle}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="technical">Technical</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="formal">Formal</SelectItem>
                        <SelectItem value="academic">Academic</SelectItem>
                        <SelectItem value="creative">Creative</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Target Audience</label>
                    <Input placeholder="e.g., professionals, students..." value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="citations" checked={includeCitations} onChange={(e) => setIncludeCitations(e.target.checked)} className="rounded" />
                    <label htmlFor="citations" className="text-sm font-medium">Include Citations</label>
                  </div>
                  <Button onClick={handleGenerate} disabled={loading || !topic.trim()} className="w-full pulse-glow">
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><FileText className="mr-2 h-4 w-4" />Generate Document</>}
                  </Button>
                  {generatedContent && (
                    <Button onClick={handleAnalyze} disabled={analyzing} variant="outline" className="w-full">
                      {analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing...</> : <><Sparkles className="mr-2 h-4 w-4" />Analyze Document</>}
                    </Button>
                  )}
                </CardContent>
              </Card>
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Generated Document</CardTitle>
                  <CardDescription>{generatedContent ? "Your AI-generated document" : "Document will appear here"}</CardDescription>
                </CardHeader>
                <CardContent>
                  {generatedContent ? (
                    <div className="space-y-4">
                      <DocumentPreview content={generatedContent} />
                      {analysis && (
                        <Card className="mt-6 border-emerald-500/30">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                              Document Analysis
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">Readability:</span>
                              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${analysis.readability_score * 10}%` }} />
                              </div>
                              <span className="text-sm font-bold">{analysis.readability_score}/10</span>
                            </div>
                            <div><span className="text-sm font-medium">Tone:</span> <span className="text-zinc-400">{analysis.tone}</span></div>
                            <div><span className="text-sm font-medium">Audience:</span> <span className="text-zinc-400">{analysis.target_audience}</span></div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  ) : (
                    <div className="py-12 text-center"><FileText className="h-12 w-12 mx-auto text-zinc-600 mb-4" /><p className="text-zinc-400">Enter a topic and click generate!</p></div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Summarize Tab */}
          <TabsContent value="summarize">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Document to Summarize</CardTitle>
                  <CardDescription>Paste content to create a summary</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea placeholder="Paste your document content..." value={summarizeContent} onChange={(e) => setSummarizeContent(e.target.value)} rows={12} />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Summary Length</label>
                    <Select value={summaryLength} onValueChange={setSummaryLength}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="brief">Brief</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="detailed">Detailed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleSummarize} disabled={summarizing || !summarizeContent.trim()} className="w-full pulse-glow">
                    {summarizing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Summarizing...</> : <><ArrowUpRight className="mr-2 h-4 w-4" />Summarize</>}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
                <CardContent>
                  {summary ? <DocumentPreview content={summary} /> : <div className="py-12 text-center text-zinc-400">Summary will appear here</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Expand Tab */}
          <TabsContent value="expand">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Document to Expand</CardTitle>
                  <CardDescription>Add more detail to your document</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea placeholder="Paste your document content..." value={expandContent} onChange={(e) => setExpandContent(e.target.value)} rows={10} />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Expansion Factor</label>
                    <Select value={expansionFactor} onValueChange={setExpansionFactor}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1.25">1.25x (25% longer)</SelectItem>
                        <SelectItem value="1.5">1.5x (50% longer)</SelectItem>
                        <SelectItem value="2">2x (double)</SelectItem>
                        <SelectItem value="3">3x (triple)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Focus Areas (comma-separated, optional)</label>
                    <Input placeholder="e.g., examples, technical details, use cases" value={focusAreas} onChange={(e) => setFocusAreas(e.target.value)} />
                  </div>
                  <Button onClick={handleExpand} disabled={expanding || !expandContent.trim()} className="w-full pulse-glow">
                    {expanding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Expanding...</> : <>Expand Document</>}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Expanded Document</CardTitle></CardHeader>
                <CardContent>
                  {expandedContent ? <DocumentPreview content={expandedContent} /> : <div className="py-12 text-center text-zinc-400">Expanded content will appear here</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Translate Tab */}
          <TabsContent value="translate">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Document to Translate</CardTitle>
                  <CardDescription>Translate to another language</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea placeholder="Paste your document content..." value={translateContent} onChange={(e) => setTranslateContent(e.target.value)} rows={10} />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Target Language</label>
                    <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Spanish">Spanish</SelectItem>
                        <SelectItem value="French">French</SelectItem>
                        <SelectItem value="German">German</SelectItem>
                        <SelectItem value="Italian">Italian</SelectItem>
                        <SelectItem value="Portuguese">Portuguese</SelectItem>
                        <SelectItem value="Japanese">Japanese</SelectItem>
                        <SelectItem value="Chinese">Chinese</SelectItem>
                        <SelectItem value="Korean">Korean</SelectItem>
                        <SelectItem value="Arabic">Arabic</SelectItem>
                        <SelectItem value="Hindi">Hindi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleTranslate} disabled={translating || !translateContent.trim()} className="w-full pulse-glow">
                    {translating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Translating...</> : <><Languages className="mr-2 h-4 w-4" />Translate</>}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Translated Document ({targetLanguage})</CardTitle></CardHeader>
                <CardContent>
                  {translatedContent ? <DocumentPreview content={translatedContent} /> : <div className="py-12 text-center text-zinc-400">Translated content will appear here</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Improve Tab */}
          <TabsContent value="improve">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Document to Improve</CardTitle>
                  <CardDescription>Enhance your document based on goals</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea placeholder="Paste your document content..." value={improveContent} onChange={(e) => setImproveContent(e.target.value)} rows={10} />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Improvement Goals (comma-separated)</label>
                    <Input placeholder="e.g., improve readability, add examples, strengthen conclusion" value={improvements} onChange={(e) => setImprovements(e.target.value)} />
                  </div>
                  <Button onClick={handleImprove} disabled={improving || !improveContent.trim() || !improvements.trim()} className="w-full pulse-glow">
                    {improving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Improving...</> : <><Wand2 className="mr-2 h-4 w-4" />Improve Document</>}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Improved Document</CardTitle></CardHeader>
                <CardContent>
                  {improvedContent ? <DocumentPreview content={improvedContent} /> : <div className="py-12 text-center text-zinc-400">Improved content will appear here</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Research Tab */}
          <TabsContent value="research">
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="md:col-span-1">
                <CardHeader>
                  <CardTitle>Research Topic</CardTitle>
                  <CardDescription>Generate document with live web research</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea placeholder="Enter topic for research..." value={researchTopic} onChange={(e) => setResearchTopic(e.target.value)} rows={4} />
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="grounding" checked={useGrounding} onChange={(e) => setUseGrounding(e.target.checked)} className="rounded" />
                    <label htmlFor="grounding" className="text-sm font-medium">Use Web Grounding</label>
                  </div>
                  <Button onClick={handleResearch} disabled={researching || !researchTopic.trim()} className="w-full pulse-glow">
                    {researching ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Researching...</> : <><Search className="mr-2 h-4 w-4" />Research & Generate</>}
                  </Button>
                </CardContent>
              </Card>
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Research Document</CardTitle>
                  <CardDescription>{researchContent ? "Document with live research data" : "Document with research will appear here"}</CardDescription>
                </CardHeader>
                <CardContent>
                  {researchContent ? <DocumentPreview content={researchContent} /> : <div className="py-12 text-center"><Globe className="h-12 w-12 mx-auto text-zinc-600 mb-4" /><p className="text-zinc-400">Enter a topic to research and generate!</p></div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
