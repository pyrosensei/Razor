# Aisle — Explained Like You're Five

**One-line summary:** Agent-readable merchant catalog with a deterministic price lock; "The model shops. The rules pay."

## The Problem
Imagine you send a super-smart robot to the grocery store with your credit card. The robot is great at picking the best apples and chatting with the cashier. But sometimes, the robot hallucinates a coupon that doesn't exist, or decides the $10 apples should only cost $1, or tries to buy 50 apples when you only have $20 in your account. If the store's cash register just blindly trusts whatever the robot says, the store goes bankrupt or your bank account gets drained. We needed a cash register that doesn't trust the robot with numbers.

## Glossary
*   **SKU:** Product ID (Stock Keeping Unit).
*   **Paise:** 1/100 of a Rupee. We use integer math (100 paise = 1 INR) to completely eliminate floating-point calculation errors.
*   **Spend Mandate:** The budget ceiling (how much the robot is allowed to spend).
*   **Deterministic vs Probabilistic:**
    *   **Probabilistic:** The LLM guessing, thinking, and chatting (creative but can hallucinate).
    *   **Deterministic:** Hardcoded if/then rules that never change and never hallucinate (boring but perfectly safe).
*   **Audit Log:** An append-only notebook where every single action (approve, reject, block) is written down permanently.
*   **Race Condition / TOCTOU (Time-Of-Check to Time-Of-Use):** Two robots try to buy the last apple at the exact same millisecond. They both check stock (1 left), both think they can buy it, and both buy it. Now stock is -1 (overselling).
*   **Test Mode:** Simulated `order_sim_` / `pay_sim_` IDs. No live Razorpay keys are used in this codebase.

## The 7-Step Pipeline
1.  **Merchant CSV** is uploaded.
2.  **Deterministic Gate** parses messy text into integer paise and locks the price in the database.
3.  **Locked Catalog** is now safe for agents to read.
4.  **AI Buyer Agent (Nemotron)** searches the catalog and uses 3 tool calls.
5.  **Checkout Gate** strictly validates the purchase sequence: Lock → Stock → Spend Ceiling → No-discount.
6.  **Simulated Payment** generates Razorpay-shaped test IDs and decrements stock.
7.  **Immutable Audit** permanently logs the transaction.

## The 6 Non-Negotiable Invariants
1.  **Price authority lives only in ingest parser + gate.** The LLM never writes a charged number.
2.  **`create_checkout` accepts ONLY sku + qty.** Any extra injected fields (price, discount) trigger an immediate block.
3.  **Strict checkout order: locked → stock → spend limit → no discount.** Checked in this exact, unchangeable sequence.
4.  **Every lock, reject, block, capture writes exactly one `audit_log` row.** There are absolutely no silent paths.
5.  **LLM API down → rule-based fallback buyer completes purchase.** The money path never hard-depends on the model.
6.  **Test mode only.** We strictly use simulated IDs (`order_sim_` / `pay_sim_`).

## What Broke and How We Got Out
*   **Messy INR formats:** Real merchant CSVs had varied formats (`Rs. 450`, `₹1,299.00`). Handing this to an LLM caused numerical hallucinations. *Fix:* Engineered a deterministic rule-based regex parser.
*   **Model injecting prices:** The LLM occasionally invented discounts. *Fix:* The strict checkout gate outright rejects tool-calls that attempt to pass price or discount args, immediately logging an attack.
*   **Oversell race:** Concurrent requests oversold inventory. *Fix:* Enforced a strict `BEGIN IMMEDIATE` SQLite lock during checkout.
*   **Audit wipe on reset:** Resetting the catalog wiped the history. *Fix:* Made the `audit_log` append-only, and `/api/reset` now writes a `system_reset` row instead of deleting logs.
*   **Silent 404s:** Failed unlocks were silently throwing HTTP 404s. *Fix:* Wired all rejections to write `sku_not_found` audit logs before raising the HTTP exception.
*   **LLM down:** When the AI API dropped, the app died. *Fix:* Built a deterministic rule-based fallback buyer that triggers if the LLM is unreachable.
*   **Groq → NVIDIA NIM:** Migrated the entire codebase from Groq to NVIDIA NIM (Nemotron) for superior tool-call reliability and latency.

## Code Map
*   `gate.py`: The deterministic money gate (where checkout validations and locks happen).
*   `buyer.py`: The AI agent loop (Nemotron integration) + rule-based fallback buyer.
*   `csv_ingest.py` + `inr_parser.py`: The price authority and catalog ingestion logic.
*   `main.py`: The FastAPI server endpoints.
*   `database.py`: SQLite engine configuration (with a 30-second timeout) and seeding logic.
*   `models.py`: SQLModel database schemas.

## Why Razorpay Cares
Razorpay needs a trust layer for agentic commerce. As more AI agents get access to digital wallets, merchants need deterministic guardrails around the probabilistic intent of LLMs. Aisle perfectly matches Track 01 (AI Growth & Agentic Commerce) of the Razorpay AI Buildathon 2026 by proving that an agent can shop while strictly deterministic rules handle the payment.
