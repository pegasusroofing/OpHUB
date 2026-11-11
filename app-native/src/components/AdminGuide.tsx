// The set-up guide for a company's admin (Andy, 11 Nov 2026): a step-by-step list on the home page from their first login.
// Each step opens the place to do it; steps tick themselves when the app can tell they're done, and can be ticked by hand.
// It can be minimised to one line, or closed (Admin › Set-Up Guide brings it back). It goes once everything is ticked.
// What's ticked, minimised or closed is kept on the person's profile (with the How To notes), so it follows them.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { howtoDismissed } from '@/lib/howto';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { base, useTheme } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Step = { k: string; t: string; s: string; go: string; auto?: boolean };

/** Saves the guide's keys on the profile (beside the How To notes). */
async function setKeys(me: Profile, add: string[], remove: string[] = []) {
  const next = [...new Set([...howtoDismissed(me).filter((k) => !remove.includes(k)), ...add])];
  await supabase.from('profiles').update({ howto_dismissed: next } as never).eq('id', me.id);
}
export const reopenGuide = (me: Profile) => setKeys(me, [], ['guide:closed', 'guide:min']);

/** What the app can tell is already done. */
function useDone(me: Profile | null) {
  return useQuery({
    queryKey: ['adminGuide', me?.org_id], enabled: !!me?.org_id, staleTime: 60000,
    queryFn: async () => {
      const org = me?.org_id as string;
      const n = async (t: string, f: (q: ReturnType<ReturnType<typeof db.from>['select']>) => unknown) => {
        try { const r = (await f(db.from(t).select('id', { count: 'exact', head: true }) as never)) as { count: number | null }; return r.count ?? 0; } catch { return 0; }
      };
      const one = async (t: string, cols: string) => { try { return ((await db.from(t).select(cols).eq('org_id', org).maybeSingle()).data as Record<string, unknown> | null) ?? null; } catch { return null; } };
      const [people, sites, od, pack, hr, pol, qs, sup, orgRow] = await Promise.all([
        n('profiles', (q) => q.eq('org_id' as never, org as never)), n('sites', (q) => q.eq('org_id' as never, org as never)),
        n('onedrive_connections', (q) => q.eq('org_id' as never, org as never)), one('job_pack_settings', 'org_id'), one('hr_settings', 'approvers'),
        n('hr_policies', (q) => q.eq('org_id' as never, org as never)), one('quote_settings', 'open_path,cc_email'), n('suppliers', (q) => q.eq('org_id' as never, org as never)),
        db.from('organizations').select('logo_path').eq('id', org).maybeSingle(),
      ]);
      return {
        branding: !!(orgRow.data as { logo_path?: string | null } | null)?.logo_path, team: people > 1, onedrive: od > 0, folders: !!pack,
        holidays: !!((hr?.approvers as string[] | undefined)?.length), policies: pol > 0, quotes: !!qs?.open_path, suppliers: sup > 0, project: sites > 0,
      } as Record<string, boolean>;
    },
  });
}

export function AdminGuide() {
  const { me, org } = useAuth();
  const t = useTheme();
  const { data: done } = useDone(me);
  const [keys, setLocal] = useState<string[] | null>(null);
  if (!me || me.role !== 'admin') return null;
  const have = keys ?? howtoDismissed(me);
  if (have.includes('*') || have.includes('guide:closed')) return null;
  const pm = org?.has_pm !== false, fin = !!org?.has_finance;
  const steps: Step[] = [
    { k: 'branding', t: 'Add Your Logo And Colours', s: 'Shows on the app, PDFs and emails', go: '/pm/admin/branding' },
    { k: 'team', t: 'Invite Your Team', s: 'PMs, operatives, drivers and the office', go: '/pm/admin/invites' },
    { k: 'onedrive', t: 'Link OneDrive', s: 'So job folders and documents save themselves', go: '/pm/admin/onedrive' },
    ...(pm ? [
      { k: 'folders', t: 'Set Up New Job Folders', s: 'Your template folder for every new job', go: '/pm/admin/onedrive' },
      { k: 'holidays', t: 'Choose Who Approves Holidays', s: 'And everyone’s allowance', go: '/pm/hr/holidays' },
      { k: 'policies', t: 'Upload Company Policies', s: 'For everyone to read and sign', go: '/pm/hr/policies' },
      { k: 'templates', t: 'Set Up Report And Email Templates', s: 'Inspections, surveys and briefings', go: '/pm/admin/templates' },
      { k: 'hs', t: 'Fill The H&S Libraries', s: 'RAMS, COSHH and toolbox talks', go: '/pm/admin/ramslibrary' },
      { k: 'suppliers', t: 'Add Your Suppliers', s: 'For material orders', go: '/pm/admin/suppliers' },
      { k: 'quotes', t: 'Set Up Quotes', s: 'Tender folders, the chaser and copy-to', go: '/pm/quotes/settings' },
    ] : []),
    ...(fin ? [{ k: 'finance', t: 'Set Up Finance', s: 'Company details, bank, VAT and Xero', go: '/fin/settings' }] : []),
    ...(pm ? [{ k: 'project', t: 'Add Your First Project', s: 'Then assign the team to it', go: '/sites/new' }] : []),
  ];
  const isDone = (s: Step) => !!done?.[s.k] || have.includes(`guide:tick:${s.k}`);
  const n = steps.filter(isDone).length;
  if (n === steps.length) return null;
  const save = (add: string[], remove: string[] = []) => { const next = [...new Set([...have.filter((k) => !remove.includes(k)), ...add])]; setLocal(next); void setKeys(me, add, remove); };
  const min = have.includes('guide:min');
  const bar = (
    <View style={{ height: 6, backgroundColor: '#EEF0F2', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
      <View style={{ width: `${Math.round((n / steps.length) * 100)}%`, height: 6, backgroundColor: t.brand1 }} />
    </View>
  );
  return (
    <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={min ? 'Open the set-up guide' : 'Minimise the set-up guide'} onPress={() => save(min ? [] : ['guide:min'], min ? ['guide:min'] : [])} style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: base.ink }}>Set Up {org?.name || 'Your Company'} · {n} Of {steps.length} Done</Text>
          {min ? <Text style={{ fontSize: 12, color: base.slate }}>Tap to carry on</Text> : null}
          {bar}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={min ? 'Open' : 'Minimise'} hitSlop={8} onPress={() => save(min ? [] : ['guide:min'], min ? ['guide:min'] : [])}><Text style={{ fontSize: 16, color: base.slate }}>{min ? '▾' : '▴'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close the set-up guide" hitSlop={8} onPress={() => save(['guide:closed'])}><Text style={{ fontSize: 17, color: base.slate }}>✕</Text></Pressable>
      </View>
      {!min && (
        <View style={{ marginTop: 8 }}>
          {steps.map((s, i) => {
            const ok = isDone(s);
            return (
              <View key={s.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ok }} accessibilityLabel={`Tick: ${s.t}`} hitSlop={6} disabled={!!done?.[s.k]}
                  onPress={() => save(ok ? [] : [`guide:tick:${s.k}`], ok ? [`guide:tick:${s.k}`] : [])}
                  style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: ok ? base.ink : '#C9CDD3', backgroundColor: ok ? base.ink : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  {ok ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text> : <Text style={{ color: base.slate, fontSize: 11 }}>{i + 1}</Text>}
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={s.t} onPress={() => router.push(s.go as never)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '600', color: ok ? base.slate : base.ink, textDecorationLine: ok ? 'line-through' : 'none' }}>{s.t}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slate }}>{s.s}</Text>
                  </View>
                  <Text style={{ color: base.slate }}>›</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
