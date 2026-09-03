import json
import secrets
import datetime
from typing import Dict, Any, Optional
from fastapi import HTTPException
from sqlmodel import Session, select
from backend.models import CatalogItem, SpendMandate, AuditLog, CheckoutRecord, BuyerSession, Order

# Allowed keys in checkout requests (Section 5 & Invariant 2)
# Request body accepts ONLY sku, qty, buyer_session_id.
ALLOWED_CHECKOUT_KEYS = {"sku", "qty", "buyer_session_id"}

# Fields identifying unauthorized discount injections
DISCOUNT_KEYS = {
    "discount",
    "discount_pct",
    "discount_percent",
    "discount_amount",
    "discount_code",
    "coupon",
    "promo",
    "promo_code"
}

# Fields identifying price override injections
PRICE_KEYS = {
    "price",
    "unit_price",
    "unitprice",
    "item_price",
    "rate",
    "cost",
    "amount",
    "total",
    "total_price",
    "final_amount",
    "unit_price_paise",
    "price_paisa",
    "locked_price"
}

def log_audit(
    session: Session,
    action: str,
    status: str,
    reason: str,
    sku: str = None,
    qty: int = None,
    amount_paisa: int = None,
    payload_snapshot: str = None,
    razorpay_order_id: str = None,
    razorpay_payment_id: str = None,
    event_type: str = None
) -> AuditLog:
    """Enforces Invariant 4: Every lock, reject, block, and capture writes one row to audit_log. No silent paths, ever."""
    entry = AuditLog(
        action=action,
        event_type=event_type or action.lower(),
        status=status,
        reason=reason,
        sku=sku,
        qty=qty,
        amount_paisa=amount_paisa,
        payload_snapshot=payload_snapshot,
        razorpay_order_id=razorpay_order_id,
        razorpay_payment_id=razorpay_payment_id,
        timestamp=datetime.datetime.utcnow()
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry

def lock_price_for_sku(session: Session, sku: str) -> CatalogItem:
    """
    Enforces Invariant 1 & 4:
    Price authority lives only in the ingest parser + gate.
    Locks the item price to its canonical ingested price.
    Writes one row to audit_log.
    """
    item = session.exec(select(CatalogItem).where(CatalogItem.sku == sku)).first()
    if not item:
        log_audit(
            session=session,
            action="price_reject",
            event_type="price_reject",
            status="REJECTED",
            sku=sku,
            reason=f"Cannot lock price: SKU '{sku}' not found in catalog."
        )
        raise HTTPException(status_code=404, detail=f"SKU '{sku}' not found in catalog.")
    
    # Lock deterministically using internal ingested price_paisa
    item.is_locked = True
    item.locked_price_paisa = item.price_paisa
    if item.unit_price_paise is None or item.unit_price_paise <= 0:
        item.unit_price_paise = item.price_paisa
    item.lock_expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    session.add(item)
    session.commit()
    session.refresh(item)

    log_audit(
        session=session,
        action="price_lock",
        event_type="price_lock",
        status="SUCCESS",
        sku=item.sku,
        amount_paisa=item.locked_price_paisa,
        reason=f"Deterministic price lock activated for {item.sku} at ₹{item.locked_price_paisa / 100:.2f} ({item.locked_price_paisa} paisa). Valid for 24 hours.",
        payload_snapshot=json.dumps({"sku": sku, "locked_price_paisa": item.locked_price_paisa})
    )
    return item

def unlock_price_for_sku(session: Session, sku: str) -> CatalogItem:
    """Unlocks an item (for testing or catalog resets)."""
    item = session.exec(select(CatalogItem).where(CatalogItem.sku == sku)).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"SKU '{sku}' not found in catalog.")
    item.is_locked = False
    item.locked_price_paisa = None
    item.unit_price_paise = None
    item.lock_expires_at = None
    session.add(item)
    session.commit()
    session.refresh(item)

    log_audit(
        session=session,
        action="price_unlock",
        event_type="price_unlock",
        status="SUCCESS",
        sku=item.sku,
        reason=f"Price lock removed for {item.sku}."
    )
    return item

