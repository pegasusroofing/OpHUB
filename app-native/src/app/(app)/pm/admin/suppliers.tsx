// Admin Centre › Suppliers (726 renderSuppliersAdmin, 730 add / rename / delete):
// name, order email, our account number, and branches (name, address, branch
// order email, phone). Same-company duplicates are blocked, look-alikes warned. Finance users can link
// a supplier to its Finance Directory record (9219zc) — two records, neither changes the other.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { SelectBox } from '@/components/SelectBox';
import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { toggleFavourite, useSuppliers, type FullSupplier } from '@/data/materials';
import { useAuth } from '@/lib/auth';
import { type Branch } from '@/lib/rules/materials';
import { supplierConflict, supplierImportRows } from '@/lib/rules/suppliers';
import { csvRows, readXlsx } from '@/lib/rules/xlsxRead';
import * as DocumentPicker from 'expo-document-picker';
import { isFinanceUser, isFullManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Sup = FullSupplier & { account_number?: string | null };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 6 };

function Field({ label, value, placeholder, onSave, keyboard }: { label?: string; value: string; placeholder?: string; onSave: (v: string) => void; keyboard?: 'email-address' | 'phone-pad' }) {
  const [v, setV] = useState(value);
  return (
    <View>
      {!!label && <Muted style={{ fontWeight: '700' }}>{label}</Muted>}
      <TextInput value={v} onChangeText={setV} placeholder={placeholder} keyboardType={keyboard} autoCapitalize={keyboard ? 'none' : 'sentences'} onBlur={() => { if (v.trim() !== value.trim()) onSave(v.trim()); }} style={box} />
    </View>
  );
}

// Branch edits re-read the supplier and write the whole list back, one at a time.
let queue: Promise<unknown> = Promise.resolve();
function updateBranches(id: string, fn: (b: Branch[]) => Branch[]): Promise<boolean> {
  const run = queue.then(async () => {
    const s = ((await db.from('suppliers').select('branches').eq('id', id).maybeSingle()).data as { branches: Branch[] | null } | null);
    if (!s) return false;
    const before = Array.isArray(s.branches) ? s.branches : [];
    const after = fn(before.map((b) => ({ ...b })));
    if (JSON.stringify(after) === JSON.stringify(before)) return true;
    return !!(await db.from('suppliers').update({ branches: after } as never).eq('id', id).select('id')).data?.length;
  });
  queue = run.catch(() => null);
  return run;
}

