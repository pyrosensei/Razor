import os
import json
import httpx
import re
import datetime
import secrets
from typing import Dict, Any, List, Optional
from fastapi import HTTPException
from sqlmodel import Session, select
from backend.models import CatalogItem, SpendMandate, AuditLog, BuyerSession, Order
from backend.gate import lock_price_for_sku, process_checkout_gate, log_audit

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
MAX_AGENT_TURNS = 6

# -----------------------------------------------------------------------------
# Section 6: Groq Function-Calling Tool Definitions
# INVARIANT: create_checkout's schema must NOT include a price or discount field.
# -----------------------------------------------------------------------------
TOOLS_DEFINITION = [
    {
        "type": "function",
        "function": {
            "name": "search_catalog",
            "description": "Search the merchant catalog for products by keyword or category. Returns matching products with stock, locked price in INR, unit_price_paise, and lock status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Keyword search query (e.g. 'coffee', 'cable', 'monitor') or category name. Leave empty to list all available products."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_item",
            "description": "Get comprehensive details, real-time stock, and locked price status for a specific product SKU.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku": {
                        "type": "string",
                        "description": "The exact product SKU (e.g. 'SKU-COFFEE-ROAST')."
                    }
                },
                "required": ["sku"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_checkout",
            "description": "Create an order checkout through the deterministic Aisle payment gate. Accepts strictly ONLY 'sku' and 'qty'. Price, unit_price, or discount parameters are strictly forbidden and will trigger an immediate security block.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku": {
                        "type": "string",
                        "description": "Canonical product SKU to purchase."
                    },
                    "qty": {
                        "type": "integer",
                        "description": "Positive integer quantity to purchase."
                    }
                },
                "required": ["sku", "qty"]
            }
        }
    }
]

