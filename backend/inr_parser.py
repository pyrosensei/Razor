import re
from typing import Tuple, Optional, Any

def parse_inr_price_to_paise(raw_value: Any) -> Tuple[bool, Optional[int], Optional[str]]:
    """
    Rule-based INR parser strictly enforcing Invariant 1:
    Price authority lives only in the ingest parser + gate.
    
    Handles:
    - Currency symbols: '₹', 'Rs.', 'Rs', 'INR', 'inr'
    - Thousand-separator commas: '1,299.00', '1,00,000.00'
    - Trailing '/-' or '/=' or '/' (e.g. '450/-', '1,500 /-')
    - Decimal places (up to 2): '45.50', '999.5'
    
    Rejects (strictly doesn't guess):
    - "Best price"
    - "POR" / "P.O.R" / "Price on request" / "Price on req"
    - "Call for price" / "Call for quote"
    - "Contact us" / "Inquire" / "Ask"
    - "N/A" / "TBD" / "Free" / empty / null
    - Ranges: "500 - 800"
    - Zero or negative amounts
    - Anything that does not reduce to a clean positive number
    
    Returns:
        (success: bool, unit_price_paise: Optional[int], reject_reason: Optional[str])
    """
    if raw_value is None:
        return False, None, "Missing price: Value is null"

    # Convert to string and trim
    s = str(raw_value).strip()
    if not s:
        return False, None, "Empty price: Blank or whitespace value"

    s_lower = s.lower()

    # 1. Strict keyword rejects — NEVER guess on commercial ambiguity
    if "best price" in s_lower:
        return False, None, "Non-deterministic quotation ('Best price'): Rule gate requires canonical exact amount"
    
    if s_lower in ("por", "p.o.r", "p.o.r.") or "price on request" in s_lower or "price on req" in s_lower:
        return False, None, "Price on Request (POR) is non-deterministic: Exact price authority required"

    if "call for price" in s_lower or "call for quote" in s_lower:
        return False, None, "Non-deterministic quote ('Call for price'): Rule gate requires canonical exact amount"

    if "contact" in s_lower or "inquire" in s_lower or "ask" in s_lower:
        return False, None, f"Non-deterministic commercial quote ('{s}'): Requires definite numeric price"

    if s_lower in ("n/a", "na", "tbd", "none", "null", "undefined", "free", "-", "--"):
        return False, None, f"Non-numeric placeholder ('{s}')"

    if "-" in s and not s.endswith("/-"):
        # Check if it's a price range (e.g. 500 - 800) or negative number (-50)
        return False, None, f"Ambiguous range or negative price ('{s}'): Ranges forbidden by deterministic gate"

    # 2. Strip trailing slash-dash notation: '/-', '/=', '/'
    # Matches '450/-', '1500 /-', '1500/'
    s_cleaned = re.sub(r'/\s*[-=]?$', '', s).strip()

    # 3. Strip currency identifiers at the beginning
    # ₹, Rs., Rs, INR (case-insensitive)
    s_cleaned = re.sub(r'^(₹|Rs\.?|INR)\s*', '', s_cleaned, flags=re.IGNORECASE).strip()

    # Also strip currency identifiers at the end (e.g. '500 INR', '450 Rs')
    s_cleaned = re.sub(r'\s*(₹|Rs\.?|INR)$', '', s_cleaned, flags=re.IGNORECASE).strip()

    # 4. Remove internal thousand-separator commas (handles standard '1,299.00' and Indian '1,00,000')
    s_cleaned = s_cleaned.replace(',', '').strip()

    # 5. Must match a clean positive number with at most one decimal point
    # Regex: strictly digits, optionally a dot followed by 1 or 2 digits
    if not re.match(r'^\d+(\.\d+)?$', s_cleaned):
        return False, None, f"Unparseable price format: '{s}' cannot be converted to clean INR numeric"

    # 6. Process integer and decimal parts
    parts = s_cleaned.split('.')
    integer_part = parts[0]
    
    if len(parts) > 1:
        decimal_part = parts[1]
        if len(decimal_part) > 2:
            return False, None, f"Sub-paisa precision not supported: '{s}' (max 2 decimal places permitted)"
        # Pad to exactly 2 digits: '5' -> '50', '25' -> '25'
        decimal_paise = int(decimal_part.ljust(2, '0')[:2])
    else:
        decimal_paise = 0

    try:
        rupees = int(integer_part) if integer_part else 0
        total_paise = rupees * 100 + decimal_paise
    except ValueError:
        return False, None, f"Numeric overflow or invalid integer conversion for '{s}'"

    # 7. Reject non-positive amounts
    if total_paise <= 0:
        return False, None, f"Non-positive price ({total_paise} paise): Gate requires strictly positive price"

    return True, total_paise, None
