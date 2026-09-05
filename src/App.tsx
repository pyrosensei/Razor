import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { MerchantCatalog } from './components/MerchantCatalog';
import { CatalogIngest } from './components/CatalogIngest';
import { AIBuyerConsole } from './components/AIBuyerConsole';
import { BuyerPage } from './components/BuyerPage';
import { AttackSimulator } from './components/AttackSimulator';
import { AuditLogViewer } from './components/AuditLogViewer';
import { GateProtocolCard } from './components/GateProtocolCard';
import { SpendMandateCard } from './components/SpendMandateCard';
import { SecurityLabPage } from './components/SecurityLabPage';
import { ArchitecturePage } from './components/ArchitecturePage';
import { CatalogItem, SpendMandate, AuditLogEntry, BuyerRunResult } from './types';

export default function App() {
  const [mainView, setMainView] = useState<'catalog' | 'buyer' | 'commerce' | 'lab' | 'architecture'>('lab');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [mandate, setMandate] = useState<SpendMandate | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [buyerResult, setBuyerResult] = useState<BuyerRunResult | null>(null);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isLockingAll, setIsLockingAll] = useState(false);
  const [isExecutingBuyer, setIsExecutingBuyer] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  const [activeTab, setActiveTab] = useState<'buyer' | 'attack'>('buyer');

  // Fetch all core data
  const fetchData = useCallback(async () => {
    try {
      const [catRes, manRes, logRes] = await Promise.all([
        fetch('/api/catalog'),
        fetch('/api/mandate'),
        fetch('/api/audit-log?limit=50'),
      ]);

      if (catRes.ok) {
        const catData = await catRes.json();
        setCatalog(catData);
      }
      if (manRes.ok) {
        const manData = await manRes.json();
        setMandate(manData);
      }
      if (logRes.ok) {
        const logData = await logRes.json();
        setAuditLogs(logData);
      }
    } catch (err) {
      console.error('Failed to fetch Aisle data:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Toggle lock state
  const handleToggleLock = async (sku: string, currentLock: boolean) => {
    try {
      const endpoint = currentLock ? `/api/catalog/${sku}/unlock` : `/api/catalog/${sku}/lock`;
      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Error toggling price lock:', err);
    }
  };

  // Lock all items to canonical price
  const handleLockAll = async () => {
    setIsLockingAll(true);
    try {
      for (const item of catalog) {
        if (!item.is_locked) {
          await fetch(`/api/catalog/${item.sku}/lock`, { method: 'POST' });
        }
      }
      await fetchData();
    } catch (err) {
      console.error('Error locking items:', err);
    } finally {
      setIsLockingAll(false);
    }
  };

  // Reset database state
  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (res.ok) {
        setBuyerResult(null);
        await fetchData();
      }
    } catch (err) {
      console.error('Error resetting database:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Quick direct checkout gate test (sku and qty only - Invariant 2)
  const handleQuickCheckout = async (sku: string, qty: number) => {
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, qty }),
      });
      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}: ${res.statusText || 'Checkout Failed'}`;
        try {
          const data = await res.json();
          if (data?.detail) {
            errorMsg = typeof data.detail === 'object'
              ? (data.detail.message || data.detail.block_reason || JSON.stringify(data.detail))
              : String(data.detail);
          } else if (data?.reason) {
            errorMsg = data.reason;
          } else if (data?.block_reason) {
            errorMsg = data.block_reason;
          }
        } catch {
          // Response body was not valid JSON (e.g. backend down or proxy 404/502)
        }
        await fetchData();
        alert(`Gate Rejection: ${errorMsg}`);
        return;
      }
      await res.json();
      await fetchData();
    } catch (err) {
      console.error('Error during quick checkout:', err);
    }
  };

  // Run AI Buyer
  const handleRunBuyer = async (intent: string, forceFallback: boolean, nimApiKey: string) => {
    setIsExecutingBuyer(true);
    try {
      const res = await fetch('/api/buyer/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent,
          force_fallback: forceFallback,
          nvidia_nim_api_key: nimApiKey || undefined,
          groq_api_key: nimApiKey || undefined,
        }),
      });
      const data = await res.json();
      setBuyerResult(data);
      await fetchData();
    } catch (err) {
      console.error('Error running AI buyer:', err);
    } finally {
      setIsExecutingBuyer(false);
    }
  };

  // Fire attack payload directly to gate
  const handleSimulateAttack = async (payload: Record<string, unknown>) => {
    setIsAttacking(true);
    try {
      const res = await fetch('/api/test/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      await fetchData();
      return data;
    } catch (err: any) {
      return { error: err.message };
    } finally {
      setIsAttacking(false);
    }
  };

  // Update Mandate Ceiling
  const handleUpdateMandateCeiling = async (maxAmountInr: number, resetSpent: boolean) => {
    try {
      await fetch('/api/mandate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_amount_inr: maxAmountInr,
          reset_spent: resetSpent,
        }),
      });
      await fetchData();
    } catch (err) {
      console.error('Error updating mandate:', err);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-zinc-300 font-sans selection:bg-white/30 selection:text-white">
      {/* Header */}
      <Header
        mandate={mandate}
        onReset={handleReset}
        isResetting={isResetting}
        onLockAll={handleLockAll}
        isLockingAll={isLockingAll}
        activeView={mainView}
        onSelectView={setMainView}
      />

      {/* Main Content: Catalog Ingest vs AI Buyer Agent vs Live Commerce Cockpit */}
      {mainView === 'catalog' ? (
        <main className="flex-1 grid grid-cols-12 gap-0">
          <section className="col-span-12 xl:col-span-8 p-6 border-b xl:border-b-0 xl:border-r border-white/10 bg-black overflow-y-auto">
            <CatalogIngest
              catalog={catalog}
              onRefresh={fetchData}
              onQuickCheckout={handleQuickCheckout}
            />
          </section>

          <section className="col-span-12 xl:col-span-4 bg-zinc-950 p-6 space-y-4 flex flex-col">
            <SpendMandateCard
              mandate={mandate}
              onUpdateCeiling={handleUpdateMandateCeiling}
              isLoading={false}
            />
            <div className="flex-1">
              <AuditLogViewer
                logs={auditLogs}
                isLoading={false}
                onRefresh={fetchData}
              />
            </div>
            <GateProtocolCard />
          </section>
        </main>
      ) : mainView === 'buyer' ? (
        <main className="flex-1 bg-black overflow-y-auto">
          <BuyerPage
            mandate={mandate}
            onRefreshData={fetchData}
          />
        </main>
      ) : mainView === 'lab' ? (
        <main className="flex-1 bg-black overflow-y-auto">
          <SecurityLabPage
            mandate={mandate}
            onRefreshData={fetchData}
          />
        </main>
      ) : mainView === 'architecture' ? (
        <main className="flex-1 bg-black overflow-y-auto">
          <ArchitecturePage />
        </main>
      ) : (
        <main className="flex-1 grid grid-cols-12 gap-0">
          {/* Left Column: Catalog & AI Buyer / Attack Simulator */}
          <section className="col-span-12 xl:col-span-7 flex flex-col border-b xl:border-b-0 xl:border-r border-white/10 bg-black">
            {/* Catalog View */}
            <div className="flex-1">
              <MerchantCatalog
                items={catalog}
                onToggleLock={handleToggleLock}
                onQuickCheckout={handleQuickCheckout}
                isLoading={isLoadingCatalog}
                selectedSku={selectedSku}
                onSelectSku={setSelectedSku}
              />
            </div>

            {/* Interactive Console Tabs: Buyer Engine vs Attack Harness */}
            <div className="p-6 pt-0 border-t border-white/10/80 bg-black">
              <div className="flex items-center gap-2 mb-3 pt-4">
                <button
                  onClick={() => setActiveTab('buyer')}
                  className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                    activeTab === 'buyer'
                      ? 'bg-white text-black'
                      : 'bg-slate-900 text-zinc-500 hover:text-zinc-200 border border-white/10'
                  }`}
                >
                  AI Buyer Console (Invariant 1 & 5)
                </button>
                <button
                  onClick={() => setActiveTab('attack')}
                  className={`px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                    activeTab === 'attack'
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-900 text-zinc-500 hover:text-red-400 border border-white/10'
                  }`}
                >
                  Attack Simulator (Invariant 2 Proof)
                </button>
              </div>

              {activeTab === 'buyer' ? (
                <AIBuyerConsole
                  onRunBuyer={handleRunBuyer}
                  isRunning={isExecutingBuyer}
                  buyerResult={buyerResult}
                  mandate={mandate}
                />
              ) : (
                <AttackSimulator
                  onSimulateAttack={handleSimulateAttack}
                  isLoading={isAttacking}
                />
              )}
            </div>
          </section>

          {/* Right Column: Mandate Governor, Immutable Audit Log & Gate Protocol */}
          <section className="col-span-12 xl:col-span-5 bg-zinc-950 flex flex-col p-6 space-y-4">
            <SpendMandateCard
              mandate={mandate}
              onUpdateCeiling={handleUpdateMandateCeiling}
              isLoading={false}
            />

            <div className="flex-1">
              <AuditLogViewer
                logs={auditLogs}
                isLoading={false}
                onRefresh={fetchData}
              />
            </div>

            <GateProtocolCard />
          </section>
        </main>
      )}

      {/* Footer */}
      <footer className="px-6 py-3 bg-black border-t border-white/10 flex flex-wrap justify-between items-center text-[10px] font-mono text-zinc-600 uppercase tracking-widest gap-2">
        <div>SYSTEM_ID: AISLE-01-RAZORPAY-BUILDATHON</div>
        <div className="flex flex-wrap gap-4">
          <span>BACKEND: FASTAPI_PY</span>
          <span className="text-white">GATE: DETERMINISTIC_LOCK</span>
          <span>LLM: NVIDIA_NIM_TOOL_CALLING</span>
          <span className="text-emerald-400">TEST_MODE: SIM_ORDERS</span>
        </div>
      </footer>
    </div>
  );
}
