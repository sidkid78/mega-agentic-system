"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import { WorkflowVisualizer, WorkflowType } from "@/components/workflow-visualizer"
import { WorkflowCard } from "@/components/workflow-card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeToggle } from "@/components/theme-toggle"
import { 
  ArrowLeft, 
  Settings, 
  Workflow, 
  Box, 
  Zap, 
  GitMerge, 
  Layers, 
  Search,
  MessageSquare,
  Users,
  Handshake,
  Swords,
  Brain,
  Trophy,
  HelpCircle,
  RotateCcw,
  Activity,
  Eye
} from "lucide-react"

const WORKFLOW_DATA: Record<WorkflowType, { 
  title: string, 
  description: string, 
  useCases: string[], 
  pros: string[], 
  cons: string[], 
  complexity: "Low" | "Medium" | "High" | "Ultra" 
}> = {
  chain: {
    title: "Prompt Chaining",
    description: "The most fundamental pattern: a sequence of LLM calls where the output of one step becomes the input for the next.",
    useCases: ["Document summarization and translation", "Multi-step reasoning", "Iterative content refinement"],
    pros: ["Predictable & easy to debug", "Lower latency per step", "Simple to implement"],
    cons: ["Fragile (error propagates)", "Rigid execution path", "Sub-optimal for complex branching"],
    complexity: "Low"
  },
  routing: {
    title: "Intelligent Routing",
    description: "Input is analyzed by a classifier agent and directed to a specialized model or prompt designed for that specific task.",
    useCases: ["Customer support triaging", "Multi-language handling", "Domain-specific expertise selection"],
    pros: ["High precision", "Cost-effective (use small models for easy tasks)", "Highly scalable"],
    cons: ["Classifier is a single point of failure", "Increased first-token latency", "Requires specialized prompts"],
    complexity: "Medium"
  },
  parallel: {
    title: "Parallel Execution",
    description: "A task is decomposed into independent sub-tasks executed concurrently, then aggregated into a final result.",
    useCases: ["Multi-source research", "Concurrent code file auditing", "Ensemble polling (majority vote)"],
    pros: ["Significant speed gains", "Diverse perspective blending", "Fault tolerance"],
    cons: ["Complex state management", "Hard to debug race conditions", "Aggregation logic can be tricky"],
    complexity: "Medium"
  },
  orchestrator: {
    title: "Orchestrator-Workers",
    description: "A central 'Manager' agent analyzes input, dynamically allocates tasks to specialized workers, and integrates their outputs.",
    useCases: ["Autonomous engineering projects", "Complex report generation", "Ad-hoc task automation"],
    pros: ["Extremely flexible", "Handles ambiguous goals locally", "Excellent for complex problem solving"],
    cons: ["High token consumption", "Prone to infinite loops if not capped", "Sophisticated orchestration logic required"],
    complexity: "High"
  },
  evaluator: {
    title: "Evaluator-Optimizer",
    description: "An iterative loop involving a Generator and an Evaluator. The Evaluator provides critical feedback until criteria are met.",
    useCases: ["Code optimization", "Creative writing high-fidelity", "Strategic planning refinement"],
    pros: ["Guaranteed quality bar", "Self-correcting mechanism", "Very high reliability"],
    cons: ["High latency (iterative)", "Costly (multiple round-trips)", "Can get stuck in local optima"],
    complexity: "High"
  },
  orch5: {
    title: "Multi-Team Orch (orch5)",
    description: "Advanced hierarchical orchestration using MultiTeamOrchestrator, Team Leads, and specialized Worker agents with persistent mental models.",
    useCases: ["Large-scale software engineering", "Enterprise-grade RAG pipelines", "Multi-domain project management"],
    pros: ["Unmatched scalability", "Domain isolation & safety", "Persistent expertise accumulation"],
    cons: ["Extremely complex architecture", "High overhead for simple tasks", "Requires robust configuration & infra"],
    complexity: "Ultra"
  },
  swarm: {
    title: "Swarm Intelligence",
    description: "A large number of simple agents collaborate in a decentralized manner, mimicking nature to explore massive search spaces.",
    useCases: ["Market sentiment analysis", "Large-scale code refactoring", "High-diversity creative brainstorming"],
    pros: ["Highly resilient", "Emergent problem solving", "Massive parallel throughput"],
    cons: ["Hard to steer precisely", "High token noise", "Aggregation of 50+ responses is difficult"],
    complexity: "High"
  },
  debate: {
    title: "Adversarial Debate",
    description: "Multiple agents with different personas or perspectives argue their positions to a judge, who synthesizes the best solution.",
    useCases: ["Critical policy analysis", "Scientific hypothesis testing", "Strategic risk assessment"],
    pros: ["Reduces model hallucination", "Exposes hidden assumptions", "Balanced decision making"],
    cons: ["Slower consensus", "Adversarial tone can be tricky", "Requires strong judge model"],
    complexity: "High"
  },
  negotiate: {
    title: "Negotiation Agents",
    description: "Agents represent different stakeholders with specific interests, negotiating to find a utility-maximizing agreement.",
    useCases: ["Supply chain optimization", "Resource allocation", "Legal term settlement"],
    pros: ["Fairness by design", "Handles competing constraints", "Optimizes for multi-party utility"],
    cons: ["Can stall in stalemate", "Requires complex utility modeling", "Negotiation rounds add latency"],
    complexity: "High"
  },
  red_blue: {
    title: "Red/Blue Teaming",
    description: "One agent (Red) attempts to break or find flaws in a solution, while another (Blue) improves it. Repeat until hardened.",
    useCases: ["Security protocol hardening", "Prompt injection testing", "Robust code generation"],
    pros: ["Exceptional security posture", "Finds obscure edge cases", "Self-refining robustness"],
    cons: ["Computationally expensive", "Red team needs high skill/variety", "Can lead to over-engineering"],
    complexity: "High"
  },
  socratic: {
    title: "Socratic Reasoning",
    description: "A questioner agent uses deep, iterative probing to challenge assumptions and force the thinker agent into breakthroughs.",
    useCases: ["Complex bug root-cause analysis", "Philosophical exploration", "Deep technical debugging"],
    pros: ["Uncovers 'unknown unknowns'", "High-fidelity reasoning", "Educational for the user"],
    cons: ["Very high latency", "Requires specialized 'Questioner' logic", "Can be frustratingly pedantic"],
    complexity: "High"
  },
  meta_learning: {
    title: "Meta-Learning",
    description: "The system monitors its own performance across multiple strategies (Direct vs. COT vs. Few-Shot) and selects the best one.",
    useCases: ["Dynamic production pipelines", "Self-optimizing RAG", "Automated prompt engineering"],
    pros: ["Always uses the best tool", "Reduces manual tuning", "Improves over time autonomously"],
    cons: ["Extremely high complexity", "Meta-overhead cost", "Requires significant historical data"],
    complexity: "Ultra"
  },
  reflective: {
    title: "Reflective Execution",
    description: "An agent recursively improves its own output by generating, critiquing, and refining in an autonomous loop.",
    useCases: ["Quality-critical document drafting", "Complex code refactoring", "Self-correcting reasoning"],
    pros: ["Autonomous quality assurance", "No external evaluator needed", "Iterative refinement"],
    cons: ["High token usage", "Can converge on local optima", "Latency increases with cycles"],
    complexity: "High"
  },
  background: {
    title: "Background Monitoring",
    description: "Autonomous agents that run continuously in the background, monitoring system state and adapting to environmental triggers.",
    useCases: ["Anomaly detection", "Continuous data sync", "Autonomous system maintenance"],
    pros: ["Low touch / set-and-forget", "Immediate response to events", "Continuous operations"],
    cons: ["Hard to observe in real-time", "Requires robust safety guardrails", "Can waste tokens if not tuned"],
    complexity: "High"
  }
}