def record_blocked_order_and_audit(
    session: Session,
    raw_payload: Dict[str, Any],
    block_reason: str,
    detail_message: str,
    sku: Optional[str] = None,
    qty: Optional[int] = None,
    unit_price_paise: Optional[int] = None,
    total_paise: Optional[int] = None,
    step_failed: Optional[int] = None,
    extra_details: Optional[Dict[str, Any]] = None
):
    """
    Enforces Section 5 & Invariant 4:
    On any failure: write orders row (status='blocked', block_reason=...), audit_log row (event_type='checkout_block').
    """
    sim_id = secrets.token_hex(6)
    order_id = f"order_sim_blocked_{sim_id}"
    buyer_session_id = raw_payload.get("buyer_session_id") if isinstance(raw_payload, dict) else None
    effective_sku = sku or (str(raw_payload.get("sku")) if isinstance(raw_payload, dict) and raw_payload.get("sku") else None)
    effective_qty = qty if isinstance(qty, int) else (raw_payload.get("qty") if isinstance(raw_payload, dict) and isinstance(raw_payload.get("qty"), int) else None)
    
    # 1. Write orders row (status='blocked', block_reason=...)
    blocked_order = Order(
        order_id=order_id,
        buyer_session_id=str(buyer_session_id) if buyer_session_id else None,
        sku=effective_sku,
        qty=effective_qty,
        unit_price_paise=unit_price_paise,
        total_paise=total_paise,
        status="blocked",
        block_reason=block_reason,
        created_at=datetime.datetime.utcnow()
    )
    session.add(blocked_order)
    
    # 2. Write audit_log row (event_type='checkout_block')
    audit_entry = AuditLog(
        action="checkout_block",
        event_type="checkout_block",
        status="BLOCKED",
        sku=effective_sku,
        qty=effective_qty,
        amount_paisa=total_paise,
        reason=f"Checkout blocked: {block_reason}. {detail_message}",
        payload_snapshot=json.dumps(raw_payload) if isinstance(raw_payload, dict) else str(raw_payload),
        timestamp=datetime.datetime.utcnow()
    )
    session.add(audit_entry)
    session.commit()
    session.refresh(blocked_order)
    session.refresh(audit_entry)
    
    # Throw HTTP 400 with strict machine-readable block details
    error_payload = {
        "error": "ATTACK_BLOCKED" if block_reason in ("price_override_attempt", "unauthorized_discount") else "CHECKOUT_BLOCKED",
        "status": "blocked",
        "block_reason": block_reason,
        "message": f"Checkout blocked: {block_reason}. {detail_message}",
        "order_id": order_id,
        "audit_log_id": audit_entry.id
    }
    if step_failed is not None:
        error_payload["step_failed"] = step_failed
    if extra_details:
        error_payload.update(extra_details)
        
    raise HTTPException(status_code=400, detail=error_payload)

