// Accident / Incident / Near Miss reports (690), modelled on RTB's paper form.
// Anyone on the job can file one; it's signed with the reporter's adopted
// signature and permanent once filed — only a manager can delete one.
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { compressOne, type Picked } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type Incident = Record<string, unknown> & {
  id: string; site_id: string; created_at: string; created_by: string | null; incident_type: string | null; location: string | null; incident_date: string | null;
  filed_by_name: string | null; riddor_reportable: boolean; injury_occurred: boolean; damage_occurred: boolean;
  area_photo_paths: string[] | null; damage_photo_paths: string[] | null; signature_image_path: string | null; signed_at: string | null;
};

export function useIncidents(siteId: string | undefined) {
  return useQuery({
    queryKey: ['incidents', siteId],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`incidents:${siteId}`, async () => orThrow(await db.from('incident_reports').select('*').eq('site_id', siteId as string).order('created_at', { ascending: false })) as Incident[]),
  });
}
export function useIncident(id: string | undefined) {
  return useQuery({
    queryKey: ['incident', id],
    enabled: !!id,
    queryFn: async () => ((orThrow(await db.from('incident_reports').select('*').eq('id', id as string).limit(1)) as Incident[]) ?? [])[0] ?? null,
  });
}

export async function uploadIncidentPhoto(siteId: string, p: Picked): Promise<string | null> {
  try {
    const uri = await compressOne(p);
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('incident-photos').upload(`${siteId}/incidents/tmp/${rid}.jpg`, await (await fetch(uri)).arrayBuffer(), { contentType: 'image/jpeg' });
    return up.error ? null : up.data.path;
  } catch { return null; }
}

export type IncidentDraft = {
  type: string; siteAddress: string; location: string; date: string; operatives: string; filedBy: string; detail: string; areaPhotos: string[];
  dateTime: string; reportedDateTime: string; reportedTo: string; witnesses: string; witnessNames: string; medical: string; medicalDetail: string;
  injury: string; injuryTo: string; injuryDescription: string; injuryFurther: string; damage: string; damageSeverity: string; damagePhotos: string[];
  damageDescription: string; factors: string; corrective: string; potential: string; potentialOutcome: string; reoccurrence: string; riddor: string;
};

/** "2026-10-28 14:30" → ISO, else null. */
const dt = (t: string) => { const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/.exec(t.trim()); return m ? new Date(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00`).toISOString() : null; };
export const validDateTime = (t: string) => !t.trim() || !!dt(t);

export function incidentProblem(d: IncidentDraft): string | null {
  if (!d.type) return 'Please choose whether this is an Incident, Accident or Near Miss.';
  if (!d.detail.trim()) return 'Please describe what happened.';
  if (!d.medical) return 'Please answer: does the operative require further medical treatment?';
  if (!d.injury) return 'Please answer: did any injuries occur?';
  if (!d.riddor) return 'Please answer: is this RIDDOR reportable?';
  if (!validDateTime(d.dateTime) || !validDateTime(d.reportedDateTime)) return 'Enter dates and times like 2026-10-28 14:30.';
  return null;
}

export async function submitIncident(me: Profile & { signature_path?: string | null }, siteId: string, d: IncidentDraft): Promise<{ id: string | null; error?: string }> {
  const t = (v: string) => v.trim() || null;
  const r = await db.from('incident_reports').insert({
    org_id: me.org_id, site_id: siteId, created_by: me.id, incident_type: d.type, site_address: t(d.siteAddress), location: t(d.location),
    incident_date: t(d.date), operatives_involved: t(d.operatives), filed_by_name: t(d.filedBy) || me.name, detail: d.detail.trim(), area_photo_paths: d.areaPhotos,
    incident_datetime: dt(d.dateTime), reported_datetime: dt(d.reportedDateTime), reported_to: t(d.reportedTo), witnesses: d.witnesses || null,
    witness_names: t(d.witnessNames), medical_treatment_required: d.medical === 'yes', medical_treatment_detail: t(d.medicalDetail),
    injury_occurred: d.injury === 'yes', injury_to: t(d.injuryTo), injury_description: t(d.injuryDescription), injury_further_treatment: d.injuryFurther === 'yes',
    damage_occurred: d.damage === 'yes', damage_severity: d.damageSeverity || null, damage_photo_paths: d.damagePhotos, damage_description: t(d.damageDescription),
    contributing_factors: t(d.factors), corrective_action: t(d.corrective), potential_severity: d.potential || null, potential_outcome: t(d.potentialOutcome),
    reoccurrence_probability: d.reoccurrence || null, riddor_reportable: d.riddor === 'yes', signature_image_path: me.signature_path, signed_at: new Date().toISOString(),
  } as never).select('id').single();
  return r.error ? { id: null, error: 'Could not submit — check your signal and try again.' } : { id: (r.data as { id: string }).id };
}

export async function deleteIncident(me: Profile, r: Incident): Promise<boolean> {
  const x = await db.from('incident_reports').delete().eq('id', r.id);
  if (!x.error && me.org_id) void db.from('site_activity_log').insert({ site_id: r.site_id, org_id: me.org_id, actor_id: me.id, action: 'incident_report_deleted', description: `Deleted ${r.incident_type || 'incident'} report${r.incident_date ? ` (${r.incident_date})` : ''}` } as never);
  return !x.error;
}
