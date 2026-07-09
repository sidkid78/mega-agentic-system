"use client"

import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Loader2, Check, Copy } from "lucide-react"

// Dynamic Mermaid Component
let mermaidLoaded = false
let mermaidInstance: typeof import("mermaid").default | null = null

function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted || !ref.current) return

    const loadAndRender = async () => {
      try {
        setError(null)
        if (!mermaidLoaded) {
          const m = (await import("mermaid")).default
          m.initialize({
            startOnLoad: false,
            theme: "dark",
            securityLevel: "loose",
            fontFamily: "var(--font-geist-sans), sans-serif",
          })
          mermaidInstance = m
          mermaidLoaded = true
        }

        const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`
        // Standardize newlines and trim whitespace
        const cleanChart = chart.replace(/\\n/g, "\n").trim()

        if (!mermaidInstance) {
          throw new Error("Mermaid is not loaded")
        }

        const { svg: renderedSvg } = await mermaidInstance.render(id, cleanChart)
        setSvg(renderedSvg)
      } catch (err) {
        console.error("Mermaid parsing error:", err)
        setError("Failed to render Mermaid diagram. Please check syntax.")
      }
    }

    loadAndRender()
  }, [chart, isMounted])

  if (!isMounted) return null

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-mono text-red-500 overflow-auto my-4">
        <p className="font-bold mb-1">Mermaid Syntax Error</p>
        <pre className="mt-2 opacity-75 max-w-full overflow-x-auto whitespace-pre">{chart}</pre>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-500 text-xs border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl my-4">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Rendering diagram...
      </div>
    )
  }

  return (
    <div 
      ref={ref} 
      className="mermaid-chart flex justify-center overflow-auto p-6 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 my-6 shadow-sm"
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  )
}

// Reusable Copy Button Component
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy text:", err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
      title="Copy code"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

interface MarkdownRendererProps {
  children: string
}

export function MarkdownRenderer({ children }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Table element overrides for premium aesthetics
        table: ({ children }) => (
          <div className="my-6 w-full overflow-x-auto rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
            <table className="w-full text-left text-sm border-collapse">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200/50 dark:border-zinc-800/50 text-zinc-700 dark:text-zinc-300 font-semibold">
            {children}
          </thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-zinc-200/30 dark:divide-zinc-800/30">
            {children}
          </tbody>
        ),
        tr: ({ children }) => (
          <tr className="hover:bg-zinc-50/40 dark:hover:bg-zinc-900/40 transition-colors">
            {children}
          </tr>
        ),
        th: ({ children }) => (
          <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
            {children}
          </td>
        ),
        // Custom code rendering for Mermaid diagrams and code blocks
        code: ({ className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || "")
          const codeStr = String(children).replace(/\n$/, "")

          if (match && match[1] === "mermaid") {
            return <Mermaid chart={codeStr} />
          }

          // Inline code styling
          const inline = !className
          if (inline) {
            return (
              <code className="bg-zinc-100 dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                {children}
              </code>
            )
          }

          // Block code styling with header and Copy Button
          return (
            <div className="relative group my-4 rounded-xl overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50">
              <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200/50 dark:border-zinc-800/50 text-xs text-zinc-400 font-mono">
                <span>{match ? match[1] : "code"}</span>
                <CopyButton value={codeStr} />
              </div>
              <pre className="p-4 overflow-auto text-xs bg-zinc-950 text-zinc-100 dark:bg-zinc-900/30 font-mono leading-relaxed max-h-[400px]">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            </div>
          )
        }
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