def execute_tool(
    session: Session,
    name: str,
    args: Dict[str, Any],
    buyer_session_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Executes a tool call against the real Phase 1/2 database and gate endpoints (no mocks).
    """
    if name == "search_catalog":
        query_str = (args.get("query") or "").strip().lower()
        items = session.exec(select(CatalogItem)).all()
        
        matched: List[CatalogItem] = []
        for item in items:
            if not query_str:
                matched.append(item)
                continue
            
            # Match against sku, name, category, description, tags
            haystack = f"{item.sku} {item.name} {item.category} {item.description or ''} {item.tags}".lower()
            if query_str in haystack or any(term in haystack for term in query_str.split() if len(term) > 2):
                matched.append(item)

        return {
            "count": len(matched),
            "items": [
                {
                    "sku": item.sku,
                    "name": item.name,
                    "category": item.category,
                    "unit_price_paise": item.unit_price_paise or item.price_paisa,
                    "price_inr": (item.unit_price_paise or item.price_paisa) / 100.0,
                    "stock": item.stock,
                    "is_locked": item.is_locked,
                    "locked_price_paise": item.locked_price_paisa,
                    "description": item.description
                }
                for item in matched
            ]
        }

    elif name == "get_item":
        sku = (args.get("sku") or "").strip()
        item = session.exec(select(CatalogItem).where(CatalogItem.sku == sku)).first()
        if not item:
            return {"error": f"Item with SKU '{sku}' not found in catalog."}
        
        return {
            "sku": item.sku,
            "name": item.name,
            "category": item.category,
            "description": item.description,
            "unit_price_paise": item.unit_price_paise or item.price_paisa,
            "price_inr": (item.unit_price_paise or item.price_paisa) / 100.0,
            "stock": item.stock,
            "is_locked": item.is_locked,
            "locked_price_paise": item.locked_price_paisa,
            "lock_expires_at": item.lock_expires_at.isoformat() if item.lock_expires_at else None
        }

    elif name == "create_checkout":
        # Pass raw args through gate.
        # If buyer_session_id is active, attach it to payload
        checkout_payload = dict(args)
        if buyer_session_id and "buyer_session_id" not in checkout_payload:
            checkout_payload["buyer_session_id"] = buyer_session_id

        try:
            gate_result = process_checkout_gate(session, checkout_payload)
            return gate_result
        except HTTPException as he:
            # Return machine-readable block error details to the model
            return he.detail if isinstance(he.detail, dict) else {"error": str(he.detail)}
        except Exception as e:
            return {"error": "UNEXPECTED_GATE_ERROR", "detail": str(e)}

    else:
        return {"error": f"Unknown tool: '{name}'"}

def run_rule_based_fallback_buyer(
    session: Session,
    intent: str,
    reason_trigger: str,
    spend_limit_paise: Optional[int] = None,
    buyer_session_id: Optional[str] = None,
    persona: Optional[str] = None
) -> Dict[str, Any]:
    """
    Enforces Invariant 5:
    If the LLM API is unreachable or times out, the local gate and a rule-based fallback buyer
    still complete a purchase. The money path never hard-depends on the LLM.
    
    Logs distinctly with event_type='fallback_triggered'.
    Algorithm:
    1. Search locked items (is_locked == True, stock > 0)
    2. Pick cheapest in-stock item within remaining budget
    3. Call create_checkout directly with ONLY sku, qty, and buyer_session_id.
    """
    # 1. Distinct audit log entry per Section 6 requirement
    log_audit(
        session=session,
        action="fallback_triggered",
        event_type="fallback_triggered",
        status="TRIGGERED",
        reason=f"Fallback triggered: {reason_trigger}. Groq LLM unavailable or offline. Engaging deterministic rule-based buyer under mandate.",
        payload_snapshot=json.dumps({
            "intent": intent,
            "trigger": reason_trigger,
            "buyer_session_id": buyer_session_id,
            "spend_limit_paise": spend_limit_paise,
            "persona": persona
        })
    )

    # Determine remaining budget and buyer session
    b_sess = None
    if buyer_session_id:
        b_sess = session.exec(select(BuyerSession).where(BuyerSession.session_id == buyer_session_id)).first()
    else:
        b_sess = session.exec(
            select(BuyerSession).where(BuyerSession.is_active == True).order_by(BuyerSession.id.desc())
        ).first()
        if b_sess:
            buyer_session_id = b_sess.session_id

    if b_sess:
        remaining_budget_paise = max(0, b_sess.spend_limit_paise - b_sess.spend_used)
    else:
        remaining_budget_paise = spend_limit_paise if spend_limit_paise is not None else 500000

    # Ensure fallback buyer has positive budget
    if remaining_budget_paise <= 0:
        remaining_budget_paise = 500000

    transcript = [
        {
            "turn": 1,
            "phase": "observe",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "content": f"Groq API unreachable ({reason_trigger}). Triggering Invariant 5 deterministic rule-based fallback buyer. Remaining budget: ₹{remaining_budget_paise/100:.2f} ({remaining_budget_paise} paise)."
        }
    ]

    # Search locked catalog items that are in stock
    locked_items = session.exec(
        select(CatalogItem).where(
            CatalogItem.is_locked == True,
            CatalogItem.stock > 0
        )
    ).all()

    transcript.append({
        "turn": 1,
        "phase": "act",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "tool": "search_catalog",
        "args": {"locked_only": True}
    })

    transcript.append({
        "turn": 1,
        "phase": "tool_result",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "tool": "search_catalog",
        "result": {
            "locked_in_stock_count": len(locked_items),
            "skus": [i.sku for i in locked_items]
        }
    })

    # Filter by budget
    affordable_locked = [
        item for item in locked_items
        if (item.unit_price_paise or item.price_paisa) <= remaining_budget_paise
    ]

    # Prioritize relevance to goal if possible
    intent_lower = intent.lower()
    matching_candidates = []
    for item in affordable_locked:
        item_text = f"{item.sku} {item.name} {item.category} {item.tags}".lower()
        if any(w in item_text for w in intent_lower.split() if len(w) > 3):
            matching_candidates.append(item)

    # Pick target item: prefer intent-matched item if available, else cheapest in-stock locked item
    target_item: Optional[CatalogItem] = None
    if matching_candidates:
        matching_candidates.sort(key=lambda x: (x.unit_price_paise or x.price_paisa))
        target_item = matching_candidates[0]
    elif affordable_locked:
        affordable_locked.sort(key=lambda x: (x.unit_price_paise or x.price_paisa))
        target_item = affordable_locked[0]

    if not target_item:
        msg = f"Rule-based fallback buyer could not find any locked in-stock item within budget ₹{remaining_budget_paise/100:.2f}."
        transcript.append({
            "turn": 1,
            "phase": "reason",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "content": msg
        })
        transcript.append({
            "turn": 1,
            "phase": "final_answer",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "content": msg
        })
        return {
            "mode": "RULE_BASED_FALLBACK",
            "status": "FAILED",
            "buyer_session_id": buyer_session_id,
            "message": msg,
            "fallback_used": True,
            "fallback_triggered": True,
            "fallback_reason": reason_trigger,
            "turns_taken": 1,
            "transcript": transcript,
            "final_order": None
        }

    target_qty = 1
    # Check if a specific quantity was requested in the prompt
    qty_match = re.search(r'\b([1-9]\d?)\b', intent)
    if qty_match:
        try:
            pq = int(qty_match.group(1))
            item_price = target_item.unit_price_paise or target_item.price_paisa
            if pq > 0 and pq <= target_item.stock and (item_price * pq) <= remaining_budget_paise:
                target_qty = pq
        except Exception:
            target_qty = 1

    unit_p = target_item.unit_price_paise or target_item.price_paisa
    transcript.append({
        "turn": 1,
        "phase": "reason",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "content": f"Selected cheapest matching locked item: '{target_item.name}' ({target_item.sku}) at ₹{unit_p/100:.2f} (qty: {target_qty}). Calling create_checkout directly."
    })

    # Call create_checkout directly (passes ONLY sku and qty + session)
    checkout_args = {"sku": target_item.sku, "qty": target_qty}
    transcript.append({
        "turn": 1,
        "phase": "act",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "tool": "create_checkout",
        "args": checkout_args
    })

    checkout_payload = {
        "sku": target_item.sku,
        "qty": target_qty
    }
    if buyer_session_id:
        checkout_payload["buyer_session_id"] = buyer_session_id

    # Calculate spend limit
    b_sess = None
    if buyer_session_id:
        b_sess = session.exec(select(BuyerSession).where(BuyerSession.session_id == buyer_session_id)).first()
    effective_limit = b_sess.spend_limit_paise if b_sess else (spend_limit_paise or 500000)

    try:
        checkout_res = process_checkout_gate(session, checkout_payload)
        spend_used = b_sess.spend_used if b_sess else (checkout_res.get("total_amount_paisa") or 0)
        transcript.append({
            "turn": 1,
            "phase": "tool_result",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "tool": "create_checkout",
            "result": checkout_res
        })
        final_ans = f"Fallback buyer completed purchase: {target_qty}x {target_item.name} ({target_item.sku}) captured in Razorpay test mode (Order ID: {checkout_res.get('razorpay_order_id')})."
        transcript.append({
            "turn": 1,
            "phase": "final_answer",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "content": final_ans
        })

        if b_sess:
            session.refresh(b_sess)
            spend_used = b_sess.spend_used

        return {
            "mode": "RULE_BASED_FALLBACK",
            "status": "COMPLETED",
            "buyer_engine": "Aisle Local Deterministic Rule Gate (Zero LLM Dependency)",
            "intent": intent,
            "persona": persona or "Autonomous Fallback Buyer",
            "buyer_session_id": buyer_session_id,
            "spend_limit_paise": effective_limit,
            "spend_limit_inr": effective_limit / 100.0,
            "spend_used_paise": spend_used,
            "spend_used_inr": spend_used / 100.0,
            "remaining_spend_paise": effective_limit - spend_used,
            "remaining_spend_inr": (effective_limit - spend_used) / 100.0,
            "fallback_used": True,
            "fallback_triggered": True,
            "fallback_reason": reason_trigger,
            "turns_taken": 1,
            "transcript": transcript,
            "checkout": checkout_res,
            "final_order": checkout_res
        }
    except HTTPException as he:
        transcript.append({
            "turn": 1,
            "phase": "tool_result",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "tool": "create_checkout",
            "result": he.detail
        })
        return {
            "mode": "RULE_BASED_FALLBACK",
            "status": "BLOCKED",
            "buyer_session_id": buyer_session_id,
            "fallback_used": True,
            "fallback_triggered": True,
            "fallback_reason": reason_trigger,
            "message": str(he.detail),
            "turns_taken": 1,
            "transcript": transcript,
            "final_order": None
        }

async def run_ai_buyer(
    session: Session,
    intent: str,
    spend_limit_paise: Optional[int] = None,
    persona: Optional[str] = None,
    buyer_session_id: Optional[str] = None,
    groq_api_key: Optional[str] = None,
    force_fallback: bool = False,
    simulate_groq_down: bool = False
) -> Dict[str, Any]:
    """
    Executes the autonomous Buyer Agent observe->reason->act loop (max 6 turns).
    Per Section 6 of aisle-backend-architecture.md:
    1. Uses Groq's function-calling with tools: search_catalog, get_item, create_checkout.
    2. create_checkout schema strictly excludes price/discount fields.
    3. Runs up to 6 turns, logging every step to transcript.
    4. If Groq call throws or times out, engages Invariant 5 rule-based fallback.
    """
    api_key = groq_api_key or os.environ.get("GROQ_API_KEY", "").strip()

    # Check simulation flags for Groq down (env vars or request flags)
    is_down_simulated = (
        force_fallback
        or simulate_groq_down
        or (os.environ.get("SIMULATE_GROQ_DOWN", "").lower() in ("1", "true", "yes"))
        or (os.environ.get("GROQ_SIMULATE_DOWN", "").lower() in ("1", "true", "yes"))
    )

    if is_down_simulated:
        return run_rule_based_fallback_buyer(
            session=session,
            intent=intent,
            reason_trigger="SIMULATE_GROQ_DOWN_TOGGLE_ACTIVE",
            spend_limit_paise=spend_limit_paise,
            buyer_session_id=buyer_session_id,
            persona=persona
        )

    if not api_key:
        return run_rule_based_fallback_buyer(
            session=session,
            intent=intent,
            reason_trigger="GROQ_API_KEY_NOT_CONFIGURED",
            spend_limit_paise=spend_limit_paise,
            buyer_session_id=buyer_session_id,
            persona=persona
        )

    # Initialize Buyer Session if not passed
    effective_session_id = buyer_session_id
    effective_spend_limit = spend_limit_paise or 500000

    if not effective_session_id:
        effective_session_id = f"session_{secrets.token_hex(6)}"
        session_rec = BuyerSession(
            session_id=effective_session_id,
            spend_limit_paise=effective_spend_limit,
            spend_used=0,
            is_active=True
        )
        session.add(session_rec)
        session.commit()

    effective_persona = persona or "Frugal Office Manager (Cost-minimizing, strictly essentials)"

    # Observe Step 1: Initial System Objective
    transcript: List[Dict[str, Any]] = [
        {
            "turn": 1,
            "phase": "observe",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "content": f"Session initialized. Persona: '{effective_persona}'. Spend Limit: ₹{effective_spend_limit/100:.2f} ({effective_spend_limit} paise). Procurement Goal: '{intent}'."
        }
    ]

    system_prompt = (
        f"You are Aisle's autonomous procurement buyer agent for the Razorpay AI Buildathon 2026.\n"
        f"Persona: {effective_persona}\n"
        f"Goal: {intent}\n"
        f"Spend Limit: ₹{effective_spend_limit/100:.2f} ({effective_spend_limit} paise)\n"
        f"Buyer Session ID: {effective_session_id}\n\n"
        "STRICT PROTOCOL RULES:\n"
        "1. The price authority lives strictly in the merchant catalog gate. You must NEVER formulate, invent, or specify prices in checkout.\n"
        "2. To purchase an item, search or inspect the catalog, then invoke `create_checkout` with ONLY `sku` and `qty`.\n"
        "3. Any attempt to supply a price, unit_price, or discount field will be immediately blocked and audit-logged as an attack.\n"
        "4. Follow the observe -> reason -> act methodology. Once checkout completes or is answered, terminate with a concise answer."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Fulfill procurement goal: {intent}. Ensure you stay within the budget of ₹{effective_spend_limit/100:.2f}."}
    ]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    final_checkout: Optional[Dict[str, Any]] = None
    timeout_seconds = float(os.environ.get("GROQ_TIMEOUT_SECONDS", "10.0"))

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            for turn in range(1, MAX_AGENT_TURNS + 1):
                payload = {
                    "model": DEFAULT_GROQ_MODEL,
                    "messages": messages,
                    "tools": TOOLS_DEFINITION,
                    "tool_choice": "auto",
                    "temperature": 0.1
                }

                resp = await client.post(GROQ_API_URL, headers=headers, json=payload)
                if resp.status_code != 200:
                    err_text = resp.text
                    print(f"[Aisle Buyer] Groq API error {resp.status_code}: {err_text}")
                    return run_rule_based_fallback_buyer(
                        session=session,
                        intent=intent,
                        reason_trigger=f"Groq API HTTP {resp.status_code}: {err_text[:100]}",
                        spend_limit_paise=effective_spend_limit,
                        buyer_session_id=effective_session_id,
                        persona=effective_persona
                    )

                data = resp.json()
                choice = data["choices"][0]
                assistant_message = choice["message"]
                messages.append(assistant_message)

                reasoning_content = assistant_message.get("content")
                if reasoning_content:
                    transcript.append({
                        "turn": turn,
                        "phase": "reason",
                        "timestamp": datetime.datetime.utcnow().isoformat(),
                        "content": reasoning_content
                    })

                tool_calls = assistant_message.get("tool_calls")
                if not tool_calls:
                    # Model concluded without further action
                    transcript.append({
                        "turn": turn,
                        "phase": "final_answer",
                        "timestamp": datetime.datetime.utcnow().isoformat(),
                        "content": reasoning_content or "Procurement loop concluded."
                    })
                    break

                for tc in tool_calls:
                    fn_name = tc["function"]["name"]
                    try:
                        fn_args = json.loads(tc["function"].get("arguments", "{}"))
                    except Exception:
                        fn_args = {}

                    transcript.append({
                        "turn": turn,
                        "phase": "act",
                        "timestamp": datetime.datetime.utcnow().isoformat(),
                        "tool": fn_name,
                        "args": fn_args
                    })

                    tool_resp = execute_tool(
                        session=session,
                        name=fn_name,
                        args=fn_args,
                        buyer_session_id=effective_session_id
                    )

                    transcript.append({
                        "turn": turn,
                        "phase": "tool_result",
                        "timestamp": datetime.datetime.utcnow().isoformat(),
                        "tool": fn_name,
                        "result": tool_resp
                    })

                    if fn_name == "create_checkout" and tool_resp.get("status") == "captured":
                        final_checkout = tool_resp

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "name": fn_name,
                        "content": json.dumps(tool_resp)
                    })

                if final_checkout:
                    transcript.append({
                        "turn": turn,
                        "phase": "final_answer",
                        "timestamp": datetime.datetime.utcnow().isoformat(),
                        "content": f"Checkout captured successfully: {final_checkout.get('qty')}x {final_checkout.get('sku')} for ₹{final_checkout.get('total_amount_inr', 0):.2f}. Razorpay Order: {final_checkout.get('razorpay_order_id')}."
                    })
                    break

    except Exception as e:
        print(f"[Aisle Buyer] Exception during Groq communication: {str(e)}")
        # Invariant 5: money path never hard-depends on LLM
        return run_rule_based_fallback_buyer(
            session=session,
            intent=intent,
            reason_trigger=f"Groq network/timeout exception ({type(e).__name__}): {str(e)}",
            spend_limit_paise=effective_spend_limit,
            buyer_session_id=effective_session_id,
            persona=effective_persona
        )

    if not final_checkout:
        # If Groq loop finished turns without making a purchase, engage fallback to complete purchase
        return run_rule_based_fallback_buyer(
            session=session,
            intent=intent,
            reason_trigger="Groq loop reached max turns without checkout capture",
            spend_limit_paise=effective_spend_limit,
            buyer_session_id=effective_session_id,
            persona=effective_persona
        )

    # Re-fetch session status
    b_sess = session.exec(select(BuyerSession).where(BuyerSession.session_id == effective_session_id)).first()
    spend_used = b_sess.spend_used if b_sess else (final_checkout.get("total_paise", 0) or 0)

    return {
        "mode": "GROQ_LLM",
        "status": "COMPLETED",
        "buyer_engine": f"Groq Autonomous Tool Calling ({DEFAULT_GROQ_MODEL})",
        "intent": intent,
        "persona": effective_persona,
        "buyer_session_id": effective_session_id,
        "spend_limit_paise": effective_spend_limit,
        "spend_limit_inr": effective_spend_limit / 100.0,
        "spend_used_paise": spend_used,
        "spend_used_inr": spend_used / 100.0,
        "remaining_spend_paise": effective_spend_limit - spend_used,
        "remaining_spend_inr": (effective_spend_limit - spend_used) / 100.0,
        "fallback_used": False,
        "fallback_triggered": False,
        "fallback_reason": None,
        "turns_taken": len(set(step["turn"] for step in transcript)),
        "transcript": transcript,
        "checkout": final_checkout,
        "final_order": final_checkout
    }

