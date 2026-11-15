// HR › Employee Records (Andy, 14 Nov 2026): the HR team sees everyone's folder, with what needs sorting (documents
// missing, expiring or due, appraisals overdue), and opens HR Access (who's on the HR team, what line managers see,
// appraisals, OneDrive). Until a company chooses an HR team, its company admins are it (15 Nov 2026). Anyone else sees
// their own folder and those of the people they line-manage.
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Card, Empty, Muted } from '@/components/ui';
import { useHrAccess, useHrOverview, useMyReports, useStaff } from '@/data/hrRecords';
import { useAuth } from '@/lib/auth';
import { employmentLabel, itemState, itemsFor, nextAppraisal } from '@/lib/rules/hrRecords';
import { base, page, radius, useTheme } from '@/theme/theme';

const ROLE: Record<string, string> = { admin: 'Admin', pm: 'Project Manager', site_manager: 'Site Manager', operative: 'Operative', driver: 'Driver' };

export default function EmployeeRecords() {
  const { me } = useAuth();
  const t = useTheme();
  const [q, setQ] = useState('');
  const { data: staff = [], isLoading } = useStaff();
  const { data: acc } = useHrAccess(me?.org_id);
  const team = !!acc?.team;
  const { data: ov } = useHrOverview(me?.org_id, team);
  const { data: reports = [] } = useMyReports(!!acc && !team);
  if (!me) return null;
  const months = acc?.appraisal_months ?? 12;
  const recOf = (id: string) => ov?.recs.find((r) => r.user_id === id) ?? null;
  // The HR team: everyone. Others: themselves, and the people they line-manage.
  const mine = staff.filter((p) => team || p.id === me.id || reports.some((r) => r.user_id === p.id));
  const shown = mine.filter((p) => !q.trim() || `${p.name} ${recOf(p.id)?.job_title || ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const today = new Date().toISOString().slice(0, 10);
  const status = (id: string, role: string) => {
    if (!team) return { toSort: 0, expired: 0, apprOver: false };
    const rec = recOf(id), docs = (ov?.docs ?? []).filter((d) => d.user_id === id);
    if (rec?.end_date && rec.end_date <= today) return { toSort: 0, expired: 0, apprOver: false };
    const st = itemsFor(rec, role).map((i) => itemState(i, docs, today, rec).state);
    const appr = nextAppraisal(rec, (ov?.apps ?? []).filter((a) => a.user_id === id), months, today);
    return { toSort: st.filter((s) => s !== 'ok').length, expired: st.filter((s) => s === 'expired').length, apprOver: !!appr?.overdue };
  };
  const chip = (txt: string, bg: string, fg: string) => <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><Text style={{ fontSize: 11.5, fontWeight: '600', color: fg }}>{txt}</Text></View>;
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Employee Records' }} />
      {(team || me.role === 'admin') && (
        <Pressable accessibilityRole="button" accessibilityLabel="HR Access" onPress={() => router.push('/pm/hr/access' as never)}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 20 }}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink }}>HR Access</Text>
              <Muted>{acc?.team_set ? 'Only the people chosen see everyone’s folders.' : 'Every company admin sees everyone’s folders.'} Who sees whose folder, the HR folder in OneDrive, appraisals.</Muted>
            </View>
            <Text style={{ color: base.slate, fontSize: 18 }}>›</Text>
          </Card>
        </Pressable>
      )}
      {mine.length > 6 && <TextInput value={q} onChangeText={setQ} placeholder="Search people…" style={{ borderWidth: 1.5, borderColor: base.line, borderRadius: radius.input, padding: 12, color: base.ink, backgroundColor: base.card, marginBottom: 10 }} />}
      {isLoading || !acc ? <Muted>Loading…</Muted> : shown.length ? shown.map((p) => {
        const s = status(p.id, p.role);
        const rec = recOf(p.id);
        const jt = rec?.job_title || reports.find((r) => r.user_id === p.id)?.job_title;
        return (
          <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.name} onPress={() => router.push(`/pm/hr/records/${p.id}` as never)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 10, backgroundColor: base.card }}>
            <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: t.brand1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontWeight: '700', color: t.brand1Text }}>{(p.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: base.ink }}>{p.name}{p.id === me.id ? ' (You)' : ''}</Text>
              <Muted>{[jt || ROLE[p.role] || p.role, rec?.employment_type ? employmentLabel(rec.employment_type) : '', !team && p.id !== me.id ? 'You Can See' : ''].filter(Boolean).join(' · ')}</Muted>
            </View>
            {s.expired > 0 && chip(`${s.expired} Expired`, '#FDECEA', '#C0392B')}
            {s.toSort - s.expired > 0 && chip(`${s.toSort - s.expired} To Sort`, '#FFF4DE', '#B45309')}
            {s.apprOver && chip('Appraisal Due', '#F1F2F4', '#5B6470')}
            <Text style={{ color: base.slate, fontSize: 18 }}>›</Text>
          </Pressable>
        );
      }) : <Empty>No one found.</Empty>}
    </ScrollView>
  );
}
