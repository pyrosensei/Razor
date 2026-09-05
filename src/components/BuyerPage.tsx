import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Play,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Clock,
  ArrowRight,
  RefreshCw,
  Terminal,
  ExternalLink,
  ChevronDown,
  Info
} from 'lucide-react';
import { BuyerRunResult, SpendMandate, TranscriptStep } from '../types';

interface BuyerPageProps {
  mandate: SpendMandate | null;
  onRefreshData: () => Promise<void>;
}

const PERSONA_OPTIONS = [
  {
    id: 'frugal_office_manager',
    name: 'Frugal Office Manager',
    desc: 'Cost-minimizing, strictly essential items under budget',
  },
  {
    id: 'engineering_lead',
    name: 'Engineering Team Lead',
    desc: 'Developer accessories, mechanical keyboards, cables',
  },
  {
    id: 'facilities_coordinator',
    name: 'Facilities & Wellness Coordinator',
    desc: 'Ergonomic comfort, healthy pantry snacks & coffee',
  },
  {
    id: 'strict_auditor',
    name: 'Strict Corporate Auditor',
    desc: 'Minimal spend, strict policy compliance',
  },
];

const QUICK_GOALS = [
  { label: 'Restock Coffee (1x)', goal: 'Restock 1 bag of whole bean coffee for the office espresso bar' },
  { label: 'Ergonomic Gear (2x)', goal: 'Procure 2 ergonomic wrist rests for testing workstations' },
  { label: 'Thunderbolt Cable (1x)', goal: 'Order 1 Braided USB-C Thunderbolt 4 cable' },
  { label: 'Oat Milk Supply (3x)', goal: 'Restock 3 cartons of Barista Edition Oat Milk' },
  { label: 'Budget Breach Test', goal: 'Order 10 Mechanical Keyboards to test spend limit block' },
];

const SPEND_PRESETS = [
  { label: '₹1,000', paise: 100000 },
  { label: '₹2,500', paise: 250000 },
  { label: '₹5,000', paise: 500000 },
  { label: '₹10,000', paise: 1000000 },
];