def process_checkout_gate(session: Session, raw_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes the non-negotiable payment gate for Aisle per Section 5 of aisle-backend-architecture.md.
    Enforces Invariants 1, 2, 3, 4, 6.
    
    1. Request body accepts ONLY sku, qty, buyer_session_id. If any other field is present
       (price, unit_price, discount, discount_pct), immediately block with reason
       'price_override_attempt' or 'unauthorized_discount' and audit-log it — this check
       runs before every other check, no exceptions.
    2. Then check: item exists and is locked -> stock >= qty -> total (unit_price_paise * qty)
       within remaining spend_limit_paise for the session.
    3. On success: decrement stock, increment spend_used, generate simulated order_sim_<uuid> /
       pay_sim_<uuid>, write orders row (status='captured'), audit_log row (event_type='checkout_capture').
    4. On any failure: write orders row (status='blocked', block_reason=...), audit_log row
       (event_type='checkout_block').
    """
    if not isinstance(raw_payload, dict):
        record_blocked_order_and_audit(
            session=session,
            raw_payload={},
            block_reason="invalid_payload",
            detail_message="Request body must be a JSON object."
        )

    # -------------------------------------------------------------
    # 1. IMMEDIATE ATTACK / PROHIBITED FIELD CHECK:
    # Request body accepts ONLY sku, qty, buyer_session_id.
    # If ANY other field is present (price, unit_price, discount, discount_pct),
    # immediately block with reason 'price_override_attempt' or 'unauthorized_discount'
    # and audit-log it — this check runs before every other check, no exceptions.
    # -------------------------------------------------------------
    payload_keys = set(k.lower() for k in raw_payload.keys())
    extra_keys = payload_keys - ALLOWED_CHECKOUT_KEYS

    if extra_keys:
        # Check discount fields first
        has_discount = bool(extra_keys.intersection(DISCOUNT_KEYS))
        if has_discount:
            block_reason = "unauthorized_discount"
            msg = f"Unauthorized discount field(s) detected: {sorted(list(extra_keys))}. Checkouts strictly forbid discounts."
        else:
            block_reason = "price_override_attempt"
            msg = f"Prohibited price/override field(s) detected: {sorted(list(extra_keys))}. Price authority lives only in the catalog gate."

        record_blocked_order_and_audit(
            session=session,
            raw_payload=raw_payload,
            block_reason=block_reason,
            detail_message=msg,
            extra_details={"unauthorized_fields": sorted(list(extra_keys))}
        )

    # -------------------------------------------------------------
    # Validate sku and qty types
    # -------------------------------------------------------------
    sku = raw_payload.get("sku")
    qty = raw_payload.get("qty")

    if not sku or not isinstance(sku, str):
        record_blocked_order_and_audit(
            session=session,
            raw_payload=raw_payload,
            block_reason="invalid_sku",
            detail_message="Field 'sku' must be a non-empty string."
        )
    
    if not isinstance(qty, int) or qty <= 0:
        record_blocked_order_and_audit(
            session=session,
            raw_payload=raw_payload,
            block_reason="invalid_qty",
            detail_message="Field 'qty' must be a positive integer >= 1.",
            sku=sku
        )

    # -------------------------------------------------------------
    # 2. CHECK SEQUENCE (Invariant 3):
    # item exists and is locked -> stock >= qty -> total within remaining spend_limit_paise
    # -------------------------------------------------------------
    
    # 2a. Check: Item exists
    item = session.exec(select(CatalogItem).where(CatalogItem.sku == sku)).first()
    if not item:
        record_blocked_order_and_audit(
            session=session,
            raw_payload=raw_payload,
            block_reason="item_not_found",
            detail_message=f"SKU '{sku}' does not exist in catalog.",
            sku=sku,
            qty=qty
        )

    # 2b. Check: Item is locked
    item_unit_price = item.unit_price_paise if item.unit_price_paise is not None else item.locked_price_paisa
    if not item.is_locked or item_unit_price is None or item_unit_price <= 0:
        record_blocked_order_and_audit(
            session=session,
            raw_payload=raw_payload,
            block_reason="item_not_locked",
            detail_message=f"Rule 1 Check Failed: Item '{sku}' is NOT price-locked. Aisle requires deterministic price authority prior to checkout.",
            sku=sku,
            qty=qty,
            step_failed=1
        )

    # Check lock expiry if set
    if item.lock_expires_at and item.lock_expires_at < datetime.datetime.utcnow():
        item.is_locked = False
        item.locked_price_paisa = None
        item.unit_price_paise = None
        session.add(item)
        session.commit()
        record_blocked_order_and_audit(
            session=session,
            raw_payload=raw_payload,
            block_reason="lock_expired",
            detail_message=f"Rule 1 Check Failed: Price lock for SKU '{sku}' expired at {item.lock_expires_at.isoformat()}.",
            sku=sku,
            qty=qty,
            step_failed=1
        )

    # 2c. Check: Stock >= qty
    if item.stock < qty:
        record_blocked_order_and_audit(
            session=session,
            raw_payload=raw_payload,
            block_reason="insufficient_stock",
            detail_message=f"Rule 2 Check Failed: Requested qty {qty} exceeds available stock ({item.stock}) for SKU '{sku}'.",
            sku=sku,
            qty=qty,
            step_failed=2,
            extra_details={"requested_qty": qty, "available_stock": item.stock}
        )

    # 2d. Check: Within remaining spend_limit_paise for the session
    unit_price_paise = item_unit_price
    total_amount_paise = unit_price_paise * qty

    buyer_session_id = raw_payload.get("buyer_session_id")
    session_rec = None
    if buyer_session_id:
        session_rec = session.exec(select(BuyerSession).where(BuyerSession.session_id == buyer_session_id)).first()
        if not session_rec:
            record_blocked_order_and_audit(
                session=session,
                raw_payload=raw_payload,
                block_reason="session_not_found",
                detail_message=f"Buyer session '{buyer_session_id}' not found in active sessions.",
                sku=sku,
                qty=qty,
                unit_price_paise=unit_price_paise,
                total_paise=total_amount_paise
            )
    else:
        # Fallback to active buyer session or create/find one from active SpendMandate
        session_rec = session.exec(select(BuyerSession).where(BuyerSession.is_active == True).order_by(BuyerSession.id.desc())).first()
        if not session_rec:
            mandate = session.exec(select(SpendMandate).where(SpendMandate.is_active == True)).first()
            limit = mandate.max_amount_paisa if mandate else 1000000
            spent = mandate.current_spent_paisa if mandate else 0
            session_rec = BuyerSession(
                session_id="session_default",
                spend_limit_paise=limit,
                spend_used=spent,
                is_active=True
            )
            session.add(session_rec)
            session.commit()
            session.refresh(session_rec)

    remaining_spend_paise = session_rec.spend_limit_paise - session_rec.spend_used
    if total_amount_paise > remaining_spend_paise:
        record_blocked_order_and_audit(
            session=session,
            raw_payload=raw_payload,
            block_reason="spend_limit_exceeded",
            detail_message=(
                f"Rule 3 Check Failed: Checkout total of ₹{total_amount_paise / 100:.2f} ({total_amount_paise} paise) "
                f"exceeds remaining spend limit of ₹{remaining_spend_paise / 100:.2f} ({remaining_spend_paise} paise) "
                f"for session '{session_rec.session_id}'. Ceiling is ₹{session_rec.spend_limit_paise / 100:.2f}."
            ),
            sku=sku,
            qty=qty,
            unit_price_paise=unit_price_paise,
            total_paise=total_amount_paise,
            step_failed=3,
            extra_details={
                "total_paise": total_amount_paise,
                "remaining_spend_paise": remaining_spend_paise,
                "spend_limit_paise": session_rec.spend_limit_paise,
                "spend_used": session_rec.spend_used
            }
        )

    # -------------------------------------------------------------
    # 3. ON SUCCESS (ALL CHECKS PASSED):
    # decrement stock, increment spend_used, generate simulated order_sim_<uuid> / pay_sim_<uuid>,
    # write orders row (status='captured'), audit_log row (event_type='checkout_capture').
    # -------------------------------------------------------------
    sim_suffix = secrets.token_hex(8)
    simulated_order_id = f"order_sim_{sim_suffix}"
    simulated_payment_id = f"pay_sim_{sim_suffix}"
    checkout_id = f"chk_{secrets.token_hex(6)}"

    # Atomic updates: decrement stock & increment spend_used
    item.stock -= qty
    session_rec.spend_used += total_amount_paise

    # Keep global SpendMandate synced if active
    mandate = session.exec(select(SpendMandate).where(SpendMandate.is_active == True)).first()
    if mandate:
        mandate.current_spent_paisa += total_amount_paise
        session.add(mandate)

    # Write orders row (status='captured')
    order_rec = Order(
        order_id=simulated_order_id,
        buyer_session_id=session_rec.session_id,
        sku=item.sku,
        qty=qty,
        unit_price_paise=unit_price_paise,
        total_paise=total_amount_paise,
        status="captured",
        block_reason=None,
        razorpay_order_id=simulated_order_id,
        razorpay_payment_id=simulated_payment_id,
        created_at=datetime.datetime.utcnow()
    )
    session.add(order_rec)

    # Also write CheckoutRecord for legacy views
    checkout_rec = CheckoutRecord(
        checkout_id=checkout_id,
        sku=item.sku,
        qty=qty,
        unit_price_paisa=unit_price_paise,
        total_paisa=total_amount_paise,
        status="CAPTURED",
        razorpay_order_id=simulated_order_id,
        razorpay_payment_id=simulated_payment_id,
        created_at=datetime.datetime.utcnow()
    )
    session.add(checkout_rec)
    session.add(item)
    session.add(session_rec)

    # Write audit_log row (event_type='checkout_capture')
    reason_success = (
        f"Checkout captured: {qty}x {item.sku} @ ₹{unit_price_paise / 100:.2f} ({unit_price_paise} paise). "
        f"Total ₹{total_amount_paise / 100:.2f} ({total_amount_paise} paise) deducted from session '{session_rec.session_id}'. "
        f"Simulated Razorpay order {simulated_order_id} & payment {simulated_payment_id} recorded."
    )
    audit_log_rec = AuditLog(
        action="checkout_capture",
        event_type="checkout_capture",
        status="CAPTURED",
        sku=item.sku,
        qty=qty,
        amount_paisa=total_amount_paise,
        razorpay_order_id=simulated_order_id,
        razorpay_payment_id=simulated_payment_id,
        reason=reason_success,
        payload_snapshot=json.dumps(raw_payload),
        timestamp=datetime.datetime.utcnow()
    )
    session.add(audit_log_rec)
    session.commit()
    session.refresh(order_rec)
    session.refresh(audit_log_rec)
    session.refresh(session_rec)

    return {
        "order_id": simulated_order_id,
        "status": "captured",
        "sku": item.sku,
        "item_name": item.name,
        "qty": qty,
        "unit_price_inr": unit_price_paise / 100.0,
        "unit_price_paise": unit_price_paise,
        "total_amount_inr": total_amount_paise / 100.0,
        "total_amount_paisa": total_amount_paise,
        "total_paise": total_amount_paise,
        "buyer_session_id": session_rec.session_id,
        "razorpay_order_id": simulated_order_id,
        "razorpay_payment_id": simulated_payment_id,
        "currency": "INR",
        "stock_remaining": item.stock,
        "spend_used": session_rec.spend_used,
        "spend_used_inr": session_rec.spend_used / 100.0,
        "remaining_spend_paise": session_rec.spend_limit_paise - session_rec.spend_used,
        "remaining_spend_inr": (session_rec.spend_limit_paise - session_rec.spend_used) / 100.0,
        "checkout_id": checkout_id,
        "audit_log_id": audit_log_rec.id,
        "rules_verified": [
            {"step": 1, "rule": "Item is locked", "passed": True, "detail": f"Locked price ₹{unit_price_paise / 100:.2f}"},
            {"step": 2, "rule": "Stock available", "passed": True, "detail": f"Remaining stock {item.stock}"},
            {"step": 3, "rule": "Within spend limit", "passed": True, "detail": f"Charged ₹{total_amount_paise / 100:.2f}"},
            {"step": 4, "rule": "No discount applied", "passed": True, "detail": "Strict canonical price matched"}
        ]
    }
