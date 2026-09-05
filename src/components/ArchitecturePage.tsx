import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Database,
  Lock,
  ArrowRight,
  Copy,
  Check,
  Terminal,
  Layers,
  Code,
  AlertTriangle,
  FileSpreadsheet,
  Workflow,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  Info
} from 'lucide-react';

// Exact tool schemas from backend/buyer.py (TOOLS_DEFINITION)
const BUYER_TOOLS = [
  {
    name: 'search_catalog',
    badge: 'Discovery Tool',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    description:
      'Search the merchant catalog for products by keyword or category. Returns matching products with stock, locked price in INR, unit_price_paise, and lock status.',
    invariantNote: 'Read-only discovery. Never mutates catalog state or initiates payment.',
    schema: {
      type: 'function',
      function: {
        name: 'search_catalog',
        description:
          'Search the merchant catalog for products by keyword or category. Returns matching products with stock, locked price in INR, unit_price_paise, and lock status.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                "Keyword search query (e.g. 'coffee', 'cable', 'monitor') or category name. Leave empty to list all available products."
            }
          },
          required: []
        }
      }
    }
  },
  {
    name: 'get_item',
    badge: 'Inspection Tool',
    badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
    description:
      'Get comprehensive details, real-time stock, and locked price status for a specific product SKU.',
    invariantNote: 'Inspects locked price in paise. Does not grant price modification authority.',
    schema: {
      type: 'function',
      function: {
        name: 'get_item',
        description:
          'Get comprehensive details, real-time stock, and locked price status for a specific product SKU.',
        parameters: {
          type: 'object',
          properties: {
            sku: {
              type: 'string',
              description: "The exact product SKU (e.g. 'SKU-COFFEE-ROAST')."
            }
          },
          required: ['sku']
        }
      }
    }
  },
  {
    name: 'create_checkout',
    badge: 'Invariant 2 Enforced',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    description:
      "Create an order checkout through the deterministic Aisle payment gate. Accepts strictly ONLY 'sku' and 'qty'. Price, unit_price, or discount parameters are strictly forbidden and will trigger an immediate security block.",
    invariantNote:
      'CRITICAL: Strictly forbidden from having price, unit_price, discount, or coupon parameters.',
    schema: {
      type: 'function',
      function: {
        name: 'create_checkout',
        description:
          "Create an order checkout through the deterministic Aisle payment gate. Accepts strictly ONLY 'sku' and 'qty'. Price, unit_price, or discount parameters are strictly forbidden and will trigger an immediate security block.",
        parameters: {
          type: 'object',
          properties: {
            sku: {
              type: 'string',
              description: 'Canonical product SKU to purchase.'
            },
            qty: {
              type: 'integer',
              description: 'Positive integer quantity to purchase.'
            }
          },
          required: ['sku', 'qty']
        }
      }
    }
  }
];

