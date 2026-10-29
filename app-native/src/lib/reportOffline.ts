// Reports with no signal (435): while a report is open a copy (answers, any
// added items, and the photos' places on the phone) is kept on the phone, so
// closing the app or losing signal never loses it. "Save & Exit" or
// "Complete" that can't reach the server parks it as waiting to send, and it
// is sent on its own when there is signal — photos first, then the answers,
// then the completion. Kept under this person only; removed once sent.
// A report started with no signal is made on the phone too: its row is created on the server first,
// as soon as there is signal, and then its answers follow.
import { AppState, Platform } from 'react-native';

import { completeReport, saveAnswers, uploadPhotos, type Sub } from '@/data/reports';
import { plainGet, plainSet } from '@/lib/kv';
import { supabase } from '@/lib/supabase';
import type { Answers, ReportSection } from '@/lib/rules/reports';
import type { Profile } from '@/lib/types';

export type Parked = { sub: Sub; siteId: string; answers: Answers; sections: ReportSection[]; extra: boolean; editingCompleted: boolean; action: 'keep' | 'save' | 'complete'; at: string };
const key = (uid: string) => `ophub_report_drafts_${uid}`;

export const parkedAll = (uid: string) => plainGet<Record<string, Parked>>(key(uid), {});
export async function parkedFor(uid: string, subId: string): Promise<Parked | null> { return (await parkedAll(uid))[subId] ?? null; }
export async function park(uid: string, p: Parked) { const all = await parkedAll(uid); all[p.sub.id] = { ...p, answers: await keepable(p.answers) }; await plainSet(key(uid), all); }

// On the office laptop a new photo is a blob: link that dies when the page is
// reloaded, so the kept copy holds the photo itself (a data: link) instead.
const blobCache = new Map<string, string>();
async function keepable(a: Answers): Promise<Answers> {
  if (Platform.OS !== 'web') return a;
  const out: Answers = {};
  for (const [k, v] of Object.entries(a)) {
    if (!Array.isArray(v) || !v.some((x) => typeof x === 'string' && x.startsWith('blob:'))) { out[k] = v; continue; }
    out[k] = await Promise.all(v.map(async (x) => {
      if (typeof x !== 'string' || !x.startsWith('blob:')) return x;
      if (blobCache.has(x)) return blobCache.get(x) as string;
      try {
        const blob = await (await fetch(x)).blob();
        const d = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(blob); });
        blobCache.set(x, d); return d;
      } catch { return x; }
    }));
  }
  return out;
}
// Reports started with no signal, waiting to be created on the server (keyed by their id).
const NEW_KEY = 'ophub_report_new';
export const newReportsAll = () => plainGet<Record<string, Record<string, unknown>>>(NEW_KEY, {});
export async function keepNewReport(row: Record<string, unknown>) { const all = await newReportsAll(); all[String(row.id)] = row; await plainSet(NEW_KEY, all); }
export async function newReportRow(id: string) { return (await newReportsAll())[id] ?? null; }
/** Makes sure a report started with no signal exists on the server before its answers are saved. */
export async function ensureCreated(id: string): Promise<boolean> { if (!(await newReportRow(id))) return true; return !(await createNewReports(id)).has(id); }
async function createNewReports(only?: string): Promise<Set<string>> {
  const all = await newReportsAll(), still = new Set<string>();
  for (const [id, row] of Object.entries(all)) {
    if (only && id !== only) continue;
    try {
      const r = await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from('report_submissions').insert(row as never);
      // Already there (sent before the phone heard back) counts as done.
      if (r.error && !/duplicate|already exists|23505/i.test(`${r.error.message} ${(r.error as { code?: string }).code || ''}`)) { still.add(id); continue; }
      delete all[id];
    } catch { still.add(id); }
  }
  await plainSet(NEW_KEY, all);
  return still;
}
export async function unpark(uid: string, subId: string) { const all = await parkedAll(uid); if (!all[subId]) return; delete all[subId]; await plainSet(key(uid), all); }
/** How many are waiting to send (not just kept while open). */
export async function parkedWaiting(uid: string) { const n = Object.keys(await newReportsAll()).length; return Math.max(n, Object.values(await parkedAll(uid)).filter((p) => p.action !== 'keep').length); }

let busy = false;
/** Sends everything waiting. Returns how many went. */
export async function sendParked(me: Profile & { signature_path?: string | null }): Promise<number> {
  if (busy) return 0;
  busy = true; let sent = 0;
  try {
    const notYet = await createNewReports();
    for (const p of Object.values(await parkedAll(me.id))) {
      if (p.action === 'keep' || notYet.has(p.sub.id)) continue;
      try {
        const up = await uploadPhotos(p.siteId, p.answers);
        if (up.failed) { await park(me.id, { ...p, answers: p.answers }); continue; }
        const ok = p.action === 'complete'
          ? await completeReport(me, p.sub, p.answers, p.sections, p.editingCompleted, p.extra)
          : await saveAnswers(p.sub.id, p.answers, p.extra ? p.sections : undefined);
        if (ok) { await unpark(me.id, p.sub.id); sent++; } else await park(me.id, p);
      } catch { /* still no signal — try again later */ }
    }
  } finally { busy = false; }
  return sent;
}

let started = false, who: Profile | null = null;
/** Tries again when the app comes to the front, when the laptop is back online, and every 2 minutes. */
export function startReportSync(me: Profile, onSent?: (n: number) => void) {
  who = me;
  if (started) return;
  started = true;
  const go = () => { if (who) void sendParked(who).then((n) => { if (n) onSent?.(n); }); };
  AppState.addEventListener('change', (s) => { if (s === 'active') go(); });
  if (Platform.OS === 'web') globalThis.addEventListener?.('online', go);
  setInterval(go, 120000);
  go();
}
