# 5-Minute Pitch — Word-for-Word Script

## Recording Tips
*   **Video:** 1080p minimum. Clear screen capture with your face/webcam in the corner.
*   **Audio:** High-quality mic. No background music.
*   **Focus:** Do NOT read code line-by-line. Focus entirely on the UI, the business problem, and the architectural invariants.

## The Script

**0:00 - 0:40 (The Hook: Model Shops, Rules Pay)**
"Agentic commerce is broken. If an LLM hallucinates a price of ₹1 or invents a 90% coupon code, naive APIs will blindly charge that amount. Merchants lose money instantly. Welcome to Aisle. Our core philosophy is simple: The model shops, but the rules pay. We've built a deterministic money gate that completely strips pricing authority away from the AI."

**0:40 - 1:30 (Act 1: Ingest + Parser)**
"It starts at ingestion. *[Show Merchant Catalog]* Real-world CSVs have messy price strings. Handing those to an LLM causes calculation hallucinations. Aisle uses a strict, deterministic regex parser to convert all prices to integer paise, eliminating float errors. Once ingested, the price is hard-locked into the database. The LLM can read this price, but it can never edit it."

**1:30 - 2:30 (Act 2: Nemotron Buyer & Schema)**
"Let's make a purchase. *[Run normal AI Buyer request]* We are using NVIDIA NIM to power the Nemotron model. Notice the tool schema for checkout. It strictly accepts only `sku` and `qty`. There is literally no field for price or discount in the tool definition. The AI couldn't pass a price if it wanted to."

**2:30 - 3:30 (Act 3: Security Lab & Attacks)**
"But what if a malicious user prompt-injects the agent into passing a price parameter anyway? *[Navigate to Security Lab, trigger Price Override attack]* The deterministic gate catches it instantly. It evaluates a strict sequence: lock, stock, spend ceiling, and no-discount. The attack is immediately blocked. *[Navigate to Audit Log]* And right here, you see the immutable audit log proving the gate caught the attack before it ever reached the payment simulator."

**3:30 - 4:15 (Act 4: Kill the LLM)**
"What happens when the LLM provider goes down? *[Toggle Simulate NIM Down in Buyer tab and run]* Revenue shouldn't halt just because an API timed out. When Aisle detects an unreachable LLM, it drops into a deterministic rule-based fallback buyer that securely completes the purchase within the spend mandate. *[Point to Audit Log]* As you can see, the fallback trigger is permanently logged."

**4:15 - 5:00 (Act 5: The Razorpay Close)**
"Razorpay is the trust layer for human commerce. With Aisle, we extend that trust to agentic commerce. By wrapping probabilistic AI intent inside deterministic guardrails, we make it completely safe for autonomous agents to hold digital wallets. Thank you."

---

## Q&A One-Liners (If asked by judges)
*   **Why simulate Razorpay IDs instead of live keys?** "We strictly enforce test mode to prove the architectural boundary. The simulation cleanly mocks the exact shape of a Razorpay order, making it a one-function swap to go live without risking real capital during a hackathon."
*   **Why SQLite?** "SQLite supports `BEGIN IMMEDIATE` transaction locking. This allows us to perfectly serialize concurrent checkouts and prevent TOCTOU race conditions without needing heavy infrastructure like Redis."
*   **Why NVIDIA Nemotron?** "For agentic checkout, tool-call reliability and low latency are far more valuable than raw creative IQ. We offload all the safety and math to the deterministic gate anyway."
*   **What if two buyers hit the last stock at the exact same millisecond?** "Our `BEGIN IMMEDIATE` lock serializes them. The first captures the stock; the second reads stock=0, blocks the transaction, and writes an immutable audit log."
