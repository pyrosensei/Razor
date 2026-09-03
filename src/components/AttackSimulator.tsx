import React, { useState } from 'react';
import { ShieldAlert, Bug, Terminal, Flame, CheckCircle, AlertTriangle } from 'lucide-react';

interface AttackSimulatorProps {
  onSimulateAttack: (payload: Record<string, unknown>) => Promise<any>;
  isLoading: boolean;
}

const ATTACK_VECTORS = [
  {
    type: 'hallucinated_price',
    title: "Injected unit_price: ₹1.00",
    description: "Adversary / LLM attempts to override canonical ₹650.00 price with ₹1.00",
    payload: { sku: "SKU-COFFEE-ROAST", qty: 1, unit_price: 1.00 },
    badge: "Invariant 1 & 2"
  },
  {
    type: 'unauthorized_discount',
    title: "Injected 90% Discount",
    description: "Adversary / LLM attempts to slip discount: 0.90 into checkout arguments",
    payload: { sku: "SKU-KEYBOARD-MECH", qty: 1, discount: 0.90 },
    badge: "Invariant 2"
  },
  {
    type: 'oversell',
    title: "Inventory Oversell (qty: 9999)",
    description: "Adversary attempts to order 9999 units when only 3 exist in stock",
    payload: { sku: "SKU-COFFEE-ROAST", qty: 9999 },
    badge: "Invariant 3 (Rule 2)"
  },
  {
    type: 'spend_breach',
    title: "Spend Ceiling Breach",
    description: "Adversary attempts to checkout ₹8,499.00 item under a ₹1,000.00 ceiling",
    payload: { sku: "SKU-KEYBOARD-MECH", qty: 1, buyer_session_id: "session_lab_mandate" },
    badge: "Invariant 3 (Rule 3)"
  },
];

export const AttackSimulator: React.FC<AttackSimulatorProps> = ({
  onSimulateAttack,
  isLoading,
}) => {
  const [selectedVector, setSelectedVector] = useState(ATTACK_VECTORS[0]);
  const [customJson, setCustomJson] = useState(JSON.stringify(ATTACK_VECTORS[0].payload, null, 2));
  const [attackResponse, setAttackResponse] = useState<any>(null);

  const handleSelectVector = (vector: typeof ATTACK_VECTORS[0]) => {
    setSelectedVector(vector);
    setCustomJson(JSON.stringify(vector.payload, null, 2));
    setAttackResponse(null);
  };

  const handleFireAttack = async () => {
    try {
      const parsed = JSON.parse(customJson);
      const res = await onSimulateAttack(parsed);
      setAttackResponse(res);
    } catch (err: any) {
      setAttackResponse({ error: "Malformed JSON: " + err.message });
    }
  };

  return (
    <div className="bg-[#0A0F1D] border border-slate-800 rounded-lg p-5 font-mono text-xs">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-400" />
          <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
            Invariant 2 Attack Simulator
          </h3>
        </div>
        <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded font-mono">
          Strict Gate Proof Harness
        </span>
      </div>

      <p className="text-slate-400 text-[11px] mb-3 leading-relaxed">
        Test LLM prompt injections and client tampering. Invariant 2 mandates: if <code className="text-red-400 bg-slate-900 px-1 py-0.5 rounded">price</code>, <code className="text-red-400 bg-slate-900 px-1 py-0.5 rounded">unit_price</code>, or <code className="text-red-400 bg-slate-900 px-1 py-0.5 rounded">discount</code> is present, immediately block and audit-log as attack.
      </p>

      {/* Vector Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {ATTACK_VECTORS.map((vec, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSelectVector(vec)}
            className={`p-2 rounded text-left border transition-colors ${
              selectedVector.title === vec.title
                ? 'bg-red-950/30 border-red-500/40 text-slate-200'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="text-[11px] font-bold text-red-400 flex items-center gap-1">
              <Flame className="w-3 h-3" />
              <span>{vec.title}</span>
            </div>
            <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
              {vec.description}
            </div>
          </button>
        ))}
      </div>

      {/* JSON Payload Editor */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
          <span>MALICIOUS CHECKOUT PAYLOAD</span>
          <span>Only sku + qty allowed</span>
        </div>
        <textarea
          value={customJson}
          onChange={(e) => setCustomJson(e.target.value)}
          rows={4}
          className="w-full bg-[#05070A] border border-slate-800 rounded p-2.5 text-xs text-red-300 font-mono focus:outline-none focus:border-red-500/50"
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleFireAttack}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded uppercase tracking-wider text-xs transition-colors disabled:opacity-50"
        >
          <Bug className="w-3.5 h-3.5" />
          <span>{isLoading ? 'Firing Attack...' : 'Fire Malicious Payload to Gate'}</span>
        </button>

        <span className="text-[10px] text-slate-500 font-mono">
          Endpoint: POST /api/checkout
        </span>
      </div>

      {/* Result Display */}
      {attackResponse && (
        <div className="mt-3 p-3 bg-[#1A0B0B] border-l-2 border-red-500 rounded-r shadow-inner">
          <div className="flex items-center justify-between text-[10px] font-mono mb-1">
            <span className="text-red-400 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-red-500" />
              {attackResponse.gate_status === 'BLOCKED_ATTACK' ? '[BLOCKED_ATTACK]' : '[REJECTED]'}
            </span>
            <span className="text-slate-500">Security Gate Intercept</span>
          </div>
          <p className="text-xs text-slate-200 font-mono mb-1">
            {attackResponse.reason || attackResponse.error || 'Attack successfully intercepted and logged.'}
          </p>
          {attackResponse.prohibited_keys_found && (
            <div className="text-[10px] text-red-400 font-mono mt-1">
              Violating Keys Trapped: [{attackResponse.prohibited_keys_found.join(', ')}]
            </div>
          )}
          <p className="text-[9px] text-slate-500 mt-1 uppercase tracking-wider">
            Written to audit_log table with status: BLOCKED_ATTACK
          </p>
        </div>
      )}
    </div>
  );
};
