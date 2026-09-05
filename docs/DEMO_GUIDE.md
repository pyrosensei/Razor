# How to Run & Demo Aisle

## Setup Commands
**1. Backend (FastAPI)**
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --port 8001 --reload
```

**2. Frontend (React/Vite)**
```bash
npm install
npm run dev
```

**3. Environment Configuration**
Ensure you have an `.env` file at the root of the project:
```env
NVIDIA_NIM_API_KEY="nvapi-..."
```
*(If omitted, the app gracefully falls back to the deterministic rule-based buyer).*

## Pre-Demo Checklist
1. Click **Reset System** via the UI or `POST /api/reset` to wipe slate clean.
2. Confirm exactly 6 seeded SKUs exist in the Merchant Catalog.
3. Ensure the Audit Log viewer shows the "system_reset" initialization row.

## The 5-Act Demo Flow
*(Timings match the 5-Minute Pitch Script)*

*   **Act 1: Ingest & Parser (0:40 - 1:30)**
    *   Show the Merchant Catalog tab.
    *   Point out the locked prices (prices are green and locked deterministically, never by the LLM).
*   **Act 2: Nemotron Buyer (1:30 - 2:30)**
    *   Go to the AI Buyer tab.
    *   Click "Run AI Buyer" for a normal request.
    *   Show the successful capture and highlight the `order_sim_` test IDs.
*   **Act 3: Security Lab Attacks (2:30 - 3:30)**
    *   Go to the Security Lab tab.
    *   Trigger the **Price Override** and **Unauthorized Discount** attacks.
    *   Jump immediately to the Audit Log. Point at the red `BLOCKED` logs proving the deterministic gate caught the LLM hallucination.
*   **Act 4: LLM-Down Fallback (3:30 - 4:15)**
    *   In the AI Buyer tab, toggle **"Simulate NVIDIA NIM Down"**.
    *   Run the buyer. Show that the purchase still completes instantly.
    *   Point out the `fallback_triggered` entry in the Audit Log.
*   **Act 5: Immutable Audit (4:15 - 5:00)**
    *   Stay on the Audit Log page to close the demo. Show that every single action taken across the 4 acts was immutably recorded.

## Troubleshooting
*   **Port 8001 Busy:** If uvicorn fails, find and kill the process: `lsof -i :8001` then `kill -9 <PID>`.
*   **Missing Key / Silent Fallback:** If you forget your `NVIDIA_NIM_API_KEY`, the app will intentionally trigger the fallback buyer by design (Invariant 5).
*   **Stale Database:** If you run into weird stock limits or want a fresh start, just hit the **Reset System** button.
