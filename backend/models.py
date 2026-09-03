import datetime
from typing import Optional
from sqlmodel import SQLModel, Field

class CatalogItem(SQLModel, table=True):
    __tablename__ = "catalog_item"
    id: Optional[int] = Field(default=None, primary_key=True)
    sku: str = Field(index=True, unique=True)
    name: str
    description: str
    category: str
    price_paisa: int  # Canonical price in paisa (e.g. 45000 = ₹450.00). Price authority lives in ingest parser + gate only.
    stock: int
    is_locked: bool = Field(default=False)
    locked_price_paisa: Optional[int] = Field(default=None)
    lock_expires_at: Optional[datetime.datetime] = Field(default=None)
    tags: str = Field(default="")
    source_row_ref: Optional[str] = Field(default=None)  # e.g. "row_1" from CSV ingest
    unit_price_paise: Optional[int] = Field(default=None) # Synced with price_paisa
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

class RejectedCatalogItem(SQLModel, table=True):
    __tablename__ = "rejected_catalog_item"
    id: Optional[int] = Field(default=None, primary_key=True)
    source_row_ref: str = Field(index=True)
    raw_sku: Optional[str] = Field(default=None)
    raw_title: Optional[str] = Field(default=None)
    raw_price: Optional[str] = Field(default=None)
    reject_reason: str
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

class SpendMandate(SQLModel, table=True):
    __tablename__ = "spend_mandate"
    id: Optional[int] = Field(default=None, primary_key=True)
    mandate_id: str = Field(index=True, unique=True)
    title: str
    max_amount_paisa: int  # Spend ceiling in paisa (e.g. 500000 = ₹5,000.00)
    current_spent_paisa: int = Field(default=0)
    currency: str = Field(default="INR")
    is_active: bool = Field(default=True)
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_log"
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    action: str  # price_lock | price_reject | ATTACK_BLOCKED | etc.
    event_type: Optional[str] = Field(default=None)  # 'price_lock' | 'price_reject' | etc.
    status: str  # SUCCESS | BLOCKED | REJECTED | FAILED
    sku: Optional[str] = Field(default=None)
    qty: Optional[int] = Field(default=None)
    amount_paisa: Optional[int] = Field(default=None)
    reason: str  # Full explanation of rule check or attack signature
    payload_snapshot: Optional[str] = Field(default=None)
    razorpay_order_id: Optional[str] = Field(default=None)
    razorpay_payment_id: Optional[str] = Field(default=None)

class CheckoutRecord(SQLModel, table=True):
    __tablename__ = "checkout_record"
    id: Optional[int] = Field(default=None, primary_key=True)
    checkout_id: str = Field(index=True, unique=True)
    sku: str
    qty: int
    unit_price_paisa: int
    total_paisa: int
    status: str  # CAPTURED | BLOCKED | REJECTED
    razorpay_order_id: str
    razorpay_payment_id: str
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

class BuyerSession(SQLModel, table=True):
    __tablename__ = "buyer_sessions"
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(index=True, unique=True)
    spend_limit_paise: int
    spend_used: int = Field(default=0)
    is_active: bool = Field(default=True)
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

class Order(SQLModel, table=True):
    __tablename__ = "orders"
    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: str = Field(index=True, unique=True)
    buyer_session_id: Optional[str] = Field(default=None, index=True)
    sku: Optional[str] = Field(default=None)
    qty: Optional[int] = Field(default=None)
    unit_price_paise: Optional[int] = Field(default=None)
    total_paise: Optional[int] = Field(default=None)
    status: str = Field(index=True)  # 'captured' | 'blocked'
    block_reason: Optional[str] = Field(default=None)
    razorpay_order_id: Optional[str] = Field(default=None)
    razorpay_payment_id: Optional[str] = Field(default=None)
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
