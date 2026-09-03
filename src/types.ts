export interface CatalogItem {
  id: number;
  sku: string;
  name: string;
  description: string;
  category: string;
  price_inr: number;
  price_paisa: number;
  stock: number;
  is_locked: boolean;
  locked_price_inr: number | null;
  locked_price_paisa: number | null;
  lock_expires_at: string | null;
  source_row_ref?: string | null;
  unit_price_paise?: number | null;
  tags: string;
}

export interface RejectedItem {
  id?: number;
  source_row_ref: string;
  raw_sku: string | null;
  raw_title: string | null;
  raw_price: string | null;
  reject_reason: string;
  created_at?: string;
}

export interface CsvUploadResult {
  locked: Array<{
    sku: string;
    title: string;
    name?: string;
    unit_price_paise: number;
    unit_price_inr: number;
    stock: number;
    source_row_ref: string;
    is_locked: boolean;
    category?: string;
    description?: string;
  }>;
  rejected: Array<RejectedItem>;
  coverage: number;
  total_count: number;
  locked_count: number;
  rejected_count: number;
  header_mapping_used?: Record<string, string | null>;
}

export interface SpendMandate {
  mandate_id: string;
  title: string;
  max_amount_inr: number;
  max_amount_paisa: number;
  current_spent_inr: number;
  current_spent_paisa: number;
  remaining_inr: number;
  remaining_paisa: number;
  currency: string;
  is_active: boolean;
}

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  action: string;
  status: string;
  sku: string | null;
  qty: number | null;
  amount_inr: number | null;
  amount_paisa: number | null;
  reason: string;
  payload_snapshot: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
}

export interface CheckoutRecord {
  id: number;
  checkout_id: string;
  sku: string;
  qty: number;
  unit_price_inr: number;
  total_inr: number;
  status: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  created_at: string;
}

export interface TranscriptStep {
  turn: number;
  phase: 'observe' | 'reason' | 'act' | 'tool_result' | 'final_answer';
  timestamp: string;
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown> | unknown;
}

export interface BuyerSessionData {
  session_id: string;
  buyer_session_id?: string;
  spend_limit_paise: number;
  spend_limit_inr: number;
  spend_used: number;
  spend_used_inr: number;
  remaining_spend_paise: number;
  remaining_spend_inr: number;
  is_active: boolean;
  created_at: string;
}

export interface BuyerRunResult {
  mode: string;
  status: string;
  buyer_engine?: string;
  intent?: string;
  goal?: string;
  persona?: string;
  buyer_session_id?: string;
  spend_limit_paise?: number;
  spend_limit_inr?: number;
  spend_used_paise?: number;
  spend_used_inr?: number;
  remaining_spend_paise?: number;
  remaining_spend_inr?: number;
  fallback_reason?: string | null;
  fallback_used?: boolean;
  fallback_triggered?: boolean;
  message?: string;
  turns_taken?: number;
  transcript?: TranscriptStep[];
  tool_steps?: Array<{
    tool: string;
    args: Record<string, unknown>;
  }>;
  checkout?: {
    checkout_id?: string;
    order_id?: string;
    status: string;
    sku: string;
    item_name?: string;
    name?: string;
    qty: number;
    unit_price_inr?: number;
    unit_price_paisa?: number;
    total_amount_inr?: number;
    total_amount_paisa?: number;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    stock_remaining?: number;
    mandate_remaining_inr?: number;
    rules_verified?: Array<{
      step: number;
      rule: string;
      passed: boolean;
      detail: string;
    }>;
  };
  final_order?: {
    order_id?: string;
    status: string;
    sku: string;
    qty: number;
    unit_price_paisa?: number;
    total_amount_paisa?: number;
    unit_price_inr?: number;
    total_amount_inr?: number;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    stock_remaining?: number;
  };
}

export type LabAttackType = 'hallucinated_price' | 'unauthorized_discount' | 'oversell' | 'spend_breach';

export interface LabAttackSpec {
  id: LabAttackType;
  name: string;
  badge: string;
  description: string;
  pitch_claim: string;
  invariant_enforced: string;
  target_sku: string;
  default_payload: Record<string, unknown>;
  expected_block_reason: string;
  expected_step: string;
}

export interface LabAttackResult {
  attack_type: LabAttackType;
  name: string;
  description: string;
  pitch_claim: string;
  invariant_enforced: string;
  payload_attempted: Record<string, unknown>;
  blocked: boolean;
  status_code: number;
  block_reason: string;
  block_result: {
    error?: string;
    status?: string;
    block_reason?: string;
    message?: string;
    order_id?: string;
    audit_log_id?: number;
    step_failed?: number;
    unauthorized_fields?: string[];
    requested_qty?: number;
    available_stock?: number;
    total_paise?: number;
    remaining_spend_paise?: number;
    [key: string]: unknown;
  };
  audit_log: AuditLogEntry | null;
}
