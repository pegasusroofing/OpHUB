// Admin Centre › HAVS Tools (260, 760 saveHavsToolField / addHavsTool /
// deleteHavsTool): the company's tool list and vibration magnitudes. Removing
// a tool hides it from new entries; past HAVS records keep it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { titleCaseWords } from '@/lib/rules/havs';
import { isFullManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Tool = { id: string; name: string; vibration_magnitude: number };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: 6, padding: 8, fontSize: 13, color: base.ink, backgroundColor: base.card };

function ToolRow({ t, onSave, onRemove }: { t: Tool; onSave: (field: 'name' | 'vibration_magnitude', v: string) => void; onRemove: () => void }) {
  const [name, setName] = useState(titleCaseWords(t.name));
  const [mag, setMag] = useState(String(t.vibration_magnitude));
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, gap: 6 }}>
        <TextInput value={name} onChangeText={setName} onBlur={() => { if (name !== titleCaseWords(t.name)) onSave('name', name); }} style={[box, { fontWeight: '700' }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Muted>Magnitude</Muted>
          <TextInput value={mag} onChangeText={setMag} keyboardType="decimal-pad" onBlur={() => { if (mag !== String(t.vibration_magnitude)) onSave('vibration_magnitude', mag); }} style={[box, { width: 70 }]} />
          <Muted>m/s²</Muted>
        </View>
      </View>
      <Pressable hitSlop={8} onPress={onRemove}><Text style={{ fontSize: 16 }}>🗑</Text></Pressable>
    </Card>
  );
}

export default function HavsTools() {
  const [gen, setGen] = useState(0);
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(''), [mag, setMag] = useState('');
  const { data: tools = [], isLoading } = useQuery({
    queryKey: ['havsToolsAdmin', me?.org_id], enabled: !!me,
    queryFn: async () => ((await db.from('havs_tools').select('*').eq('org_id', me?.org_id as string).eq('active', true).order('sort_order').order('name')).data as Tool[] | null) ?? [],
  });
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['havsToolsAdmin'] }); void qc.invalidateQueries({ queryKey: ['havs'] }); };
  const save = async (t: Tool, field: 'name' | 'vibration_magnitude', raw: string) => {
    const back = () => { setGen((g) => g + 1); refresh(); };
    const v = raw.trim();
    if (!v) { toast(`${field === 'name' ? 'Tool name' : 'Magnitude'} can't be empty.`); back(); return; }
    const val = field === 'vibration_magnitude' ? parseFloat(v) : titleCaseWords(v);
    if (field === 'vibration_magnitude' && (!isFinite(val as number) || (val as number) <= 0)) { toast('Enter a magnitude greater than 0.'); back(); return; }
    const ok = !!(await db.from('havs_tools').update({ [field]: val } as never).eq('id', t.id).select('id')).data?.length;
    toast(ok ? 'Tool updated' : 'Could not save — try again.'); if (ok) refresh(); else back();
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'HAVS Tools' }} />
      <Muted style={{ marginBottom: 10 }}>The vibration magnitude (m/s²) used to calculate everyone&apos;s HAVS exposure points. These are sensible starting defaults — update them if you have proper manufacturer or measured figures.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : tools.length ? tools.map((t) => (
        <ToolRow key={`${t.id}#${gen}`} t={t} onSave={(f, v) => void save(t, f, v)} onRemove={async () => {
          if (!(await confirmAsk(`Remove "${t.name}"? Past HAVS entries using it are kept, but it won't be selectable for new entries.`, 'Remove'))) return;
          toast(!(await db.from('havs_tools').update({ active: false } as never).eq('id', t.id).select('id')).data?.length ? 'Could not remove — try again.' : 'Tool removed'); refresh();
        }} />
      )) : <Empty>No tools yet — add your first one below.</Empty>}
      {adding ? (
        <Card>
          <TextInput value={name} onChangeText={setName} placeholder="Tool name" style={[box, { borderRadius: radius.input, marginBottom: 8 }]} />
          <TextInput value={mag} onChangeText={setMag} placeholder="Vibration magnitude (m/s²)" keyboardType="decimal-pad" style={[box, { borderRadius: radius.input, marginBottom: 8 }]} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button title="Add Tool" onPress={async () => {
              const n = titleCaseWords(name.trim()), m = parseFloat(mag);
              if (!n) { toast('Enter a tool name.'); return; }
              if (!isFinite(m) || m <= 0) { toast('Enter a vibration magnitude greater than 0.'); return; }
              if ((await db.from('havs_tools').insert({ org_id: me.org_id, name: n, vibration_magnitude: m, sort_order: 999 } as never)).error) { toast('Could not save — try again.'); return; }
              toast('Tool added'); setAdding(false); setName(''); setMag(''); refresh();
            }} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setAdding(false)} /></View>
          </View>
        </Card>
      ) : <Button title="+ Add Tool" onPress={() => setAdding(true)} />}
    </ScrollView>
  );
}
