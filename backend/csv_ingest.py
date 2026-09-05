import os
import csv
import io
import json
import re
import datetime
from typing import Dict, Any, List, Tuple, Optional
import httpx
from sqlmodel import Session, select

from backend.models import CatalogItem, AuditLog, RejectedCatalogItem
from backend.inr_parser import parse_inr_price_to_paise

NVIDIA_NIM_API_URL = os.environ.get("NVIDIA_NIM_API_URL", "https://integrate.api.nvidia.com/v1/chat/completions")
DEFAULT_NVIDIA_NIM_MODEL = os.environ.get("NVIDIA_NIM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")
# Backward-compatible aliases
GROQ_API_URL = NVIDIA_NIM_API_URL
DEFAULT_GROQ_MODEL = DEFAULT_NVIDIA_NIM_MODEL

# ==============================================================================
# INVARIANT 1 & REQUIREMENT 6 CODE PATH SEPARATION PROOF:
#
# NVIDIA NIM (Nemotron) may ONLY be used to:
#   1. Map messy column headers to (title, price, sku, stock)
#   2. Clean up title text
#
# The LLM NEVER sees, touches, or parses the raw price value that gets locked.
# The raw price value flows directly and exclusively into `parse_inr_price_to_paise()`,
# which is a 100% local, deterministic rule-based Python function.
# ==============================================================================

def map_column_headers_with_rules(headers: List[str]) -> Dict[str, Optional[str]]:
    """
    Deterministic rule-based mapping of common CSV column header variations.
    """
    mapping: Dict[str, Optional[str]] = {
        "title": None,
        "price": None,
        "sku": None,
        "stock": None,
        "category": None,
        "description": None,
    }

    lowered = {h.lower().strip(): h for h in headers}

    # Price header patterns
    price_candidates = [
        "price", "unit_price", "unit price", "mrp", "m.r.p", "m.r.p.",
        "cost", "rate", "listed_rate", "listed rate", "inr", "price inr",
        "price (inr)", "selling price", "sp", "amount"
    ]
    for cand in price_candidates:
        if cand in lowered:
            mapping["price"] = lowered[cand]
            break
    if not mapping["price"]:
        for h_low, orig in lowered.items():
            if "price" in h_low or "mrp" in h_low or "cost" in h_low or "rate" in h_low:
                mapping["price"] = orig
                break

    # Title / Name header patterns
    title_candidates = [
        "title", "name", "product_name", "product name", "item", "item_name",
        "item name", "product", "product_title", "product title", "product details", "details"
    ]
    for cand in title_candidates:
        if cand in lowered:
            mapping["title"] = lowered[cand]
            break
    if not mapping["title"]:
        for h_low, orig in lowered.items():
            if "title" in h_low or "name" in h_low or "item" in h_low or "product" in h_low:
                mapping["title"] = orig
                break

    # SKU header patterns
    sku_candidates = [
        "sku", "sku_code", "sku code", "item_code", "item code", "code",
        "product_sku", "product sku", "part_number", "part_no", "id", "item_id", "item id"
    ]
    for cand in sku_candidates:
        if cand in lowered:
            mapping["sku"] = lowered[cand]
            break
    if not mapping["sku"]:
        for h_low, orig in lowered.items():
            if "sku" in h_low or "code" in h_low or "ident" in h_low:
                mapping["sku"] = orig
                break

    # Stock header patterns
    stock_candidates = [
        "stock", "qty", "quantity", "inventory", "available", "units",
        "available_units", "available units", "stock_qty", "count"
    ]
    for cand in stock_candidates:
        if cand in lowered:
            mapping["stock"] = lowered[cand]
            break
    if not mapping["stock"]:
        for h_low, orig in lowered.items():
            if "stock" in h_low or "qty" in h_low or "quant" in h_low:
                mapping["stock"] = orig
                break

    # Category and Description
    for cand in ["category", "cat", "dept", "department"]:
        if cand in lowered:
            mapping["category"] = lowered[cand]
            break
    for cand in ["description", "desc", "specification", "specs", "summary"]:
        if cand in lowered:
            mapping["description"] = lowered[cand]
            break

    return mapping


