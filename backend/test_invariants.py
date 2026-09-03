import sys
import secrets
from sqlmodel import Session, select
from backend.database import engine, init_db
from backend.models import CatalogItem, SpendMandate, AuditLog, BuyerSession
from backend.gate import lock_price_for_sku, process_checkout_gate
from backend.buyer import run_rule_based_fallback_buyer
from fastapi import HTTPException

def run_tests():
    init_db()
    with Session(engine) as session:
        # Ensure fresh active session for invariant test suite
        test_session = BuyerSession(
            session_id=f"test_inv_session_{secrets.token_hex(4)}",
            spend_limit_paise=1000000,
            spend_used=0,
            is_active=True
        )
        session.add(test_session)
        session.commit()

        print("=== TEST 1: Invariant 1 & 4 (Price Authority & Audit Log for Lock) ===")
        item = lock_price_for_sku(session, "SKU-ERGOCAB-CABLE")
        assert item.is_locked == True
        assert item.locked_price_paisa == 129900
        latest_audit = session.exec(select(AuditLog).order_by(AuditLog.id.desc())).first()
        assert latest_audit.action.lower() in ("price_lock", "price-lock")
        assert latest_audit.status == "SUCCESS"
        print("  [OK] Invariant 1 & 4 passed: Item price locked deterministically at 129900 paisa, audit written.")

        print("\n=== TEST 2: Invariant 2 (create_checkout rejects price/discount as attack) ===")
        # Attempt price injection
        attack_payload = {"sku": "SKU-ERGOCAB-CABLE", "qty": 1, "price": 100}
        blocked = False
        try:
            process_checkout_gate(session, attack_payload)
        except HTTPException as e:
            blocked = True
            assert e.status_code == 400
            assert e.detail.get("error") == "ATTACK_BLOCKED"
        assert blocked == True
        latest_audit = session.exec(select(AuditLog).order_by(AuditLog.id.desc())).first()
        assert latest_audit.action in ("ATTACK_BLOCKED", "checkout_block")
        assert latest_audit.status == "BLOCKED"
        print("  [OK] Invariant 2 passed: Attack blocked immediately with ATTACK_BLOCKED audit log.")

        # Attempt discount injection
        discount_payload = {"sku": "SKU-ERGOCAB-CABLE", "qty": 1, "discount": "90PERCENT"}
        blocked_discount = False
        try:
            process_checkout_gate(session, discount_payload)
        except HTTPException as e:
            blocked_discount = True
            assert e.status_code == 400
            assert e.detail.get("error") == "ATTACK_BLOCKED"
        assert blocked_discount == True
        print("  [OK] Invariant 2 passed: Discount injection also blocked as attack.")

        print("\n=== TEST 3: Invariant 3 (Check order: Locked -> Stock -> Spend -> Discount) ===")
        # Step 1: Not locked
        unlocked_item = session.exec(select(CatalogItem).where(CatalogItem.sku == "SKU-MONITOR-STAND")).first()
        unlocked_item.is_locked = False
        unlocked_item.locked_price_paisa = None
        unlocked_item.unit_price_paise = None
        session.add(unlocked_item)
        session.commit()
        try:
            process_checkout_gate(session, {"sku": "SKU-MONITOR-STAND", "qty": 1})
            assert False, "Should have failed on lock check"
        except HTTPException as e:
            assert e.detail.get("step_failed") == 1
            print("  [OK] Step 1 (Locked) enforced.")

        # Step 2: Stock check (SKU-NOTEBOOK-HARD has 0 stock in seed)
        try:
            process_checkout_gate(session, {"sku": "SKU-NOTEBOOK-HARD", "qty": 1})
            assert False, "Should have failed on stock check"
        except HTTPException as e:
            assert e.detail.get("step_failed") == 2
            print("  [OK] Step 2 (Stock) enforced.")

        # Step 3: Spend limit check
        lock_price_for_sku(session, "SKU-KEYBOARD-MECH")
        try:
            # 2 units @ 8499 = 16998 INR, which exceeds 10,000 INR spend ceiling
            process_checkout_gate(session, {"sku": "SKU-KEYBOARD-MECH", "qty": 2})
            assert False, "Should have failed on spend check"
        except HTTPException as e:
            assert e.detail.get("step_failed") == 3
            print("  [OK] Step 3 (Spend limit) enforced.")

        print("\n=== TEST 4 & 6: Valid Checkout -> Simulated Razorpay Capture ===")
        coffee_item = session.exec(select(CatalogItem).where(CatalogItem.sku == "SKU-COFFEE-ROAST")).first()
        if coffee_item:
            coffee_item.stock = 50
            coffee_item.is_locked = True
            coffee_item.locked_price_paisa = 65000
            session.add(coffee_item)
            session.commit()
        valid_res = process_checkout_gate(session, {"sku": "SKU-COFFEE-ROAST", "qty": 2})
        assert valid_res["status"].upper() == "CAPTURED"
        assert valid_res["razorpay_order_id"].startswith("order_sim_")
        assert valid_res["razorpay_payment_id"].startswith("pay_sim_")
        assert valid_res["total_amount_paisa"] == 130000  # 65000 * 2
        print(f"  [OK] Invariant 6 passed: Payment captured with IDs: {valid_res['razorpay_order_id']} and {valid_res['razorpay_payment_id']}")

        print("\n=== TEST 5: Invariant 5 (Rule-Based Fallback Buyer) ===")
        fallback_res = run_rule_based_fallback_buyer(session, "Get 1 bag of coffee for team", "TEST_OFFLINE_SIMULATION")
        assert fallback_res["status"] == "COMPLETED"
        assert fallback_res["mode"] == "RULE_BASED_FALLBACK"
        assert fallback_res["checkout"]["razorpay_payment_id"].startswith("pay_sim_")
        print("  [OK] Invariant 5 passed: Fallback buyer completed purchase deterministically under mandate.")

        print("\n=== TEST 7: Section 7 Lab Attacks (/lab/attack/{type}) ===")
        import asyncio
        from starlette.requests import Request
        from backend.main import trigger_lab_attack
        
        async def run_lab_checks():
            for atype, expected_reason in [
                ("hallucinated_price", "price_override_attempt"),
                ("unauthorized_discount", "unauthorized_discount"),
                ("oversell", "insufficient_stock"),
                ("spend_breach", "spend_limit_exceeded")
            ]:
                req = Request({'type': 'http', 'headers': []})
                res = await trigger_lab_attack(attack_type=atype, request=req, session=session)
                assert res["blocked"] is True
                assert res["block_reason"] == expected_reason
                assert res["audit_log"] is not None
                assert res["audit_log"]["status"] == "BLOCKED"
                print(f"  [OK] Attack '{atype}' blocked with '{expected_reason}', audit log #{res['audit_log']['id']}")

        asyncio.run(run_lab_checks())
        print("  [OK] All 4 Section 7 Lab Attacks verified.")

    print("\nALL 6 INVARIANTS & SECTION 7 LAB ATTACKS VALIDATED AND VERIFIED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
