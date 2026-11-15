// Sites, addresses and check-in history. Every read goes through the offline
// cache, so pages open with no signal (showing the last good copy).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow, readCached } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';
import type { Checkin, Site, SubAddress } from '@/lib/types';

// The project columns the app uses (speed review, 15 Nov 2026: it read all 54 for every project on every screen).
// Left out, as nothing in the app reads them: additional_works_amount, additional_works_note, overbooked_notified, price_excel_path, price_onedrive_drive_id, price_onedrive_item_id, price_updated_at.
// A new column the app needs must be added here too.
export const SITE_COLS = 'id,name,address,status,geofence_lat,geofence_lon,created_by,created_at,org_id,responsible_pm_id,postcode,onedrive_folder_id,onedrive_folder_name,onedrive_drive_id,geofence_radius_m,price_enabled,price_total,price_booked_override,start_date,closed_at,closed_by,job_number,material_orders_folder_id,material_orders_folder_name,material_orders_drive_id,material_orders_last_synced_at,onedrive_last_synced_at,multi_site,acting_as_main_contractor,site_inductions_folder_id,site_inductions_folder_name,site_inductions_drive_id,mc_hidden_tiles,client_name,client_phone,client_email,client_contact_name,repair_contract,materials_visibility,tile_visibility,job_pack,estimating_linked_at,repair_discount_pct,repair_uses_rates,repair_rates_name,repair_online_approval,repair_no_access_charge';

// RLS decides which sites each person can see (operatives: the jobs they're assigned to).
export function useSites() {
  const { me } = useAuth();
  const qc = useQueryClient();
  // Open from the copy saved on this device straight away; the fresh list replaces it when it arrives (speed review,
  // 15 Nov 2026: every cold start showed spinners although the list was already on the phone).
  useEffect(() => {
    if (!me) return;
    const key = ['sites', me.id];
    if (qc.getQueryData(key)) return;
    void readCached<Site[]>(`sites:${me.id}`).then((saved) => { if (saved && !qc.getQueryData(key)) qc.setQueryData(key, saved.data, { updatedAt: saved.at }); });
  }, [me, qc]);
  return useQuery({
    queryKey: ['sites', me?.id],
    enabled: !!me,
    staleTime: 120000,
    queryFn: () => cachedQuery(`sites:${me?.id}`, async () =>
      orThrow(await supabase.from('sites').select(SITE_COLS).order('created_at', { ascending: true })) as unknown as Site[]),
  });
}

export function useSite(siteId: string | undefined) {
  const q = useSites();
  return { ...q, data: q.data?.find((s) => s.id === siteId) };
}

export function useSubAddresses(siteId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['subAddresses', siteId],
    enabled: !!siteId && enabled,
    queryFn: () => cachedQuery(`subAddresses:${siteId}`, async () =>
      orThrow(await supabase.from('site_sub_addresses').select('*').eq('site_id', siteId as string).order('name', { ascending: true })) as SubAddress[]),
  });
}

// My last few check-ins on a job (or one address of a multi-site job), newest first.
export function useMyCheckins(siteId: string | undefined, subId?: string) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['myCheckins', siteId, subId ?? null, me?.id],
    enabled: !!siteId && !!me,
    queryFn: () => cachedQuery(`myCheckins:${siteId}:${subId ?? ''}:${me?.id}`, async () => {
      let q = supabase.from('checkins').select('*').eq('site_id', siteId as string).eq('user_id', (me as { id: string }).id);
      if (subId) q = q.eq('sub_site_id', subId);
      return orThrow(await q.order('ts', { ascending: false }).limit(5)) as Checkin[];
    }),
  });
}