def map_headers_with_nim(headers: List[str], api_key: str) -> Dict[str, Optional[str]]:
    """
    Uses NVIDIA NIM (Nemotron) LLM EXCLUSIVELY to map messy column headers to (title, price, sku, stock).
    
    SECURITY INVARIANT:
    Only header strings (column names) are passed to the model.
    ZERO ROW DATA and ZERO RAW PRICE VALUES are ever sent to the LLM.
    """
    system_prompt = (
        "You are a strict CSV column header classifier for merchant catalogs. "
        "Given a list of CSV header names, map them to canonical fields: "
        "'title', 'price', 'sku', 'stock', 'category', 'description'. "
        "Respond ONLY with a valid JSON object mapping canonical fields to the exact header name from the list. "
        "Do not invent column names. Do not request or process any row values."
    )
    user_prompt = f"CSV Headers list: {json.dumps(headers)}"

    payload = {
        "model": DEFAULT_NVIDIA_NIM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.0,
        "response_format": {"type": "json_object"}
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                NVIDIA_NIM_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json=payload
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                parsed = json.loads(content)
                result: Dict[str, Optional[str]] = {}
                for field in ["title", "price", "sku", "stock", "category", "description"]:
                    val = parsed.get(field)
                    result[field] = val if (val in headers) else None
                return result
    except Exception as e:
        print(f"[Aisle Ingest] NVIDIA NIM header mapping fallback to rule parser: {e}")
    
    return map_column_headers_with_rules(headers)

# Backward-compatible alias
map_headers_with_groq = map_headers_with_nim


def clean_title_with_nim(raw_title: str, api_key: str) -> str:
    """
    Uses NVIDIA NIM (Nemotron) ONLY to clean up messy title text (removing extraneous promo asterisks or noise).
    SECURITY INVARIANT: Only the title string is passed. Never sees price values.
    """
    if not api_key or not raw_title or len(raw_title) < 4:
        return raw_title

    system_prompt = (
        "Clean up the merchant product title: strip marketing clutter, excess asterisks, "
        "or bad formatting. Return ONLY the clean, concise product title as plain text."
    )
    payload = {
        "model": DEFAULT_NVIDIA_NIM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": raw_title}
        ],
        "temperature": 0.1,
        "max_tokens": 60
    }
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(
                NVIDIA_NIM_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json=payload
            )
            if resp.status_code == 200:
                data = resp.json()
                cleaned = data["choices"][0]["message"]["content"].strip().strip('"')
                if cleaned:
                    return cleaned
    except Exception:
        pass
    return raw_title

# Backward-compatible alias
clean_title_with_groq = clean_title_with_nim


