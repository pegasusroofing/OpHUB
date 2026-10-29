// Admin Centre › RAMS Library (588): the hazards, safe systems of work, method
// statements and templates the RAMS Builder picks from, plus the company details
// printed on every RAMS. Changing the library never changes a job's RAMS.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { lines, moveLib, P_LABELS, RAMS_DEFAULT_PPE, RAMS_PPE, ramsSettings, renameInTemplate, riskBand, rr, S_LABELS, type LibItem, type RamsSettings } from '@/lib/rules/rams';
import { starterRows } from '@/lib/rules/ramsStarter';
import { isFullManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = supabase.rpc as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
type Tab = 'hazard' | 'section' | 'template' | 'company';
const Badge = ({ p, s }: { p: unknown; s: unknown }) => { const n = rr(p, s), b = riskBand(n); return <Text style={{ backgroundColor: b.bg, color: b.fg, fontWeight: '800', paddingHorizontal: 7, borderRadius: 6, overflow: 'hidden' }}>{n}</Text>; };

function Editor({ it, lib, onSave, onCancel }: { it: LibItem; lib: LibItem[]; onSave: (title: string, data: Record<string, unknown>) => void; onCancel: () => void }) {
  const d = (it.data || {}) as Record<string, unknown>;
  const [title, setTitle] = useState(it.title);
  const [harm, setHarm] = useState(String(d.harm || ''));
  const [ps, setPs] = useState({ p: Number(d.p) || 1, s: Number(d.s) || 1, rp: Number(d.rp) || 1, rs: Number(d.rs) || 1 });
  const [list, setList] = useState(((it.kind === 'hazard' ? d.controls : d.steps) as string[] | undefined || []).join('\n'));
  const [part, setPart] = useState(d.part === 'method' ? 'method' : 'general');
  const [body, setBody] = useState(String(d.body || ''));
  const name = (x: unknown) => (typeof x === 'string' ? x : ((x as { title?: string }) || {}).title || '');
  const [hz, setHz] = useState<unknown[]>((d.hazards as unknown[]) || []);
  const [sc, setSc] = useState<unknown[]>((d.sections as unknown[]) || []);
  const [ppe, setPpe] = useState<string[]>((d.ppe as string[]) || []);
  const pick = async (key: 'p' | 's' | 'rp' | 'rs') => {
    const labels = key === 'p' || key === 'rp' ? P_LABELS : S_LABELS;
    const k = await chooseAction(key.endsWith('p') ? 'Likelihood' : 'Severity', [1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: `${n} — ${labels[n]}` })));
    if (k) setPs({ ...ps, [key]: Number(k) });
  };
  const toggle = (arr: unknown[], set: (v: unknown[]) => void, t: string) => set(arr.some((x) => name(x) === t) ? arr.filter((x) => name(x) !== t) : [...arr, t]);
  return (
    <Card style={{ borderColor: base.ink }}>
      <Muted style={{ fontWeight: '700' }}>{it.kind === 'hazard' ? 'Hazard' : it.kind === 'section' ? 'Heading' : 'Template name'}</Muted>
      <TextInput value={title} onChangeText={setTitle} style={box} />
      {it.kind === 'hazard' && (
        <>
          <Muted style={{ fontWeight: '700' }}>Harm</Muted>
          <TextInput value={harm} onChangeText={setHarm} style={box} />
          {[['Before controls', 'p', 's'], ['Residual', 'rp', 'rs']].map(([l, a, b]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text style={{ width: 110, color: base.ink, fontWeight: '700' }}>{l}</Text>
              <Pressable onPress={() => void pick(a as 'p')} style={[box, { marginBottom: 0 }]}><Text style={{ color: base.ink }}>P {ps[a as 'p']}</Text></Pressable>
              <Pressable onPress={() => void pick(b as 's')} style={[box, { marginBottom: 0 }]}><Text style={{ color: base.ink }}>S {ps[b as 's']}</Text></Pressable>
              <Badge p={ps[a as 'p']} s={ps[b as 's']} />
            </View>
          ))}
          <Muted style={{ fontWeight: '700' }}>Control procedures — one per line</Muted>
          <TextInput value={list} onChangeText={setList} multiline style={[box, { minHeight: 140 }]} />
        </>
      )}
      {it.kind === 'section' && (
        <>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
            {[['general', 'Safe system of work'], ['method', 'Method statement (step by step)']].map(([k, l]) => (
              <Pressable key={k} onPress={() => setPart(k)} style={{ flex: 1, padding: 8, borderRadius: radius.input, borderWidth: 1, borderColor: part === k ? base.ink : base.line, backgroundColor: part === k ? base.ink : base.card }}><Text style={{ textAlign: 'center', color: part === k ? '#fff' : base.ink, fontWeight: '700', fontSize: 12 }}>{l}</Text></Pressable>
            ))}
          </View>
          <Muted style={{ fontWeight: '700' }}>Text</Muted>
          <TextInput value={body} onChangeText={setBody} multiline style={[box, { minHeight: 90 }]} />
          <Muted style={{ fontWeight: '700' }}>Numbered steps — one per line</Muted>
          <TextInput value={list} onChangeText={setList} multiline style={[box, { minHeight: 110 }]} />
        </>
      )}
      {it.kind === 'template' && (
        <>
          {[['Hazards (Risk Assessment)', lib.filter((x) => x.kind === 'hazard'), hz, setHz, 'hazards'], ['Safe Systems of Work', lib.filter((x) => x.kind === 'section' && (x.data || {}).part !== 'method'), sc, setSc, 'sections'], ['Method Statements', lib.filter((x) => x.kind === 'section' && (x.data || {}).part === 'method'), sc, setSc, 'sections']].map(([l, opts, arr, set]) => {
            const o = opts as LibItem[], a = arr as unknown[], st = set as (v: unknown[]) => void;
            const custom = a.filter((x) => typeof x !== 'string' && (l === 'Hazards (Risk Assessment)' || (((x as { part?: string }).part === 'method') === (l === 'Method Statements'))));
            return (
              <View key={l as string} style={{ marginBottom: 10 }}>
                <Text style={{ fontWeight: '800', color: base.ink }}>{l as string} ({o.filter((x) => a.some((y) => name(y) === x.title)).length + custom.length} ticked)</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginVertical: 4 }}>
                  <Pressable onPress={() => st([...a.filter((y) => !o.some((x) => x.title === name(y))), ...o.map((x) => x.title)])}><Text style={{ color: base.blue }}>Tick all</Text></Pressable>
                  <Pressable onPress={() => st(a.filter((y) => !o.some((x) => x.title === name(y))))}><Text style={{ color: base.blue }}>Untick all</Text></Pressable>
                </View>
                {o.length ? o.map((x) => <Check key={x.id} label={x.title} value={a.some((y) => name(y) === x.title)} onChange={() => toggle(a, st, x.title)} />) : <Muted>None in the library yet.</Muted>}
                {custom.map((x, i) => <Muted key={i}>☑ {name(x)} (saved from a job)</Muted>)}
              </View>
            );
          })}
          <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 4 }}>Required PPE</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {RAMS_PPE.map((p) => (
              <Pressable key={p.key} onPress={() => setPpe(ppe.includes(p.key) ? ppe.filter((x) => x !== p.key) : [...ppe, p.key])} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: ppe.includes(p.key) ? base.ink : base.line, backgroundColor: ppe.includes(p.key) ? base.ink : base.card }}>
                <Text style={{ fontSize: 12, color: ppe.includes(p.key) ? '#fff' : base.ink }}>{p.icon} {p.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 2 }}><Button title={it.kind === 'template' ? 'Save template' : 'Save'} onPress={() => onSave(title.trim() || it.title,
          it.kind === 'hazard' ? { harm, ...ps, controls: lines(list) } : it.kind === 'section' ? { part, body, steps: lines(list) } : { ...d, hazards: hz, sections: sc, ppe })} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={onCancel} /></View>
      </View>
    </Card>
  );
}

