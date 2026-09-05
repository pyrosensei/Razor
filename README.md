# Aisle — Agent-Readable Merchant Catalog & Deterministic Price Gate
**Simulated Razorpay test-mode IDs (order_sim_/pay_sim_) — no live keys.**

Aisle is an agent-readable merchant catalog with a deterministic price lock and an autonomous AI buyer (powered by Groq `llama-3.3-70b-versatile`) that completes simulated Razorpay test-mode payments under a strict corporate spend mandate. The model shops, the rules pay.

## The 6 Non-Negotiable Invariants
| Inv | Rule | Enforcement |
|---|---|---|
| 1 | Price authority lives only in ingest parser + gate. | LLM never writes a charged number. |
| 2 | create_checkout accepts ONLY sku + qty. | Extra fields (price, discount) are BLOCKED + audit-logged. |
| 3 | Strict checkout order: locked -> stock -> spend limit -> no discount. | Checked in this exact sequence. |
| 4 | Every lock, reject, block, capture writes exactly one audit_log row. | No silent paths. |
| 5 | LLM API down -> rule-based fallback buyer completes purchase. | Money path never hard-depends on LLM. |
| 6 | Test mode only. | Simulated IDs (order_sim_ / pay_sim_). |

## Setup & Run
```bash
# Backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --port 8001 --reload

# Frontend
npm install
npm run dev
```

## LLM Provider & Architecture
- **Buyer Model**: Groq API using `llama-3.3-70b-versatile` with OpenAI-compatible tool calling.
- **Deterministic Gate**: Local Python / FastAPI / SQLite transaction layer guaranteeing zero hallucinated prices or rogue discounts.
- **Failover**: If the LLM is unreachable, the local rule-based fallback buyer deterministically completes the purchase (Invariant 5).

## What Broke and How We Got Out
- **Messy INR formats → Rule parser**: Real merchant CSVs contain varied formats (`Rs. 450`, `₹1,299.00`, `INR 850/-`, strings with trailing whitespace). Handing raw price parsing to an LLM caused numerical inconsistencies and hallucinations. *Fix*: Engineered a deterministic rule-based regex parser (`backend/inr_parser.py`) converting all values strictly into integer paise at catalog ingest.
- **Model filling missing prices → Gate mismatch reject**: Incomplete catalog items invited agents to guess price amounts. *Fix*: Mandatory deterministic price locking (`CatalogItem.is_locked = True`, `locked_price_paisa = canonical_paisa`). Unlocked items fail Rule 1 check and are hard-rejected before payment creation.
- **LLM down or timeout → Fallback buyer**: Relying solely on external LLM inference makes the commerce flow brittle. *Fix*: Implemented an autonomous rule-based fallback buyer (`backend/buyer.py`) that filters locked, in-stock SKUs and directly dispatches `create_checkout(sku, qty)` within the spend mandate.
- **Invented discounts or price overrides → Hard reject & attack audit**: An agent or user might inject `discount: 0.9` or `unit_price: 1`. *Fix*: The checkout gate strictly validates that payloads contain ONLY `sku`, `qty`, and `buyer_session_id`. Any extra field triggers immediate HTTP 400 rejection and writes an `ATTACK_BLOCKED` audit log row.
