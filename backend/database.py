import os
import datetime
from sqlmodel import SQLModel, create_engine, Session, select
from backend.models import (
    CatalogItem, SpendMandate, AuditLog, CheckoutRecord, 
    RejectedCatalogItem, BuyerSession, Order
)

DB_FILE = os.environ.get("AISLE_DB_FILE", "aisle.db")
DATABASE_URL = f"sqlite:///{DB_FILE}"

engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})

def get_session():
    with Session(engine) as session:
        yield session

INITIAL_CATALOG = [
    {
        "sku": "SKU-COFFEE-ROAST",
        "name": "Blue Tokai Attikan Estate Coffee (500g)",
        "description": "Artisanal single-origin dark roast Arabica beans for office espresso bar.",
        "category": "Pantry & Beverage",
        "price_paisa": 65000,  # ₹650.00
        "stock": 25,
        "tags": "coffee, beverage, pantry, arabica, consumable",
        "is_locked": True,
        "locked_price_paisa": 65000,
    },
    {
        "sku": "SKU-OAT-MILK",
        "name": "Oatly Barista Edition Oat Milk (1L x 6)",
        "description": "Plant-based milk carton for team cafeteria. High foam stability.",
        "category": "Pantry & Beverage",
        "price_paisa": 180000,  # ₹1,800.00
        "stock": 8,
        "tags": "milk, vegan, beverage, pantry, barista",
        "is_locked": True,
        "locked_price_paisa": 180000,
    },
    {
        "sku": "SKU-ERGOCAB-CABLE",
        "name": "Anker 100W Braided USB-C to USB-C Cable (2m)",
        "description": "High-durability power delivery cable with reinforced nylon shielding.",
        "category": "IT Hardware",
        "price_paisa": 129900,  # ₹1,299.00
        "stock": 15,
        "tags": "electronics, cable, usb-c, charging, tech",
        "is_locked": False,
        "locked_price_paisa": None,
    },
    {
        "sku": "SKU-MONITOR-STAND",
        "name": "ErgoRiser Dual Monitor Arm (Aluminum)",
        "description": "Gas spring dynamic height-adjustable monitor desk clamp.",
        "category": "Office Furniture",
        "price_paisa": 450000,  # ₹4,500.00
        "stock": 4,
        "tags": "ergonomic, monitor, desk, mount, hardware",
        "is_locked": False,
        "locked_price_paisa": None,
    },
    {
        "sku": "SKU-KEYBOARD-MECH",
        "name": "Keychron K2 Wireless Mechanical Keyboard (Brown Switches)",
        "description": "Compact 75% layout, RGB backlit, Mac and Windows compatible.",
        "category": "IT Hardware",
        "price_paisa": 849900,  # ₹8,499.00
        "stock": 2,
        "tags": "keyboard, wireless, bluetooth, mechanical, hardware",
        "is_locked": False,
        "locked_price_paisa": None,
    },
    {
        "sku": "SKU-NOTEBOOK-HARD",
        "name": "Moleskine Classic Hardcover Ruled Notebook",
        "description": "Acid-free 70 gsm ivory paper notebook with elastic closure and bookmark ribbon.",
        "category": "Stationery",
        "price_paisa": 99900,  # ₹999.00
        "stock": 0,  # Intentionally 0 stock to test Invariant 3 Step 2 Stock check!
        "tags": "stationery, notebook, notes, paper",
        "is_locked": True,
        "locked_price_paisa": 99900,
    }
]

def init_db():
    SQLModel.metadata.create_all(engine)
    
    # SQLite runtime column migration if database was created previously
    with engine.connect() as conn:
        try:
            res_item = conn.exec_driver_sql("PRAGMA table_info(catalog_item)").fetchall()
            cols_item = [r[1] for r in res_item]
            if "source_row_ref" not in cols_item:
                conn.exec_driver_sql("ALTER TABLE catalog_item ADD COLUMN source_row_ref TEXT")
            if "unit_price_paise" not in cols_item:
                conn.exec_driver_sql("ALTER TABLE catalog_item ADD COLUMN unit_price_paise INTEGER")

            res_log = conn.exec_driver_sql("PRAGMA table_info(audit_log)").fetchall()
            cols_log = [r[1] for r in res_log]
            if "event_type" not in cols_log:
                conn.exec_driver_sql("ALTER TABLE audit_log ADD COLUMN event_type TEXT")
            conn.commit()
        except Exception as e:
            print(f"[Aisle DB] Migration check note: {e}")

    with Session(engine) as session:
        # Check if catalog exists
        existing_item = session.exec(select(CatalogItem)).first()
        if not existing_item:
            print("[Aisle DB] Seeding initial catalog items...")
            for item_data in INITIAL_CATALOG:
                item = CatalogItem(
                    sku=item_data["sku"],
                    name=item_data["name"],
                    description=item_data["description"],
                    category=item_data["category"],
                    price_paisa=item_data["price_paisa"],
                    stock=item_data["stock"],
                    tags=item_data["tags"],
                    is_locked=item_data["is_locked"],
                    locked_price_paisa=item_data["locked_price_paisa"],
                    lock_expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=24) if item_data["is_locked"] else None,
                )
                session.add(item)
            
            # Initial audit log for seed
            seed_log = AuditLog(
                action="CATALOG_INGEST",
                status="SUCCESS",
                reason="Initial system catalog seeded with 6 merchant SKUs. Price authority established in parser.",
                payload_snapshot=f"Seeded {len(INITIAL_CATALOG)} items"
            )
            session.add(seed_log)

        # Check if spend mandate exists
        existing_mandate = session.exec(select(SpendMandate)).first()
        if not existing_mandate:
            print("[Aisle DB] Seeding corporate spend mandate...")
            mandate = SpendMandate(
                mandate_id="mandate_spend_corp_2026",
                title="Q1 Engineering & Pantry Spend Mandate",
                max_amount_paisa=1000000,  # ₹10,000.00 ceiling
                current_spent_paisa=0,
                currency="INR",
                is_active=True,
            )
            session.add(mandate)
            
            mandate_log = AuditLog(
                action="MANDATE_INIT",
                status="SUCCESS",
                amount_paisa=1000000,
                reason="Corporate spend mandate configured with ₹10,000.00 ceiling."
            )
            session.add(mandate_log)

        session.commit()
