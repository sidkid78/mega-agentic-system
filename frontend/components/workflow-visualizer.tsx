"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Bot, 
  Cpu, 
  Layers, 
  Network, 
  RefreshCw, 
  GitBranch, 
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Users,
  Handshake,
  Swords,
  Brain,
  Trophy,
  HelpCircle,
  MessageCircle,
  RotateCcw,
  Activity,
  Eye,
  Search,
  Zap,
  Box
} from "lucide-react"

export type WorkflowType = 
  | "chain" 
  | "routing" 
  | "parallel" 
  | "orchestrator" 
  | "evaluator" 
  | "orch5"
  | "swarm"
  | "debate"
  | "negotiate"
  | "red_blue"
  | "socratic"
  | "meta_learning"
  | "reflective"
  | "background"

interface WorkflowVisualizerProps {
  type: WorkflowType
}

export function WorkflowVisualizer({ type }: WorkflowVisualizerProps) {
  return (
    <div className="relative w-full aspect-video glass-card rounded-2xl overflow-hidden flex items-center justify-center p-8">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-10" 
           style={{ backgroundImage: 'radial-gradient(circle, #6366f1 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      <div className="relative z-10 w-full h-full flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={type}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.4 }}
            className="w-full h-full"
          >
            {renderWorkflow(type)}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function renderWorkflow(type: WorkflowType) {
  switch (type) {
    case "chain": return <ChainVisualizer />
    case "routing": return <RoutingVisualizer />
    case "parallel": return <ParallelVisualizer />
    case "orchestrator": return <OrchestratorVisualizer />
    case "evaluator": return <EvaluatorVisualizer />
    case "orch5": return <Orch5Visualizer />
    case "swarm": return <SwarmVisualizer />
    case "debate": return <DebateVisualizer />
    case "negotiate": return <NegotiationVisualizer />
    case "red_blue": return <RedBlueVisualizer />
    case "socratic": return <SocraticVisualizer />
    case "meta_learning": return <MetaLearningVisualizer />
    case "reflective": return <ReflectiveVisualizer />
    case "background": return <BackgroundVisualizer />
  }
}

// ── Common Components ────────────────────────────────────────────────────────

const Node = ({ icon: Icon, label, color = "indigo", delay = 0 }: any) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5 }}
    className="flex flex-col items-center gap-3"
  >
    <div className={`p-4 rounded-xl glass-card border border-${color}-500/30 flex items-center justify-center relative group overflow-hidden`}>
      <div className={`absolute inset-0 bg-${color}-500/10 opacity-0 group-hover:opacity-100 transition-opacity`} />
      <Icon className={`w-8 h-8 text-${color}-500 relative z-10`} />
      <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-${color}-500 pulse-glow`} />
    </div>
    <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
  </motion.div>
)

const ConnectionLine = ({ length = 100, horizontal = true, delay = 0, animated = true }: any) => (
  <div className={`flex items-center justify-center ${horizontal ? 'h-full' : 'w-full'}`}>
    <div className={`relative ${horizontal ? `w-[${length}px] h-[2px]` : `h-[${length}px] w-[2px]`} bg-zinc-800`}>
      {animated && (
        <motion.div
          initial={horizontal ? { left: "-100%" } : { top: "-100%" }}
          animate={horizontal ? { left: "100%" } : { top: "100%" }}
          transition={{ 
            repeat: Infinity, 
            duration: 2, 
            delay,
            ease: "linear"
          }}
          className={`absolute ${horizontal ? 'h-full w-20' : 'w-full h-20'} bg-gradient-to-r from-transparent via-indigo-500 to-transparent`}
        />
      )}
    </div>
  </div>
)

// ── Specific Visualizers ─────────────────────────────────────────────────────

function ChainVisualizer() {
  return (
    <div className="flex items-center justify-center gap-4 h-full">
      <Node icon={Bot} label="Input Analysis" delay={0.1} />
      <ConnectionLine length={80} delay={0.2} />
      <Node icon={Cpu} label="Data Processing" color="emerald" delay={0.3} />
      <ConnectionLine length={80} delay={0.4} />
      <Node icon={CheckCircle2} label="Final Response" color="blue" delay={0.5} />
    </div>
  )
}

function RoutingVisualizer() {
  return (
    <div className="flex items-center justify-center gap-8 h-full">
      <Node icon={Network} label="Classifier" delay={0.1} />
      <div className="flex flex-col gap-12">
        <div className="flex items-center">
          <ConnectionLine length={60} delay={0.2} />
          <Node icon={Cpu} label="Code Expert" color="emerald" delay={0.3} />
        </div>
        <div className="flex items-center">
          <ConnectionLine length={60} delay={0.4} />
          <Node icon={Layers} label="Creative Expert" color="magenta" delay={0.5} />
        </div>
        <div className="flex items-center">
          <ConnectionLine length={60} delay={0.6} />
          <Node icon={ShieldCheck} label="Security Audit" color="red" delay={0.7} />
        </div>
      </div>
    </div>
  )
}

function ParallelVisualizer() {
  return (
    <div className="flex items-center justify-center gap-4 h-full">
      <Node icon={Bot} label="Spliter" delay={0.1} />
      <div className="flex flex-col gap-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center">
            <ConnectionLine length={60} delay={0.2 + i * 0.1} />
            <Node icon={Cpu} label={`Worker ${i}`} color="emerald" delay={0.3 + i * 0.1} />
            <ConnectionLine length={60} delay={0.4 + i * 0.1} />
          </div>
        ))}
      </div>
      <Node icon={Layers} label="Aggregator" color="blue" delay={0.8} />
    </div>
  )
}

function OrchestratorVisualizer() {
  return (
    <div className="relative flex items-center justify-center h-full w-full">
      <div className="absolute">
        <Node icon={Network} label="Orchestrator" color="indigo" delay={0.5} />
      </div>
      
      {/* Surrounding workers */}
      {[0, 60, 120, 180, 240, 300].map((angle, i) => (
        <motion.div
          key={angle}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 * i, duration: 0.5 }}
          style={{
            position: 'absolute',
            transform: `rotate(${angle}deg) translateY(-140px) rotate(-${angle}deg)`
          }}
        >
          <Node icon={Cpu} label={`Worker ${i+1}`} color="emerald" />
        </motion.div>
      ))}
    </div>
  )
}

function EvaluatorVisualizer() {
  return (
    <div className="flex items-center justify-center gap-24 h-full">
      <div className="relative flex flex-col items-center">
        <Node icon={Cpu} label="Generator" color="emerald" delay={0.1} />
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
          className="absolute -inset-8 border-2 border-dashed border-emerald-500/20 rounded-full"
        />
      </div>
      
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-4">
           <ArrowRight className="w-6 h-6 text-zinc-600" />
           <span className="text-[10px] font-mono text-indigo-400">PROPOSED OUTPUT</span>
        </div>
        <div className="flex items-center gap-4">
           <motion.div animate={{ x: [-10, 0, -10] }} transition={{ repeat: Infinity, duration: 2 }}>
             <ArrowRight className="w-6 h-6 text-zinc-600 rotate-180" />
           </motion.div>
           <span className="text-[10px] font-mono text-red-400">FEEDBACK LOOP</span>
        </div>
      </div>

      <div className="relative flex flex-col items-center">
        <Node icon={ShieldCheck} label="Evaluator" color="indigo" delay={0.5} />
        <motion.div 
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
          className="absolute -inset-8 border-2 border-dashed border-indigo-500/20 rounded-full"
        />
      </div>
    </div>
  )
}

function Orch5Visualizer() {
  return (
    <div className="flex flex-col items-center justify-center gap-12 h-full">
      <Node icon={Network} label="Multi-Team Orchestrator" color="indigo" delay={0.1} />
      
      <div className="flex gap-20">
        {[
          { label: "Engineering Lead", icon: Cpu, color: "emerald" },
          { label: "Validation Lead", icon: ShieldCheck, color: "blue" }
        ].map((lead, i) => (
          <div key={i} className="flex flex-col items-center gap-10">
            <div className="w-[1px] h-10 bg-indigo-500/30" />
            <Node icon={lead.icon} label={lead.label} color={lead.color} delay={0.3 + i * 0.1} />
            
            <div className="flex gap-8">
              {[1, 2].map((w) => (
                <div key={w} className="flex flex-col items-center gap-6">
                   <div className="w-[1px] h-6 bg-zinc-700" />
                   <Node icon={Bot} label="Worker" color="zinc" delay={0.5 + i * 0.1 + w * 0.1} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SwarmVisualizer() {
  return (
    <div className="relative flex items-center justify-center h-full w-full">
      <div className="absolute z-20">
        <Node icon={Users} label="Swarm Manager" color="indigo" delay={0.1} />
      </div>
      
      {/* Dense cluster of small worker bots */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2
        const radius = 180 + Math.sin(i * 2) * 20
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ 
              opacity: 1, 
              scale: 0.6,
              x: Math.cos(angle) * radius,
              y: Math.sin(angle) * radius
            }}
            transition={{ 
              delay: 0.05 * i, 
              duration: 0.5,
              x: { repeat: Infinity, duration: 2 + Math.random() * 2, repeatType: "reverse" },
              y: { repeat: Infinity, duration: 2 + Math.random() * 2, repeatType: "reverse" }
            }}
            className="absolute"
          >
            <Node icon={Bot} label="" color="emerald" />
            <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full" />
          </motion.div>
        )
      })}

      {/* Connection webs */}
      <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none">
        <motion.circle 
          cx="50%" cy="50%" r="180" 
          fill="none" 
          stroke="indigo" 
          strokeWidth="1" 
          strokeDasharray="5,5"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
        />
      </svg>
    </div>
  )
}

function DebateVisualizer() {
  return (
    <div className="flex flex-col items-center justify-center gap-8 h-full">
      <div className="flex gap-24 items-center mb-8">
        <div className="flex flex-col items-center gap-4">
           <Node icon={MessageCircle} label="Arguer A" color="rose" delay={0.2} />
           <div className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-[8px] font-mono text-rose-400">PERSPECTIVE 01</div>
        </div>
        <div className="flex flex-col items-center gap-4">
           <Node icon={MessageCircle} label="Arguer B" color="blue" delay={0.4} />
           <div className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-[8px] font-mono text-blue-400">PERSPECTIVE 02</div>
        </div>
        <div className="flex flex-col items-center gap-4">
           <Node icon={MessageCircle} label="Arguer C" color="amber" delay={0.6} />
           <div className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[8px] font-mono text-amber-400">PERSPECTIVE 03</div>
        </div>
      </div>

      <div className="relative">
         <motion.div
           animate={{ scale: [1, 1.1, 1] }}
           transition={{ repeat: Infinity, duration: 3 }}
           className="absolute -inset-4 bg-indigo-500/20 blur-2xl rounded-full"
         />
         <Node icon={Layers} label="Consensus Synthesis" color="indigo" delay={1.0} />
      </div>

      {/* Arcs pointing to consensus */}
       <svg viewBox="0 0 1000 1000" className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
          <motion.path 
            d="M 350 300 Q 500 500 500 650" 
            fill="none" stroke="indigo" strokeWidth="2" strokeDasharray="4,4"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.8, duration: 1 }}
          />
          <motion.path 
            d="M 500 300 Q 500 500 500 650" 
            fill="none" stroke="indigo" strokeWidth="2" strokeDasharray="4,4"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.9, duration: 1 }}
          />
          <motion.path 
            d="M 650 300 Q 500 500 500 650" 
            fill="none" stroke="indigo" strokeWidth="2" strokeDasharray="4,4"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.0, duration: 1 }}
          />
       </svg>
    </div>
  )
}

function NegotiationVisualizer() {
  return (
    <div className="flex items-center justify-center gap-16 h-full">
      <div className="flex flex-col gap-12">
         <Node icon={Handshake} label="Stakeholder X" color="emerald" delay={0.2} />
         <Node icon={Handshake} label="Stakeholder Y" color="rose" delay={0.4} />
      </div>

      <div className="flex flex-col items-center gap-6">
        <div className="relative p-6 rounded-full glass-card border border-indigo-500/30">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 10, ease: "linear" }}>
            <Network className="w-12 h-12 text-indigo-500" />
          </motion.div>
          <div className="absolute inset-0 border-2 border-dashed border-indigo-500/20 rounded-full animate-pulse" />
        </div>
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-bold">Negotiation Kernel</span>
      </div>

      <div className="flex flex-col gap-4 items-center">
         <div className="w-32 h-20 glass-card border border-indigo-500/20 rounded-xl p-4 flex flex-col gap-2">
            <div className="w-full h-1 bg-indigo-500/20 rounded overflow-hidden">
               <motion.div animate={{ x: ["-100%", "100%"] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-1/2 h-full bg-indigo-500" />
            </div>
            <div className="text-[8px] font-mono text-zinc-500">OPTIMIZING TERMS...</div>
            <div className="text-[8px] font-mono text-emerald-400 font-bold">MUTUAL SATISFACTION: 85%</div>
         </div>
         <Node icon={CheckCircle2} label="Final Agreement" color="indigo" delay={0.8} />
      </div>
    </div>
  )
}

function RedBlueVisualizer() {
  return (
    <div className="flex flex-col items-center justify-center gap-12 h-full">
      <div className="flex items-center gap-32">
        <div className="relative">
          <Node icon={Swords} label="Red Team" color="rose" delay={0.2} />
          <motion.div 
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute -inset-4 bg-rose-500/20 rounded-xl blur-xl"
          />
        </div>

        <div className="relative">
          <Node icon={ShieldCheck} label="Blue Team" color="blue" delay={0.4} />
          <motion.div 
            animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ repeat: Infinity, duration: 4 }}
            className="absolute -inset-8 border-2 border-blue-500/30 rounded-full"
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-8">
           <motion.div animate={{ x: [-10, 10, -10] }} transition={{ repeat: Infinity, duration: 1.5 }} className="text-rose-500 font-mono text-[10px] font-bold tracking-widest">
              ATTACK VECTOR -&gt;
           </motion.div>
           <motion.div animate={{ x: [10, -10, 10] }} transition={{ repeat: Infinity, duration: 1.5 }} className="text-blue-500 font-mono text-[10px] font-bold tracking-widest">
              &lt;- DEFENSES HARDENING
           </motion.div>
        </div>
        <div className="w-96 h-12 glass-card border border-zinc-800 rounded-lg p-2 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-emerald-500" />
             <span className="text-[8px] font-mono text-zinc-400">Hardenened Output ready for production deployment</span>
           </div>
           <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
      </div>
    </div>
  )
}

function SocraticVisualizer() {
  return (
    <div className="flex items-center justify-center gap-32 h-full">
      <div className="flex flex-col items-center gap-4">
        <Node icon={HelpCircle} label="Questioner" color="indigo" delay={0.2} />
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="p-3 glass-card border border-indigo-500/20 rounded-xl text-[8px] font-mono max-w-[120px]"
        >
          "What assumptions are we making about this system?"
        </motion.div>
      </div>

      <div className="flex flex-col items-center gap-8">
         <div className="flex flex-col gap-2">
            {[3, 2, 1].map((lvl) => (
              <motion.div 
                key={lvl}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 + (3-lvl)*0.3 }}
                className={`px-4 py-1 rounded border ${lvl === 3 ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-zinc-800 text-zinc-600'} text-[8px] font-mono font-bold`}
              >
                LEVEL {lvl} {lvl === 3 ? 'BREAKTHROUGH' : 'PROBING'}
              </motion.div>
            ))}
         </div>
         <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin-slow" />
      </div>

      <div className="flex flex-col items-center gap-4">
        <Node icon={Brain} label="Thinker" color="emerald" delay={0.4} />
        <motion.div
           animate={{ y: [0, 5, 0] }}
           transition={{ repeat: Infinity, duration: 2.5 }}
           className="p-3 glass-card border border-emerald-500/20 rounded-xl text-[8px] font-mono max-w-[120px]"
        >
          "The modularity might be a bottleneck, let me refine."
        </motion.div>
      </div>
    </div>
  )
}

