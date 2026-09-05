import React, { useState } from 'react';
import { Bot, Play, ShieldAlert, Cpu, Sparkles, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { BuyerRunResult, SpendMandate } from '../types';

interface AIBuyerConsoleProps {
  onRunBuyer: (intent: string, forceFallback: boolean, groqApiKey: string) => void;
  isRunning: boolean;
  buyerResult: BuyerRunResult | null;
  mandate: SpendMandate | null;
}

const PRESET_INTENTS = [
  { label: "Restock Coffee (2x)", intent: "Restock 2 packs of office coffee beans for team espresso bar" },
  { label: "Ergonomic Gear (3x)", intent: "Procure 3 ergonomic wrist rests for new engineering workstations" },
  { label: "High-Speed Cables (5x)", intent: "Order 5 Braided USB-C Thunderbolt 4 cables for testing bench" },
  { label: "Budget Breach Test (>₹15,000)", intent: "Order 10 Keychron Mechanical Keyboards to test spend limit rejection" },
];

export const AIBuyerConsole: React.FC<AIBuyerConsoleProps> = ({
  onRunBuyer,
  isRunning,
  buyerResult,
  mandate,
}) => {
  const [customIntent, setCustomIntent] = useState<string>(PRESET_INTENTS[0].intent);
  const [forceFallback, setForceFallback] = useState<boolean>(false);
  const [groqApiKey, setGroqApiKey] = useState<string>('');
  const [showConfig, setShowConfig] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customIntent.trim() || isRunning) return;
    onRunBuyer(customIntent, forceFallback, groqApiKey);
  };

  return (
    <div className="bg-[#000] border border-white/10 rounded-lg p-5 font-mono text-[11px] leading-relaxed shadow-inner">
      {/* Title & Engine Mode */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-900">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-white" />
          <span className="font-bold text-zinc-300 uppercase tracking-wider text-xs">
            Autonomous Buyer Engine
          </span>
          <span className="text-[10px] text-zinc-600 font-normal">
            (The model shops, the rules pay)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="text-[10px] text-zinc-500 hover:text-zinc-200 underline"
          >
            {showConfig ? 'Hide Config' : 'Engine Settings'}
          </button>

          <span
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${
              isRunning
                ? 'bg-white/20 text-white border border-white/30 animate-pulse'
                : buyerResult?.status === 'SUCCESS'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-slate-900 text-zinc-500 border border-white/10'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isRunning ? 'bg-zinc-300' : buyerResult?.status === 'SUCCESS' ? 'bg-emerald-400' : 'bg-slate-500'
              }`}
            ></span>
            {isRunning ? 'PROCESSING' : buyerResult ? buyerResult.status : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* Optional Configuration Area */}
      {showConfig && (
        <div className="mb-4 p-3 bg-slate-900/60 border border-white/10 rounded text-xs space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-zinc-300 font-sans text-xs flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-white" />
              <span>Force Invariant 5 Rule-Based Fallback Buyer</span>
            </label>
            <input
              type="checkbox"
              checked={forceFallback}
              onChange={(e) => setForceFallback(e.target.checked)}
              className="accent-white cursor-pointer"
            />
          </div>
          <p className="text-[10px] text-zinc-600 font-mono">
            Invariant 5: If NVIDIA NIM is unreachable or key is unset, local deterministic buyer completes the purchase safely.
          </p>

          <div className="pt-2 border-t border-white/10">
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-mono">
              NVIDIA NIM API Key (Optional — fallback buyer used if empty):
            </label>
            <input
              type="password"
              value={groqApiKey}
              onChange={(e) => setGroqApiKey(e.target.value)}
              placeholder="nvapi-..."
              className="w-full bg-black border border-white/10 text-zinc-200 px-3 py-1 rounded text-xs focus:outline-none focus:border-white/30 font-mono"
            />
          </div>
        </div>
      )}

      {/* Preset Intent Chips */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider mr-1">Quick Scenarios:</span>
        {PRESET_INTENTS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setCustomIntent(p.intent)}
            className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-slate-800 border border-white/10 text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={customIntent}
          onChange={(e) => setCustomIntent(e.target.value)}
          placeholder="Natural language buyer intent (e.g. Procure 2 ergonomic mouse pads)..."
          className="flex-1 bg-zinc-950 border border-white/10 text-zinc-200 px-3 py-2 rounded text-xs focus:outline-none focus:border-white/30 font-mono"
          disabled={isRunning}
        />
        <button
          type="submit"
          disabled={isRunning || !customIntent.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded bg-white hover:bg-zinc-200 text-black text-xs font-bold font-sans uppercase tracking-wider transition-colors disabled:opacity-50 shadow-lg shadow-white/10"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isRunning ? 'Shopping...' : 'Dispatch AI'}</span>
        </button>
      </form>

      {/* Live Terminal & Reasoning Trace */}
      <div className="bg-black border border-slate-900 rounded p-3 font-mono text-[11px] space-y-1.5 max-h-[220px] overflow-y-auto">
        <div className="text-zinc-600 text-[10px] uppercase tracking-wider pb-1 border-b border-slate-900 flex justify-between">
          <span>Trace Log & Security Guardrails</span>
          <span>Engine: {buyerResult?.buyer_engine || (forceFallback ? 'RULE_FALLBACK' : 'NVIDIA_NIM_OR_FALLBACK')}</span>
        </div>

        {isRunning && (
          <div className="text-white flex items-center gap-2 py-2">
            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
            <span>Parsing procurement objective & querying Agent-Readable Catalog Spec...</span>
          </div>
        )}

        {buyerResult ? (
          <>
            <p className="text-white">&gt; Intent: "{buyerResult.intent}"</p>
            {buyerResult.fallback_used && (
              <p className="text-amber-400">
                &gt; [Invariant 5 Triggered] {buyerResult.fallback_reason || 'Autonomous rule-based fallback engaged'}
              </p>
            )}

            {buyerResult.tool_steps && buyerResult.tool_steps.map((step, idx) => (
              <p key={idx} className="text-zinc-500">
                &gt; Action: <span className="text-emerald-400">{step.tool}</span>({JSON.stringify(step.args)})
              </p>
            ))}

            {buyerResult.checkout ? (
              <div className="mt-2 pt-2 border-t border-white/10 text-zinc-300">
                <p className="text-emerald-400 font-bold">
                  &gt; Gate Accepted: {buyerResult.checkout.qty}x {buyerResult.checkout.item_name} ({buyerResult.checkout.sku})
                </p>
                <p className="text-zinc-300">
                  &gt; Canonical Unit Price: ₹{buyerResult.checkout.unit_price_inr.toFixed(2)} | Total: ₹{buyerResult.checkout.total_amount_inr.toFixed(2)}
                </p>
                <p className="text-zinc-500 text-[10px]">
                  &gt; Razorpay Simulated Order: <span className="text-zinc-200">{buyerResult.checkout.razorpay_order_id}</span>
                </p>
                <p className="text-zinc-500 text-[10px]">
                  &gt; Razorpay Simulated Payment: <span className="text-emerald-400">{buyerResult.checkout.razorpay_payment_id}</span>
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10px] text-zinc-500">
                  {buyerResult.checkout.rules_verified.map((r) => (
                    <div key={r.step} className="flex items-center gap-1">
                      <span className="text-emerald-400">[✓]</span>
                      <span>{r.rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : buyerResult.status === 'REJECTED' || buyerResult.status === 'ERROR' ? (
              <div className="mt-2 pt-2 border-t border-white/10 text-red-400">
                <p className="font-bold">&gt; [GATE REJECTION] {buyerResult.message}</p>
                <p className="text-zinc-600 text-[10px]">&gt; Audit log entry written with status REJECTED.</p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-slate-600 py-3 text-center">
            Ready to dispatch AI Buyer. Click a quick scenario above or enter a prompt.
          </div>
        )}
      </div>
    </div>
  );
};
