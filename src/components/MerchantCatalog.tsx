import React, { useState } from 'react';
import { Lock, Unlock, ShoppingBag, CheckCircle, Search, Sparkles } from 'lucide-react';
import { CatalogItem } from '../types';

interface MerchantCatalogProps {
  items: CatalogItem[];
  onToggleLock: (sku: string, currentLock: boolean) => void;
  onQuickCheckout: (sku: string, qty: number) => void;
  isLoading: boolean;
  selectedSku: string | null;
  onSelectSku: (sku: string) => void;
}

export const MerchantCatalog: React.FC<MerchantCatalogProps> = ({
  items,
  onToggleLock,
  onQuickCheckout,
  isLoading,
  selectedSku,
  onSelectSku,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = ['all', ...Array.from(new Set(items.map((i) => i.category)))];

  const filteredItems = items.filter((item) => {
    const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full bg-black p-6 border-r border-white/10">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">
              Merchant Catalog
            </h2>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
              Deterministic Price Lock Active
            </span>
          </div>
          <p className="text-xs text-zinc-600 mt-0.5 font-mono">
            Invariant 1: Authority resides strictly in catalog gate — LLM never dictates charged amount
          </p>
        </div>
        <div className="text-right">
          <span className="text-[11px] font-mono text-zinc-500 bg-slate-900 border border-white/10 px-2.5 py-1 rounded">
            SKU_REGISTRY: {items.length} ITEMS
          </span>
        </div>
      </div>

      {/* Controls: Search and Categories */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter SKU or item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-white/10 text-xs text-zinc-200 pl-8 pr-3 py-1.5 rounded focus:outline-none focus:border-white/30 font-mono"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 max-w-full">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase whitespace-nowrap transition-colors ${
                filterCategory === cat
                  ? 'bg-white text-black font-semibold'
                  : 'bg-zinc-950 text-zinc-500 hover:text-zinc-200 border border-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 border border-white/10 rounded-lg overflow-y-auto bg-zinc-950 shadow-inner max-h-[420px]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-zinc-950 z-10">
            <tr className="bg-slate-900/80 border-b border-white/10 text-[10px] uppercase tracking-wider text-zinc-500 font-mono font-bold">
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Product Name</th>
              <th className="px-4 py-3">Authority Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Gate Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-xs font-mono divide-y divide-slate-800/40">
            {filteredItems.map((item) => {
              const isSelected = selectedSku === item.sku;
              return (
                <tr
                  key={item.sku}
                  onClick={() => onSelectSku(item.sku)}
                  className={`transition-colors cursor-pointer ${
                    isSelected ? 'bg-slate-800/40' : 'hover:bg-slate-800/20'
                  }`}
                >
                  <td className="px-4 py-3 text-white font-bold">
                    {item.sku}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-zinc-200 font-sans font-medium line-clamp-1">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-zinc-600 line-clamp-1">
                      {item.category} • {item.description}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-emerald-400 font-bold whitespace-nowrap">
                    ₹{item.price_inr.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] ${
                        item.stock > 10
                          ? 'text-zinc-300'
                          : item.stock > 0
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }`}
                    >
                      {item.stock} left
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {item.is_locked ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          title="Price fixed by the deterministic gate — buyable"
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20 text-[10px] font-semibold"
                        >
                          <Lock className="w-2.5 h-2.5" />
                          PRICE LOCKED ✓
                        </span>
                        {item.lock_expires_at && (
                          new Date(item.lock_expires_at).getTime() < Date.now() ? (
                            <span className="text-[10px] text-rose-400 font-mono">EXPIRED — re-lock</span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              expires in {Math.max(0, Math.round((new Date(item.lock_expires_at).getTime() - Date.now()) / 3600000))}h
                            </span>
                          )
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20 text-[10px] font-semibold">
                        <Unlock className="w-2.5 h-2.5" />
                        UNLOCKED
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onToggleLock(item.sku, item.is_locked)}
                        disabled={isLoading}
                        title={item.is_locked ? "Unlock price (tests Invariant 3 rejection)" : "Lock price at canonical ingest rate"}
                        className="p-1.5 rounded border border-white/20 bg-slate-900/60 hover:bg-slate-800 text-zinc-500 hover:text-white transition-colors"
                      >
                        {item.is_locked ? (
                          <Unlock className="w-3 h-3 text-amber-400" />
                        ) : (
                          <Lock className="w-3 h-3 text-emerald-400" />
                        )}
                      </button>
                      <button
                        onClick={() => onQuickCheckout(item.sku, 1)}
                        disabled={isLoading || item.stock <= 0}
                        title="Direct 1-click checkout gate request (sku + qty only)"
                        className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white border border-white/30/30 text-[10px] uppercase font-bold transition-colors disabled:opacity-30"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        <span>Pay 1x</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