function MetaLearningVisualizer() {
  return (
    <div className="flex flex-col items-center justify-center gap-12 h-full">
      <Node icon={Trophy} label="Meta-Orchestrator" color="indigo" delay={0.1} />
      
      <div className="flex gap-12">
        {['Direct', 'Step-by-Step', 'Creative', 'Analytical'].map((strat, i) => (
          <div key={strat} className="flex flex-col items-center gap-4">
             <div className="w-[1px] h-8 bg-zinc-800" />
             <div className={`p-4 rounded-xl glass-card border ${i === 1 ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 opacity-50'} relative transition-all`}>
                <span className="text-[8px] font-mono font-bold tracking-widest">{strat}</span>
                {i === 1 && (
                  <motion.div 
                    layoutId="best"
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_10px_#10b981]"
                  >
                    <CheckCircle2 className="w-2 h-2 text-white" />
                  </motion.div>
                )}
             </div>
             {i === 1 ? (
               <span className="text-[8px] font-mono text-emerald-400 font-bold">9.2/10 (BEST)</span>
             ) : (
               <span className="text-[8px] font-mono text-zinc-600">7.4/10</span>
             )}
          </div>
        ))}
      </div>

      <div className="px-6 py-2 rounded-full glass-card border border-indigo-500/30 flex items-center gap-3">
         <Brain className="w-4 h-4 text-indigo-400" />
         <span className="text-[10px] font-mono text-indigo-300 font-bold tracking-widest">STRATEGY MODEL UPDATED FROM EXPERIENCE</span>
      </div>
    </div>
  )
}
function ReflectiveVisualizer() {
  return (
    <div className="flex flex-col items-center justify-center gap-12 h-full">
      <div className="flex items-center gap-32">
        <div className="relative">
          <Node icon={Cpu} label="Generator" color="indigo" delay={0.2} />
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
            className="absolute -inset-6 border border-indigo-500/10 rounded-xl"
          />
        </div>

        <div className="relative">
          <Node icon={RotateCcw} label="Reflector" color="rose" delay={0.4} />
          <motion.div 
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute -inset-4 bg-rose-500/5 rounded-full blur-xl"
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-8">
           <motion.div animate={{ x: [-5, 5, -5] }} transition={{ repeat: Infinity, duration: 2 }} className="text-zinc-500 font-mono text-[8px] uppercase tracking-widest">
              Draft Solution
           </motion.div>
           <motion.div animate={{ x: [5, -5, 5] }} transition={{ repeat: Infinity, duration: 2 }} className="text-rose-400 font-mono text-[8px] uppercase tracking-widest font-bold">
              Self-Critique and Improvement
           </motion.div>
        </div>
        
        <div className="relative w-64 h-2 bg-zinc-800 rounded-full overflow-hidden">
           <motion.div 
             animate={{ width: ["0%", "100%"] }}
             transition={{ duration: 3, repeat: Infinity }}
             className="absolute inset-0 bg-emerald-500/50"
           />
           <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[6px] font-bold text-white uppercase tracking-tighter">Quality Convergence</span>
           </div>
        </div>
      </div>

      <svg viewBox="0 0 1000 1000" className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
         <motion.path 
           d="M 420 380 Q 500 300 580 380" 
           fill="none" stroke="indigo" strokeWidth="2"
           initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ repeat: Infinity, duration: 2 }}
         />
         <motion.path 
           d="M 580 430 Q 500 510 420 430" 
           fill="none" stroke="rose" strokeWidth="2" strokeDasharray="4,4"
           initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ repeat: Infinity, duration: 2 }}
         />
      </svg>
    </div>
  )
}

