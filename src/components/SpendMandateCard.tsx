import React, { useState } from 'react';
import { CreditCard, Edit3, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { SpendMandate } from '../types';

interface SpendMandateCardProps {
  mandate: SpendMandate | null;
  onUpdateCeiling: (maxAmountInr: number, resetSpent: boolean) => Promise<void>;
  isLoading: boolean;
}

export const SpendMandateCard: React.FC<SpendMandateCardProps> = ({
  mandate,
  onUpdateCeiling,
  isLoading,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newCeiling, setNewCeiling] = useState(mandate ? mandate.max_amount_inr.toString() : '15000');

  const handleSave = async () => {
    const val = parseFloat(newCeiling);
    if (!isNaN(val) && val > 0) {
      await onUpdateCeiling(val, false);
      setIsEditing(false);
    }
  };

  const handleResetSpent = async () => {
    if (mandate) {
      await onUpdateCeiling(mandate.max_amount_inr, true);
    }
  };

  if (!mandate) return null;

  const maxInr = mandate.max_amount_inr;
  const spentInr = mandate.current_spent_inr;
  const remainingInr = Math.max(0, maxInr - spentInr);
  const percentSpent = Math.min(100, Math.max(0, (spentInr / (maxInr || 1)) * 100));

  return (
    <div className="bg-[#0A0F1D] border border-slate-800 rounded-lg p-4 font-mono text-xs">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[#3395FF]" />
          <span className="font-bold text-slate-200 uppercase tracking-wider text-xs">
            Spend Mandate Governor
          </span>
        </div>
        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
          ID: {mandate.mandate_id}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3 text-center">
        <div className="p-2 rounded bg-[#05070A] border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Ceiling Limit</div>
          <div className="text-sm font-bold text-white mt-0.5">₹{maxInr.toFixed(2)}</div>
        </div>
        <div className="p-2 rounded bg-[#05070A] border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Current Spent</div>
          <div className="text-sm font-bold text-amber-400 mt-0.5">₹{spentInr.toFixed(2)}</div>
        </div>
        <div className="p-2 rounded bg-[#05070A] border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Remaining</div>
          <div className="text-sm font-bold text-emerald-400 mt-0.5">₹{remainingInr.toFixed(2)}</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
          <span>Budget Consumption</span>
          <span>{percentSpent.toFixed(1)}% Used</span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              percentSpent >= 90 ? 'bg-red-500' : percentSpent >= 75 ? 'bg-amber-500' : 'bg-[#3395FF]'
            }`}
            style={{ width: `${percentSpent}%` }}
          ></div>
        </div>
      </div>

      {/* Adjust Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <span className="text-slate-400">₹</span>
            <input
              type="number"
              value={newCeiling}
              onChange={(e) => setNewCeiling(e.target.value)}
              className="w-24 bg-[#05070A] border border-slate-700 text-white px-2 py-1 rounded text-xs focus:outline-none focus:border-[#3395FF]"
            />
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="p-1 rounded bg-[#3395FF] text-white hover:bg-[#2080ee]"
              title="Save Limit"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="text-[10px] text-slate-500 hover:text-slate-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setNewCeiling(maxInr.toString());
              setIsEditing(true);
            }}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
          >
            <Edit3 className="w-3 h-3 text-[#3395FF]" />
            <span>Edit Ceiling</span>
          </button>
        )}

        <button
          onClick={handleResetSpent}
          disabled={isLoading || spentInr === 0}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-400 transition-colors disabled:opacity-40"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Spent (₹0)</span>
        </button>
      </div>
    </div>
  );
};
