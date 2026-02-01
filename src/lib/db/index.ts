import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Database types based on schema
export interface DbUser {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  password_salt: string;
  role: "provider" | "buyer" | "admin";
  display_name?: string;
  phone?: string;
  location?: string;
  avatar_url?: string;

  // Provider fields
  payout_method?: "venmo" | "paypal" | "bank" | "stripe";
  venmo_username?: string;
  paypal_email?: string;
  bank_account_last4?: string;
  bank_routing_last4?: string;
  stripe_account_id?: string;
  stripe_onboarding_complete?: boolean;

  // Buyer fields
  business_name?: string;
  business_type?: string;
  licensed_states?: string[];
  npn?: string;
  compliance_acknowledged?: boolean;

  // Email verification
  email_verified: boolean;
  email_verification_token?: string;
  email_verification_expires?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

export interface DbSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface DbConnection {
  id: string;
  provider_id: string;
  buyer_id: string;
  status: "pending" | "accepted" | "declined" | "terminated";
  rate_per_lead: number;
  payment_timing: "per_lead" | "weekly" | "biweekly" | "monthly";
  weekly_lead_cap?: number;
  monthly_lead_cap?: number;
  cap_strategy?: "pause" | "reject";
  allowed_states?: string[];
  total_leads: number;
  total_paid: number;
  leads_this_week: number;
  leads_this_month: number;
  requested_at: string;
  accepted_at?: string;
  terminated_at?: string;
  terms_updated_at?: string;
}

export interface DbLead {
  id: string;
  provider_id: string;
  buyer_id?: string;
  connection_id?: string;
  status: "pending" | "claimed" | "converted" | "rejected" | "expired";
  customer_data_encrypted: string;
  customer_data_iv: string;
  customer_state?: string;
  vehicle_year?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  license_extracted: boolean;
  license_confidence?: "high" | "medium" | "low";
  quote_type: "asap" | "standard" | "comprehensive";
  estimated_premium?: number;
  selected_carrier?: string;
  payout_amount: number;
  payout_status: "pending" | "processing" | "completed" | "failed";
  stripe_transfer_id?: string;
  crm_pushed: boolean;
  crm_lead_id?: string;
  crm_push_error?: string;
  policy_number?: string;
  policy_carrier?: string;
  policy_bound_at?: string;
  submitted_at: string;
  claimed_at?: string;
  converted_at?: string;
  payout_completed_at?: string;
}

export interface DbTransaction {
  id: string;
  type: "lead_payout" | "policy_commission" | "platform_fee" | "refund" | "adjustment";
  status: "pending" | "completed" | "failed" | "reversed";
  amount: number;
  fee_amount: number;
  net_amount: number;
  from_account_id?: string;
  to_account_id?: string;
  lead_id?: string;
  connection_id?: string;
  stripe_payment_id?: string;
  stripe_transfer_id?: string;
  stripe_payout_id?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  completed_at?: string;
  reversed_at?: string;
  reversal_reason?: string;
  reversal_transaction_id?: string;
}

export interface DbAccountBalance {
  user_id: string;
  account_type: "provider" | "buyer" | "admin";
  available_balance: number;
  pending_balance: number;
  total_earnings: number;
  total_payouts: number;
}

// Database type for Supabase
export interface Database {
  public: {
    Tables: {
      users: {
        Row: DbUser;
        Insert: Omit<DbUser, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<DbUser, "id" | "created_at">>;
      };
      sessions: {
        Row: DbSession;
        Insert: Omit<DbSession, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<DbSession, "id" | "created_at">>;
      };
      connections: {
        Row: DbConnection;
        Insert: Omit<DbConnection, "id" | "requested_at" | "total_leads" | "total_paid" | "leads_this_week" | "leads_this_month"> & { id?: string };
        Update: Partial<Omit<DbConnection, "id" | "requested_at">>;
      };
      leads: {
        Row: DbLead;
        Insert: Omit<DbLead, "id" | "submitted_at"> & { id?: string };
        Update: Partial<Omit<DbLead, "id" | "submitted_at">>;
      };
      transactions: {
        Row: DbTransaction;
        Insert: Omit<DbTransaction, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<DbTransaction, "id" | "created_at">>;
      };
    };
    Views: {
      account_balances: {
        Row: DbAccountBalance;
      };
    };
  };
}

// Singleton instances
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: SupabaseClient<any, "public", any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serverClient: SupabaseClient<any, "public", any> | null = null;

/**
 * Get Supabase client for browser/client-side usage
 * Uses anon key with RLS policies
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabaseBrowserClient(): SupabaseClient<any, "public", any> {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false, // We handle our own sessions
      autoRefreshToken: false,
    },
  });

  return browserClient;
}

/**
 * Get Supabase client for server-side usage
 * Uses service role key to bypass RLS
 * ONLY use on server (API routes, middleware)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabaseServerClient(): SupabaseClient<any, "public", any> {
  if (serverClient) return serverClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase server environment variables");
  }

  serverClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return serverClient;
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Check if Supabase server client is configured
 */
export function isSupabaseServerConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
