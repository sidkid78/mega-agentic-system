"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertCircle, Zap, Shield } from "lucide-react"

interface WorkflowCardProps {
  title: string
  description: string
  useCases: string[]
  pros: string[]
  cons: string[]
  complexity: "Low" | "Medium" | "High" | "Ultra"
}

export function WorkflowCard({ 
  title, 
  description, 
  useCases, 
  pros, 
  cons, 
  complexity 
}: WorkflowCardProps) {
  const complexityColor = {
    Low: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    Medium: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    High: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    Ultra: "bg-magenta-500/10 text-magenta-500 border-magenta-500/20",
  }[complexity]

  return (
    <Card className="glass-card border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden group">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between mb-2">
          <Badge variant="outline" className={`${complexityColor} font-mono tracking-tighter`}>
            {complexity} Complexity
          </Badge>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold gradient-text">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed italic">
          "{description}"
        </p>

        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
            <Zap className="w-3 h-3" /> Core Use Cases
          </h4>
          <ul className="grid grid-cols-1 gap-2">
            {useCases.map((uc, i) => (
              <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300 flex items-start gap-2">
                <span className="text-indigo-500 mt-1">•</span> {uc}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-200/30 dark:border-zinc-800/30">
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Strengths
            </h4>
            <div className="space-y-1">
              {pros.map((p, i) => (
                <p key={i} className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                   {p}
                </p>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Trade-offs
            </h4>
            <div className="space-y-1">
              {cons.map((c, i) => (
                <p key={i} className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                  {c}
                </p>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
