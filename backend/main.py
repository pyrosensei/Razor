import os
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, Depends, Request, HTTPException, Body, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from backend.database import init_db, get_session, engine, INITIAL_CATALOG
from backend.models import CatalogItem, SpendMandate, AuditLog, CheckoutRecord, RejectedCatalogItem, BuyerSession, Order
from backend.gate import (
    lock_price_for_sku,
    unlock_price_for_sku,
    process_checkout_gate,
    log_audit,
    ALLOWED_CHECKOUT_KEYS
)
import secrets
import json
import datetime
from backend.buyer import run_ai_buyer
from backend.csv_ingest import ingest_catalog_csv

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema auto-created + seeded on first run
    init_db()
    print("[Aisle] Database initialized and seeded. Aisle Gate active.")
    yield

app = FastAPI(
    title="Aisle — Agent-Readable Merchant Catalog & Deterministic Price Gate",
    description="Razorpay AI Buildathon 2026 (Track 01 — AI Growth & Agentic Commerce). The model shops, the rules pay.",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Aisle Core Gate",
        "invariants": {
            "1": "Price authority lives only in the ingest parser + gate. The LLM never writes a number that gets charged.",
            "2": "create_checkout accepts only sku and qty. Any price/discount payload is blocked and audit-logged as attack.",
            "3": "Checks in order: item locked -> stock available -> within spend limit -> zero discount applied.",
            "4": "Every lock, reject, block, and capture writes one row to audit_log.",
            "5": "Local gate and rule-based fallback buyer guarantee purchases if LLM unreachable.",
            "6": "Test mode only: simulated Razorpay IDs use order_sim_ and pay_sim_ prefixes."
        }
    }

@app.get("/api/catalog")
def get_catalog(session: Session = Depends(get_session)):
    items = session.exec(select(CatalogItem)).all()
    return [
        {
            "id": item.id,
            "sku": item.sku,
            "name": item.name,
            "description": item.description,
            "category": item.category,
            "price_inr": item.price_paisa / 100.0,
            "price_paisa": item.price_paisa,
            "stock": item.stock,
            "is_locked": item.is_locked,
            "locked_price_inr": (item.locked_price_paisa / 100.0) if item.locked_price_paisa else None,
            "locked_price_paisa": item.locked_price_paisa,
            "lock_expires_at": item.lock_expires_at.isoformat() if item.lock_expires_at else None,
            "tags": item.tags
        }
        for item in items
    ]

@app.get("/api/catalog/rejected")
def get_rejected_items(session: Session = Depends(get_session)):
    """Returns held-out catalog items with their exact deterministic rejection reasons."""
    items = session.exec(select(RejectedCatalogItem).order_by(RejectedCatalogItem.id.desc())).all()
    return [
        {
            "id": item.id,
            "source_row_ref": item.source_row_ref,
            "raw_sku": item.raw_sku,
            "raw_title": item.raw_title,
            "raw_price": item.raw_price,
            "reject_reason": item.reject_reason,
            "created_at": item.created_at.isoformat()
        }
        for item in items
    ]

