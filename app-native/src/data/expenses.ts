// Expenses: send receipts to the office. Ported from 590-expenses-sub-tile-inside-materials.js.
// Each group of receipts is labelled with a job (or Fuel, or a job not on the app);
// files upload, one expenses row per group is saved, then send-expenses-email emails
// each receipt on its own to the company's expenses address.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { compressOne, type Picked } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type ExpFile = { name: string; uri: string; isPdf: boolean; size?: number | null; picked?: Picked };
export type ExpGroup = { key: string; job: string; manual: string; note: string; files: ExpFile[] };
export type ExpenseRow = {
  id: string; batch_id: string; site_id: string | null; manual_label: string | null; category: string; note: string | null;
  file_paths: string[] | null; file_names: string[] | null; created_by: string; created_at: string; emailed_at: string | null; emailed_to: string | null;
};

const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);
export const newGroup = (siteId?: string | null): ExpGroup => ({ key: rid(), job: siteId ? `site:${siteId}` : '', manual: '', note: '', files: [] });

/** The problem with a set of receipt groups before saving, or ''. Same wording as today. */
export function expProblem(groups: ExpGroup[]): string {
  const withFiles = groups.filter((g) => g.files.length);
  if (!withFiles.length) return 'Add at least one photo or file.';
  for (const g of withFiles) {
    if (!g.job) return 'Choose which job each set of receipts is for.';
    if (g.job === 'manual' && !g.manual.trim()) return "Type the job name for the one that's not on the app.";
  }
  return '';
}

export function useRecentExpenses(org: Organization | null, fullManager: boolean) {
  const { me } = useAuth();
  const months = ((org as unknown as { expenses_retention_months?: number })?.expenses_retention_months) || 3;
  return useQuery({
    queryKey: ['expenses', me?.id, months],
    enabled: !!me,
    queryFn: () => cachedQuery(`expenses:${me?.id}`, async () => {
      const since = new Date(); since.setMonth(since.getMonth() - months);
      let q = db.from('expenses').select('*').gte('created_at', since.toISOString());
      if (!fullManager) q = q.eq('created_by', (me as Profile).id);
      return { rows: orThrow(await q.order('created_at', { ascending: false }).limit(200)) as ExpenseRow[], months };
    }),
  });
}

async function uploadFile(path: string, f: ExpFile): Promise<string | null> {
  const uri = f.isPdf || !f.picked ? f.uri : await compressOne(f.picked);
  const body = await (await fetch(uri)).arrayBuffer();
  const up = await supabase.storage.from('site-photos').upload(path, body, { contentType: f.isPdf ? 'application/pdf' : 'image/jpeg' });
  return up.error ? null : up.data.path;
}

export async function saveExpenses(me: Profile, groups: ExpGroup[], onProgress: (s: string) => void): Promise<{ batchId: string } | { error: string }> {
  const entries = groups.filter((g) => g.files.length);
  const batchId = rid();
  const total = entries.reduce((n, g) => n + g.files.length, 0);
  let done = 0;
  const rows: Record<string, unknown>[] = [];
  for (const g of entries) {
    const ok: { path: string; name: string }[] = [];
    for (const f of g.files) {
      const path = `expenses/${me.org_id}/${batchId}/${rid()}${f.isPdf ? '.pdf' : '.jpg'}`;
      const p = await uploadFile(path, f).catch(() => null);
      done++; onProgress(`Uploading ${done} of ${total}…`);
      if (p) ok.push({ path: p, name: f.name });
    }
    if (ok.length < g.files.length) return { error: 'Some files did not upload — check your connection and try again.' };
    const siteId = g.job.startsWith('site:') ? g.job.slice(5) : null;
    rows.push({
      batch_id: batchId, site_id: siteId, manual_label: siteId ? null : g.manual.trim() || null,
      category: g.job === 'fuel' ? 'fuel' : siteId ? 'materials' : 'other', note: g.note.trim() || null,
      file_paths: ok.map((x) => x.path), file_names: ok.map((x) => x.name),
    });
  }
  const r = await db.from('expenses').insert(rows as never);
  if (r.error) return { error: 'Could not save — please try again.' };
  return { batchId };
}

/** Emails the batch (or re-sends one entry). */
export async function sendExpenses(body: Record<string, unknown>): Promise<{ ok: boolean; emails?: number; to?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-expenses-email', { body });
    const out = (data || {}) as { ok?: boolean; emails?: number; files?: number; to?: string; error?: string };
    if (error || !out.ok) return { ok: false, error: out.error || error?.message || 'the server said no' };
    return { ok: true, emails: out.emails || out.files || 0, to: out.to };
  } catch {
    return { ok: false, error: 'check your connection.' };
  }
}

export async function deleteExpense(id: string): Promise<boolean> {
  return !(await db.from('expenses').delete().eq('id', id)).error;
}
