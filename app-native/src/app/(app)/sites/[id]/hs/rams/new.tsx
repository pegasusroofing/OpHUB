// Create RAMS (586 renderRamsNew): name it, then start blank, from one or more
// templates, and / or by copying other jobs' RAMS. PMs and admins only.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Muted, SectionTitle } from '@/components/ui';
import { createBuild, useLibrary, useOrgBuilds } from '@/data/ramsBuilder';
import { useSite, useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isFullManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };

export default function RamsNew() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const { data: site } = useSite(id);
  const { data: sites = [] } = useSites();
  const { data: lib = [] } = useLibrary(me?.org_id);
  const { data: builds = [] } = useOrgBuilds(me?.org_id);
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState<string | null>(null);
  const [tpls, setTpls] = useState<string[]>([]);
  const [copySite, setCopySite] = useState<string | null>(null);
  const [copies, setCopies] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  const name = title ?? `${site ? `${site.name} — ` : ''}Roof Renewal`;
  const templates = lib.filter((i) => i.kind === 'template');
  const siteName = (sid: string) => sites.find((s) => s.id === sid)?.name || 'Another job';
  const bySite: Record<string, typeof builds> = {};
  builds.forEach((b) => { (bySite[b.site_id] = bySite[b.site_id] || []).push(b); });
  const copySites = Object.keys(bySite).map((sid) => ({ id: sid, name: siteName(sid), n: bySite[sid].length })).sort((x, y) => x.name.localeCompare(y.name));
  const tick = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Create RAMS' }} />
      <Card style={{ backgroundColor: '#E7EEF9', borderColor: '#C9D7EE' }}><Text style={{ color: '#1F3B66' }}>🦺 Builds a <Text style={{ fontWeight: '800' }}>Risk Assessment</Text> and a <Text style={{ fontWeight: '800' }}>Method Statement</Text> as two separate documents for this job. Everything stays editable until you issue it.</Text></Card>
      <Muted style={{ fontWeight: '700' }}>RAMS name</Muted>
      <TextInput value={name} onChangeText={setTitle} style={box} />
      <SectionTitle>Start from — tick one or more</SectionTitle>
      <Card>
        {templates.length > 1 && <Check label="Select all templates" value={tpls.length === templates.length} onChange={(v) => setTpls(v ? templates.map((t) => t.id) : [])} />}
        {templates.map((t) => <Check key={t.id} label={`📋 ${t.title} · ${((t.data || {}).hazards as unknown[] || []).length} hazards · ${((t.data || {}).sections as unknown[] || []).length} sections`} value={tpls.includes(t.id)} onChange={() => tick(tpls, setTpls, t.id)} />)}
        <Muted style={{ marginTop: 6 }}>Tick nothing to start blank and add hazards and sections yourself from the library. Ticking several combines them — anything in more than one is only added once.</Muted>
        {!templates.length && <Muted style={{ marginTop: 6 }}>No templates yet — {lib.length ? 'save one from any RAMS.' : 'load the starter library in Admin Centre › RAMS Library.'}</Muted>}
      </Card>
      {builds.length > 0 && (
        <>
          <SectionTitle>Or copy another job&apos;s RAMS</SectionTitle>
          <Card>
            <Muted>Pick the job, then tick one or more of its RAMS. Can be combined with templates above.</Muted>
            <Pressable onPress={async () => { const k = await chooseAction('Choose a job', copySites.map((c) => ({ key: c.id, label: `${c.name} (${c.n})` }))); if (k) { setCopySite(k); } }} style={[box, { marginTop: 8 }]}>
              <Text style={{ color: copySite ? base.ink : base.slate }}>{copySite ? siteName(copySite) : `— Choose a job (${copySites.length}) —`}</Text>
            </Pressable>
            {copySite && (bySite[copySite] || []).map((b) => <Check key={b.id} label={`${b.title} · ${b.status === 'issued' ? `Issued rev ${b.revision}` : 'Draft'} · ${new Date(b.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`} value={copies.includes(b.id)} onChange={() => tick(copies, setCopies, b.id)} />)}
            {copies.length > 0 && <Muted style={{ marginTop: 4 }}>{copies.length} ticked to copy.</Muted>}
            <Muted style={{ marginTop: 6 }}>Copies hazards, sections, PPE and groups — job details (dates, address, numbers) start fresh. Edit anything afterwards.</Muted>
          </Card>
        </>
      )}
      <View style={{ marginTop: 6 }}><Button title="Create RAMS" busy={busy} onPress={async () => {
        if (busy) return;
        setBusy(true);
        try {
          const r = await createBuild(me, org as never, site, id, name.trim() || 'RAMS', tpls, copies);
          if (typeof r === 'string') { toast(r); return; }
          void qc.invalidateQueries({ queryKey: ['ramsBuilds'] }); void qc.invalidateQueries({ queryKey: ['ramsBuildsOrg'] });
          router.replace(`/sites/${id}/hs/rams/build/${r.id}` as never);
          if (r.missing.length) showAlert(`Heads up: ${r.missing.length === 1 ? 'one item' : `${r.missing.length} items`} in the template could not be found in the RAMS library, so ${r.missing.length === 1 ? 'it was' : 'they were'} not added: ${r.missing.join(' · ')}. Add ${r.missing.length === 1 ? 'it' : 'them'} from the library in the editor, and fix the template in the RAMS Library.`);
        } finally { setBusy(false); }
      }} /></View>
    </ScrollView>
  );
}