// Table Data: Deterministic vs Probabilistic division
const ARCHITECTURE_MATRIX = [
  {
    domain: 'CSV Parse',
    type: 'Deterministic',
    engine: 'FastAPI / Python Standard Library (csv)',
    authority: 'Rules',
    description: 'Exact CSV delimiter extraction, row indexing, and raw cell isolation.',
    isDeterministic: true
  },
  {
    domain: 'INR Parse',
    type: 'Deterministic',
    engine: 'backend/inr_parser.py (Regex + Math)',
    authority: 'Rules',
    description: 'Stripping symbols (₹, Rs., INR, /-) into canonical integer paise. Non-numeric values (POR, Call for price) are rejected deterministically.',
    isDeterministic: true
  },
  {
    domain: 'Price Lock',
    type: 'Deterministic',
    engine: 'backend/gate.py: lock_price_for_sku',
    authority: 'Rules',
    description: 'Locks the unit price to canonical paise in the database for 24h. The LLM can never alter this value.',
    isDeterministic: true
  },
  {
    domain: 'Stock Check & Decrement',
    type: 'Deterministic',
    engine: 'backend/gate.py (SQL atomic transaction)',
    authority: 'Rules',
    description: 'Verifies stock >= requested qty and decrements inventory. Oversell is blocked deterministically.',
    isDeterministic: true
  },
  {
    domain: 'Spend Limit Enforcement',
    type: 'Deterministic',
    engine: 'backend/gate.py (Spend Mandate check)',
    authority: 'Rules',
    description: 'Verifies (unit_price_paise * qty) <= remaining session budget. Exceeding spend is blocked with spend_limit_exceeded.',
    isDeterministic: true
  },
  {
    domain: 'No Discount Rule',
    type: 'Deterministic',
    engine: 'backend/gate.py (Allowed keys filter)',
    authority: 'Rules',
    description: 'Prohibits any discount, discount_pct, or promo fields. Injected discount attempts are logged as ATTACK_BLOCKED.',
    isDeterministic: true
  },
  {
    domain: 'Audit Trail',
    type: 'Deterministic',
    engine: 'backend/gate.py: log_audit',
    authority: 'Rules',
    description: 'Every price lock, reject, checkout capture, and attack block writes an immutable row into audit_log. No silent paths.',
    isDeterministic: true
  },
  {
    domain: 'Column Mapping',
    type: 'Probabilistic',
    engine: 'NVIDIA NIM (Nemotron) / Fuzzy Matching',
    authority: 'Model',
    description: 'Maps messy merchant headers (e.g. "Cost of Item", "Product Title") to canonical catalog keys.',
    isDeterministic: false
  },
  {
    domain: 'Title Cleanup',
    type: 'Probabilistic',
    engine: 'NVIDIA NIM (Nemotron)',
    authority: 'Model',
    description: 'Normalizes brand names, strips extraneous marketing fluff, and categorizes products.',
    isDeterministic: false
  },
  {
    domain: 'Buyer Search Intent',
    type: 'Probabilistic',
    engine: 'NVIDIA NIM (nvidia/nemotron-3.5-lightning-30b-a3b)',
    authority: 'Model',
    description: 'Interprets user prompt, persona context, and goals to formulate search queries and compare candidate products.',
    isDeterministic: false
  },
  {
    domain: 'SKU Pick',
    type: 'Probabilistic',
    engine: 'NVIDIA NIM (Autonomous agent loop)',
    authority: 'Model',
    description: 'Decides which specific product to buy based on user preferences and requirements.',
    isDeterministic: false
  }
];

