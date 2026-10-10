export interface Voucher {
  id: string;
  type: string;
  source_id: string;
  amount_paise: number;
  status: 'pending' | 'pushed' | 'failed';
  attempts: number;
  last_error?: string | null;
  client_ref: string;
  external_ref?: string | null;
  locked_until?: string | null;
  locked_by?: string | null;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
}

export interface IssueSummary {
  id: string;
  party_id: string;
  party_name: string;
  party_phone: string;
  sku_id: string;
  sku_code: string;
  sku_name: string;
  sku_image_url: string;
  issued_qty: number;
  total_received_qty: number;
  outstanding_qty: number;
  issued_on: string;
  created_at: string;
}

export interface AskToolCall {
  tool_name: string;
  arguments: any;
  timestamp: string;
  result: any;
}

export interface AskResponse {
  question: string;
  answer: string;
  tool_calls: AskToolCall[];
  model_status: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
}
