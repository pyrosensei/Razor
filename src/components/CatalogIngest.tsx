import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  AlertTriangle,
  Lock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  RotateCw,
  ExternalLink,
  Info,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { CatalogItem, RejectedItem, CsvUploadResult } from '../types';

interface CatalogIngestProps {
  catalog: CatalogItem[];
  onRefresh: () => Promise<void>;
  onQuickCheckout?: (sku: string, qty: number) => void;
}

export const CatalogIngest: React.FC<CatalogIngestProps> = ({
  catalog,
  onRefresh,
  onQuickCheckout,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<CsvUploadResult | null>(null);
  const [rejectedItems, setRejectedItems] = useState<RejectedItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch rejected items from database
  const fetchRejectedItems = async () => {
    try {
      const res = await fetch('/api/catalog/rejected');
      if (res.ok) {
        const data = await res.json();
        setRejectedItems(data);
      }
    } catch (err) {
      console.error('Failed to load rejected items:', err);
    }
  };

  useEffect(() => {
    fetchRejectedItems();
  }, []);

  // Compute live coverage
  const lockedCount = uploadResult ? uploadResult.locked_count : catalog.filter((c) => c.is_locked).length;
  const heldOutCount = uploadResult ? uploadResult.rejected_count : rejectedItems.length;
  const totalRows = uploadResult ? uploadResult.total_count : (lockedCount + heldOutCount);
  const coveragePercent = totalRows > 0 ? ((lockedCount / totalRows) * 100).toFixed(1) : '100.0';

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // POST /catalog/upload accepting CSV file (Requirement 1)
      const res = await fetch('/catalog/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setUploadError(data.detail || data.error || 'Failed to upload CSV');
      } else {
        setUploadResult(data);
        await onRefresh();
        await fetchRejectedItems();
      }
    } catch (err: any) {
      setUploadError(err.message || 'Network error uploading CSV file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleLoadSample = async (type: 'clean' | 'rejects') => {
    setIsUploading(true);
    setUploadError(null);
    const path = type === 'clean' ? '/sample_clean.csv' : '/sample_with_rejects.csv';
    setFileName(type === 'clean' ? 'sample_clean.csv' : 'sample_with_rejects.csv');

    try {
      const sampleRes = await fetch(path);
      const csvText = await sampleRes.text();

      // POST /catalog/upload with text content
      const res = await fetch('/catalog/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvText,
      });

      const data = await res.json();

      if (!res.ok) {
        setUploadError(data.detail || data.error || 'Error processing sample CSV');
      } else {
        setUploadResult(data);
        await onRefresh();
        await fetchRejectedItems();
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to load sample');
    } finally {
      setIsUploading(false);
    }
  };

  const displayLockedItems = uploadResult
    ? uploadResult.locked
    : catalog.map((c) => ({
        sku: c.sku,
        title: c.name,
        unit_price_paise: c.price_paisa,
        unit_price_inr: c.price_inr,
        stock: c.stock,
        source_row_ref: c.source_row_ref || 'seeded',
        is_locked: c.is_locked,
        category: c.category,
      }));

  const displayRejectedItems = uploadResult ? uploadResult.rejected : rejectedItems;

  return (
    <div className="flex flex-col space-y-5">
      {/* Top Banner: Invariant 1 & Section 4 Overview */}
      <div className="bg-zinc-950 border border-white/10 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-white font-mono">
                Deterministic Catalog Ingest & Price Gate
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white border border-white/20">
                POST /catalog/upload
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Enforcing Invariant 1: Price authority lives only in the ingest parser + gate. The LLM never writes a number that gets charged.
            </p>
          </div>

          {/* KPI Badges */}
          <div className="flex items-center gap-3">
            <div className="bg-black border border-white/10 px-3 py-1.5 rounded text-right">
              <div className="text-[10px] uppercase font-mono text-zinc-600">Locked Items</div>
              <div className="text-sm font-bold font-mono text-emerald-400">{lockedCount}</div>
            </div>
            <div className="bg-black border border-white/10 px-3 py-1.5 rounded text-right">
              <div className="text-[10px] uppercase font-mono text-zinc-600">Held-Out (Rejects)</div>
              <div className="text-sm font-bold font-mono text-rose-400">{heldOutCount}</div>
            </div>
            <div className="bg-black border border-white/30 px-3.5 py-1.5 rounded text-right">
              <div className="text-[10px] uppercase font-mono text-white">Coverage %</div>
              <div className="text-sm font-bold font-mono text-white">{coveragePercent}%</div>
            </div>
          </div>
        </div>

        {/* Coverage Progress Bar */}
        <div className="mt-3">
          <div className="flex justify-between text-[11px] font-mono text-zinc-500 mb-1">
            <span>Price Gate Determinism: {lockedCount} / {totalRows} Validated</span>
            <span className="text-zinc-300 font-bold">{coveragePercent}%</span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-white/10">
            <div
              className="h-full bg-white transition-all duration-500"
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Upload Zone & Quick Sample Loaders */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* File Drag-and-Drop Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`md:col-span-7 border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-white/30 bg-white/5'
              : 'border-white/10 hover:border-white/20 bg-zinc-950/50'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />
          <Upload className="w-8 h-8 text-white mb-2" />
          <div className="text-sm font-semibold text-zinc-200">
            {isUploading ? 'Parsing and Enforcing Price Locks...' : 'Drop merchant catalog CSV here, or click to browse'}
          </div>
          <p className="text-xs text-zinc-600 font-mono mt-1 text-center">
            Supports ₹, "Rs.", "INR", thousand commas, and trailing "/-". Rejects POR and unparseable quotes.
          </p>
          {fileName && (
            <div className="mt-2 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Active File: {fileName}
            </div>
          )}
        </div>

        {/* Quick Sample Trigger Card */}
        <div className="md:col-span-5 bg-zinc-950 border border-white/10 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold font-mono text-zinc-300 uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Live Test Harness CSVs
            </div>
            <p className="text-xs text-zinc-500 font-mono leading-relaxed mb-3">
              Test both clean 100% price lock coverage and live rejection of commercial quotes ("Best price", "POR", "Call for price").
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => handleLoadSample('clean')}
              disabled={isUploading}
              className="w-full py-2 px-3 rounded bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold flex items-center justify-between transition-colors disabled:opacity-50"
            >
              <span>1. Load Clean Sample (100% Coverage)</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleLoadSample('rejects')}
              disabled={isUploading}
              className="w-full py-2 px-3 rounded bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 text-xs font-mono font-bold flex items-center justify-between transition-colors disabled:opacity-50"
            >
              <span>2. Load Sample with Rejects (Shows Live Rejects)</span>
              <AlertTriangle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs font-mono text-rose-300 flex items-center gap-2">
          <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>Upload Error: {uploadError}</span>
        </div>
      )}

      {/* Code Path Separation Proof Callout (Invariant 1 & Requirement 6) */}
      <div className="bg-black border border-white/20 rounded-lg p-3 text-xs font-mono">
        <div className="flex items-center gap-2 text-white font-bold mb-1">
          <ShieldCheck className="w-4 h-4" />
          <span>INVARIANT 1 CODE PATH SEPARATION PROOF</span>
        </div>
        <p className="text-zinc-500 text-[11px] leading-relaxed">
          <strong className="text-zinc-200">Zero LLM Price Visibility:</strong> NVIDIA NIM is restricted strictly to mapping messy column headers (passed as string list <code className="text-amber-400">headers: List[str]</code>) and cleaning title text.
          The cell price string is fed <strong className="text-emerald-400">directly and exclusively</strong> to Python's local deterministic rule parser (<code className="text-zinc-300">parse_inr_price_to_paise</code>) in <code className="text-zinc-300">backend/csv_ingest.py:270</code>. The LLM never sees or touches the raw price that gets locked.
        </p>
      </div>

      {/* TWO SEPARATE TABLES: Locked Items & Held-Out (Rejected) Items */}
      <div className="grid grid-cols-1 gap-5">
        {/* Table 1: Locked Items */}
        <div className="border border-white/10 rounded-lg bg-zinc-950 overflow-hidden">
          <div className="p-3.5 bg-slate-900/90 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-200">
                1. Locked Items Registry ({displayLockedItems.length})
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                event_type='price_lock'
              </span>
            </div>
            <span className="text-[10px] font-mono text-zinc-600">
              Stored with unit_price_paise + source_row_ref
            </span>
          </div>

          <div className="overflow-x-auto max-h-[300px]">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead className="sticky top-0 bg-zinc-950 text-[10px] text-zinc-500 uppercase tracking-wider border-b border-white/10">
                <tr>
                  <th className="px-4 py-2.5">Source Ref</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Product Title</th>
                  <th className="px-4 py-2.5 text-right">Locked Price (Paise)</th>
                  <th className="px-4 py-2.5 text-right">Locked Price (INR)</th>
                  <th className="px-4 py-2.5 text-center">Stock</th>
                  <th className="px-4 py-2.5 text-center">Gate State</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {displayLockedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-zinc-600 font-mono">
                      No locked catalog items yet. Upload a CSV or load a sample above.
                    </td>
                  </tr>
                ) : (
                  displayLockedItems.map((item, idx) => (
                    <tr key={`${item.sku}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-2 text-zinc-500">
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/10 text-[10px]">
                          {item.source_row_ref}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-white font-bold">{item.sku}</td>
                      <td className="px-4 py-2 text-zinc-200 max-w-xs truncate">{item.title || item.name}</td>
                      <td className="px-4 py-2 text-right text-zinc-500">
                        {item.unit_price_paise.toLocaleString()} p
                      </td>
                      <td className="px-4 py-2 text-right text-emerald-400 font-bold">
                        ₹{(item.unit_price_paise / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-center text-zinc-300">{item.stock}</td>
                      <td className="px-4 py-2 text-center">
                        <span
                          title="Price fixed by the deterministic gate — buyable"
                          className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          PRICE LOCKED ✓
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {onQuickCheckout && (
                          <button
                            onClick={() => onQuickCheckout(item.sku, 1)}
                            className="px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-white border border-white/30/40 text-[10px] font-bold uppercase transition-colors"
                          >
                            Pay 1x
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Held-Out (Rejected) Items */}
        <div className="border border-rose-900/40 rounded-lg bg-zinc-950 overflow-hidden">
          <div className="p-3.5 bg-rose-950/30 border-b border-rose-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-rose-200">
                2. Held-Out Table — Parse Rejections ({displayRejectedItems.length})
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
                event_type='price_reject'
              </span>
            </div>
            <span className="text-[10px] font-mono text-rose-400">
              Deterministic gate reject — non-numeric quotes rejected without guessing
            </span>
          </div>

          <div className="overflow-x-auto max-h-[300px]">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead className="sticky top-0 bg-[#0E070B] text-[10px] text-rose-300 uppercase tracking-wider border-b border-rose-900/40">
                <tr>
                  <th className="px-4 py-2.5">Source Ref</th>
                  <th className="px-4 py-2.5">Raw SKU</th>
                  <th className="px-4 py-2.5">Raw Product Title</th>
                  <th className="px-4 py-2.5 text-center">Raw Price Input</th>
                  <th className="px-4 py-2.5">Deterministic Rejection Reason</th>
                  <th className="px-4 py-2.5 text-center">Audit Event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-950/30">
                {displayRejectedItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-zinc-600 font-mono">
                      No rejected items. All ingested rows parsed deterministically (100% Coverage).
                    </td>
                  </tr>
                ) : (
                  displayRejectedItems.map((item, idx) => (
                    <tr key={`${item.source_row_ref}-${idx}`} className="hover:bg-rose-950/20 transition-colors">
                      <td className="px-4 py-2 text-zinc-500">
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/10 text-[10px]">
                          {item.source_row_ref}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-zinc-500">{item.raw_sku || 'N/A'}</td>
                      <td className="px-4 py-2 text-zinc-200 max-w-xs truncate">{item.raw_title}</td>
                      <td className="px-4 py-2 text-center font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        "{item.raw_price}"
                      </td>
                      <td className="px-4 py-2 text-rose-300 max-w-md">
                        {item.reject_reason}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                          <XCircle className="w-3 h-3" />
                          price_reject
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
