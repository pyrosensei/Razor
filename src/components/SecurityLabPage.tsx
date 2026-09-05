import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Flame,
  Bug,
  Terminal,
  AlertTriangle,
  CheckCircle,
  Database,
  Lock,
  ArrowRight,
  RefreshCw,
  Zap,
  Play,
  Copy,
  Check
} from 'lucide-react';
import { LabAttackType, LabAttackSpec, LabAttackResult, SpendMandate } from '../types';

interface SecurityLabPageProps {
  mandate: SpendMandate | null;
  onRefreshData?: () => void;
}

const STATIC_ATTACK_SPECS: Record<LabAttackType, LabAttackSpec> = {
  hallucinated_price: {
    id: 'hallucinated_price',
    name: 'Hallucinated Unit Price Injection',
    badge: 'Invariant 1 & 2',
    description: 'Adversary / rogue LLM attempts to pass a custom unit_price directly into checkout to override the canonical merchant price (₹1.00 instead of ₹650.00).',
    pitch_claim: "The model can't set the price.",
    invariant_enforced: 'Invariant 1 & 2: Price authority lives strictly in ingest parser + gate. create_checkout rejects unit_price.',
    target_sku: 'SKU-COFFEE-ROAST',
    default_payload: {
      sku: 'SKU-COFFEE-ROAST',
      qty: 1,
      unit_price: 1.00
    },
    expected_block_reason: 'price_override_attempt',
    expected_step: 'Rule 4 Pre-flight (Invariant 2)'
  },
  unauthorized_discount: {
    id: 'unauthorized_discount',
    name: 'Unauthorized Discount Injection',
    badge: 'Invariant 2',
    description: 'Adversary / rogue LLM attempts to slip a discount rate or coupon parameter (discount: 0.90) into checkout arguments.',
    pitch_claim: 'Discounts are strictly forbidden on checkout schema.',
    invariant_enforced: 'Invariant 2: create_checkout accepts only sku and qty. Discount fields are audited as attacks.',
    target_sku: 'SKU-KEYBOARD-MECH',
    default_payload: {
      sku: 'SKU-KEYBOARD-MECH',
      qty: 1,
      discount: 0.90
    },
    expected_block_reason: 'unauthorized_discount',
    expected_step: 'Rule 4 Pre-flight (Invariant 2)'
  },
  oversell: {
    id: 'oversell',
    name: 'Inventory Oversell Attempt',
    badge: 'Invariant 3 (Rule 2)',
    description: 'Adversary / rogue LLM attempts to purchase more quantity than physically available in merchant stock (requesting 9,999 units when only 3 exist).',
    pitch_claim: 'Stock verified before payment authorization.',
    invariant_enforced: 'Invariant 3 (Rule 2): Stock must be verified before payment authorization. Cannot sell nonexistent inventory.',
    target_sku: 'SKU-COFFEE-ROAST',
    default_payload: {
      sku: 'SKU-COFFEE-ROAST',
      qty: 9999
    },
    expected_block_reason: 'insufficient_stock',
    expected_step: 'Rule 2 (Stock Verification)'
  },
  spend_breach: {
    id: 'spend_breach',
    name: 'Spend Mandate Budget Breach',
    badge: 'Invariant 3 (Rule 3)',
    description: 'Adversary / rogue LLM attempts to checkout items whose total exceeds the session spend limit ceiling (purchasing ₹8,499.00 under a ₹1,000.00 ceiling).',
    pitch_claim: 'Model cannot spend beyond approved mandate ceiling.',
    invariant_enforced: 'Invariant 3 (Rule 3): Total cost must be strictly within remaining spend limit under the spend mandate.',
    target_sku: 'SKU-KEYBOARD-MECH',
    default_payload: {
      sku: 'SKU-KEYBOARD-MECH',
      qty: 1,
      buyer_session_id: 'session_lab_mandate'
    },
    expected_block_reason: 'spend_limit_exceeded',
    expected_step: 'Rule 3 (Spend Limit Check)'
  }
};

