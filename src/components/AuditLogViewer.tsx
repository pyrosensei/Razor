import React from 'react';
import { History, Shield, AlertOctagon, CheckCircle2, Lock, Filter } from 'lucide-react';
import { AuditLogEntry } from '../types';

interface AuditLogViewerProps {
  logs: AuditLogEntry[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({
  logs,
  isLoading,
  onRefresh,
}) => {
  return (
    <div className="bg-zinc-950 p-6 flex flex-col h-full border-t lg:border-t-0 lg:border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">
            Deterministic Audit Log
          </h2>
          <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
            Invariant 4: Every lock, reject, block & capture writes one immutable row
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
            {logs.length} EVENTS
          </span>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1 rounded border border-white/10 hover:border-white/20 bg-slate-900 text-zinc-500 hover:text-zinc-200 transition-colors"
            title="Refresh Audit Trail"
          >
            <History className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stream List */}
      <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[580px] pr-1">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-600 font-mono text-xs border border-dashed border-white/10 rounded">
            No audit records captured yet.
          </div>
        ) : (
          logs.map((log) => {
            const isAttack = log.status === 'BLOCKED_ATTACK' || log.action.includes('TAMPER') || log.action.includes('ATTACK');
            const isRejected = log.status === 'REJECTED';
            const isSuccess = log.status === 'SUCCESS' && (log.action === 'CHECKOUT_CAPTURE' || log.action === 'LOCK_CAPTURE');
            const isLock = log.action.includes('LOCK');

            let cardBg = 'bg-[#0A1224]';
            let borderColor = 'border-white/20';
            let badgeColor = 'text-zinc-500';

            if (isAttack) {
              cardBg = 'bg-[#1A0B0B]';
              borderColor = 'border-red-500';
              badgeColor = 'text-red-500';
            } else if (isRejected) {
              cardBg = 'bg-[#1A1005]';
              borderColor = 'border-amber-500';
              badgeColor = 'text-amber-400';
            } else if (isSuccess) {
              cardBg = 'bg-[#0A1224]';
              borderColor = 'border-emerald-500';
              badgeColor = 'text-emerald-400';
            } else if (isLock) {
              cardBg = 'bg-[#0A1224]';
              borderColor = 'border-white/30';
              badgeColor = 'text-white';
            }

            const timeStr = log.timestamp
              ? new Date(log.timestamp).toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : '00:00:00';

            return (
              <div
                key={log.id}
                className={`p-3 ${cardBg} border-l-2 ${borderColor} rounded-r shadow-sm transition-all hover:bg-slate-800/40`}
              >
                <div className="flex justify-between items-center text-[10px] font-mono mb-1">
                  <span className={`${badgeColor} font-bold flex items-center gap-1`}>
                    {isAttack ? (
                      <AlertOctagon className="w-3 h-3 text-red-500" />
                    ) : isSuccess ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Shield className="w-3 h-3 text-zinc-500" />
                    )}
                    [{log.action}]
                  </span>
                  <span className="text-zinc-600 font-mono">{timeStr}</span>
                </div>

                {log.razorpay_payment_id ? (
                  <p className="text-xs text-zinc-200 mb-1 font-mono">
                    <span className="text-emerald-400 font-semibold">{log.razorpay_payment_id}</span>
                    <span className="text-zinc-600"> // Captured</span>
                  </p>
                ) : (
                  <p className="text-xs text-zinc-300 mb-1 font-mono leading-tight">
                    {log.reason}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 text-[9px] text-zinc-600 font-mono uppercase tracking-tighter pt-0.5">
                  {log.sku && <span>SKU: <strong className="text-zinc-500">{log.sku}</strong></span>}
                  {log.qty !== null && log.qty !== undefined && (
                    <span>QTY: <strong className="text-zinc-500">{log.qty}</strong></span>
                  )}
                  {log.amount_inr !== null && log.amount_inr !== undefined && (
                    <span>AMT: <strong className="text-emerald-400">₹{log.amount_inr.toFixed(2)}</strong></span>
                  )}
                  {log.razorpay_order_id && (
                    <span>ORDER: <strong className="text-zinc-500">{log.razorpay_order_id}</strong></span>
                  )}
                </div>

                {log.payload_snapshot && isAttack && (
                  <div className="mt-1.5 p-1.5 bg-black/50 rounded text-[9px] font-mono text-red-400 overflow-x-auto">
                    {log.payload_snapshot}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
