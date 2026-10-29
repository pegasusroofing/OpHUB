// Reports with no signal (435): while a report is open a copy (answers, any
// added items, and the photos' places on the phone) is kept on the phone, so
// closing the app or losing signal never loses it. "Save & Exit" or
// "Complete" that can't reach the server parks it as waiting to send, and it
// is sent on its own when there is signal — photos first, then the answers,
// then the completion. Kept under this person only; removed once sent.
import { AppState, Platform } from 'react-native';

import { completeReport, saveAnswers, uploadPhotos, type Sub } from '@/data/reports';
import { plainGet, plainSet } from '@/lib/kv';
import type { Answers, ReportSection } from '@/lib/rules/reports';
import type { Profile } from '@/lib/types';

export type Parked = { sub: Sub; siteId: string; answers: Answers; sections: ReportSection[]; extra: boolean; editingCompleted: boolean; action: 'keep' | 'save' | 'complete'; at: string };
const key = (uid: string) => `ophub_report_drafts_${uid}`;

export const parkedAll = (uid: string) => plainGet<Record<string, Parked>>(key(uid), {});
export async function parkedFor(uid: string, subId: string): Promise<Parked | null> { return (await parkedAll(uid))[subId] ?? null; }
export async function park(uid: string, p: Parked) { const all = await parkedAll(uid); all[p.sub.id] = p; await plainSet(key(uid), all); }
export async function unpark(uid: string, subId: string) { const all = await parkedAll(uid); if (!all[subId]) return; delete all[subId]; await plainSet(key(uid), all); }
/** How many are waiting to send (not just kept while open). */
export async function parkedWaiting(uid: string) { return Object.values(await parkedAll(uid)).filter((p) => p.action !== 'keep').length; }

let busy = false;
/** Sends everything waiting. Returns how many went. */
export async function sendParked(me: Profile & { signature_path?: string | null }): Promise<number> {
  if (busy) return 0;
  busy = true; let sent = 0;
  try {
    for (const p of Object.values(await parkedAll(me.id))) {
      if (p.action === 'keep') continue;
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
