import os
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from backend.main import app
from backend.database import get_session, engine
from backend.models import AuditLog, BuyerSession, Order, CatalogItem
from backend.buyer import TOOLS_DEFINITION

client = TestClient(app)

def test_tool_definitions_schema_invariant():
    """Invariant 2: create_checkout's schema must NOT include any price or discount field."""
    checkout_tool = next(t for t in TOOLS_DEFINITION if t["function"]["name"] == "create_checkout")
    props = checkout_tool["function"]["parameters"]["properties"]
    print(f"create_checkout properties: {list(props.keys())}")
    assert "sku" in props
    assert "qty" in props
    assert "price" not in props
    assert "unit_price" not in props
    assert "discount" not in props
    assert "discount_pct" not in props
    print("  [OK] Invariant 2 enforced in LLM tool definition schema.")

def test_buyer_run_fallback_simulation():
    """
    Tests Section 6 & Invariant 5:
    Simulates Groq being down via simulate_groq_down=True.
    Confirms purchase still completes with rule-based fallback,
    audit log contains event_type='fallback_triggered',
    and full transcript is returned.
    """
    payload = {
        "persona": "Budget Office Lead",
        "spend_limit_paise": 250000, # ₹2,500.00
        "goal": "Procure whole bean coffee for meeting",
        "simulate_groq_down": True
    }
    
    resp = client.post("/buyer/run", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    print(f"\nResponse status: {data.get('status')}")
    print(f"Mode: {data.get('mode')}")
    print(f"Fallback triggered: {data.get('fallback_triggered')}")
    print(f"Fallback reason: {data.get('fallback_reason')}")
    print(f"Buyer Session ID: {data.get('buyer_session_id')}")

    assert data["mode"] == "RULE_BASED_FALLBACK"
    assert data["status"] == "COMPLETED"
    assert data["fallback_triggered"] is True
    assert data["fallback_reason"] == "SIMULATE_GROQ_DOWN_TOGGLE_ACTIVE"
    
    # Check transcript
    transcript = data["transcript"]
    assert len(transcript) >= 4
    phases = [s["phase"] for s in transcript]
    print(f"Transcript phases: {phases}")
    assert "observe" in phases
    assert "act" in phases
    assert "tool_result" in phases
    assert "final_answer" in phases

    # Check final order
    order = data["checkout"]
    assert order["status"].upper() == "CAPTURED"
    assert order["razorpay_order_id"].startswith("order_sim_")
    assert order["razorpay_payment_id"].startswith("pay_sim_")
    print(f"Captured Order: {order['razorpay_order_id']}, Payment: {order['razorpay_payment_id']}")

    # Check Audit Log for distinct 'fallback_triggered' row (Section 6 Requirement)
    with Session(engine) as db:
        fallback_log = db.exec(
            select(AuditLog).where(AuditLog.event_type == "fallback_triggered").order_by(AuditLog.id.desc())
        ).first()
        assert fallback_log is not None
        assert "SIMULATE_GROQ_DOWN_TOGGLE_ACTIVE" in fallback_log.reason
        print(f"  [OK] Found audit_log row with event_type='fallback_triggered': {fallback_log.reason}")

def test_buyer_run_env_var_fallback():
    """
    Tests Section 6 & Invariant 5 using SIMULATE_GROQ_DOWN=1 environment variable.
    """
    os.environ["SIMULATE_GROQ_DOWN"] = "1"
    try:
        payload = {
            "persona": "Engineering Facilities Manager",
            "spend_limit_paise": 100000, # ₹1,000.00
            "goal": "Buy HDMI cable adapters"
        }
        resp = client.post("/buyer/run", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["fallback_triggered"] is True
        assert data["mode"] == "RULE_BASED_FALLBACK"
        assert data["checkout"]["status"].upper() == "CAPTURED"
        print("  [OK] Verified environment variable SIMULATE_GROQ_DOWN=1 triggers deterministic fallback buyer.")
    finally:
        os.environ.pop("SIMULATE_GROQ_DOWN", None)

if __name__ == "__main__":
    test_tool_definitions_schema_invariant()
    test_buyer_run_fallback_simulation()
    test_buyer_run_env_var_fallback()
    print("\nALL BUYER TESTS PASSED SUCCESSFULLY!")
