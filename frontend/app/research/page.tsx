"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiClient } from "@/lib/api"
import { Loader2, Search, MessageSquare, BookOpen, Send } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { MarkdownRenderer } from "@/components/markdown-renderer"

export default function ResearchPage() {
  const [requestType, setRequestType] = useState<"research" | "rag_query" | "chat">("chat")
  const [query, setQuery] = useState("")
  const [question, setQuestion] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<string | null>(null)
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    let input = ""
    if (requestType === "research") {
      input = query
      if (!input.trim()) return
    } else if (requestType === "rag_query") {
      input = question
      if (!input.trim()) return
    } else {
      input = message
      if (!input.trim()) return
    }

    setLoading(true)
    setError(null)

    // Add user message to chat history for chat mode
    if (requestType === "chat") {
      setChatHistory((prev) => [...prev, { role: "user", content: input }])
      setMessage("")
    }

    try {
      const result = await apiClient.researchQuery({
        request_type: requestType,
        query: requestType === "research" ? input : undefined,
        question: requestType === "rag_query" ? input : undefined,
        message: requestType === "chat" ? input : undefined,
      })

      const responseText = result.response || result.answer || ""
      setResponse(responseText)

      // Add assistant response to chat history for chat mode
      if (requestType === "chat") {
        setChatHistory((prev) => [...prev, { role: "assistant", content: responseText }])
      }
    } catch (err: any) {
      setError(err.message || "Failed to process request")
    } finally {
      setLoading(false)
    }
  }

  const getCurrentInput = () => {
    if (requestType === "research") return query
    if (requestType === "rag_query") return question
    return message
  }

  const setCurrentInput = (value: string) => {
    if (requestType === "research") setQuery(value)
    else if (requestType === "rag_query") setQuestion(value)
    else setMessage(value)
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background */}
      <div className="mega-bg fixed inset-0" />
      
      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text mb-2">
              🔬 Research Platform
            </h1>
            <p className="text-lg text-zinc-700 dark:text-zinc-300">
              AI-powered research, RAG queries, and conversational chat
            </p>
          </div>
          <ThemeToggle />
        </div>

        <Tabs value={requestType} onValueChange={(v) => setRequestType(v as any)} className="space-y-6">
          <TabsList className="glass-card p-1.5 gap-1">
            <TabsTrigger value="chat">
              <MessageSquare className="mr-2 h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="research">
              <Search className="mr-2 h-4 w-4" />
              Research
            </TabsTrigger>
            <TabsTrigger value="rag_query">
              <BookOpen className="mr-2 h-4 w-4" />
              RAG Query
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Chat Assistant</CardTitle>
                  <CardDescription>
                    Have a conversation with the AI research assistant
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="chat-message" className="text-sm font-medium">
                      Message
                    </label>
                    <Textarea
                      id="chat-message"
                      placeholder="Type your message..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={6}
                      className="resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          handleSubmit()
                        }
                      }}
                    />
                  </div>
                  <Button
                    onClick={handleSubmit}
                    disabled={loading || !message.trim()}
                    className="w-full pulse-glow"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send Message
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Conversation</CardTitle>
                  <CardDescription>
                    {chatHistory.length > 0
                      ? `${chatHistory.length} message(s)`
                      : "Start a conversation"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {chatHistory.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500/20 to-emerald-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="h-8 w-8 text-indigo-500" />
                      </div>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        No messages yet. Start chatting!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[600px] overflow-y-auto">
                      {chatHistory.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-4 ${
                              msg.role === "user"
                                ? "bg-indigo-500/20 text-indigo-900 dark:text-indigo-100"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                            }`}
                          >
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <MarkdownRenderer>{msg.content}</MarkdownRenderer>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="research" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Research Query</CardTitle>
                <CardDescription>
                  Execute a research task using the AI orchestrator
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="research-query" className="text-sm font-medium">
                    Research Query *
                  </label>
                  <Textarea
                    id="research-query"
                    placeholder="Enter your research query..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    rows={6}
                    className="resize-none"
                  />
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={loading || !query.trim()}
                  className="w-full pulse-glow"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Researching...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Execute Research
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {response && (
              <Card>
                <CardHeader>
                  <CardTitle>Research Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:bg-gradient-to-r prose-headings:from-indigo-600 prose-headings:to-emerald-600 prose-headings:bg-clip-text prose-headings:text-transparent">
                    <MarkdownRenderer>{response}</MarkdownRenderer>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="rag_query" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>RAG Query</CardTitle>
                <CardDescription>
                  Ask questions using the Retrieval-Augmented Generation system
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="rag-question" className="text-sm font-medium">
                    Question *
                  </label>
                  <Textarea
                    id="rag-question"
                    placeholder="Enter your question..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={6}
                    className="resize-none"
                  />
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={loading || !question.trim()}
                  className="w-full pulse-glow"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Ask Question
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {response && (
              <Card>
                <CardHeader>
                  <CardTitle>Answer</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:bg-gradient-to-r prose-headings:from-indigo-600 prose-headings:to-emerald-600 prose-headings:bg-clip-text prose-headings:text-transparent">
                    <MarkdownRenderer>{response}</MarkdownRenderer>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {error && (
            <Card className="border-red-500/30">
              <CardContent className="pt-6">
                <div className="rounded-lg bg-red-500/20 border border-red-500/30 dark:border-red-500/20 p-4">
                  <p className="text-sm text-red-900 dark:text-red-100">{error}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </Tabs>
      </div>
    </div>
  )
}