def ingest_catalog_csv(
    session: Session,
    csv_content: str,
    nvidia_nim_api_key: Optional[str] = None,
    groq_api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Full ingest pipeline enforcing Invariant 1 and Section 4 of aisle-backend-architecture.md:
    
    1. Parse CSV structure.
    2. Column Header Mapping: Rule-based fast path, with NVIDIA NIM used ONLY for ambiguous headers.
       -> THE LLM NEVER SEES OR TOUCHES RAW PRICE VALUES.
    3. Iterate rows:
       - Extract raw_price cell value.
       - Pass raw_price into local deterministic rule parser `parse_inr_price_to_paise()`.
       - On success: Write locked CatalogItem (unit_price_paise + source_row_ref) & AuditLog ('price_lock').
       - On failure: Write RejectedCatalogItem (reject_reason) & AuditLog ('price_reject').
    4. Compute coverage = locked_count / total_count.
    5. Return { locked: [...], rejected: [...], coverage: float }.
    """
    f = io.StringIO(csv_content)
    reader = csv.reader(f)

    try:
        raw_headers = next(reader)
    except StopIteration:
        return {"locked": [], "rejected": [], "coverage": 0.0, "error": "CSV file is empty"}

    headers = [h.strip() for h in raw_headers if h is not None]
    if not headers:
        return {"locked": [], "rejected": [], "coverage": 0.0, "error": "No valid header columns detected"}

    # Resolve header mapping
    resolved_headers = map_column_headers_with_rules(headers)
    
    # If required columns are missing and NVIDIA NIM API key is present, use Nemotron for header mapping ONLY
    effective_nim_key = nvidia_nim_api_key or groq_api_key or os.environ.get("NVIDIA_NIM_API_KEY") or os.environ.get("GROQ_API_KEY")
    if (not resolved_headers.get("price") or not resolved_headers.get("title")) and effective_nim_key:
        nim_mapped = map_headers_with_nim(headers, effective_nim_key)
        for k, v in nim_mapped.items():
            if v:
                resolved_headers[k] = v

    price_col = resolved_headers.get("price")
    title_col = resolved_headers.get("title")
    sku_col = resolved_headers.get("sku")
    stock_col = resolved_headers.get("stock")
    cat_col = resolved_headers.get("category")
    desc_col = resolved_headers.get("description")

    if not price_col:
        # Cannot proceed without a price column
        return {
            "locked": [],
            "rejected": [],
            "coverage": 0.0,
            "error": f"Could not identify price column from headers: {headers}"
        }

    # Reset buffer to parse with DictReader
    f.seek(0)
    dict_reader = csv.DictReader(f)

    locked_results: List[Dict[str, Any]] = []
    rejected_results: List[Dict[str, Any]] = []

    row_index = 0

    for row_dict in dict_reader:
        row_index += 1
        source_row_ref = f"row_{row_index}"

        # Clean row dictionary keys (strip whitespace)
        cleaned_row = {k.strip(): (v.strip() if v else "") for k, v in row_dict.items() if k is not None}

        # ----------------------------------------------------------------------
        # ISOLATION BARRIER:
        # Extract raw_price string directly from CSV cell.
        # This string is NEVER sent to Groq or any LLM.
        # ----------------------------------------------------------------------
        raw_price = cleaned_row.get(price_col, "")
        raw_title = cleaned_row.get(title_col, "") if title_col else ""
        raw_sku = cleaned_row.get(sku_col, "") if sku_col else ""
        raw_stock = cleaned_row.get(stock_col, "10") if stock_col else "10"
        raw_category = cleaned_row.get(cat_col, "General Catalog") if cat_col else "General Catalog"
        raw_description = cleaned_row.get(desc_col, "") if desc_col else ""

        # Deterministic rule-based INR parse (Invariant 1)
        is_valid_price, unit_price_paise, reject_reason = parse_inr_price_to_paise(raw_price)

        if not is_valid_price:
            # ------------------------------------------------------------------
            # REQUIREMENT 4: On parse failure:
            # Write a rejected row with reject_reason and audit_log row (event_type='price_reject')
            # ------------------------------------------------------------------
            rejected_item = RejectedCatalogItem(
                source_row_ref=source_row_ref,
                raw_sku=raw_sku or f"UNRESOLVED-{source_row_ref}",
                raw_title=raw_title or f"Unparsed Item ({source_row_ref})",
                raw_price=raw_price,
                reject_reason=reject_reason or "Unparseable price format",
                created_at=datetime.datetime.utcnow()
            )
            session.add(rejected_item)

            audit_entry = AuditLog(
                action="price_reject",
                event_type="price_reject",
                status="REJECTED",
                sku=raw_sku or f"UNRESOLVED-{source_row_ref}",
                reason=(
                    f"Deterministic price parse rejected on {source_row_ref}: {reject_reason}. "
                    f"Raw price input: '{raw_price}'"
                ),
                payload_snapshot=json.dumps({
                    "source_row_ref": source_row_ref,
                    "raw_price": raw_price,
                    "raw_title": raw_title,
                    "reject_reason": reject_reason,
                    "invariant_enforced": "Invariant 1: Rule gate price authority (reject unparseable quotes)"
                }),
                timestamp=datetime.datetime.utcnow()
            )
            session.add(audit_entry)

            rejected_results.append({
                "source_row_ref": source_row_ref,
                "raw_sku": raw_sku or f"UNRESOLVED-{source_row_ref}",
                "raw_title": raw_title or f"Unparsed Item ({source_row_ref})",
                "raw_price": raw_price,
                "reject_reason": reject_reason or "Unparseable price format"
            })
            continue

        # ----------------------------------------------------------------------
        # REQUIREMENT 3: On parse success:
        # Write a locked catalog_items row with unit_price_paise + source_row_ref,
        # and an audit_log row (event_type='price_lock').
        # ----------------------------------------------------------------------
        
        # Derive canonical SKU if missing
        derived_sku = raw_sku.strip() if raw_sku else ""
        if not derived_sku:
            safe_slug = re.sub(r'[^A-Za-z0-9]+', '-', raw_title.strip().upper())[:16].strip('-')
            derived_sku = f"SKU-{safe_slug or 'ITEM'}-{row_index}"

        # Parse stock
        try:
            stock_clean = re.sub(r'[^\d]', '', raw_stock)
            stock_int = int(stock_clean) if stock_clean else 10
        except ValueError:
            stock_int = 10

        # Optional: NVIDIA NIM title clean if configured, strictly isolated to title text only
        final_title = raw_title.strip() or f"Catalog Item {derived_sku}"
        if effective_nim_key and ("***" in final_title or len(final_title) > 60):
            final_title = clean_title_with_nim(final_title, effective_nim_key)

        # Check if item with this SKU already exists
        existing_item = session.exec(select(CatalogItem).where(CatalogItem.sku == derived_sku)).first()
        
        if existing_item:
            existing_item.name = final_title
            existing_item.price_paisa = unit_price_paise
            existing_item.locked_price_paisa = unit_price_paise
            existing_item.unit_price_paise = unit_price_paise
            existing_item.is_locked = True
            existing_item.stock = stock_int
            existing_item.source_row_ref = source_row_ref
            existing_item.lock_expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            if raw_category:
                existing_item.category = raw_category
            if raw_description:
                existing_item.description = raw_description
            session.add(existing_item)
            saved_item = existing_item
        else:
            new_item = CatalogItem(
                sku=derived_sku,
                name=final_title,
                description=raw_description or f"Deterministic locked product from {source_row_ref}",
                category=raw_category or "General Merchant",
                price_paisa=unit_price_paise,
                locked_price_paisa=unit_price_paise,
                unit_price_paise=unit_price_paise,
                is_locked=True,
                stock=stock_int,
                source_row_ref=source_row_ref,
                lock_expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=24),
                tags=f"ingest, {source_row_ref}, locked"
            )
            session.add(new_item)
            saved_item = new_item

        # Write audit_log row (event_type='price_lock')
        audit_lock = AuditLog(
            action="price_lock",
            event_type="price_lock",
            status="SUCCESS",
            sku=derived_sku,
            amount_paisa=unit_price_paise,
            reason=(
                f"Deterministic price lock activated on {source_row_ref}: "
                f"Locked at ₹{unit_price_paise / 100:.2f} ({unit_price_paise} paise). "
                f"Raw input '{raw_price}' parsed via rule parser."
            ),
            payload_snapshot=json.dumps({
                "source_row_ref": source_row_ref,
                "sku": derived_sku,
                "raw_price": raw_price,
                "unit_price_paise": unit_price_paise,
                "unit_price_inr": unit_price_paise / 100.0,
                "is_locked": True,
                "invariant_enforced": "Invariant 1: Price authority lives only in ingest parser + gate"
            }),
            timestamp=datetime.datetime.utcnow()
        )
        session.add(audit_lock)

        locked_results.append({
            "sku": derived_sku,
            "title": final_title,
            "name": final_title,
            "unit_price_paise": unit_price_paise,
            "unit_price_inr": unit_price_paise / 100.0,
            "stock": stock_int,
            "source_row_ref": source_row_ref,
            "is_locked": True,
            "category": raw_category or "General Merchant",
            "description": raw_description or ""
        })

    # Commit all changes atomically
    session.commit()

    total_count = len(locked_results) + len(rejected_results)
    coverage = round(len(locked_results) / total_count, 4) if total_count > 0 else 0.0

    return {
        "locked": locked_results,
        "rejected": rejected_results,
        "coverage": coverage,
        "total_count": total_count,
        "locked_count": len(locked_results),
        "rejected_count": len(rejected_results),
        "header_mapping_used": resolved_headers
    }