export const BuyerPage: React.FC<BuyerPageProps> = ({ mandate, onRefreshData }) => {
  const [selectedPersona, setSelectedPersona] = useState<string>(PERSONA_OPTIONS[0].name);
  const [spendLimitInr, setSpendLimitInr] = useState<number>(5000);
  const [goal, setGoal] = useState<string>(QUICK_GOALS[0].goal);
  const [simulateGroqDown, setSimulateGroqDown] = useState<boolean>(false);
  const [groqApiKey, setGroqApiKey] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [buyerResult, setBuyerResult] = useState<BuyerRunResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [buyerResult, isRunning]);

  const handleRunBuyer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!goal.trim() || isRunning) return;

    setIsRunning(true);
    setErrorMsg(null);

    const spendLimitPaise = Math.max(100, Math.round(spendLimitInr * 100));

    try {
      const response = await fetch('/buyer/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona: selectedPersona,
          spend_limit_paise: spendLimitPaise,
          goal: goal.trim(),
          simulate_groq_down: simulateGroqDown,
          nvidia_nim_api_key: groqApiKey.trim() || undefined,
          groq_api_key: groqApiKey.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Buyer run failed');
      }

      setBuyerResult(data);
      await onRefreshData();
    } catch (err: any) {
      console.error('Buyer run error:', err);
      setErrorMsg(err.message || 'Failed to execute buyer agent');
    } finally {
      setIsRunning(false);
    }
  };

  const spendLimitPaise = Math.round(spendLimitInr * 100);

  return (
    <div className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Top Banner / Invariant Brief */}
      <div className="bg-zinc-950 border border-white/10 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/30/30 flex items-center justify-center text-white">
                <Bot className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                AI Autonomous Buyer Engine
              </h2>
              <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white border border-white/20 font-mono">
                Section 6 • Observe → Reason → Act
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1 max-w-2xl font-sans leading-relaxed">
              The model shops, the rules pay. The LLM operates with zero price authority: it invokes{' '}
              <code className="text-emerald-400 bg-slate-900 px-1 py-0.5 rounded font-mono text-[11px]">search_catalog</code>,{' '}
              <code className="text-emerald-400 bg-slate-900 px-1 py-0.5 rounded font-mono text-[11px]">get_item</code>, and{' '}
              <code className="text-emerald-400 bg-slate-900 px-1 py-0.5 rounded font-mono text-[11px]">create_checkout</code> (which strictly accepts only <span className="text-white font-mono">sku</span> and <span className="text-white font-mono">qty</span>).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-3 py-1.5 rounded-lg border border-white/20 hover:border-slate-600 bg-slate-900/80 text-xs font-mono text-zinc-300 transition-colors"
            >
              {showSettings ? 'Hide Settings' : 'Engine Settings'}
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Gate Active</span>
            </div>
          </div>
        </div>

        {/* Engine Settings (API Key & Fallback Simulator) */}
        {showSettings && (
          <div className="mt-4 pt-4 border-t border-white/10/80 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="bg-black p-3 rounded-lg border border-white/10">
              <div className="flex items-center justify-between mb-1">
                <label className="text-zinc-300 font-sans font-medium flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-white" />
                  <span>Invariant 5 Fallback Simulation</span>
                </label>
                <input
                  type="checkbox"
                  id="simulate-groq-down-toggle"
                  checked={simulateGroqDown}
                  onChange={(e) => setSimulateGroqDown(e.target.checked)}
                  className="w-4 h-4 accent-white cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-zinc-500 font-sans leading-normal">
                Simulates NVIDIA NIM API being offline or unreachable. Proves Invariant 5: money path completes safely via deterministic rule-based buyer under budget. Distinctly logs <code className="text-amber-400 font-mono">fallback_triggered</code>.
              </p>
            </div>

            <div className="bg-black p-3 rounded-lg border border-white/10">
              <label className="block text-zinc-500 uppercase tracking-wider text-[10px] mb-1 font-mono">
                NVIDIA NIM API Key (Optional — fallback used if omitted):
              </label>
              <input
                type="password"
                value={groqApiKey}
                onChange={(e) => setGroqApiKey(e.target.value)}
                placeholder="nvapi-..."
                className="w-full bg-zinc-950 border border-white/10 text-zinc-200 px-3 py-1.5 rounded text-xs focus:outline-none focus:border-white/30 font-mono"
              />
              <span className="text-[10px] text-zinc-600 mt-1 block font-mono">
                Model defaults to <span className="text-zinc-300">nvidia/nemotron-3.5-lightning-30b-a3b</span> with function-calling.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Interactive Grid: Configuration on Left, Live Transcript on Right */}
      <div className="grid grid-cols-12 gap-6 items-start">
        {/* Left Column: Buyer Parameters */}
        <div className="col-span-12 lg:col-span-5 space-y-5">
          <div className="bg-zinc-950 border border-white/10 rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2 pb-2 border-b border-white/10">
              <span>01 // Procurement Parameters</span>
            </h3>

            {/* Persona Dropdown */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5 font-sans">
                Buyer Persona
              </label>
              <div className="relative">
                <select
                  value={selectedPersona}
                  onChange={(e) => setSelectedPersona(e.target.value)}
                  disabled={isRunning}
                  className="w-full appearance-none bg-black border border-white/10 rounded-lg px-3 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-white/30 font-mono cursor-pointer"
                >
                  {PERSONA_OPTIONS.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} — {p.desc}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-zinc-600 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            {/* Spend Limit Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-300 font-sans">
                  Session Spend Limit
                </label>
                <span className="text-[11px] font-mono text-zinc-500">
                  {spendLimitPaise.toLocaleString()} paise
                </span>
              </div>
              <div className="relative mb-2">
                <span className="absolute left-3 top-2.5 text-zinc-500 font-mono text-sm font-bold">
                  ₹
                </span>
                <input
                  type="number"
                  min="1"
                  step="50"
                  value={spendLimitInr}
                  onChange={(e) => setSpendLimitInr(Math.max(1, Number(e.target.value)))}
                  disabled={isRunning}
                  className="w-full bg-black border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white font-mono font-bold focus:outline-none focus:border-white/30"
                />
              </div>

              {/* Spend Presets */}
              <div className="flex items-center gap-2">
                {SPEND_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setSpendLimitInr(preset.paise / 100)}
                    disabled={isRunning}
                    className={`flex-1 py-1 rounded text-[10px] font-mono font-bold uppercase transition-colors border ${
                      spendLimitInr === preset.paise / 100
                        ? 'bg-white/20 text-white border-white/30/40'
                        : 'bg-black text-zinc-500 border-white/10 hover:text-zinc-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Goal / Intent Input */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5 font-sans">
                Procurement Objective (Goal)
              </label>
              <textarea
                rows={3}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                disabled={isRunning}
                placeholder="Describe what the agent should purchase within budget..."
                className="w-full bg-black border border-white/10 rounded-lg p-3 text-xs text-zinc-200 focus:outline-none focus:border-white/30 font-sans resize-none"
              />

              {/* Quick Preset Buttons */}
              <div className="mt-2 space-y-1.5">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-600 block">
                  Quick Goal Presets:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_GOALS.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => setGoal(q.goal)}
                      disabled={isRunning}
                      className="px-2 py-1 rounded bg-black hover:bg-slate-800 border border-white/10 text-[10px] font-mono text-zinc-500 hover:text-zinc-200 transition-colors"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Offline Simulation Banner */}
            {simulateGroqDown && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2.5 text-xs text-amber-300 font-sans">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold font-mono">SIMULATE_NIM_DOWN Active:</span>
                  <p className="text-[11px] text-amber-400/90 mt-0.5">
                    The agent will trigger Invariant 5 rule-based fallback buyer. Purchase will complete deterministically without NVIDIA NIM.
                  </p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2 text-xs text-red-400">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Run Buyer Button */}
            <button
              type="button"
              onClick={handleRunBuyer}
              disabled={isRunning || !goal.trim()}
              className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-200 text-black text-sm font-bold tracking-wide transition-all shadow-lg shadow-white/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Running Observe-Reason-Act Loop...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run Buyer Agent</span>
                </>
              )}
            </button>
          </div>

          {/* Architecture Guardrail Reminder */}
          <div className="bg-zinc-950 border border-white/10/80 rounded-xl p-4 text-[11px] font-mono text-zinc-500 space-y-2">
            <div className="text-zinc-300 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
              <span>Non-Negotiable Invariants Enforced</span>
            </div>
            <ul className="space-y-1.5 list-disc pl-4 text-zinc-500">
              <li>
                <span className="text-zinc-300">Invariant 1:</span> Price authority lives only in ingest parser & gate.
              </li>
              <li>
                <span className="text-zinc-300">Invariant 2:</span> <code className="text-emerald-400">create_checkout</code> schema accepts only <span className="text-zinc-200">sku</span> and <span className="text-zinc-200">qty</span>.
              </li>
              <li>
                <span className="text-zinc-300">Invariant 5:</span> Money path never hard-depends on NVIDIA NIM. Fallback completes purchase.
              </li>
            </ul>
          </div>
        </div>

        {/* Right Column: Scrolling Transcript View & Final Result Banner */}
        <div className="col-span-12 lg:col-span-7 flex flex-col space-y-5">
          {/* Final Result Banner (if run completed) */}
          {buyerResult && (
            <div
              className={`border rounded-xl p-5 shadow-lg ${
                buyerResult.status === 'COMPLETED' || buyerResult.status === 'captured'
                  ? 'bg-emerald-950/20 border-emerald-500/40'
                  : 'bg-red-950/20 border-red-500/40'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-white/10/80">
                <div className="flex items-center gap-2">
                  {buyerResult.status === 'COMPLETED' || buyerResult.status === 'captured' ? (
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                      <span>Order Result:</span>
                      <span
                        className={`font-mono px-2 py-0.5 rounded text-xs uppercase ${
                          buyerResult.status === 'COMPLETED' || buyerResult.status === 'captured'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {buyerResult.status}
                      </span>
                    </h4>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      Session: {buyerResult.buyer_session_id || 'Active'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {buyerResult.fallback_triggered ? (
                    <span className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5" />
                      <span>INVARIANT 5 FALLBACK USED</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-white/10 border border-white/30 text-white text-xs font-mono font-bold flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5" />
                      <span>NVIDIA NIM TOOL-CALLING</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Order Specs */}
              {buyerResult.checkout && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/80 p-3.5 rounded-lg border border-white/10">
                    <div>
                      <span className="text-[10px] text-zinc-600 uppercase tracking-wider block">SKU</span>
                      <span className="text-white font-bold">{buyerResult.checkout.sku}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-600 uppercase tracking-wider block">Quantity</span>
                      <span className="text-white font-bold">{buyerResult.checkout.qty} unit(s)</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-600 uppercase tracking-wider block">Total Charged</span>
                      <span className="text-emerald-400 font-bold">
                        ₹{(buyerResult.checkout.total_amount_inr || (buyerResult.checkout.total_amount_paisa ? buyerResult.checkout.total_amount_paisa / 100 : 0)).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-600 uppercase tracking-wider block">Remaining Budget</span>
                      <span className="text-zinc-200">
                        ₹{(buyerResult.remaining_spend_inr ?? ((buyerResult.spend_limit_inr || 5000) - (buyerResult.checkout.total_amount_inr || 0))).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Simulated Razorpay Credentials */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-black p-2.5 rounded border border-white/10 flex items-center justify-between">
                      <span className="text-zinc-600">Razorpay Order ID:</span>
                      <span className="text-zinc-200 font-bold">{buyerResult.checkout.razorpay_order_id}</span>
                    </div>
                    <div className="bg-black p-2.5 rounded border border-white/10 flex items-center justify-between">
                      <span className="text-zinc-600">Razorpay Payment ID:</span>
                      <span className="text-emerald-400 font-bold">{buyerResult.checkout.razorpay_payment_id}</span>
                    </div>
                  </div>

                  {/* Fallback Reason Confirmation */}
                  {buyerResult.fallback_reason && (
                    <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-sans">
                      <span className="font-bold font-mono">Fallback Trigger Log: </span>
                      <span>{buyerResult.fallback_reason}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Scrolling Transcript View */}
          <div className="bg-zinc-950 border border-white/10 rounded-xl flex flex-col shadow-sm overflow-hidden">
            {/* Transcript Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-950">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-white" />
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300">
                  Observe → Reason → Act Transcript
                </h3>
              </div>
              <div className="text-[11px] font-mono text-zinc-600">
                {buyerResult?.transcript ? `${buyerResult.transcript.length} step(s)` : 'Awaiting dispatch'}
              </div>
            </div>

            {/* Transcript Body (Scrollable) */}
            <div className="p-4 space-y-4 max-h-[460px] overflow-y-auto font-mono text-xs bg-black">
              {isRunning && (
                <div className="p-4 rounded-lg bg-white/10 border border-white/20 flex items-center gap-3 text-white animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <div>
                    <span className="font-bold">Autonomous loop in progress...</span>
                    <p className="text-[11px] text-zinc-300/80 font-sans mt-0.5">
                      Executing turns with NVIDIA NIM tool-calling against real catalog and deterministic gate.
                    </p>
                  </div>
                </div>
              )}

              {buyerResult?.transcript && buyerResult.transcript.length > 0 ? (
                buyerResult.transcript.map((step: TranscriptStep, index: number) => {
                  const phaseColor = {
                    observe: 'bg-white/10 text-white border-white/30',
                    reason: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
                    act: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                    tool_result: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
                    final_answer: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                  }[step.phase] || 'bg-slate-800 text-zinc-300 border-white/20';

                  return (
                    <div
                      key={index}
                      className="p-3.5 rounded-lg bg-zinc-950 border border-white/10/80 space-y-2 hover:border-white/20 transition-colors"
                    >
                      {/* Step Header */}
                      <div className="flex items-center justify-between text-[10px] text-zinc-600 pb-1.5 border-b border-white/10/60">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-500">TURN {step.turn}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${phaseColor}`}>
                            {step.phase}
                          </span>
                          {step.tool && (
                            <span className="text-emerald-400 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-white/10">
                              {step.tool}()
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-600">
                          {new Date(step.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      {/* Step Content */}
                      {step.content && (
                        <p className="text-zinc-300 font-sans text-xs leading-relaxed whitespace-pre-line">
                          {step.content}
                        </p>
                      )}

                      {/* Tool Call Arguments */}
                      {step.args && (
                        <div className="bg-black p-2 rounded border border-white/10 text-[11px]">
                          <span className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
                            Arguments Sent:
                          </span>
                          <pre className="text-emerald-300 overflow-x-auto">
                            {JSON.stringify(step.args, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Tool Result Payload */}
                      {step.result && (
                        <div className="bg-black p-2 rounded border border-white/10 text-[11px]">
                          <span className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
                            Tool Result:
                          </span>
                          <pre className="text-cyan-300 overflow-x-auto max-h-36">
                            {JSON.stringify(step.result, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : !isRunning ? (
                <div className="text-center py-16 text-slate-600 space-y-2">
                  <Bot className="w-8 h-8 mx-auto text-slate-700" />
                  <p className="font-sans text-xs text-zinc-600">
                    No active buyer transcript yet.
                  </p>
                  <p className="text-[11px] text-slate-600 font-mono">
                    Select a persona and goal on the left, then click "Run Buyer Agent" to start.
                  </p>
                </div>
              ) : null}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
