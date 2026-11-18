// Operative "Getting Started" checklist. Ported from computeOnboardingChecklist (210).
// From the day they sign up (Andy, 18 Nov 2026: "it needs to have a list of tasks to do on sign up, create signature etc"):
// their phone, signature, Subcontractor Form and certificates straight away; the job ones (H&S Policy, RAMS, COSHH,
// tools, Schedule of Works) once they're on a live job. Not for managers or clients.
import { useQuery } from '@tanstack/react-query';
import { mustHit } from '@/lib/mustHit';

import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { policySigValid } from '@/lib/rules/hs';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type OnboardItem = { key: string; label: string; desc: string; done: boolean; href: string };

export function useOnboarding(sites: Site[] | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['onboarding', me?.id, me?.phone, me?.signature_path, me?.viewed_schedule_at, (sites ?? []).length],
    enabled: !!me && !!sites && !isManager(me) && me.role !== 'client',
    queryFn: async () => {
      const p = me as Profile & { phone?: string | null; signature_path?: string | null; viewed_schedule_at?: string | null };
      const a = await db.from('site_assignments').select('site_id').eq('user_id', p.id);
      const mine = new Set(((a.data as { site_id: string }[] | null) ?? []).map((x) => x.site_id));
      const live = (sites ?? []).filter((s) => mine.has(s.id) && siteStatusKey(s) === 'live');
      const op = p.role === 'operative';
      // Their Subcontractor Form (unless switched off for them) and certificates: operatives, from day one.
      const [prof, sent, certs] = op ? await Promise.all([
        db.from('profiles').select('subform_required').eq('id', p.id).maybeSingle(),
        db.from('subcontractor_applications').select('id,status').eq('user_id', p.id).order('created_at', { ascending: false }).limit(1),
        db.from('operative_certifications').select('id').eq('operative_id', p.id).limit(1),
      ]) : [null, null, null];
      const formOff = (prof?.data as { subform_required?: boolean | null } | null)?.subform_required === false;
      const lastForm = ((sent?.data as { status?: string }[] | null) ?? [])[0];
      const first0: OnboardItem[] = [
        { key: 'phone', label: 'Add your phone number', desc: 'So the office, your PM and delivery drivers can reach you on site.', done: !!(p.phone && String(p.phone).trim()), href: '' },
        { key: 'signature', label: 'Create your signature', desc: "Draw your signature once — it's reused everywhere you need to sign (RAMS, COSHH, sign-offs) so you never have to redraw it.", done: !!p.signature_path, href: '' },
        ...(op && !formOff ? [{ key: 'subform', label: 'Fill in your Subcontractor Form', desc: lastForm?.status === 'rejected' ? 'Your form was sent back for more information — open it, see what’s needed, and send it again.' : 'Your company details, insurance and cards — the office needs this before you start.', done: !!lastForm && lastForm.status !== 'rejected', href: '/subform' }] : []),
        ...(op ? [{ key: 'certs', label: 'Upload your certificates', desc: 'Photos or scans of your CSCS card and any training certificates (asbestos awareness, working at height…). They go in your folder for the office.', done: ((certs?.data as unknown[] | null) ?? []).length > 0, href: '/dashboard' }] : []),
      ];
      if (!live.length) return { items: first0, allDone: first0.every((i) => i.done) };
      const first = live[0].id;
      const [pol, rams, coshh, tools] = await Promise.all([
        db.from('hs_policy_docs').select('id,uploaded_at,resign_cycle_start').eq('org_id', p.org_id as string).eq('status', 'current').order('uploaded_at', { ascending: false }).limit(1),
        db.from('rams_signatures').select('id').eq('user_id', p.id).limit(1),
        db.from('coshh_signatures').select('id').eq('user_id', p.id).limit(1),
        db.from('operative_tools').select('id').eq('user_id', p.id).limit(1),
      ]);
      const doc = ((pol.data as { id: string; uploaded_at: string; resign_cycle_start: string | null }[] | null) ?? [])[0] ?? null;
      let hsSigned = false;
      if (doc) {
        const s = await db.from('hs_policy_signatures').select('signed_at').eq('policy_id', doc.id).eq('user_id', p.id);
        hsSigned = ((s.data as { signed_at: string }[] | null) ?? []).some((x) => policySigValid(doc, x));
      }
      const n = (r: { data: unknown }) => ((r.data as unknown[] | null) ?? []).length > 0;
      const items: OnboardItem[] = [
        ...first0,
        { key: 'hspolicy', label: 'Sign the H&S Policy', desc: "Our company Health & Safety Policy — a one-off sign-off confirming you've read and understood it.", done: hsSigned, href: `/sites/${first}/hs/rams` },
        { key: 'rams', label: 'Sign RAMS', desc: 'Risk Assessment & Method Statements for your site — read through them and sign to confirm you understand the risks and how to work safely.', done: n(rams), href: `/sites/${first}/hs/rams` },
        { key: 'coshh', label: 'Sign COSHH', desc: 'Control of Substances Hazardous to Health — sign to confirm you understand any hazardous substances used on site.', done: n(coshh), href: `/sites/${first}/hs/coshh` },
        { key: 'tools', label: 'Upload your tool photos', desc: 'A quick photo record of your own tools on site, kept against your profile.', done: n(tools), href: `/sites/${first}/hs/mytools` },
        { key: 'schedule', label: 'Open and view the Schedule of Works', desc: "See the full list of tasks for your project, and what's still to do.", done: !!p.viewed_schedule_at, href: `/sites/${first}/schedule` },
      ];
      return { items, allDone: items.every((i) => i.done) };
    },
  });
}

export async function saveMyPhone(me: Profile, phone: string): Promise<string | null> {
  const r = await db.from('profiles').update({ phone: phone.trim() || null } as never).eq('id', me.id).select('id');
  return r.error || !r.data?.length ? 'Could not save — try again.' : null;
}
export async function savePhone(me: Profile, phone: string): Promise<string | null> {
  if (phone.replace(/[^0-9]/g, '').length < 10) return 'Enter a full phone number.';
  const r = mustHit(await db.from('profiles').update({ phone } as never).eq('id', me.id).select('id'));
  return r.error ? 'Could not save — try again.' : null;
}
