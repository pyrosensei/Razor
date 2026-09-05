import React from 'react';
import { ShieldCheck, Check, AlertCircle } from 'lucide-react';

export const GateProtocolCard: React.FC = () => {
  const gateSequence = [
    { step: "01", name: "PRICE_LOCK_VERIFIED", desc: "Item price locked at ingest; un-locked items rejected (Inv 1 & 3)" },
    { step: "02", name: "STOCK_AVAILABILITY_CHECKED", desc: "Inventory checked; partial/negative amounts blocked" },
    { step: "03", name: "SPEND_LIMIT_VALIDATED", desc: "Total price strictly under remaining mandate ceiling" },
    { step: "04", name: "DISCOUNT_INJECT_CHECK", desc: "create_checkout accepts only sku & qty; zero discounts permitted (Inv 2)" },
  ];

  const invariants = [
    { id: 1, text: "Price authority in ingest parser + gate only (LLM never writes price charged)" },
    { id: 2, text: "create_checkout takes sku + qty only; any price/discount field is logged attack" },
    { id: 3, text: "Sequential order: item locked → stock → spend limit → zero discount" },
    { id: 4, text: "Every lock, reject, block, capture writes one row to immutable audit_log" },
    { id: 5, text: "Local gate & fallback buyer complete purchase if LLM is offline/fails" },
    { id: 6, text: "Razorpay test mode only: simulated order_sim_ and pay_sim_ identifiers" },
  ];

  return (
    <div className="mt-4 p-4 border border-white/10 rounded-lg bg-slate-900/40">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider font-mono">
            The Gate Protocol // Strict Invariant Enforcement
          </span>
        </div>
        <span className="text-[9px] font-mono text-emerald-400 uppercase">Deterministic</span>
      </div>

      {/* Sequential Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {gateSequence.map((item) => (
          <div
            key={item.step}
            className="flex items-start gap-2 p-2 rounded bg-black border border-white/10/80 text-[10px] font-mono"
          >
            <span className="text-emerald-500 font-bold mt-0.5">[✓]</span>
            <div>
              <div className="text-zinc-200 font-bold">{item.name}</div>
              <div className="text-zinc-600 text-[9px] leading-tight mt-0.5">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Invariants summary */}
      <div className="pt-2 border-t border-white/10/60">
        <div className="text-[9px] font-mono uppercase text-zinc-500 mb-1.5 font-bold tracking-wider">
          Non-Negotiable Architecture Invariants:
        </div>
        <div className="space-y-1 text-[9px] font-mono text-zinc-600">
          {invariants.map((inv) => (
            <div key={inv.id} className="flex items-baseline gap-1.5">
              <span className="text-white font-bold">INV #{inv.id}:</span>
              <span className="text-zinc-500">{inv.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