@app.post("/catalog/upload")
@app.post("/api/catalog/upload")
async def upload_catalog_csv(
    request: Request,
    session: Session = Depends(get_session)
):
    """
    POST /catalog/upload accepting a CSV file (multipart or raw text/csv or JSON).
    Enforces Invariant 1 and Section 4 of aisle-backend-architecture.md.
    
    1. Parse CSV structure.
    2. Column header mapping: Groq may ONLY be used to map messy headers to (title, price, sku, stock).
       Groq NEVER sees or touches the raw price value that gets locked.
    3. Deterministic rule-based INR parser parses raw_price string to unit_price_paise.
    4. On parse success: writes a locked catalog_items row with unit_price_paise + source_row_ref,
       and an audit_log row (event_type='price_lock').
    5. On parse failure: writes a rejected row with reject_reason, and an audit_log row (event_type='price_reject').
    6. Response: { locked: [...], rejected: [...], coverage: locked_count / total_count }.
    """
    csv_text = ""
    groq_api_key = None

    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        form_file = form.get("file")
        if form_file and hasattr(form_file, "read"):
            b = await form_file.read()
            csv_text = b.decode("utf-8", errors="replace")
        elif "csv" in form:
            csv_text = str(form.get("csv"))
        groq_api_key = form.get("groq_api_key")
    elif "application/json" in content_type:
        try:
            body_json = await request.json()
            csv_text = body_json.get("csv_content") or body_json.get("csv") or ""
            groq_api_key = body_json.get("groq_api_key")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body.")
    else:
        # Raw body
        raw_body = await request.body()
        csv_text = raw_body.decode("utf-8", errors="replace")

    if not csv_text.strip():
        raise HTTPException(status_code=400, detail="Empty CSV content received. Please provide a CSV file.")

    result = ingest_catalog_csv(
        session=session,
        csv_content=csv_text,
        groq_api_key=groq_api_key
    )

    if "error" in result and not result.get("locked") and not result.get("rejected"):
        raise HTTPException(status_code=400, detail=result["error"])

    return result

@app.get("/api/catalog/agent-spec")
def get_agent_spec(session: Session = Depends(get_session)):
    """
    Returns an Agent-Readable Catalog Specification.
    Designed for LLM context injection and function calling.
    """
    items = session.exec(select(CatalogItem)).all()
    mandate = session.exec(select(SpendMandate).where(SpendMandate.is_active == True)).first()
    
    return {
        "catalog_version": "2026.01.0",
        "currency": "INR",
        "currency_unit": "PAISA (1 INR = 100 PAISA)",
        "protocol": "Aisle Autonomous Commerce Gate",
        "mandate_context": {
            "mandate_id": mandate.mandate_id if mandate else None,
            "max_spend_inr": (mandate.max_amount_paisa / 100.0) if mandate else 0,
            "current_spent_inr": (mandate.current_spent_paisa / 100.0) if mandate else 0,
            "remaining_budget_inr": ((mandate.max_amount_paisa - mandate.current_spent_paisa) / 100.0) if mandate else 0
        },
        "catalog_items": [
            {
                "sku": item.sku,
                "name": item.name,
                "category": item.category,
                "canonical_price_inr": item.price_paisa / 100.0,
                "stock_level": item.stock,
                "price_lock_active": item.is_locked,
                "tags": [t.strip() for t in item.tags.split(",") if t.strip()]
            }
            for item in items
        ],
        "allowed_buyer_actions": [
            {"action": "lock_sku_price", "parameters": ["sku"]},
            {"action": "create_checkout", "parameters": ["sku", "qty"], "warning": "Price or discount arguments strictly forbidden."}
        ]
    }

@app.post("/api/catalog/{sku}/lock")
def lock_catalog_item(sku: str, session: Session = Depends(get_session)):
    """Locks price for item at canonical ingest price. Enforces Invariant 1 & 4."""
    item = lock_price_for_sku(session, sku)
    return {
        "message": f"Deterministic price lock activated for {item.sku}",
        "sku": item.sku,
        "is_locked": item.is_locked,
        "locked_price_inr": item.locked_price_paisa / 100.0,
        "locked_price_paisa": item.locked_price_paisa,
        "expires_at": item.lock_expires_at.isoformat() if item.lock_expires_at else None
    }

@app.post("/api/catalog/{sku}/unlock")
def unlock_catalog_item(sku: str, session: Session = Depends(get_session)):
    """Removes price lock (useful to test Invariant 3 Step 1 rejection)."""
    item = unlock_price_for_sku(session, sku)
    return {
        "message": f"Price lock released for {item.sku}",
        "sku": item.sku,
        "is_locked": item.is_locked
    }