export const ArchitecturePage: React.FC = () => {
  const [activeToolTab, setActiveToolTab] = useState<'search_catalog' | 'get_item' | 'create_checkout' | 'all'>('create_checkout');
  const [copiedTool, setCopiedTool] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTool(id);
    setTimeout(() => setCopiedTool(null), 2000);
  };

  const selectedTool = BUYER_TOOLS.find((t) => t.name === activeToolTab);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Page Header */}
      <div className="border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-widest bg-white/10 text-white border border-white/30/30">
              System Architecture</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 ml-2">
              Buyer LLM: NVIDIA Nemotron (via NIM)
            
            </span>
            <span className="text-slate-600 font-mono text-xs">// Phase 3 & 4 Verification</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1 flex items-center gap-2.5">
            <Workflow className="w-6 h-6 text-white" />
            Aisle Architecture & Governance Boundaries
          </h1>
          <p className="text-sm text-zinc-500 mt-1 max-w-3xl">
            Core thesis: <strong className="text-white font-mono">"The model shops. The rules pay."</strong> Probabilistic AI reasons about product selection and user intent; deterministic rules retain absolute authority over price, budget, inventory, and payment.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 text-right">
            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Enforcement Mode</div>
            <div className="text-xs font-mono font-bold text-emerald-400 flex items-center justify-end gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Deterministic Gate Active
            </div>
          </div>
        </div>
      </div>

      {/* SECTION D: Plain-English Architecture Explanation */}
      <section className="bg-zinc-950 rounded-xl border border-white/10 overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-zinc-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-white" />
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
              End-to-End Flow & Plain-English Explanation
            </h2>
          </div>
          <span className="text-[11px] font-mono text-zinc-600 uppercase">Invariant 1 - 6 Pipeline</span>
        </div>

        <div className="p-6 space-y-6">
          {/* Visual Step Pills */}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {[
              { step: '1', title: 'Merchant CSV', desc: 'Raw product data', color: 'border-white/20 bg-slate-900/60 text-zinc-300' },
              { step: '2', title: 'Deterministic Gate', desc: 'INR parser & lock', color: 'border-blue-500/40 bg-blue-950/20 text-blue-400' },
              { step: '3', title: 'Locked Catalog', desc: 'Immutable paise', color: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-400' },
              { step: '4', title: 'AI Buyer Agent', desc: 'Persona & reasoning', color: 'border-indigo-500/40 bg-indigo-950/20 text-indigo-300' },
              { step: '5', title: 'Checkout Gate', desc: 'Order verification', color: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-400' },
              { step: '6', title: 'Simulated Payment', desc: 'Razorpay test mode', color: 'border-amber-500/40 bg-amber-950/20 text-amber-400' },
              { step: '7', title: 'Immutable Audit', desc: 'Persistent audit_log', color: 'border-cyan-500/40 bg-cyan-950/20 text-cyan-400' },
            ].map((node, i) => (
              <div
                key={node.step}
                className={`p-3 rounded-lg border ${node.color} flex flex-col justify-between transition-all`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono font-bold opacity-70">
                  <span>STEP 0{node.step}</span>
                  {i < 6 && <ArrowRight className="w-3 h-3 hidden md:block" />}
                </div>
                <div className="mt-2">
                  <div className="text-xs font-bold font-mono tracking-tight">{node.title}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{node.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Plain English Paragraph */}
          <div className="p-4 rounded-lg bg-black border border-white/10 text-zinc-300 text-sm leading-relaxed">
            <p className="font-sans">
              A merchant uploads a standard product CSV. Rather than trusting an AI to interpret financial terms or prices, a deterministic parser validates every rupee and locks in the canonical prices in paise within a secure database. When an AI shopping agent searches for products, it is completely free to reason about customer intent, compare features, and pick items. But when it decides to buy, its checkout tool accepts <em>strictly only the SKU and quantity</em>. A strict deterministic checkout gate intercepts the request and verifies that the item price is locked, inventory exists, no discounts have been smuggled in, and the total cost fits inside the buyer's spend mandate. Only after all checks pass does the system generate a simulated Razorpay test payment and record an immutable event in the audit log. In short: <strong>the model shops; the rules pay.</strong>
            </p>
          </div>
        </div>
      </section>

      {/* SECTION A: Deterministic vs Probabilistic Matrix */}
      <section className="bg-zinc-950 rounded-xl border border-white/10 overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-zinc-950 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-white" />
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
              Deterministic vs. Probabilistic Architecture Division
            </h2>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Money & Security = Deterministic
            </span>
            <span className="text-slate-600">|</span>
            <span className="inline-flex items-center gap-1.5 text-indigo-400">
              <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
              Language & Intent = Probabilistic
            </span>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-white/10 text-zinc-500 font-mono text-[11px] uppercase tracking-wider bg-slate-900/40">
                  <th className="py-3 px-4">Component / Action</th>
                  <th className="py-3 px-4">Paradigm</th>
                  <th className="py-3 px-4">Execution Engine</th>
                  <th className="py-3 px-4">Authority</th>
                  <th className="py-3 px-4">Behavior & Governance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {ARCHITECTURE_MATRIX.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-900/30 transition-colors ${
                      row.isDeterministic ? 'bg-emerald-950/[0.04]' : 'bg-indigo-950/[0.04]'
                    }`}
                  >
                    <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                      {row.isDeterministic ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      )}
                      <span>{row.domain}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          row.isDeterministic
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                        }`}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-300 text-[11px]">{row.engine}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[11px] font-bold ${
                          row.authority === 'Rules' ? 'text-emerald-400' : 'text-indigo-400'
                        }`}
                      >
                        {row.authority}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 text-xs font-sans max-w-md">
                      {row.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3.5 rounded-lg bg-black border border-white/10 flex items-start gap-3 text-xs text-zinc-500">
            <Info className="w-4 h-4 text-white shrink-0 mt-0.5" />
            <div>
              <strong className="text-white font-mono">Architectural Guarantee:</strong> Even if the probabilistic NVIDIA NIM model hallucinates a price of ₹1.00 or invents a 90% coupon, the deterministic execution engine enforces strict database prices and immediate attack blocking. The model can never write the monetary number charged.
            </div>
          </div>
        </div>
      </section>

      {/* SECTION B: Three MCP-style Tools & Schemas */}
      <section className="bg-zinc-950 rounded-xl border border-white/10 overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-zinc-950 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-white" />
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
              MCP / NVIDIA NIM Model-Facing Tool Definitions
            </h2>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 uppercase">
            Source: backend/buyer.py (TOOLS_DEFINITION)
          </span>
        </div>

        <div className="p-6 space-y-6">
          <div className="p-4 rounded-lg bg-black border border-white/10 text-xs text-zinc-300 leading-relaxed">
            <p>
              The LLM buyer operates through three OpenAI-compatible function-calling tools via NVIDIA NIM. Notice that <strong className="text-emerald-400 font-mono">create_checkout</strong> accepts strictly only <code className="text-amber-300 font-mono">sku</code> and <code className="text-amber-300 font-mono">qty</code>. Price and discount parameters are completely absent from the tool definition schema (Invariant 2).
            </p>
          </div>

          {/* Tool Navigation Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
            {BUYER_TOOLS.map((tool) => (
              <button
                key={tool.name}
                onClick={() => setActiveToolTab(tool.name as any)}
                className={`px-3.5 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                  activeToolTab === tool.name
                    ? 'bg-white text-black shadow-md shadow-blue-500/20'
                    : 'bg-slate-900 text-zinc-500 hover:text-zinc-200 border border-white/10'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{tool.name}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${tool.badgeColor} ml-1`}>
                  {tool.name === 'create_checkout' ? 'No Price Field' : 'Safe'}
                </span>
              </button>
            ))}
            <button
              onClick={() => setActiveToolTab('all')}
              className={`px-3.5 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all ${
                activeToolTab === 'all'
                  ? 'bg-white text-black shadow-md shadow-blue-500/20'
                  : 'bg-slate-900 text-zinc-500 hover:text-zinc-200 border border-white/10'
              }`}
            >
              View Complete TOOLS_DEFINITION Array
            </button>
          </div>

          {/* Active Tool Details */}
          {activeToolTab !== 'all' && selectedTool ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-950/80 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold font-mono text-white">{selectedTool.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${selectedTool.badgeColor}`}>
                      {selectedTool.badge}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 font-sans">{selectedTool.description}</p>
                </div>
                <button
                  onClick={() => handleCopy(JSON.stringify(selectedTool.schema, null, 2), selectedTool.name)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-zinc-300 text-xs font-mono flex items-center gap-1.5 transition-colors self-start md:self-auto shrink-0"
                >
                  {copiedTool === selectedTool.name ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Copy Schema</span>
                    </>
                  )}
                </button>
              </div>

              {/* Parameter Table */}
              <div className="p-4 rounded-lg bg-black border border-white/10">
                <div className="text-xs font-mono uppercase text-zinc-500 font-bold mb-2">Parameters Schema</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(selectedTool.schema.function.parameters.properties).map(([key, prop]: [string, any]) => (
                    <div key={key} className="p-3 rounded bg-slate-900/60 border border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-white">{key}</span>
                        <span className="text-[10px] font-mono text-zinc-600 uppercase">{prop.type}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">{prop.description}</p>
                      <div className="mt-2 text-[10px] font-mono">
                        {selectedTool.schema.function.parameters.required.includes(key) ? (
                          <span className="text-amber-400 font-bold">REQUIRED</span>
                        ) : (
                          <span className="text-zinc-600">OPTIONAL</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {selectedTool.name === 'create_checkout' && (
                  <div className="mt-4 p-3 rounded bg-red-950/20 border border-red-900/40 flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-red-300">
                      <strong className="font-mono">Security Proof:</strong> Notice that parameters only contain <code className="text-white bg-red-900/40 px-1 py-0.5 rounded">sku</code> and <code className="text-white bg-red-900/40 px-1 py-0.5 rounded">qty</code>. The LLM cannot specify a price. If an adversary attempts to pass <code className="text-white bg-red-900/40 px-1 py-0.5 rounded">price</code> or <code className="text-white bg-red-900/40 px-1 py-0.5 rounded">discount</code>, the checkout gate triggers an immediate 400 Bad Request attack block with audit logging.
                    </div>
                  </div>
                )}
              </div>

              {/* Raw JSON Schema Preview */}
              <div className="relative">
                <div className="absolute top-2 right-2 text-[10px] font-mono text-zinc-600 uppercase bg-slate-900/80 px-2 py-1 rounded">
                  JSON Schema
                </div>
                <pre className="p-4 rounded-lg bg-black border border-white/10 text-zinc-300 font-mono text-xs overflow-x-auto">
                  {JSON.stringify(selectedTool.schema, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono text-zinc-500">All 3 Function Definitions</span>
                <button
                  onClick={() => handleCopy(JSON.stringify(BUYER_TOOLS.map(t => t.schema), null, 2), 'all')}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-zinc-300 text-xs font-mono flex items-center gap-1.5 transition-colors"
                >
                  {copiedTool === 'all' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Copy Full Tools Array</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-black border border-white/10 text-zinc-300 font-mono text-xs overflow-x-auto max-h-96">
                {JSON.stringify(BUYER_TOOLS.map(t => t.schema), null, 2)}
              </pre>
            </div>
          )}
        </div>
      </section>

      {/* SECTION C: "What Broke" in Agentic Commerce (Original Buildathon Context) */}
      <section className="bg-zinc-950 rounded-xl border border-white/10 overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-zinc-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
              Buildathon Brief Context: "What Broke" in Un-Gated Agentic Commerce
            </h2>
          </div>
          <span className="text-[11px] font-mono text-amber-400 uppercase">Failure Modes Addressed</span>
        </div>

        <div className="p-6 space-y-5">
          {/* Transparent Repository Status Note */}
          <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-900/40 flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200/90 leading-relaxed">
              <strong className="font-mono text-amber-300">Buildathon Brief Note:</strong> Per handoff instructions (Section 15 C), we checked the local repository git history and commit logs. The original raw buildathon text document is not present in the workspace files. Rather than fabricating or paraphrasing unverified text, the exact real-world failure modes that Aisle's deterministic gate mitigates are documented below from the verified codebase attack suite:
            </div>
          </div>

          {/* What Broke Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-black border border-red-950/50 space-y-2">
              <div className="flex items-center gap-2 text-red-400 text-xs font-mono font-bold uppercase">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>1. Model Dictates the Charged Price</span>
              </div>
              <p className="text-xs text-zinc-300 font-sans">
                In naive agentic checkout systems, the AI buyer passes <code className="text-amber-300 font-mono">{"price: 1.00"}</code> or hallucinates lower rates, causing merchants to lose revenue when the checkout API blind trusts the model's parameters.
              </p>
              <div className="text-[11px] font-mono text-emerald-400 pt-1">
                Aisle Fix: Invariant 1 & 2 — Price authority lives only in the catalog gate; create_checkout rejects all price keys.
              </div>
            </div>

            <div className="p-4 rounded-lg bg-black border border-red-950/50 space-y-2">
              <div className="flex items-center gap-2 text-red-400 text-xs font-mono font-bold uppercase">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>2. Unauthorized Discount / Promo Code Injection</span>
              </div>
              <p className="text-xs text-zinc-300 font-sans">
                Models generate fictional coupons or inject <code className="text-amber-300 font-mono">{"discount: 0.90"}</code> into tool payloads, circumventing merchant promotional rules.
              </p>
              <div className="text-[11px] font-mono text-emerald-400 pt-1">
                Aisle Fix: Invariant 2 & Rule 4 — Zero-discount gate rule immediately blocks and audits promo keys as attacks.
              </div>
            </div>

            <div className="p-4 rounded-lg bg-black border border-red-950/50 space-y-2">
              <div className="flex items-center gap-2 text-red-400 text-xs font-mono font-bold uppercase">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>3. Inventory Oversell & Ghost Stock</span>
              </div>
              <p className="text-xs text-zinc-300 font-sans">
                Agents hallucinate warehouse availability, ordering quantities exceeding merchant on-hand inventory and triggering downstream fulfillment failures.
              </p>
              <div className="text-[11px] font-mono text-emerald-400 pt-1">
                Aisle Fix: Invariant 3 (Rule 2) — Atomic stock availability check before generating any payment record.
              </div>
            </div>

            <div className="p-4 rounded-lg bg-black border border-red-950/50 space-y-2">
              <div className="flex items-center gap-2 text-red-400 text-xs font-mono font-bold uppercase">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>4. Spend Mandate Breach</span>
              </div>
              <p className="text-xs text-zinc-300 font-sans">
                Autonomous agents purchase luxury items or bulk orders without budgetary boundaries, depleting corporate accounts beyond delegated authority.
              </p>
              <div className="text-[11px] font-mono text-emerald-400 pt-1">
                Aisle Fix: Invariant 3 (Rule 3) — Mathematical spend ceiling tracked per session in database; blocks checkout if limit exceeded.
              </div>
            </div>

            <div className="p-4 rounded-lg bg-black border border-red-950/50 space-y-2 md:col-span-2">
              <div className="flex items-center gap-2 text-red-400 text-xs font-mono font-bold uppercase">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>5. Payment Pipeline Halts When LLM Fails</span>
              </div>
              <p className="text-xs text-zinc-300 font-sans">
                When external LLM providers (NVIDIA NIM/OpenAI) experience rate limits, outages, or timeouts, entire agentic commerce flows collapse and revenue halts completely.
              </p>
              <div className="text-[11px] font-mono text-emerald-400 pt-1">
                Aisle Fix: Invariant 5 — Deterministic local rule-based fallback buyer takes over instantly; logged with event_type="fallback_triggered".
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Six Non-Negotiable Invariants Quick-Check Banner */}
      <section className="p-6 rounded-xl bg-gradient-to-r from-[#080B14] via-[#0A0F1D] to-[#080B14] border border-white/10">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
            Six Non-Negotiable Invariants Checklist
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3 rounded bg-black border border-white/10">
            <span className="text-emerald-400 font-bold">INVARIANT 1:</span> Price authority lives only in ingest parser + gate.
          </div>
          <div className="p-3 rounded bg-black border border-white/10">
            <span className="text-emerald-400 font-bold">INVARIANT 2:</span> create_checkout accepts ONLY sku & qty.
          </div>
          <div className="p-3 rounded bg-black border border-white/10">
            <span className="text-emerald-400 font-bold">INVARIANT 3:</span> Check order: Locked → Stock → Spend → No Discount.
          </div>
          <div className="p-3 rounded bg-black border border-white/10">
            <span className="text-emerald-400 font-bold">INVARIANT 4:</span> Every lock, reject, block, & capture writes audit_log.
          </div>
          <div className="p-3 rounded bg-black border border-white/10">
            <span className="text-emerald-400 font-bold">INVARIANT 5:</span> LLM failure triggers local rule fallback buyer.
          </div>
          <div className="p-3 rounded bg-black border border-white/10">
            <span className="text-emerald-400 font-bold">INVARIANT 6:</span> Razorpay test mode only (order_sim_, pay_sim_).
          </div>
        </div>
      </section>
    </div>
  );
};