function CompanyDetails({ me, orgName }: { me: { org_id: string | null }; orgName: string }) {
  const toast = useToast();
  const { data } = useQuery({ queryKey: ['ramsSettings', me.org_id], queryFn: async () => (((await db.from('organizations').select('rams_settings').eq('id', me.org_id as string).maybeSingle()).data as { rams_settings: Partial<RamsSettings> | null } | null)?.rams_settings) ?? null });
  if (data === undefined) return <Muted>Loading…</Muted>;
  return <CompanyForm me={me} data={data} orgName={orgName} toast={toast} />;
}

function CompanyForm({ me, data, orgName, toast }: { me: { org_id: string | null }; data: Partial<RamsSettings> | null; orgName: string; toast: (m: string) => void }) {
  const [st, setSt] = useState<RamsSettings>(() => ramsSettings(data, orgName));
  return (
    <View>
      <Muted style={{ marginBottom: 8 }}>Printed at the top of every Risk Assessment and Method Statement made in the RAMS Builder.</Muted>
      <Muted style={{ fontWeight: '700' }}>Address (one line per row)</Muted>
      <TextInput value={st.address} onChangeText={(v) => setSt({ ...st, address: v })} multiline style={[box, { minHeight: 80 }]} />
      <Muted style={{ fontWeight: '700' }}>Telephone</Muted>
      <TextInput value={st.phone} onChangeText={(v) => setSt({ ...st, phone: v })} keyboardType="phone-pad" style={box} />
      <Muted style={{ fontWeight: '700' }}>Data protection statement</Muted>
      <TextInput value={st.dataProtection} onChangeText={(v) => setSt({ ...st, dataProtection: v })} multiline style={[box, { minHeight: 120 }]} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Muted style={{ fontWeight: '700' }}>Next RA number</Muted><TextInput value={String(st.nextRa)} onChangeText={(v) => setSt({ ...st, nextRa: Number(v) || 0 })} keyboardType="number-pad" style={box} /></View>
        <View style={{ flex: 1 }}><Muted style={{ fontWeight: '700' }}>Next MS number</Muted><TextInput value={String(st.nextMs)} onChangeText={(v) => setSt({ ...st, nextMs: Number(v) || 0 })} keyboardType="number-pad" style={box} /></View>
      </View>
      <Button title="Save company details" onPress={async () => {
        const next = { ...(data || {}), address: st.address, phone: st.phone, dataProtection: st.dataProtection, ...(st.nextRa > 0 ? { nextRa: Math.floor(st.nextRa) } : {}), ...(st.nextMs > 0 ? { nextMs: Math.floor(st.nextMs) } : {}) };
        toast((await db.from('organizations').update({ rams_settings: next } as never).eq('id', me.org_id as string)).error ? 'Could not save — admins only' : 'Saved');
      }} />
    </View>
  );
}