export default function Suppliers() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useSuppliers(me?.org_id);
  const fin = isFinanceUser(me, org);
  const { data: dir = [], refetch: refetchDir } = useQuery({ queryKey: ['finDirSups', me?.org_id], enabled: !!me && fin, queryFn: async () => ((await db.from('fin_suppliers').select('id,name,supplier_id').eq('org_id', me?.org_id as string).order('name')).data as { id: string; name: string; supplier_id: string | null }[] | null) ?? [] });
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(''), [email, setEmail] = useState('');
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  const sups = list as Sup[];
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['suppliers'] }); };
  const saveField = async (s: Sup, field: 'name' | 'email', v: string) => {
    if (!v) { toast(`${field === 'name' ? 'Supplier name' : 'Email'} can't be empty.`); refresh(); return; }
    if (field === 'name') {
      const c = supplierConflict(v, sups, s.id);
      if (c.blocked) { toast(`"${c.blocked.name}" already exists — not saved.`); refresh(); return; }
      if (c.warn && !(await confirmAsk(`This looks similar to an existing supplier, "${c.warn.name}" — rename to "${v}" anyway?`, 'Rename'))) { refresh(); return; }
    }
    toast(!(await db.from('suppliers').update({ [field]: v } as never).eq('id', s.id).select('id')).data?.length ? 'Could not save — try again.' : 'Supplier updated'); refresh();
  };
  const saveBranch = async (s: Sup, bid: string, field: keyof Branch, v: string) => {
    toast((await updateBranches(s.id, (bs) => bs.map((b) => (b.id === bid ? { ...b, [field]: v } : b)))) ? 'Saved' : 'Could not save — try again.'); refresh();
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Suppliers' }} />
      <Muted style={{ marginBottom: 12 }}>Supplier names, order emails and branches. Branches can be picked when you order for collection or add to a Collection List.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : sups.length ? sups.map((s) => {
        const brs = Array.isArray(s.branches) ? s.branches : [];
        const isOpen = open === s.id;
        return (
          <Card key={s.id} style={{ padding: 0, overflow: 'hidden' }}>
            <Pressable onPress={() => setOpen(isOpen ? null : s.id)} style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
              <Text style={{ color: base.slate, width: 18 }}>{isOpen ? '▼' : '▶'}</Text>
              <Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{s.name}</Text>
              <Pressable hitSlop={8} accessibilityLabel={`Favourite ${s.name}`} style={{ paddingHorizontal: 8 }} onPress={async () => { const err = await toggleFavourite(me.org_id as string, s); if (err) toast(err); refresh(); }}><Text style={{ fontSize: 17, color: s.favourite ? '#D98A00' : base.slate }}>{s.favourite ? '★' : '☆'}</Text></Pressable>
              <Muted>{brs.length} branch{brs.length === 1 ? '' : 'es'}</Muted>
            </Pressable>
            {isOpen && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                <Field label="Name" value={s.name} onSave={(v) => void saveField(s, 'name', v)} />
                {fin && (() => { const linked = dir.find((f) => f.supplier_id === s.id); return (
                  <SelectBox label="Finance Directory (accounts)" value={linked?.id || ''} options={[['', 'Not linked'], ...dir.map((f) => [f.id, `${f.name}${f.supplier_id && f.supplier_id !== s.id ? ' (linked to another)' : ''}`] as [string, string]), ['__new', '+ Add to the Finance Directory']]} onChange={async (v) => {
                    for (const p of dir.filter((f) => f.supplier_id === s.id && f.id !== v)) await db.from('fin_suppliers').update({ supplier_id: null } as never).eq('id', p.id);
                    if (v === '__new') { if ((await db.from('fin_suppliers').insert({ org_id: me.org_id, created_by: me.id, name: s.name, supplier_id: s.id } as never)).error) toast('Could not add it.'); void refetchDir(); return; }
                    if (v) { const f = dir.find((x) => x.id === v); if (f?.supplier_id && f.supplier_id !== s.id && !(await confirmAsk(`${f.name} is linked to another Projects supplier. Link it to this one instead?`, 'Link it here'))) return; await db.from('fin_suppliers').update({ supplier_id: s.id } as never).eq('id', v); }
                    void refetchDir();
                  }} />
                ); })()}
                <Field label="Order email" value={s.email || ''} keyboard="email-address" onSave={(v) => void saveField(s, 'email', v)} />
                <Field label="Our account number" value={s.account_number || ''} placeholder="e.g. RTB001 — added to every order email to them" onSave={async (v) => {
                  const val = v.slice(0, 60);
                  toast(!(await db.from('suppliers').update({ account_number: val || null } as never).eq('id', s.id).select('id')).data?.length ? 'Could not save — try again.' : val ? 'Account number saved — it goes on order emails' : 'Account number removed'); refresh();
                }} />
                <Text style={{ fontWeight: '800', color: base.ink, marginTop: 6, marginBottom: 4 }}>Branches</Text>
                {brs.length ? brs.map((b) => (
                  <View key={b.id} style={{ borderTopWidth: 1, borderTopColor: base.line, paddingTop: 6, marginTop: 4 }}>
                    <Field value={b.name || ''} placeholder="Branch name, e.g. Stockton" onSave={(v) => void saveBranch(s, b.id, 'name', v)} />
                    <Field value={b.address || ''} placeholder="Address" onSave={(v) => void saveBranch(s, b.id, 'address', v)} />
                    <Field value={b.email || ''} placeholder="Branch order email (optional — used instead of the main one)" keyboard="email-address" onSave={(v) => void saveBranch(s, b.id, 'email', v)} />
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <View style={{ flex: 1 }}><Field value={b.phone || ''} placeholder="Phone (optional)" keyboard="phone-pad" onSave={(v) => void saveBranch(s, b.id, 'phone', v)} /></View>
                      <Pressable onPress={async () => { if (!(await confirmAsk('Delete this branch?', 'Delete'))) return; if (await updateBranches(s.id, (bs) => bs.filter((x) => x.id !== b.id))) refresh(); }}><Text style={{ color: base.warn, fontWeight: '700' }}>Delete</Text></Pressable>
                    </View>
                  </View>
                )) : <Muted style={{ marginBottom: 8 }}>No branches yet.</Muted>}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <View style={{ flex: 1 }}><Button kind="ghost" title="+ Add branch" onPress={async () => { if (await updateBranches(s.id, (bs) => bs.concat([{ id: `b${Math.random().toString(36).slice(2, 9)}`, name: '', address: '', phone: '', email: '' }]))) refresh(); }} /></View>
                  <View style={{ flex: 1 }}><Button kind="ghost" title="Delete supplier" onPress={async () => {
                    if (!(await confirmAsk('Remove this supplier?', 'Remove'))) return;
                    toast(!(await db.from('suppliers').delete().eq('id', s.id).select('id')).data?.length ? 'Could not remove — try again.' : 'Supplier removed'); refresh();
                  }} /></View>
                </View>
              </View>
            )}
          </Card>
        );
      }) : <Empty>No suppliers yet.</Empty>}
      {adding ? (
        <Card>
          <TextInput value={name} onChangeText={setName} placeholder="Supplier name" style={box} />
          <TextInput value={email} onChangeText={setEmail} placeholder="Supplier order email" autoCapitalize="none" keyboardType="email-address" style={box} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button title="Add Supplier" onPress={async () => {
              const n = name.trim(), e = email.trim();
              if (!n || !e) { toast('Enter a supplier name and email.'); return; }
              const c = supplierConflict(n, sups);
              if (c.blocked) { showAlert(`"${c.blocked.name}" is already a supplier — that looks like the same company under a slightly different spelling, so it can't be added again.`); return; }
              if (c.warn && !(await confirmAsk(`This looks similar to an existing supplier, "${c.warn.name}" — add "${n}" anyway as a separate supplier?`, 'Add'))) return;
              if ((await db.from('suppliers').insert({ org_id: me.org_id, name: n, email: e, created_by: me.id } as never)).error) { toast('Could not save — try again.'); return; }
              toast('Supplier added'); setAdding(false); setName(''); setEmail(''); refresh();
            }} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setAdding(false)} /></View>
          </View>
          <Muted style={{ marginTop: 12, marginBottom: 6 }}>Or import a list — Excel / CSV with Name and Email columns (or name in column A, email in column B). Anything that looks like an existing supplier is skipped.</Muted>
          <Button kind="ghost" title="📊 Choose Excel / CSV file" onPress={async () => {
            const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
            const a = r.assets[0];
            if (/\.xls$/i.test(a.name || '')) { toast('Save it as .xlsx or .csv first — old .xls files can’t be read.'); return; }
            try {
              const bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
              const rows = /\.csv$/i.test(a.name || '') ? csvRows(new TextDecoder().decode(bytes)) : (await readXlsx(bytes))[0]?.rows ?? [];
              if (!rows.length) { toast('No rows found in that file.'); return; }
              const imp = supplierImportRows(rows as unknown[][], sups);
              if (!imp.found.length) { toast(imp.dupes || imp.similar.length ? 'Nothing new to import — every row matched an existing (or similar) supplier.' : 'Could not find any name + email pairs — check the file has Name / Email columns.'); return; }
              if ((await db.from('suppliers').insert(imp.found.map((f) => ({ org_id: me.org_id, name: f.name, email: f.email, created_by: me.id })) as never)).error) { toast('Could not import — try again.'); return; }
              showAlert(`${imp.found.length} supplier${imp.found.length === 1 ? '' : 's'} imported${imp.dupes ? `, ${imp.dupes} skipped (already on file)` : ''}${imp.similar.length ? `. Skipped as possible duplicates — add them by hand if they really are different companies: ${imp.similar.join(', ')}` : '.'}`);
              setAdding(false); refresh();
            } catch { toast('Could not read that file — check it’s a valid .xlsx or .csv.'); }
          }} />
        </Card>
      ) : <Button title="+ Add Supplier" onPress={() => setAdding(true)} />}
    </ScrollView>
  );
}
