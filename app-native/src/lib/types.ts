// Database types. Phase 0 covers only the tables the app touches so far.
// To replace this with the full generated list (all ~160 tables), run once:
//   npx supabase login
//   npm run gen:types
// Columns checked against the live database on 28 Oct 2026.

export type Role =
  | 'superadmin' | 'admin' | 'pm' | 'site_manager' | 'operative' | 'driver' | 'client'
  | (string & {}); // subcontractor_company_* and anything newer

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string | null;
  org_id: string | null;
  signature_path: string | null;
  phone: string | null;
  is_estimator: boolean;
  view_as_org_id: string | null;
  finance_enabled: boolean;
  finance_hidden: boolean;
  see_costs: boolean;
};

export type Organization = {
  id: string;
  name: string;
  logo_path: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  plan_tier: string;
  has_pm: boolean;
  has_finance: boolean;
};

export type DeviceLockResult = {
  ok: boolean;
  exempt?: boolean;
  error?: 'not_authenticated' | 'request_failed' | 'device_locked' | 'pending_approval' | string;
  reason?: 'lookalike' | string;
  locked_to_name?: string;
};

export type InviteInfo = {
  org_name: string;
  is_valid: boolean;
  logo_path: string | null;
  color_primary: string | null;
  color_secondary: string | null;
};

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      organizations: Table<Organization>;
      push_tokens: Table<{ id: string; user_id: string; token: string; platform: string | null; created_at: string | null; updated_at: string | null }>;
    };
    Views: Record<string, never>;
    Functions: {
      check_device_lock_v2: { Args: { p_device_id: string; p_hw_id?: string | null }; Returns: DeviceLockResult };
      claim_push_token: { Args: { p_token: string; p_platform: string }; Returns: undefined };
      get_invite_info: { Args: { p_invite_id: string }; Returns: InviteInfo[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
