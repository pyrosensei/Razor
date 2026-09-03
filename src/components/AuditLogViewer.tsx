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
    <div className="bg-[#080B14] p-6 flex flex-col h-full border-t lg:border-t-0 lg:border-l border-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
            Deterministic Audit Log
          </h2>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">
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
            className="p-1 rounded border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors"
            title="Refresh Audit Trail"
          >
            <History className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stream List */}
      <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[580px] pr-1">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-600 font-mono text-xs border border-dashed border-slate-800 rounded">
            No audit records captured yet.
          </div>
        ) : (
          logs.map((log) => {
            const isAttack = log.status === 'BLOCKED_ATTACK' || log.action.includes('TAMPER') || log.action.includes('ATTACK');
            const isRejected = log.status === 'REJECTED';
            const isSuccess = log.status === 'SUCCESS' && (log.action === 'CHECKOUT_CAPTURE' || log.action === 'LOCK_CAPTURE');
            const isLock = log.action.includes('LOCK');

            let cardBg = 'bg-[#0A1224]';
            let borderColor = 'border-slate-700';
            let badgeColor = 'text-slate-400';

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
              borderColor = 'border-[#3395FF]';
              badgeColor = 'text-[#3395FF]';
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
                      <Shield className="w-3 h-3 text-slate-400" />
                    )}
                    [{log.action}]
                  </span>
                  <span className="text-slate-500 font-mono">{timeStr}</span>
                </div>

                {log.razorpay_payment_id ? (
                  <p className="text-xs text-slate-200 mb-1 font-mono">
                    <span className="text-emerald-400 font-semibold">{log.razorpay_payment_id}</span>
                    <span className="text-slate-500"> // Captured</span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-300 mb-1 font-mono leading-tight">
                    {log.reason}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 text-[9px] text-slate-500 font-mono uppercase tracking-tighter pt-0.5">
                  {log.sku && <span>SKU: <strong className="text-slate-400">{log.sku}</strong></span>}
                  {log.qty !== null && log.qty !== undefined && (
                    <span>QTY: <strong className="text-slate-400">{log.qty}</strong></span>
                  )}
                  {log.amount_inr !== null && log.amount_inr !== undefined && (
                    <span>AMT: <strong className="text-emerald-400">₹{log.amount_inr.toFixed(2)}</strong></span>
                  )}
                  {log.razorpay_order_id && (
                    <span>ORDER: <strong className="text-slate-400">{log.razorpay_order_id}</strong></span>
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
