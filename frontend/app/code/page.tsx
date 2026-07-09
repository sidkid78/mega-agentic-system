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
import { Loader2, Code, Sparkles, CheckCircle2, AlertTriangle, Play, RefreshCw, ArrowRightLeft, TestTube2, FileText } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { MarkdownRenderer } from "@/components/markdown-renderer"

export default function CodePage() {
  // Generate tab state
  const [requirements, setRequirements] = useState("")
  const [language, setLanguage] = useState("python")
  const [style, setStyle] = useState("clean")
  const [maxComplexity, setMaxComplexity] = useState("moderate")
  const [includeTests, setIncludeTests] = useState(false)
  const [includeComments, setIncludeComments] = useState(true)
  const [loading, setLoading] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [review, setReview] = useState<any>(null)
  const [reviewing, setReviewing] = useState(false)

  // Explain tab state
  const [explainCode, setExplainCode] = useState("")
  const [explainLevel, setExplainLevel] = useState("detailed")
  const [explaining, setExplaining] = useState(false)
  const [explanation, setExplanation] = useState<string | null>(null)

  // Refactor tab state
  const [refactorCode, setRefactorCode] = useState("")
  const [refactorGoals, setRefactorGoals] = useState("")
  const [refactoring, setRefactoring] = useState(false)
  const [refactoredCode, setRefactoredCode] = useState<string | null>(null)

  // Convert tab state
  const [convertCode, setConvertCode] = useState("")
  const [sourceLang, setSourceLang] = useState("python")
  const [targetLang, setTargetLang] = useState("javascript")
  const [converting, setConverting] = useState(false)
  const [convertedCode, setConvertedCode] = useState<string | null>(null)

  // Tests tab state
  const [testCode, setTestCode] = useState("")
  const [testFramework, setTestFramework] = useState("pytest")
  const [generatingTests, setGeneratingTests] = useState(false)
  const [generatedTests, setGeneratedTests] = useState<any[]>([])

  // Execute tab state
  const [executeCodeInput, setExecuteCodeInput] = useState("")
  const [executing, setExecuting] = useState(false)
  const [executeResult, setExecuteResult] = useState<any>(null)

  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!requirements.trim()) return
    setLoading(true)
    setError(null)
    setGeneratedCode(null)
    setReview(null)

    try {
      const result = await apiClient.generateCode({
        requirements,
        language,
        style,
        include_tests: includeTests,
        include_comments: includeComments,
        max_complexity: maxComplexity,
      })
      setGeneratedCode(result.code)
    } catch (err: any) {
      setError(err.message || "Failed to generate code")
    } finally {
      setLoading(false)
    }
  }

  const handleReview = async () => {
    if (!generatedCode) return
    setReviewing(true)
    setError(null)

    try {
      const result = await apiClient.reviewCode(generatedCode, language)
      setReview(result.review)
    } catch (err: any) {
      setError(err.message || "Failed to review code")
    } finally {
      setReviewing(false)
    }
  }

  const handleExplain = async () => {
    if (!explainCode.trim()) return
    setExplaining(true)
    setError(null)
    setExplanation(null)

    try {
      const result = await apiClient.explainCode(explainCode, explainLevel)
      setExplanation(result.explanation)
    } catch (err: any) {
      setError(err.message || "Failed to explain code")
    } finally {
      setExplaining(false)
    }
  }

  const handleRefactor = async () => {
    if (!refactorCode.trim() || !refactorGoals.trim()) return
    setRefactoring(true)
    setError(null)
    setRefactoredCode(null)

    try {
      const goals = refactorGoals.split(",").map(g => g.trim()).filter(g => g)
      const result = await apiClient.refactorCode(refactorCode, goals)
      setRefactoredCode(result.refactored_code)
    } catch (err: any) {
      setError(err.message || "Failed to refactor code")
    } finally {
      setRefactoring(false)
    }
  }

  const handleConvert = async () => {
    if (!convertCode.trim()) return
    setConverting(true)
    setError(null)
    setConvertedCode(null)

    try {
      const result = await apiClient.convertCode(convertCode, sourceLang, targetLang)
      setConvertedCode(result.converted_code)
    } catch (err: any) {
      setError(err.message || "Failed to convert code")
    } finally {
      setConverting(false)
    }
  }

  const handleGenerateTests = async () => {
    if (!testCode.trim()) return
    setGeneratingTests(true)
    setError(null)
    setGeneratedTests([])

    try {
      const result = await apiClient.generateTests(testCode, testFramework)
      setGeneratedTests(result.tests)
    } catch (err: any) {
      setError(err.message || "Failed to generate tests")
    } finally {
      setGeneratingTests(false)
    }
  }

  const handleExecute = async () => {
    if (!executeCodeInput.trim()) return
    setExecuting(true)
    setError(null)
    setExecuteResult(null)

    try {
      const result = await apiClient.executeCode(executeCodeInput)
      setExecuteResult(result)
    } catch (err: any) {
      setError(err.message || "Failed to execute code")
    } finally {
      setExecuting(false)
    }
  }

  const CodeBlock = ({ code, title }: { code: string; title?: string }) => (
    <div className="relative">
      {title && <div className="text-xs text-zinc-400 mb-1">{title}</div>}
      <pre className="p-4 rounded-lg bg-zinc-900 dark:bg-zinc-950 border border-zinc-800 overflow-x-auto">
        <code className="text-sm text-zinc-100 font-mono">{code}</code>
      </pre>
      <Button
        size="sm"
        variant="ghost"
        className="absolute top-2 right-2"
        onClick={() => navigator.clipboard.writeText(code)}
      >
        Copy
      </Button>
    </div>
  )

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="mega-bg fixed inset-0" />

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text mb-2">
              💻 Code Generation
            </h1>
            <p className="text-lg text-zinc-700 dark:text-zinc-300">
              Generate, explain, refactor, convert, and test code
            </p>
          </div>
          <ThemeToggle />
        </div>

        <Tabs defaultValue="generate" className="space-y-6">
          <TabsList className="glass-card p-1.5 gap-1 flex-wrap">
            <TabsTrigger value="generate">
              <Code className="h-4 w-4 mr-2" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="explain">
              <FileText className="h-4 w-4 mr-2" />
              Explain
            </TabsTrigger>
            <TabsTrigger value="refactor">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refactor
            </TabsTrigger>
            <TabsTrigger value="convert">
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Convert
            </TabsTrigger>
            <TabsTrigger value="tests">
              <TestTube2 className="h-4 w-4 mr-2" />
              Generate Tests
            </TabsTrigger>
            <TabsTrigger value="execute">
              <Play className="h-4 w-4 mr-2" />
              Execute
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
                  <CardDescription>Configure code generation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Requirements *</label>
                    <Textarea
                      placeholder="Describe what the code should do..."
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                      rows={6}
                      className="resize-none font-mono text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Language</label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="python">Python</SelectItem>
                          <SelectItem value="javascript">JavaScript</SelectItem>
                          <SelectItem value="typescript">TypeScript</SelectItem>
                          <SelectItem value="java">Java</SelectItem>
                          <SelectItem value="go">Go</SelectItem>
                          <SelectItem value="rust">Rust</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Style</label>
                      <Select value={style} onValueChange={setStyle}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clean">Clean</SelectItem>
                          <SelectItem value="functional">Functional</SelectItem>
                          <SelectItem value="object-oriented">OOP</SelectItem>
                          <SelectItem value="minimal">Minimal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Max Complexity</label>
                    <Select value={maxComplexity} onValueChange={setMaxComplexity}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="complex">Complex</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="comments" checked={includeComments} onChange={(e) => setIncludeComments(e.target.checked)} className="rounded" />
                      <label htmlFor="comments" className="text-sm font-medium">Include Comments</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="tests" checked={includeTests} onChange={(e) => setIncludeTests(e.target.checked)} className="rounded" />
                      <label htmlFor="tests" className="text-sm font-medium">Include Tests</label>
                    </div>
                  </div>

                  <Button onClick={handleGenerate} disabled={loading || !requirements.trim()} className="w-full pulse-glow">
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><Code className="mr-2 h-4 w-4" />Generate Code</>}
                  </Button>

                  {generatedCode && (
                    <Button onClick={handleReview} disabled={reviewing} variant="outline" className="w-full">
                      {reviewing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reviewing...</> : <><Sparkles className="mr-2 h-4 w-4" />Review Code</>}
                    </Button>
                  )}
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Generated Code</CardTitle>
                  <CardDescription>{generatedCode ? `Generated ${language} code` : "Code will appear here"}</CardDescription>
                </CardHeader>
                <CardContent>
                  {generatedCode ? (
                    <div className="space-y-4">
                      <CodeBlock code={generatedCode} />
                      {review && (
                        <Card className="mt-6 border-indigo-500/30">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                              Code Review
                              <span className="ml-auto text-sm font-normal">Rating: {review.rating}/10</span>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4 text-sm">
                            {review.issues?.length > 0 && (
                              <div>
                                <p className="font-medium mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500" />Issues</p>
                                <ul className="list-disc list-inside space-y-1 text-zinc-400">{review.issues.map((issue: string, i: number) => <li key={i}>{issue}</li>)}</ul>
                              </div>
                            )}
                            {review.suggestions?.length > 0 && (
                              <div>
                                <p className="font-medium mb-2">Suggestions</p>
                                <ul className="list-disc list-inside space-y-1 text-zinc-400">{review.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500/20 to-emerald-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center mx-auto mb-4">
                        <Code className="h-8 w-8 text-indigo-500" />
                      </div>
                      <p className="text-sm text-zinc-400">Enter requirements and click generate!</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Explain Tab */}
          <TabsContent value="explain">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Code to Explain</CardTitle>
                  <CardDescription>Paste code and get a detailed explanation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea placeholder="Paste your code here..." value={explainCode} onChange={(e) => setExplainCode(e.target.value)} rows={12} className="font-mono text-sm" />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Detail Level</label>
                    <Select value={explainLevel} onValueChange={setExplainLevel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="brief">Brief</SelectItem>
                        <SelectItem value="detailed">Detailed</SelectItem>
                        <SelectItem value="line-by-line">Line-by-Line</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleExplain} disabled={explaining || !explainCode.trim()} className="w-full pulse-glow">
                    {explaining ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Explaining...</> : <><FileText className="mr-2 h-4 w-4" />Explain Code</>}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Explanation</CardTitle>
                </CardHeader>
                <CardContent>
                  {explanation ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                      <MarkdownRenderer>{explanation}</MarkdownRenderer>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-zinc-400">Explanation will appear here</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Refactor Tab */}
          <TabsContent value="refactor">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Code to Refactor</CardTitle>
                  <CardDescription>Enter code and your refactoring goals</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea placeholder="Paste your code here..." value={refactorCode} onChange={(e) => setRefactorCode(e.target.value)} rows={10} className="font-mono text-sm" />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Refactoring Goals (comma-separated)</label>
                    <Input placeholder="e.g., improve readability, add error handling, optimize performance" value={refactorGoals} onChange={(e) => setRefactorGoals(e.target.value)} />
                  </div>
                  <Button onClick={handleRefactor} disabled={refactoring || !refactorCode.trim() || !refactorGoals.trim()} className="w-full pulse-glow">
                    {refactoring ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Refactoring...</> : <><RefreshCw className="mr-2 h-4 w-4" />Refactor Code</>}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Refactored Code</CardTitle>
                </CardHeader>
                <CardContent>
                  {refactoredCode ? <CodeBlock code={refactoredCode} /> : <div className="py-12 text-center text-zinc-400">Refactored code will appear here</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Convert Tab */}
          <TabsContent value="convert">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Code to Convert</CardTitle>
                  <CardDescription>Convert code between programming languages</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea placeholder="Paste your code here..." value={convertCode} onChange={(e) => setConvertCode(e.target.value)} rows={10} className="font-mono text-sm" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">From</label>
                      <Select value={sourceLang} onValueChange={setSourceLang}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="python">Python</SelectItem>
                          <SelectItem value="javascript">JavaScript</SelectItem>
                          <SelectItem value="typescript">TypeScript</SelectItem>
                          <SelectItem value="java">Java</SelectItem>
                          <SelectItem value="go">Go</SelectItem>
                          <SelectItem value="rust">Rust</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">To</label>
                      <Select value={targetLang} onValueChange={setTargetLang}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="python">Python</SelectItem>
                          <SelectItem value="javascript">JavaScript</SelectItem>
                          <SelectItem value="typescript">TypeScript</SelectItem>
                          <SelectItem value="java">Java</SelectItem>
                          <SelectItem value="go">Go</SelectItem>
                          <SelectItem value="rust">Rust</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleConvert} disabled={converting || !convertCode.trim()} className="w-full pulse-glow">
                    {converting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Converting...</> : <><ArrowRightLeft className="mr-2 h-4 w-4" />Convert Code</>}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Converted Code ({targetLang})</CardTitle>
                </CardHeader>
                <CardContent>
                  {convertedCode ? <CodeBlock code={convertedCode} /> : <div className="py-12 text-center text-zinc-400">Converted code will appear here</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Generate Tests Tab */}
          <TabsContent value="tests">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Code to Test</CardTitle>
                  <CardDescription>Generate unit tests for your code</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea placeholder="Paste your code here..." value={testCode} onChange={(e) => setTestCode(e.target.value)} rows={10} className="font-mono text-sm" />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Test Framework</label>
                    <Select value={testFramework} onValueChange={setTestFramework}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pytest">Pytest</SelectItem>
                        <SelectItem value="unittest">Unittest</SelectItem>
                        <SelectItem value="jest">Jest</SelectItem>
                        <SelectItem value="mocha">Mocha</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleGenerateTests} disabled={generatingTests || !testCode.trim()} className="w-full pulse-glow">
                    {generatingTests ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating Tests...</> : <><TestTube2 className="mr-2 h-4 w-4" />Generate Tests</>}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Generated Tests</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {generatedTests.length > 0 ? (
                    generatedTests.map((test, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span className="font-medium text-sm">{test.test_name}</span>
                        </div>
                        <p className="text-xs text-zinc-400">{test.description}</p>
                        <CodeBlock code={test.test_code} />
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-zinc-400">Generated tests will appear here</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Execute Tab */}
          <TabsContent value="execute">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Python Code</CardTitle>
                  <CardDescription>Execute Python code and see the output</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea placeholder="Enter Python code to execute..." value={executeCodeInput} onChange={(e) => setExecuteCodeInput(e.target.value)} rows={12} className="font-mono text-sm" />
                  <Button onClick={handleExecute} disabled={executing || !executeCodeInput.trim()} className="w-full pulse-glow">
                    {executing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Executing...</> : <><Play className="mr-2 h-4 w-4" />Execute Code</>}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Output</CardTitle>
                </CardHeader>
                <CardContent>
                  {executeResult ? (
                    <div className="space-y-4">
                      <div className={`p-3 rounded-lg ${executeResult.success ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/20 border border-red-500/30'}`}>
                        <span className={`text-sm font-medium ${executeResult.success ? 'text-green-400' : 'text-red-400'}`}>
                          {executeResult.success ? '✅ Execution Successful' : '❌ Execution Failed'}
                        </span>
                        <span className="text-xs text-zinc-400 ml-2">(Exit code: {executeResult.return_code})</span>
                      </div>
                      {executeResult.stdout && (
                        <div>
                          <p className="text-sm font-medium mb-2 text-green-400">stdout:</p>
                          <pre className="p-3 rounded-lg bg-zinc-900 text-sm text-zinc-100 font-mono overflow-x-auto">{executeResult.stdout}</pre>
                        </div>
                      )}
                      {executeResult.stderr && (
                        <div>
                          <p className="text-sm font-medium mb-2 text-red-400">stderr:</p>
                          <pre className="p-3 rounded-lg bg-zinc-900 text-sm text-red-300 font-mono overflow-x-auto">{executeResult.stderr}</pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-zinc-400">Execution results will appear here</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
