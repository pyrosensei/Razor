import React from 'react';
import { ShieldCheck, RotateCcw, Lock, Zap, AlertCircle, ShieldAlert, Workflow } from 'lucide-react';
import { SpendMandate } from '../types';

interface HeaderProps {
  mandate: SpendMandate | null;
  onReset: () => void;
  isResetting: boolean;
  onLockAll: () => void;
  isLockingAll: boolean;
  activeView: 'catalog' | 'buyer' | 'commerce' | 'lab' | 'architecture';
  onSelectView: (view: 'catalog' | 'buyer' | 'commerce' | 'lab' | 'architecture') => void;
}

export const Header: React.FC<HeaderProps> = ({
  mandate,
  onReset,
  isResetting,
  onLockAll,
  isLockingAll,
  activeView,
  onSelectView,
}) => {
  const maxAmount = mandate?.max_amount_inr || 15000;
  const spentAmount = mandate?.current_spent_inr || 0;
  const percentage = Math.min(100, Math.max(0, (spentAmount / (maxAmount || 1)) * 100));

  return (
    <header className="flex flex-wrap items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-950 text-zinc-300">
      {/* Brand & Track Info */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-white rounded flex items-center justify-center font-black text-white text-xl shadow-lg shadow-[#3395FF]/20">
          A
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">AISLE</h1>
            <span className="text-xs text-zinc-600 font-mono tracking-wider">// AI Growth & Agentic Commerce</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono uppercase tracking-[0.2em]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Razorpay Test Mode Active
            </span>
            <span className="text-[10px] text-slate-600 font-mono">• Track 01</span>
          </div>
        </div>
      </div>

      {/* Primary Page Navigation */}
      <div className="flex items-center gap-1 bg-black p-1 rounded-lg border border-white/10">
        <button
          onClick={() => onSelectView('catalog')}
          className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            activeView === 'catalog'
              ? 'bg-white text-black shadow-md shadow-blue-500/20'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-slate-900'
          }`}
        >
          Catalog Ingest & Gate
        </button>
        <button
          onClick={() => onSelectView('buyer')}
          className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            activeView === 'buyer'
              ? 'bg-white text-black shadow-md shadow-blue-500/20'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-slate-900'
          }`}
        >
          AI Buyer Agent
        </button>
        <button
          onClick={() => onSelectView('commerce')}
          className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            activeView === 'commerce'
              ? 'bg-white text-black shadow-md shadow-blue-500/20'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-slate-900'
          }`}
        >
          Cockpit & Audit
        </button>
        <button
          onClick={() => onSelectView('lab')}
          className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
            activeView === 'lab'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
              : 'text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/40'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
          <span>Security Lab</span>
        </button>
        <button
          onClick={() => onSelectView('architecture')}
          className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
            activeView === 'architecture'
              ? 'bg-white text-black shadow-md shadow-blue-500/20'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-slate-900'
          }`}
        >
          <Workflow className="w-3.5 h-3.5 text-blue-400" />
          <span>Architecture</span>
        </button>
      </div>

      {/* Spend Mandate Progress & Fast Actions */}
      <div className="flex items-center gap-6 mt-3 sm:mt-0">
        {mandate && (
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-[10px] uppercase text-zinc-500 font-semibold tracking-wider">
              <ShieldCheck className="w-3 h-3 text-white" />
              <span>Spend Mandate</span>
            </div>
            <p className="text-base font-mono text-white mt-0.5">
              ₹{spentAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}{' '}
              <span className="text-zinc-600 text-xs">/ ₹{maxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </p>
            <div className="w-36 h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  percentage > 90 ? 'bg-red-500' : percentage > 70 ? 'bg-amber-500' : 'bg-white'
                }`}
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          </div>
        )}

        <div className="h-9 w-px bg-slate-800 hidden sm:block"></div>

        <div className="flex items-center gap-2">
          <button
            onClick={onLockAll}
            disabled={isLockingAll}
            title="Ensure deterministic price lock on all 12 items"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-white/20 hover:border-white/30/50 bg-slate-900/60 hover:bg-slate-800 text-zinc-300 rounded text-xs font-mono font-medium transition-colors uppercase tracking-wider disabled:opacity-50"
          >
            <Lock className="w-3.5 h-3.5 text-white" />
            <span className="hidden md:inline">Lock All</span>
          </button>

          <button
            onClick={onReset}
            disabled={isResetting}
            title="Reset Catalog, Spend Mandate & Audit Log to clean state"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-white/20 hover:border-red-500/50 bg-slate-900/60 hover:bg-slate-800 text-zinc-300 rounded text-xs font-mono font-medium transition-colors uppercase tracking-wider disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-zinc-500 ${isResetting ? 'animate-spin' : ''}`} />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
};