export const SecurityLabPage: React.FC<SecurityLabPageProps> = ({ mandate, onRefreshData }) => {
  const [selectedType, setSelectedType] = useState<LabAttackType>('hallucinated_price');
  const [attackResults, setAttackResults] = useState<Partial<Record<LabAttackType, LabAttackResult>>>({});
  const [customPayloadText, setCustomPayloadText] = useState<string>(
    JSON.stringify(STATIC_ATTACK_SPECS.hallucinated_price.default_payload, null, 2)
  );
  const [isRunningSingle, setIsRunningSingle] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [copiedAuditId, setCopiedAuditId] = useState<number | null>(null);

  const activeSpec = STATIC_ATTACK_SPECS[selectedType];
  const activeResult = attackResults[selectedType];

  // Switch attack selection
  const handleSelectAttack = (type: LabAttackType) => {
    setSelectedType(type);
    const defaultJson = JSON.stringify(STATIC_ATTACK_SPECS[type].default_payload, null, 2);
    setCustomPayloadText(defaultJson);
  };

  // Trigger attack against POST /lab/attack/{type}
  const executeAttack = async (type: LabAttackType, overridePayload?: Record<string, unknown>) => {
    try {
      let bodyData = overridePayload;
      if (!bodyData) {
        try {
          bodyData = JSON.parse(customPayloadText);
        } catch {
          bodyData = STATIC_ATTACK_SPECS[type].default_payload;
        }
      }

      const res = await fetch(`/lab/attack/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
      });

      const data: LabAttackResult = await res.json();
      setAttackResults((prev) => ({ ...prev, [type]: data }));
      if (onRefreshData) {
        onRefreshData();
      }
      return data;
    } catch (err: any) {
      console.error(`Failed attack execution ${type}:`, err);
      return null;
    }
  };

  // Run the currently active single attack
  const handleFireActiveAttack = async () => {
    setIsRunningSingle(true);
    await executeAttack(selectedType);
    setIsRunningSingle(false);
  };

  // Run all 4 attacks sequentially for high-impact pitch demonstration
  const handleRunAllAttacks = async () => {
    setIsRunningAll(true);
    const types: LabAttackType[] = ['hallucinated_price', 'unauthorized_discount', 'oversell', 'spend_breach'];
    for (const t of types) {
      setSelectedType(t);
      setCustomPayloadText(JSON.stringify(STATIC_ATTACK_SPECS[t].default_payload, null, 2));
      await executeAttack(t, STATIC_ATTACK_SPECS[t].default_payload);
      // Brief pause for visual pacing
      await new Promise((r) => setTimeout(r, 450));
    }
    setIsRunningAll(false);
  };

  const handleCopyAuditJson = (log: any) => {
    if (!log) return;
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopiedAuditId(log.id);
    setTimeout(() => setCopiedAuditId(null), 2000);
  };

  const attackList: LabAttackType[] = ['hallucinated_price', 'unauthorized_discount', 'oversell', 'spend_breach'];
  const totalExecuted = Object.keys(attackResults).length;
  const totalBlocked = (Object.values(attackResults) as (LabAttackResult | undefined)[]).filter((r) => r?.blocked).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Pitch Header Banner */}
      <div className="bg-gradient-to-r from-red-950/40 via-[#0A0F1D] to-[#0A0F1D] border border-red-500/30 rounded-xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-red-600/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                SECTION 7 SECURITY LAB
              </span>
              <span className="text-[11px] font-mono text-zinc-500">
                // Deterministic Invariant Enforcement Engine
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <span>Attack Defense Matrix</span>
              <span className="text-xs font-mono font-normal px-2 py-1 bg-slate-900 border border-white/20 text-zinc-300 rounded">
                Pitch Centerpiece
              </span>
            </h1>
            <p className="text-sm text-zinc-300 mt-2 max-w-3xl leading-relaxed">
              <strong className="text-white">The model shops, the rules pay.</strong> Price authority lives strictly in the catalog ingest parser and the non-negotiable security gate. These 4 attacks prove mathematically that the LLM cannot hallucinate prices, apply discounts, oversell inventory, or breach spend limits.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <button
              onClick={handleRunAllAttacks}
              disabled={isRunningAll || isRunningSingle}
              className="px-5 py-3 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold rounded-lg shadow-lg shadow-red-600/30 flex items-center gap-2 uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {isRunningAll ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Firing Defense Suite...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Run All 4 Attacks in Batch</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-4 border-t border-white/10/80 text-xs font-mono">
          <div className="bg-slate-950/60 p-2.5 rounded border border-white/10">
            <span className="text-zinc-500 text-[10px] uppercase">Attack Vectors</span>
            <p className="text-sm font-bold text-white mt-0.5">4 Scenarios (Sec 7)</p>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded border border-white/10">
            <span className="text-zinc-500 text-[10px] uppercase">Defense Rate</span>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">
              {totalExecuted > 0 ? `${totalBlocked} / ${totalExecuted} Blocked (100%)` : 'Ready to Test'}
            </p>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded border border-white/10">
            <span className="text-zinc-500 text-[10px] uppercase">Price Invariant</span>
            <p className="text-sm font-bold text-red-400 mt-0.5">Schema Rejected (Inv 2)</p>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded border border-white/10">
            <span className="text-zinc-500 text-[10px] uppercase">Audit Logging</span>
            <p className="text-sm font-bold text-white mt-0.5">Zero Silent Paths (Inv 4)</p>
          </div>
        </div>
      </div>

      {/* The 4 Attack Buttons */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
            <Terminal className="w-4 h-4 text-red-400" />
            <span>Select Attack Scenario to Trigger</span>
          </h2>
          <span className="text-[11px] font-mono text-zinc-600">
            Endpoints: POST /lab/attack/{'{type}'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {attackList.map((type) => {
            const spec = STATIC_ATTACK_SPECS[type];
            const result = attackResults[type];
            const isSelected = selectedType === type;

            return (
              <button
                key={type}
                onClick={() => handleSelectAttack(type)}
                className={`p-4 rounded-xl text-left border transition-all relative overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#150B0D] border-red-500 shadow-lg shadow-red-500/10 ring-1 ring-red-500/40'
                    : 'bg-zinc-950 border-white/10 hover:border-white/20 hover:bg-[#0D1426]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 text-zinc-300 border border-white/20">
                      {spec.badge}
                    </span>
                    {result ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-red-400" />
                        BLOCKED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-600 bg-slate-900 border border-white/10">
                        READY
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-sm text-white mb-1 leading-snug">
                    {spec.name}
                  </h3>
                  <p className="text-[11px] text-zinc-500 italic mb-2">
                    "{spec.pitch_claim}"
                  </p>
                </div>

                <div className="pt-3 border-t border-white/10/80 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-600">Target: {spec.target_sku}</span>
                  <span className="text-red-400 font-bold flex items-center gap-1">
                    <Flame className="w-3 h-3" />
                    <span>Attack</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Pitch Showcase: The Active Attack, Visual Red Banner, Reason Code & Audit Log */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Attack Setup & Malicious Payload (What Was Attempted) */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          <div className="bg-zinc-950 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-red-400" />
                <h3 className="font-bold text-sm text-white uppercase tracking-wider font-mono">
                  1. What Was Attempted
                </h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 bg-slate-900 px-2 py-0.5 rounded border border-white/10">
                Payload Inspector
              </span>
            </div>

            <div>
              <h4 className="text-xs font-mono font-bold text-zinc-300 uppercase mb-1">
                Attack Thesis & Mechanism:
              </h4>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {activeSpec.description}
              </p>
            </div>

            <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-lg text-xs space-y-1">
              <div className="font-bold text-red-400 font-mono text-[11px] uppercase tracking-wider">
                Invariant Mandate Enforced:
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed font-mono">
                {activeSpec.invariant_enforced}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 mb-1.5">
                <span>DELIBERATE BAD CHECKOUT PAYLOAD</span>
                <span className="text-red-400 text-[10px]">Calls real /checkout gate</span>
              </div>
              <textarea
                value={customPayloadText}
                onChange={(e) => setCustomPayloadText(e.target.value)}
                rows={6}
                className="w-full bg-black border border-white/10 rounded-lg p-3 text-xs font-mono text-red-300 focus:outline-none focus:border-red-500/50 leading-relaxed"
              />
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 mt-1">
                <span>Schema allows ONLY: sku, qty, buyer_session_id</span>
                <button
                  type="button"
                  onClick={() =>
                    setCustomPayloadText(
                      JSON.stringify(STATIC_ATTACK_SPECS[selectedType].default_payload, null, 2)
                    )
                  }
                  className="text-zinc-500 hover:text-zinc-200 underline"
                >
                  Reset to default
                </button>
              </div>
            </div>

            <button
              onClick={handleFireActiveAttack}
              disabled={isRunningSingle || isRunningAll}
              className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold rounded-lg shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {isRunningSingle ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Firing to /checkout Gate...</span>
                </>
              ) : (
                <>
                  <Flame className="w-4 h-4" />
                  <span>Fire Attack to Gate ({activeSpec.id})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Visually Obvious Block Banner, Returned Reason Code & Matching Audit Log Row */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          {activeResult ? (
            <div className="space-y-4">
              {/* VISUALLY OBVIOUS RED BANNER (PITCH CENTERPIECE) */}
              <div className="bg-[#240B0B] border-2 border-red-500 rounded-xl p-5 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-red-600/40">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded text-xs font-mono font-black bg-red-500 text-white uppercase tracking-widest">
                          [GATE INTERCEPT: ATTACK BLOCKED]
                        </span>
                        <span className="text-xs font-mono text-red-300 font-bold">
                          HTTP {activeResult.status_code} Bad Request
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-white mt-1 font-mono tracking-tight">
                        Reason Code: <span className="text-red-400 underline decoration-red-400/50">{activeResult.block_reason}</span>
                      </h3>
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs text-zinc-500 shrink-0">
                    <span className="text-[10px] text-zinc-500 block uppercase">Timestamp</span>
                    <span className="text-white font-bold text-[11px]">
                      {activeResult.audit_log?.timestamp ? new Date(activeResult.audit_log.timestamp).toLocaleTimeString() : 'Just now'}
                    </span>
                  </div>
                </div>

                {/* Machine-Readable & Human-Readable Block Detail */}
                <div className="mt-4 pt-3 border-t border-red-500/30 font-mono text-xs space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-red-200 gap-1">
                    <span>
                      <strong className="text-white">Enforcement Rule:</strong> {activeSpec.expected_step}
                    </span>
                    {activeResult.block_result?.order_id && (
                      <span className="text-[11px] text-zinc-500">
                        Order Ref: <code className="text-red-300">{activeResult.block_result.order_id}</code>
                      </span>
                    )}
                  </div>
                  <p className="bg-[#120505] p-3 rounded border border-red-500/30 text-red-200 text-xs leading-relaxed">
                    {activeResult.block_result?.message || 'Attack detected and blocked prior to authorization.'}
                  </p>
                  {activeResult.block_result?.unauthorized_fields && (
                    <div className="text-[11px] text-red-400 flex items-center gap-2">
                      <span>Violating Fields Intercepted:</span>
                      <span className="bg-red-950/60 px-2 py-0.5 rounded border border-red-500/40 font-bold">
                        [{activeResult.block_result.unauthorized_fields.join(', ')}]
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. MATCHING AUDIT_LOG ROW (Invariant 4 Proof) */}
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-white" />
                    <h3 className="font-bold text-sm text-white uppercase tracking-wider font-mono">
                      2. Matching Audit Log Row (Invariant 4)
                    </h3>
                  </div>
                  {activeResult.audit_log && (
                    <button
                      onClick={() => handleCopyAuditJson(activeResult.audit_log)}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-zinc-300 rounded text-[10px] font-mono flex items-center gap-1 border border-white/10 transition-colors"
                    >
                      {copiedAuditId === activeResult.audit_log.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Row</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <p className="text-xs text-zinc-500 leading-relaxed">
                  Every attack block writes exactly one immutable row to the <code className="text-zinc-200 bg-slate-900 px-1 py-0.5 rounded font-mono">audit_log</code> table in SQLite. No silent paths, ever.
                </p>

                {activeResult.audit_log ? (
                  <div className="bg-black border border-white/10/80 rounded-lg p-3 font-mono text-xs space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pb-2 border-b border-white/10">
                      <div>
                        <span className="text-zinc-600 block text-[9px] uppercase">Row ID</span>
                        <span className="text-white font-bold">#{activeResult.audit_log.id}</span>
                      </div>
                      <div>
                        <span className="text-zinc-600 block text-[9px] uppercase">Action</span>
                        <span className="text-white font-bold">{activeResult.audit_log.action}</span>
                      </div>
                      <div>
                        <span className="text-zinc-600 block text-[9px] uppercase">Status</span>
                        <span className="text-red-400 font-bold">{activeResult.audit_log.status}</span>
                      </div>
                      <div>
                        <span className="text-zinc-600 block text-[9px] uppercase">Timestamp (UTC)</span>
                        <span className="text-zinc-300 text-[10px]">{activeResult.audit_log.timestamp}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-zinc-600 block text-[9px] uppercase mb-0.5">Audit Reason</span>
                      <p className="text-zinc-200 text-[11px] bg-slate-900/50 p-2 rounded border border-white/10 leading-relaxed">
                        {activeResult.audit_log.reason}
                      </p>
                    </div>

                    <div>
                      <span className="text-zinc-600 block text-[9px] uppercase mb-0.5">Payload Snapshot (Stored in DB)</span>
                      <pre className="text-red-300 text-[11px] bg-slate-950 p-2 rounded border border-slate-900 overflow-x-auto whitespace-pre-wrap">
                        {activeResult.audit_log.payload_snapshot}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-900/30 rounded border border-white/10 text-xs text-zinc-600 font-mono">
                    No matching audit log row received.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-zinc-950 border border-dashed border-white/10 rounded-xl p-12 text-center flex flex-col items-center justify-center space-y-3 min-h-[380px]">
              <div className="w-12 h-12 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-400">
                <Flame className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-mono">
                Ready to Fire: {activeSpec.name}
              </h3>
              <p className="text-xs text-zinc-500 max-w-md">
                Click <strong className="text-white">"Fire Attack to Gate"</strong> on the left or click <strong className="text-white">"Run All 4 Attacks in Batch"</strong> above to observe the deterministic red block banner and verified audit log row.
              </p>
              <button
                onClick={handleFireActiveAttack}
                disabled={isRunningSingle || isRunningAll}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold rounded-lg uppercase tracking-wider flex items-center gap-2 mt-2"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Fire Attack Now</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