export default function WorkflowsPage() {
  const [activeType, setActiveType] = useState<WorkflowType>("chain")

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div className="mega-bg fixed inset-0" />
      
      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <header className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/" className="p-3 rounded-xl glass-card hover:bg-white/10 transition-colors group">
              <ArrowLeft className="w-5 h-5 text-zinc-400 group-hover:text-white" />
            </a>
            <div className="space-y-1">
              <h1 className="text-4xl font-bold tracking-tight gradient-text">
                AGENCY WORKFLOW HUB
              </h1>
              <p className="text-zinc-500 font-mono text-xs tracking-widest uppercase">
                Interactive Multi-Pattern Orchestration Demo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 rounded-xl glass-card border border-indigo-500/20 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500 pulse-glow" />
              <span className="text-xs font-bold text-indigo-400">ENGINEERING MODE</span>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Visualizer Area */}
          <div className="lg:col-span-8 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-200/20 dark:border-zinc-800/20">
                <div className="flex items-center gap-2">
                  <Workflow className="w-4 h-4 text-indigo-500" />
                  <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Live Visualisation</h2>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500 uppercase">
                  <span>Latency: Optimized</span>
                  <span className="text-emerald-500">Stability: 99.9%</span>
                </div>
              </div>
              
              <WorkflowVisualizer type={activeType} />
            </div>

            {/* Pattern Selector */}
            <div className="space-y-4">
               <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 pl-1">Select Architecture Pattern</h3>
               <Tabs 
                value={activeType} 
                onValueChange={(v) => setActiveType(v as WorkflowType)}
                className="w-full"
               >
                 <TabsList className="glass-card p-1 gap-1 h-auto flex flex-wrap justify-start">
                   <TabsTrigger value="chain" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-indigo-500/20">
                     <Zap className="w-3.5 h-3.5" /> Chain
                   </TabsTrigger>
                   <TabsTrigger value="routing" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-emerald-500/20">
                     <Settings className="w-3.5 h-3.5" /> Routing
                   </TabsTrigger>
                   <TabsTrigger value="parallel" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-blue-500/20">
                     <GitMerge className="w-3.5 h-3.5" /> Parallel
                   </TabsTrigger>
                   <TabsTrigger value="orchestrator" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-amber-500/20">
                     <Workflow className="w-3.5 h-3.5" /> Orchestrator
                   </TabsTrigger>
                   <TabsTrigger value="evaluator" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-cyan-500/20">
                     <MessageSquare className="w-3.5 h-3.5" /> Evaluator
                   </TabsTrigger>
                   <TabsTrigger value="orch5" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-magenta-500/20">
                     <Layers className="w-3.5 h-3.5" /> Orch5
                   </TabsTrigger>
                   <TabsTrigger value="swarm" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-purple-500/20">
                     <Users className="w-3.5 h-3.5" /> Swarm
                   </TabsTrigger>
                   <TabsTrigger value="debate" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-rose-500/20">
                     <MessageSquare className="w-3.5 h-3.5" /> Debate
                   </TabsTrigger>
                   <TabsTrigger value="negotiate" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-emerald-500/20">
                     <Handshake className="w-3.5 h-3.5" /> Negotiate
                   </TabsTrigger>
                   <TabsTrigger value="red_blue" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-red-600/20">
                     <Swords className="w-3.5 h-3.5" /> Red/Blue
                   </TabsTrigger>
                   <TabsTrigger value="socratic" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-indigo-600/20">
                     <HelpCircle className="w-3.5 h-3.5" /> Socratic
                   </TabsTrigger>
                   <TabsTrigger value="meta_learning" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-blue-600/20">
                     <Trophy className="w-3.5 h-3.5" /> Meta
                   </TabsTrigger>
                   <TabsTrigger value="reflective" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-orange-500/20">
                     <RotateCcw className="w-3.5 h-3.5" /> Reflective
                   </TabsTrigger>
                   <TabsTrigger value="background" className="px-4 py-2.5 text-xs font-bold gap-2 data-[state=active]:bg-zinc-500/20">
                     <Activity className="w-3.5 h-3.5" /> Background
                   </TabsTrigger>
                 </TabsList>
               </Tabs>
            </div>
          </div>

          {/* Sidebar / Info Area */}
          <div className="lg:col-span-4 space-y-6">
            <motion.div
              key={activeType}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <WorkflowCard {...WORKFLOW_DATA[activeType]} />
            </motion.div>

            {/* Quick Actions / Integration */}
            <div className="glass-card p-6 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Toolkit Integration</h4>
              <div className="grid grid-cols-2 gap-3">
                <button className="flex flex-col items-center justify-center p-4 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 hover:bg-white/5 transition-all group">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Zap className="w-4 h-4 text-indigo-500" />
                  </div>
                  <span className="text-[10px] font-bold text-zinc-500 group-hover:text-white transition-colors">API Keys</span>
                </button>
                <button className="flex flex-col items-center justify-center p-4 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 hover:bg-white/5 transition-all group">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Layers className="w-4 h-4 text-emerald-500" />
                  </div>
                  <span className="text-[10px] font-bold text-zinc-500 group-hover:text-white transition-colors">Templates</span>
                </button>
              </div>
              <button className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
                Deploy Selected Pattern
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