function BackgroundVisualizer() {
  return (
    <div className="relative flex items-center justify-center h-full w-full">
      <div className="relative z-10">
        <Node icon={Box} label="System Core" color="zinc" delay={0.1} />
        <motion.div 
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full"
        />
      </div>

      {/* Orbiting watcher */}
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
        className="absolute w-64 h-64 border border-indigo-500/10 rounded-full"
      >
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
           <div className="p-2 rounded-lg glass-card border border-indigo-500/30 bg-indigo-500/5">
              <Eye className="w-4 h-4 text-indigo-400" />
           </div>
           <span className="absolute -right-12 top-1 text-[8px] font-bold text-indigo-400 uppercase tracking-widest whitespace-nowrap">Observing</span>
        </div>
      </motion.div>

      {/* Signal blips */}
      {[...Array(6)].map((_, i) => (
        <motion.div
           key={i}
           initial={{ scale: 0, opacity: 0 }}
           animate={{ 
             scale: [0, 1.5, 2], 
             opacity: [0, 0.5, 0],
             x: (Math.random() - 0.5) * 400,
             y: (Math.random() - 0.5) * 400
           }}
           transition={{ 
             duration: 4, 
             delay: i * 0.8, 
             repeat: Infinity,
             ease: "easeOut"
           }}
           className="absolute w-2 h-2 rounded-full bg-emerald-500/30 blur-[1px]"
        />
      ))}

      <div className="absolute bottom-10 px-4 py-1 rounded-full glass-card border border-emerald-500/30 flex items-center gap-2">
         <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
         <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-widest">Active Monitoring</span>
      </div>
    </div>
  )
}