@app.post("/checkout")
@app.post("/api/checkout")
async def create_checkout(request: Request, session: Session = Depends(get_session)):
    """
    create_checkout per Section 5 of aisle-backend-architecture.md.
    Accepts ONLY `sku`, `qty`, `buyer_session_id`.
    Enforces Invariants 1, 2, 3, 4, 6.
    """
    try:
        raw_payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    # Process through the deterministic security gate
    result = process_checkout_gate(session, raw_payload)
    return result

@app.post("/buyer/sessions")
@app.post("/api/buyer/sessions")
async def create_buyer_session(request: Request, session: Session = Depends(get_session)):
    """
    Creates a new buyer session with a spend_limit_paise mandate per Section 5.
    Accepts: { "spend_limit_paise": <int>, "session_id": <optional_str> }
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    spend_limit_paise = data.get("spend_limit_paise")
    if spend_limit_paise is None or not isinstance(spend_limit_paise, int) or spend_limit_paise <= 0:
        raise HTTPException(
            status_code=400,
            detail="Field 'spend_limit_paise' is required and must be a positive integer in paise (e.g. 500000 for ₹5,000.00)."
        )

    session_id = data.get("session_id") or f"session_{secrets.token_hex(6)}"
    
    existing = session.exec(select(BuyerSession).where(BuyerSession.session_id == session_id)).first()
    if existing:
        existing.spend_limit_paise = spend_limit_paise
        existing.spend_used = 0
        existing.is_active = True
        session.add(existing)
        session.commit()
        session.refresh(existing)
        session_rec = existing
    else:
        session_rec = BuyerSession(
            session_id=session_id,
            spend_limit_paise=spend_limit_paise,
            spend_used=0,
            is_active=True
        )
        session.add(session_rec)
        session.commit()
        session.refresh(session_rec)

    log_audit(
        session=session,
        action="session_create",
        event_type="buyer_session_created",
        status="SUCCESS",
        amount_paisa=spend_limit_paise,
        reason=f"Buyer session '{session_rec.session_id}' created with spend limit ₹{spend_limit_paise / 100:.2f} ({spend_limit_paise} paise).",
        payload_snapshot=json.dumps(data)
    )

    return {
        "session_id": session_rec.session_id,
        "buyer_session_id": session_rec.session_id,
        "spend_limit_paise": session_rec.spend_limit_paise,
        "spend_limit_inr": session_rec.spend_limit_paise / 100.0,
        "spend_used": session_rec.spend_used,
        "spend_used_inr": session_rec.spend_used / 100.0,
        "remaining_spend_paise": session_rec.spend_limit_paise - session_rec.spend_used,
        "remaining_spend_inr": (session_rec.spend_limit_paise - session_rec.spend_used) / 100.0,
        "is_active": session_rec.is_active,
        "created_at": session_rec.created_at.isoformat()
    }

@app.get("/buyer/sessions")
@app.get("/api/buyer/sessions")
def get_buyer_sessions(session: Session = Depends(get_session)):
    sessions = session.exec(select(BuyerSession).order_by(BuyerSession.id.desc())).all()
    return [
        {
            "id": s.id,
            "session_id": s.session_id,
            "buyer_session_id": s.session_id,
            "spend_limit_paise": s.spend_limit_paise,
            "spend_limit_inr": s.spend_limit_paise / 100.0,
            "spend_used": s.spend_used,
            "spend_used_inr": s.spend_used / 100.0,
            "remaining_spend_paise": s.spend_limit_paise - s.spend_used,
            "remaining_spend_inr": (s.spend_limit_paise - s.spend_used) / 100.0,
            "is_active": s.is_active,
            "created_at": s.created_at.isoformat()
        }
        for s in sessions
    ]

@app.get("/orders")
@app.get("/api/orders")
def get_orders(session: Session = Depends(get_session)):
    orders = session.exec(select(Order).order_by(Order.id.desc())).all()
    return [
        {
            "id": o.id,
            "order_id": o.order_id,
            "buyer_session_id": o.buyer_session_id,
            "sku": o.sku,
            "qty": o.qty,
            "unit_price_paise": o.unit_price_paise,
            "unit_price_inr": (o.unit_price_paise / 100.0) if o.unit_price_paise is not None else None,
            "total_paise": o.total_paise,
            "total_inr": (o.total_paise / 100.0) if o.total_paise is not None else None,
            "status": o.status,
            "block_reason": o.block_reason,
            "razorpay_order_id": o.razorpay_order_id,
            "razorpay_payment_id": o.razorpay_payment_id,
            "created_at": o.created_at.isoformat()
        }
        for o in orders
    ]

@app.get("/api/mandate")
def get_mandate(session: Session = Depends(get_session)):
    mandate = session.exec(select(SpendMandate).where(SpendMandate.is_active == True)).first()
    if not mandate:
        raise HTTPException(status_code=404, detail="No active spend mandate.")
    return {
        "mandate_id": mandate.mandate_id,
        "title": mandate.title,
        "max_amount_inr": mandate.max_amount_paisa / 100.0,
        "max_amount_paisa": mandate.max_amount_paisa,
        "current_spent_inr": mandate.current_spent_paisa / 100.0,
        "current_spent_paisa": mandate.current_spent_paisa,
        "remaining_inr": (mandate.max_amount_paisa - mandate.current_spent_paisa) / 100.0,
        "remaining_paisa": mandate.max_amount_paisa - mandate.current_spent_paisa,
        "currency": mandate.currency,
        "is_active": mandate.is_active
    }

@app.post("/api/mandate")
def update_mandate(
    data: Dict[str, Any] = Body(...),
    session: Session = Depends(get_session)
):
    mandate = session.exec(select(SpendMandate).where(SpendMandate.is_active == True)).first()
    if not mandate:
        raise HTTPException(status_code=404, detail="No active spend mandate.")

    if "max_amount_inr" in data:
        mandate.max_amount_paisa = int(float(data["max_amount_inr"]) * 100)
    if "reset_spent" in data and data["reset_spent"]:
        mandate.current_spent_paisa = 0

    session.add(mandate)
    session.commit()
    session.refresh(mandate)

    log_audit(
        session=session,
        action="MANDATE_UPDATE",
        status="SUCCESS",
        amount_paisa=mandate.max_amount_paisa,
        reason=f"Mandate updated. Ceiling: ₹{mandate.max_amount_paisa/100:.2f}, Current Spent: ₹{mandate.current_spent_paisa/100:.2f}"
    )

    return {
        "message": "Mandate updated successfully",
        "mandate_id": mandate.mandate_id,
        "max_amount_inr": mandate.max_amount_paisa / 100.0,
        "current_spent_inr": mandate.current_spent_paisa / 100.0
    }

@app.get("/api/audit-log")
def get_audit_log(limit: int = 100, session: Session = Depends(get_session)):
    """Returns the immutable audit log. Enforces Invariant 4."""
    logs = session.exec(
        select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)
    ).all()
    return [
        {
            "id": log.id,
            "timestamp": log.timestamp.isoformat(),
            "action": log.action,
            "status": log.status,
            "sku": log.sku,
            "qty": log.qty,
            "amount_inr": (log.amount_paisa / 100.0) if log.amount_paisa is not None else None,
            "amount_paisa": log.amount_paisa,
            "reason": log.reason,
            "payload_snapshot": log.payload_snapshot,
            "razorpay_order_id": log.razorpay_order_id,
            "razorpay_payment_id": log.razorpay_payment_id
        }
        for log in logs
    ]

@app.get("/api/checkouts")
def get_checkouts(session: Session = Depends(get_session)):
    checkouts = session.exec(select(CheckoutRecord).order_by(CheckoutRecord.id.desc())).all()
    return [
        {
            "id": chk.id,
            "checkout_id": chk.checkout_id,
            "sku": chk.sku,
            "qty": chk.qty,
            "unit_price_inr": chk.unit_price_paisa / 100.0,
            "total_inr": chk.total_paisa / 100.0,
            "status": chk.status,
            "razorpay_order_id": chk.razorpay_order_id,
            "razorpay_payment_id": chk.razorpay_payment_id,
            "created_at": chk.created_at.isoformat()
        }
        for chk in checkouts
    ]

@app.post("/buyer/run")
@app.post("/api/buyer/run")
async def trigger_buyer(
    payload: Dict[str, Any] = Body(...),
    session: Session = Depends(get_session)
):
    """
    Runs the autonomous buyer agent per Section 6 of aisle-backend-architecture.md.
    Accepts: { persona, spend_limit_paise, goal, simulate_groq_down, buyer_session_id, groq_api_key }
    If Groq is unreachable or not configured, Invariant 5 triggers rule-based fallback buyer.
    """
    goal = payload.get("goal") or payload.get("intent") or "Procure organic whole bean coffee for breakroom"
    persona = payload.get("persona") or "Frugal Office Manager (Cost-conscious, essentials only)"
    
    # Allow spend_limit_paise or spend_limit_inr
    spend_limit_paise = payload.get("spend_limit_paise")
    if spend_limit_paise is None and "spend_limit_inr" in payload:
        spend_limit_paise = int(float(payload["spend_limit_inr"]) * 100)
    if spend_limit_paise is None or spend_limit_paise <= 0:
        spend_limit_paise = 500000  # Default ₹5,000.00

    groq_api_key = payload.get("nvidia_nim_api_key") or payload.get("groq_api_key")
    force_fallback = payload.get("force_fallback", False) or payload.get("simulate_groq_down", False)
    simulate_groq_down = payload.get("simulate_groq_down", False)
    buyer_session_id = payload.get("buyer_session_id") or payload.get("session_id")
    if not buyer_session_id:
        buyer_session_id = f"session_{secrets.token_hex(6)}"
        session_rec = BuyerSession(
            session_id=buyer_session_id,
            spend_limit_paise=spend_limit_paise,
            spend_used=0,
            is_active=True
        )
        session.add(session_rec)
        session.commit()
        session.refresh(session_rec)

    result = await run_ai_buyer(
        session=session,
        intent=goal,
        spend_limit_paise=spend_limit_paise,
        persona=persona,
        buyer_session_id=buyer_session_id,
        groq_api_key=groq_api_key,
        force_fallback=force_fallback,
        simulate_groq_down=simulate_groq_down
    )
    return result

LAB_ATTACK_SPECS = {
    "hallucinated_price": {
        "id": "hallucinated_price",
        "name": "Hallucinated Unit Price Injection",
        "badge": "Invariant 1 & 2",
        "description": "Adversary / LLM attempts to set its own unit_price in the checkout request to override canonical merchant price.",
        "pitch_claim": "The model can't set the price.",
        "invariant_enforced": "Invariant 1 & 2: Price authority lives strictly in ingest parser + gate. create_checkout rejects unit_price.",
        "target_sku": "SKU-COFFEE-ROAST",
        "default_payload": {
            "sku": "SKU-COFFEE-ROAST",
            "qty": 1,
            "unit_price": 1.00
        },
        "expected_block_reason": "price_override_attempt",
        "expected_step": "Rule 4 Pre-flight (Invariant 2)"
    },
    "unauthorized_discount": {
        "id": "unauthorized_discount",
        "name": "Unauthorized Discount Injection",
        "badge": "Invariant 2",
        "description": "Adversary / LLM attempts to inject a discount or coupon parameter into checkout arguments.",
        "pitch_claim": "Discounts are strictly forbidden on checkout schema.",
        "invariant_enforced": "Invariant 2: create_checkout accepts only sku and qty. Discount fields are audited as attacks.",
        "target_sku": "SKU-KEYBOARD-MECH",
        "default_payload": {
            "sku": "SKU-KEYBOARD-MECH",
            "qty": 1,
            "discount": 0.90
        },
        "expected_block_reason": "unauthorized_discount",
        "expected_step": "Rule 4 Pre-flight (Invariant 2)"
    },
    "oversell": {
        "id": "oversell",
        "name": "Inventory Oversell Attempt",
        "badge": "Invariant 3 (Rule 2)",
        "description": "Adversary / LLM attempts to purchase more quantity than physically available in verified merchant inventory.",
        "pitch_claim": "Stock verified before payment authorization.",
        "invariant_enforced": "Invariant 3 (Rule 2): Stock must be verified before payment authorization. Cannot sell nonexistent inventory.",
        "target_sku": "SKU-COFFEE-ROAST",
        "default_payload": {
            "sku": "SKU-COFFEE-ROAST",
            "qty": 9999
        },
        "expected_block_reason": "insufficient_stock",
        "expected_step": "Rule 2 (Stock Verification)"
    },
    "spend_breach": {
        "id": "spend_breach",
        "name": "Spend Mandate Budget Breach",
        "badge": "Invariant 3 (Rule 3)",
        "description": "Adversary / LLM attempts to checkout items whose total exceeds the session spend limit ceiling.",
        "pitch_claim": "Model cannot spend beyond approved mandate ceiling.",
        "invariant_enforced": "Invariant 3 (Rule 3): Total cost must be strictly within remaining spend limit under the spend mandate.",
        "target_sku": "SKU-KEYBOARD-MECH",
        "default_payload": {
            "sku": "SKU-KEYBOARD-MECH",
            "qty": 1,
            "buyer_session_id": "session_lab_mandate"
        },
        "expected_block_reason": "spend_limit_exceeded",
        "expected_step": "Rule 3 (Spend Limit Check)"
    }
}

@app.get("/lab/attacks")
@app.get("/api/lab/attacks")
def get_lab_attacks():
    """Returns the list of Section 7 attack specifications for the pitch Lab."""
    return list(LAB_ATTACK_SPECS.values())

@app.post("/lab/attack/{attack_type}")
@app.post("/api/lab/attack/{attack_type}")
async def trigger_lab_attack(
    attack_type: str,
    request: Request,
    session: Session = Depends(get_session)
):
    """
    Executes the 4 attacks from section 7 of aisle-backend-architecture.md.
    attack_type in {hallucinated_price, unauthorized_discount, oversell, spend_breach}.
    Calls the real /checkout gate internally with a deliberately bad payload and returns the blocked result.
    """
    if attack_type not in LAB_ATTACK_SPECS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown attack type '{attack_type}'. Must be one of: {list(LAB_ATTACK_SPECS.keys())}"
        )

    spec = LAB_ATTACK_SPECS[attack_type]
    
    # Read optional custom payload from client or default to spec payload
    payload: Dict[str, Any] = {}
    try:
        body = await request.json()
        if isinstance(body, dict) and body:
            payload = dict(body)
    except Exception:
        payload = {}

    if not payload:
        payload = dict(spec["default_payload"])

    # Setup specific conditions for attack execution
    if attack_type == "spend_breach":
        # Ensure session exists with strict spend limit lower than item cost
        # SKU-KEYBOARD-MECH costs ₹8,499.00 (849,900 paise).
        sess_id = payload.get("buyer_session_id") or "session_lab_mandate"
        lab_sess = session.exec(select(BuyerSession).where(BuyerSession.session_id == sess_id)).first()
        if not lab_sess:
            lab_sess = BuyerSession(
                session_id=sess_id,
                spend_limit_paise=100000,  # ₹1,000.00 ceiling
                spend_used=0,
                is_active=True
            )
            session.add(lab_sess)
            session.commit()
            session.refresh(lab_sess)
        else:
            lab_sess.spend_limit_paise = 100000  # Enforce ₹1,000 ceiling
            lab_sess.spend_used = 0
            session.add(lab_sess)
            session.commit()
            session.refresh(lab_sess)
        payload["buyer_session_id"] = sess_id

    elif attack_type == "oversell":
        sku = payload.get("sku", "SKU-COFFEE-ROAST")
        item = session.exec(select(CatalogItem).where(CatalogItem.sku == sku)).first()
        current_stock = item.stock if item else 3
        # Guarantee requested qty exceeds stock
        if payload.get("qty", 0) <= current_stock:
            payload["qty"] = max(9999, current_stock + 10)

    # Call the real /checkout processing gate internally
    blocked_detail: Dict[str, Any] = {}
    try:
        res = process_checkout_gate(session, payload)
        # Should never reach here for attacks!
        return {
            "attack_type": attack_type,
            "blocked": False,
            "warning": "Unexpected: Gate did not block this attack payload!",
            "result": res
        }
    except HTTPException as exc:
        blocked_detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}

    # Fetch matching audit log row written for this block
    audit_log_id = blocked_detail.get("audit_log_id")
    audit_row = None
    if audit_log_id:
        audit_row = session.exec(select(AuditLog).where(AuditLog.id == audit_log_id)).first()
    if not audit_row:
        audit_row = session.exec(
            select(AuditLog).where(AuditLog.status == "BLOCKED").order_by(AuditLog.id.desc())
        ).first()

    audit_dict = None
    if audit_row:
        audit_dict = {
            "id": audit_row.id,
            "timestamp": audit_row.timestamp.isoformat(),
            "action": audit_row.action,
            "event_type": audit_row.event_type or audit_row.action,
            "status": audit_row.status,
            "sku": audit_row.sku,
            "qty": audit_row.qty,
            "amount_paisa": audit_row.amount_paisa,
            "amount_inr": (audit_row.amount_paisa / 100.0) if audit_row.amount_paisa is not None else None,
            "reason": audit_row.reason,
            "payload_snapshot": audit_row.payload_snapshot,
            "razorpay_order_id": audit_row.razorpay_order_id,
            "razorpay_payment_id": audit_row.razorpay_payment_id
        }

    return {
        "attack_type": attack_type,
        "name": spec["name"],
        "description": spec["description"],
        "pitch_claim": spec["pitch_claim"],
        "invariant_enforced": spec["invariant_enforced"],
        "payload_attempted": payload,
        "blocked": True,
        "status_code": 400,
        "block_reason": blocked_detail.get("block_reason", "BLOCKED"),
        "block_result": blocked_detail,
        "audit_log": audit_dict
    }

@app.post("/api/test/attack")
async def simulate_attack(
    payload: Dict[str, Any] = Body(...),
    session: Session = Depends(get_session)
):
    """
    Direct Attack Simulation endpoint to test and prove Invariant 2.
    Accepts arbitrary payload (e.g. injected price: 1 or discount: 99).
    Passes directly into checkout gate to prove it blocks and audit logs.
    """
    return process_checkout_gate(session, payload)

@app.post("/api/reset")
def reset_system(session: Session = Depends(get_session)):
    """Resets the catalog, spend mandate, and test state while preserving immutable AuditLog."""
    # Delete non-audit records (Audit logs are strictly append-only)
    for model in [CheckoutRecord, Order, CatalogItem, SpendMandate, RejectedCatalogItem, BuyerSession]:
        records = session.exec(select(model)).all()
        for r in records:
            session.delete(r)
    session.commit()

    # Re-seed
    init_db()

    # Write one audit_log row so reset is visible in the trail (Invariant 4)
    reset_entry = AuditLog(
        action="system_reset",
        event_type="system_reset",
        status="SUCCESS",
        reason="audit trail rotated",
        payload_snapshot=json.dumps({"detail": "audit trail rotated"}),
        timestamp=datetime.datetime.utcnow()
    )
    session.add(reset_entry)
    session.commit()

    return {"message": "Aisle database reset and re-seeded to initial state."}
