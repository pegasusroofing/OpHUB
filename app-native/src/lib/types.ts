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
  viewed_schedule_at?: string | null;
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

export type Site = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  status: string | null;
  org_id: string | null;
  responsible_pm_id: string | null;
  job_number: string | null;
  start_date: string | null;
  geofence_lat: number | null;
  geofence_lon: number | null;
  geofence_radius_m: number;
  multi_site: boolean;
  repair_contract: boolean;
  price_enabled: boolean;
  client_name: string | null;
  created_at: string | null;
  tile_visibility?: Record<string, string[]> | null;
};

export type SubAddress = {
  id: string;
  site_id: string | null;
  org_id: string | null;
  name: string;
  address: string | null;
  postcode: string | null;
  geofence_lat: number | null;
  geofence_lon: number | null;
  geofence_radius_m: number | null;
  closed: boolean;
};

export type Checkin = {
  id: string;
  site_id: string | null;
  sub_site_id: string | null;
  user_id: string | null;
  type: 'in' | 'out' | string;
  ts: string | null;
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  device_id: string | null;
};

export type Message = {
  id: string;
  org_id: string;
  site_id: string | null;
  sender_id: string | null;
  audience: string;
  kind: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  recipient_id: string | null;
  related_id: string | null;
};

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      organizations: Table<Organization>;
      sites: Table<Site>;
      site_sub_addresses: Table<SubAddress>;
      checkins: Table<Checkin>;
      messages: Table<Message>;
      message_reads: Table<{ message_id: string; user_id: string; read_at: string }>;
      schedule_tasks: Table<{ id: string; site_id: string | null; sub_site_id: string | null; name: string; status: string | null }>;
      schedule_photos: Table<{ id: string; task_id: string | null; storage_path: string }>;
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