export default function RamsLibrary() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('hazard');
  const [part, setPart] = useState<'general' | 'method'>('general');
  const [editId, setEditId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'order' | 'az' | 'used'>('order');
  const { data: lib = [], isLoading } = useQuery({ queryKey: ['ramsLib', me?.org_id], enabled: !!me, queryFn: async () => ((await db.from('rams_library_items').select('*').eq('org_id', me?.org_id as string).order('sort_order').order('title')).data as LibItem[] | null) ?? [] });
  const { data: usage = [] } = useQuery({ queryKey: ['ramsLibUsage'], enabled: sort === 'used', queryFn: async () => ((await rpc('rams_library_usage', {})).data as { kind: string; lib_id: string | null; title: string; n: number }[] | null) ?? [] });
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['ramsLib'] }); };
  const countUses = (it: LibItem) => {
    const t = it.title.trim().toLowerCase(); let jobs = 0, tpls = 0;
    usage.forEach((r) => { if (r.kind === it.kind && (r.lib_id ? r.lib_id === it.id : r.title === t)) jobs += +r.n; else if (r.kind === `tpl-${it.kind}` && r.title === t) tpls += +r.n; });
    return { jobs, tpls };
  };
  const ofTab = tab === 'company' ? [] : lib.filter((i) => i.kind === tab && (tab !== 'section' || (((i.data || {}).part === 'method') === (part === 'method'))));
  const sortBy = tab === 'template' && sort === 'used' ? 'order' : sort;
  const items = sortBy === 'az' ? ofTab.slice().sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }))
    : sortBy === 'used' ? ofTab.slice().sort((a, b) => (countUses(b).jobs - countUses(a).jobs) || (countUses(b).tpls - countUses(a).tpls) || a.title.localeCompare(b.title)) : ofTab;
  const shown = items.filter((i) => !q.trim() || i.title.toLowerCase().includes(q.trim().toLowerCase()));
  const save = async (it: LibItem, title: string, data: Record<string, unknown>) => {
    if ((await db.from('rams_library_items').update({ title, data, updated_at: new Date().toISOString() } as never).eq('id', it.id)).error) { toast('Could not save — try again.'); return; }
    let changed = 0, failed = 0;
    if (title !== it.title && (it.kind === 'hazard' || it.kind === 'section')) {
      for (const tp of lib.filter((x) => x.kind === 'template')) {
        const d2 = renameInTemplate(tp.data || {}, it.kind === 'hazard' ? 'hazards' : 'sections', it.title, title);
        if (!d2) continue;
        if ((await db.from('rams_library_items').update({ data: d2, updated_at: new Date().toISOString() } as never).eq('id', tp.id)).error) failed++; else changed++;
      }
    }
    setEditId(null); refresh();
    if (failed) showAlert(`Saved, but ${failed} template${failed > 1 ? 's' : ''} still use${failed > 1 ? '' : 's'} the old name "${it.title}" and could not be updated. Open ${failed > 1 ? 'those templates' : 'that template'} and tick "${title}" again.`);
    else toast(changed ? `Saved — ${changed} template${changed > 1 ? 's' : ''} updated with the new name` : 'Saved');
  };
  const addNew = async () => {
    const kind = tab as LibItem['kind'];
    const data = kind === 'hazard' ? { harm: '', p: 3, s: 3, rp: 1, rs: 3, controls: [] } : kind === 'template' ? { hazards: [], sections: [], ppe: RAMS_DEFAULT_PPE.slice(), groups: ['Client Staff', 'Employees', 'Members of Public'] } : { part, body: '', steps: [] };
    const title = kind === 'hazard' ? 'New hazard' : kind === 'template' ? 'New template' : part === 'method' ? 'New method statement' : 'New safe system of work';
    const r = await db.from('rams_library_items').insert({ org_id: me.org_id, kind, title, data, sort_order: 999, created_by: me.id } as never).select('id').single();
    if (r.data) { setEditId((r.data as { id: string }).id); setQ(''); refresh(); } else toast('Could not add — try again.');
  };
  const menu = async (it: LibItem) => {
    const k = await chooseAction(it.title, [{ key: 'edit', label: '✎ Edit' }, { key: 'copy', label: '⧉ Copy' }, { key: 'del', label: '🗑 Delete', danger: true }]);
    if (k === 'edit') setEditId(it.id);
    else if (k === 'copy') {
      const n = await promptText('Name for the copy', `${it.title} (copy)`); if (!n || !n.trim()) return;
      const r = await db.from('rams_library_items').insert({ org_id: me.org_id, kind: it.kind, title: n.trim(), data: JSON.parse(JSON.stringify(it.data || {})), sort_order: (it.sort_order || 0) + 1, created_by: me.id } as never).select('id').single();
      if (r.data) { setEditId((r.data as { id: string }).id); toast('Copied'); refresh(); }
    } else if (k === 'del') {
      if (!(await confirmAsk(`Delete "${it.title}" from the library?\n\nRAMS already written for jobs keep their own copy.`, 'Delete'))) return;
      await db.from('rams_library_items').delete().eq('id', it.id); refresh();
    }
  };
  const move = async (it: LibItem, dir: -1 | 1) => {
    let all = lib.filter((i) => i.kind === tab);
    if (tab === 'section') { const pt = (i: LibItem) => ((i.data || {}).part === 'method' ? 1 : 0); all = all.filter((i) => !pt(i)).concat(all.filter((i) => pt(i))); }
    const next = moveLib(all, it.id, dir); if (!next) return;
    await Promise.all(next.map((x, k) => (x.sort_order === k ? null : db.from('rams_library_items').update({ sort_order: k } as never).eq('id', x.id))));
    refresh();
  };
  const chip = (on: boolean, l: string, onPress: () => void) => <Pressable onPress={onPress} style={{ flexBasis: '48%', flexGrow: 1, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}><Text style={{ textAlign: 'center', fontWeight: '700', fontSize: 12, color: on ? '#fff' : base.ink }}>{l}</Text></Pressable>;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'RAMS Library' }} />
      <Muted style={{ marginBottom: 10 }}>The hazards, safe systems of work and templates your team picks from in the RAMS Builder. Changing the library doesn&apos;t change RAMS already written for a job.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {([['hazard', 'Hazards'], ['section', 'Safe Systems of Work & Method Statements'], ['template', 'Templates'], ['company', 'Company Details']] as [Tab, string][]).map(([k, l]) => chip(tab === k, l, () => { setTab(k); setEditId(null); }))}
      </View>
      {tab === 'company' ? <CompanyDetails me={me} orgName={org?.name || ''} /> : (
        <>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
            <TextInput value={q} onChangeText={setQ} placeholder="Search…" style={[box, { flex: 1, marginBottom: 0 }]} />
            <Pressable onPress={async () => { const k = await chooseAction('Sort by', [{ key: 'order', label: 'Your order' }, { key: 'az', label: 'A–Z' }, ...(tab !== 'template' ? [{ key: 'used', label: 'Most used' }] : [])]); if (k) setSort(k as 'order'); }} style={[box, { marginBottom: 0, justifyContent: 'center' }]}><Text style={{ color: base.ink }}>⇅ {sortBy === 'az' ? 'A–Z' : sortBy === 'used' ? 'Most used' : 'Your order'}</Text></Pressable>
          </View>
          {tab === 'section' && <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>{chip(part === 'general', 'Safe Systems of Work', () => { setPart('general'); setEditId(null); })}{chip(part === 'method', 'Method Statements', () => { setPart('method'); setEditId(null); })}</View>}
          {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((it, i) => {
            if (editId === it.id) return <Editor key={it.id} it={it} lib={lib} onSave={(t, d) => void save(it, t, d)} onCancel={() => setEditId(null)} />;
            const d = (it.data || {}) as Record<string, unknown>, u = sortBy === 'used' ? countUses(it) : null;
            const sub = it.kind === 'hazard' ? `${d.harm || ''} · ${((d.controls as string[]) || []).length} controls` : it.kind === 'section' ? (((d.steps as string[]) || []).length ? `${((d.steps as string[]) || []).length} steps` : 'Text') : `${((d.hazards as unknown[]) || []).length} hazards · ${((d.sections as unknown[]) || []).length} sections`;
            return (
              <Card key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: '800', color: base.slate, width: 22 }}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{it.title}</Text>
                  <Muted>{sub}{u ? ` · used in ${u.jobs} RAMS${u.tpls ? ` · ${u.tpls} template${u.tpls === 1 ? '' : 's'}` : ''}` : ''}</Muted>
                  {it.kind === 'hazard' && <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 4 }}><Badge p={d.p} s={d.s} /><Text>→</Text><Badge p={d.rp} s={d.rs} /></View>}
                </View>
                {sortBy === 'order' && !q.trim() && (
                  <View style={{ gap: 4 }}>
                    <Pressable disabled={i === 0} onPress={() => void move(it, -1)} style={{ opacity: i === 0 ? 0.3 : 1 }}><Text>↑</Text></Pressable>
                    <Pressable disabled={i === shown.length - 1} onPress={() => void move(it, 1)} style={{ opacity: i === shown.length - 1 ? 0.3 : 1 }}><Text>↓</Text></Pressable>
                  </View>
                )}
                <Pressable hitSlop={8} onPress={() => void menu(it)}><Text style={{ fontSize: 18, color: base.slate }}>⋯</Text></Pressable>
              </Card>
            );
          }) : <Empty>{ofTab.length ? 'Nothing matches.' : lib.length ? 'Nothing here yet.' : 'Your library is empty. The starter library adds RTB’s hazards, safe systems of work, method statements and a pitched-roof template, ready to edit.'}</Empty>}
          {!lib.length && <Button kind="ghost" title="📚 Load the starter library" onPress={async () => {
            const r = await supabase.from('rams_library_items').insert(starterRows().map((x) => ({ ...x, org_id: me.org_id, created_by: me.id })) as never);
            toast(r.error ? 'Could not load it — try again.' : 'Starter library loaded'); refresh();
          }} />}
          <Button title={`+ New ${tab === 'template' ? 'template' : tab === 'hazard' ? 'hazard' : part === 'method' ? 'method statement' : 'safe system of work'}`} onPress={() => void addNew()} />
        </>
      )}
      <SectionTitle> </SectionTitle>
    </ScrollView>
  );
}
