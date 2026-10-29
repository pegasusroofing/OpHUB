// Collections (730, the old Collection List): items for an operative to pick up,
// grouped by supplier. Managers add items (queue several, then Complete List),
// assign who collects, mark collected, edit, delete and email the list. Items moved here
// together (a grouped request) stay grouped, on To collect and once Collected.
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import {
  addCollectionItems, assignCollections, closeCollections, collectWithQty, deleteCollection, editCollection, emailCollectionList,
  useCollections, useManagerEmails, useOrderPeople, useSubAddresses, useSuppliers, type CollDraft, type CollItem, type FullSupplier,
} from '@/data/materials';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { branchLabel, isEmail, orderEmailFor, sortSuppliers, type Branch } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const STATUS: Record<string, string> = { open: 'Open', assigned: 'Assigned', collected: 'Collected', closed: '✓ Collected' };
// Items that came over together (same group) are kept in one bundle, in list order.
const bundles = (list: CollItem[]) => { const out: CollItem[][] = []; const at: Record<string, number> = {}; list.forEach((m) => { if (m.group_id && at[m.group_id] !== undefined) out[at[m.group_id]].push(m); else { if (m.group_id) at[m.group_id] = out.length; out.push([m]); } }); return out; };
const branchesOf = (s: FullSupplier | undefined) => (Array.isArray(s?.branches) ? s?.branches : []) as Branch[];

export default function Collections() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const [tab, setTab] = useState<'live' | 'closed'>('live');
  const { data: list, isLoading, refetch, isRefetching } = useCollections(id, tab);
  const { data: suppliers } = useSuppliers(me?.org_id);
  const { data: who } = useOrderPeople(id, true);
  const { data: people } = usePeople();
  const { data: addrs } = useSubAddresses(id, !!site?.multi_site);
  const { data: managers } = useManagerEmails(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [collectFor, setCollectFor] = useState<{ id: string; qty: string } | null>(null);
  const [editFor, setEditFor] = useState<{ id: string; item: string; qty: string; sup: string | null; branch: Branch | null } | null>(null);
  const [emailing, setEmailing] = useState<null | { kind: 'selected' } | { kind: 'supplier'; sup: FullSupplier }>(null);
  const [busy, setBusy] = useState(false);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Your items to collect are on the job&apos;s Materials screen.</Muted>;

  const items = list ?? [];
  const ops = who?.siteOps ?? [];
  const supName = (sid: string | null) => suppliers?.find((s) => s.id === sid)?.name ?? null;
  const refresh = () => { setSel(new Set()); void qc.invalidateQueries({ queryKey: ['materials', id] }); };
  const flip = (k: string, set: Set<string>, put: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); put(n); };
  const picked = items.filter((m) => sel.has(m.id));

  const assign = async (ms: CollItem[], userId: string) => {
    const name = ops.find((o) => o.id === userId)?.name ?? 'them';
    setBusy(true); const n = await assignCollections(me, id, site.name, ms, userId, name); setBusy(false);
    toast(ms.length === 1 ? (n ? 'Assigned' : 'Could not save — try again.') : `${n} item${n > 1 ? 's' : ''} assigned to ${name}`);
    setAssignFor(null); refresh();
  };
  const markCollected = async (ms: CollItem[]) => {
    setBusy(true); const n = await closeCollections(me, id, ms); setBusy(false);
    toast(n > 1 ? `${n} items marked Collected` : n ? 'Marked Collected' : 'Could not save — try again.'); refresh();
  };

  const row = (m: CollItem) => {
    const isOpen = open.has(m.id);
    return (
      <View key={m.id} style={{ borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
        <Pressable onPress={() => flip(m.id, open, setOpen)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
          <Pressable hitSlop={8} onPress={() => flip(m.id, sel, setSel)}><Text style={{ fontSize: 18 }}>{sel.has(m.id) ? '☑' : '☐'}</Text></Pressable>
          <Text style={{ color: base.slate }}>{isOpen ? '▼' : '▶'}</Text>
          <Text style={{ flex: 1, fontWeight: '700', color: base.ink, fontSize: 15.5 }}>{m.item}{m.qty ? <Text style={{ color: base.slate, fontWeight: '600' }}> × {m.qty}</Text> : null}</Text>
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: m.status === 'closed' || m.status === 'collected' ? base.ok : m.status === 'assigned' ? base.blue : base.warn }}>{STATUS[m.status] || m.status}</Text>
        </Pressable>
        {isOpen && (
          <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
            <Muted>Qty {m.qty || '—'}{m.qty_collected ? ` (collected ${m.qty_collected})` : ''}</Muted>
            {!!m.supplier_id && <Muted>Supplier: {supName(m.supplier_id)}</Muted>}
            {!!m.supplier_branch && <Muted>📍 {branchLabel(m.supplier_branch as Branch)}</Muted>}
            {!!m.assigned_to && <Muted>Assigned to {nameOf(people, m.assigned_to)}</Muted>}
            {!!m.sub_site_id && <Muted>📍 {addrs?.find((a) => a.id === m.sub_site_id)?.name ?? m.sub_site_label ?? ''}</Muted>}
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 8 }}>
              <Pressable onPress={() => setEditFor({ id: m.id, item: m.item, qty: m.qty || '', sup: m.supplier_id, branch: (m.supplier_branch as Branch) || null })}><Text style={{ color: base.blue }}>✎ Edit</Text></Pressable>
              <Pressable onPress={async () => { if (await confirmAsk('Delete this item from the list?', 'Delete')) { if (await deleteCollection(me, id, m)) { toast('Deleted'); refresh(); } } }}><Text style={{ color: base.red }}>🗑 Delete</Text></Pressable>
            </View>
            {editFor?.id === m.id && (
              <Card style={{ marginTop: 10, backgroundColor: base.paper }}>
                <TextInput value={editFor.item} onChangeText={(t) => setEditFor({ ...editFor, item: t })} placeholder="Item" style={box} />
                <TextInput value={editFor.qty} onChangeText={(t) => setEditFor({ ...editFor, qty: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="Quantity (optional)" style={box} />
                <SupplierPick suppliers={suppliers ?? []} value={editFor.sup} onChange={(s) => setEditFor({ ...editFor, sup: s, branch: null })} />
                <BranchPick branches={branchesOf(suppliers?.find((s) => s.id === editFor.sup))} value={editFor.branch} onChange={(b) => setEditFor({ ...editFor, branch: b })} />
                <Button busy={busy} title="Save" onPress={async () => {
                  if (!editFor.item.trim()) { toast("Item can't be empty."); return; }
                  if (await editCollection(m.id, { item: editFor.item.trim(), qty: editFor.qty.trim() || null, supplier_id: editFor.sup, supplier_branch: editFor.branch })) { toast('Item updated'); setEditFor(null); refresh(); }
                  else toast('Could not save — try again.');
                }} />
                <Button kind="ghost" title="Cancel" onPress={() => setEditFor(null)} />
              </Card>
            )}
            {assignFor === m.id && (
              <Card style={{ marginTop: 10 }}>
                <Muted style={{ marginBottom: 6 }}>Who should collect this?</Muted>
                {ops.length ? ops.map((o) => <Button key={o.id} kind="ghost" title={`${m.assigned_to === o.id ? '✓ ' : ''}${o.name}`} onPress={() => void assign([m], o.id)} />) : <Muted>No operatives assigned to this job.</Muted>}
                <Button kind="ghost" title="Cancel" onPress={() => setAssignFor(null)} />
              </Card>
            )}
            {m.status === 'assigned' && (collectFor?.id === m.id ? (
              <Card style={{ marginTop: 10 }}>
                <Muted>Qty actually collected:</Muted>
                <TextInput value={collectFor.qty} onChangeText={(t) => setCollectFor({ id: m.id, qty: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" style={box} />
                <Button title="Confirm Collected" onPress={async () => { if (await collectWithQty(me, m.id, collectFor.qty.trim())) { toast('Marked collected'); setCollectFor(null); refresh(); } }} />
                <Button kind="ghost" title="Cancel" onPress={() => setCollectFor(null)} />
              </Card>
            ) : <Pressable onPress={() => setCollectFor({ id: m.id, qty: m.qty || '' })} style={{ marginTop: 10 }}><Text style={{ color: base.ink }}>☐ Collected</Text></Pressable>)}
            {m.status !== 'closed' && assignFor !== m.id && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <Button small title="Assign Operative to Collect" onPress={() => { setAssignFor(m.id); setCollectFor(null); }} />
                <Button small kind="ghost" title="✓ Collected" onPress={() => void markCollected([m])} />
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // Grouped by supplier, "No supplier" last.
  const groups: Record<string, CollItem[]> = {};
  items.forEach((m) => { (groups[m.supplier_id || '__none'] ||= []).push(m); });
  const keys = Object.keys(groups).sort((a, b) => (a === '__none' ? 1 : b === '__none' ? -1 : (supName(a) || '').localeCompare(supName(b) || '')));

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
      <Stack.Screen options={{ title: 'Collections' }} />
      <Card style={{ backgroundColor: '#FCEFD2' }}><Text style={{ color: '#5E3D00' }}><Text style={{ fontWeight: '700' }}>Items for an operative to pick up.</Text> Assign who collects each one — it shows on their Materials screen as a tick list.</Text></Card>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {([['live', 'To collect'], ['closed', 'Collected']] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => { setTab(k); setSel(new Set()); setAssignFor(null); setCollectFor(null); }}
            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: tab === k ? base.ink : base.line, backgroundColor: tab === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: tab === k ? '#fff' : base.ink }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {items.length > 1 && sel.size > 0 && (
        <Pressable onPress={() => setSel(sel.size >= items.length ? new Set() : new Set(items.map((m) => m.id)))} style={{ marginBottom: 8 }}>
          <Text style={{ fontWeight: '700', color: base.ink }}>{sel.size >= items.length ? '☑' : '☐'} Select all ({items.length}){sel.size < items.length ? ` · ${sel.size} selected` : ''}</Text>
        </Pressable>
      )}
      {picked.length > 0 && (
        <Card style={{ borderColor: base.ink, borderWidth: 1.5 }}>
          <SectionTitle>{picked.length} item{picked.length > 1 ? 's' : ''} selected</SectionTitle>
          <Button title="✉ Email Selected" onPress={() => setEmailing({ kind: 'selected' })} />
          {tab === 'live' && <Button kind="ghost" title="✓ Mark Selected Collected" onPress={() => void markCollected(picked)} />}
          {tab === 'live' && (assignFor === 'bulk' ? (
            <View>
              <Muted>Who collects?</Muted>
              {ops.map((o) => <Button key={o.id} kind="ghost" title={o.name} onPress={() => void assign(picked, o.id)} />)}
            </View>
          ) : <Button kind="ghost" title="👤 Assign selected to an operative" onPress={() => setAssignFor('bulk')} />)}
          <Button kind="ghost" title="Clear selection" onPress={() => { setSel(new Set()); setAssignFor(null); }} />
        </Card>
      )}
      {emailing && (
        <EmailBox title={emailing.kind === 'selected' ? `Email ${picked.length} Collection List item${picked.length > 1 ? 's' : ''}` : `Email ${emailing.sup.name}`}
          managers={emailing.kind === 'selected' ? managers ?? [] : []} meId={me.id}
          fixed={emailing.kind === 'supplier' ? (() => { const rows = groups[emailing.sup.id] ?? []; const bIds = new Set(rows.map((r) => r.supplier_branch?.id || '')); const one = bIds.size === 1 ? (rows[0]?.supplier_branch as Branch | null) : null; const live = one ? branchesOf(emailing.sup).find((b) => b.id === one.id) || one : null; return orderEmailFor(emailing.sup, live); })() : null}
          lines={(emailing.kind === 'selected' ? picked : groups[emailing.sup.id] ?? []).map((r) => `${r.item}${r.qty ? ` — qty ${r.qty}` : ''}`)}
          onCancel={() => setEmailing(null)}
          onSend={async (recipients) => {
            const rows = emailing.kind === 'selected' ? picked : groups[emailing.sup.id] ?? [];
            const err = await emailCollectionList(id, recipients, rows.map((r) => ({ item: r.item, qty: r.qty, ...(emailing.kind === 'selected' ? { supplier_name: supName(r.supplier_id) } : {}) })), emailing.kind === 'selected' ? 'Collection List' : `Collection List — ${emailing.sup.name}`);
            if (err) { toast(err); return; }
            showAlert(emailing.kind === 'selected' ? `${rows.length} item${rows.length > 1 ? 's' : ''} emailed to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}.` : `The Collection List was emailed to ${emailing.sup.name}.`, '✓ Email sent');
            setEmailing(null); if (emailing.kind === 'selected') setSel(new Set());
          }} />
      )}

      {isLoading ? <Muted>Loading…</Muted> : keys.length ? keys.map((k) => {
        const sup = suppliers?.find((s) => s.id === k);
        return (
          <Card key={k}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{k === '__none' ? 'No supplier' : sup?.name ?? 'Supplier'} <Text style={{ color: base.slate, fontWeight: '400' }}>({groups[k].length} item{groups[k].length > 1 ? 's' : ''})</Text></Text>
              {k !== '__none' && sup && <Pressable onPress={() => { if (!sup.email && !branchesOf(sup).some((b) => b.email)) { toast('This supplier has no email on file.'); return; } setEmailing({ kind: 'supplier', sup }); }}><Text style={{ color: base.blue }}>✉ Email Supplier</Text></Pressable>}
            </View>
            {bundles(groups[k]).map((b) => (b.length < 2 ? row(b[0]) : (
              <View key={`g:${b[0].group_id}`} style={{ borderLeftWidth: 4, borderLeftColor: '#6A2C91', paddingLeft: 8, marginBottom: 8 }}>
                <Text style={{ fontWeight: '700', color: '#4E1F6E', marginBottom: 6 }}>🔗 Grouped request · {b.length} items</Text>
                {b.map(row)}
              </View>
            )))}
          </Card>
        );
      }) : <Empty>{tab === 'live' ? 'Nothing waiting to be collected.' : 'Nothing collected yet.'}</Empty>}

      {tab === 'live' && <AddBox suppliers={suppliers ?? []} addrs={site.multi_site ? addrs ?? [] : null} onSave={async (rows) => {
        if (!(await addCollectionItems(me, id, rows))) { toast('Could not save — try again.'); return false; }
        toast(`${rows.length} item${rows.length > 1 ? 's' : ''} added to the list`); refresh(); return true;
      }} />}
    </ScrollView>
  );
}

function SupplierPick({ suppliers, value, onChange }: { suppliers: FullSupplier[]; value: string | null; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  return (
    <View style={{ marginBottom: 8 }}>
      <Pressable onPress={() => setOpen(!open)} style={{ paddingVertical: 6 }}><Text style={{ fontWeight: '700', color: base.ink }}>{open ? '▼' : '▶'} {suppliers.find((s) => s.id === value)?.name ?? 'Supplier (optional)'}</Text></Pressable>
      {open && (
        <View>
          {suppliers.length > 10 && <TextInput value={q} onChangeText={setQ} placeholder="Filter suppliers…" style={box} />}
          <Pressable onPress={() => { onChange(null); setOpen(false); }}><Text style={{ paddingVertical: 6, color: base.slate }}>— No supplier —</Text></Pressable>
          {sortSuppliers(suppliers, q).map((s) => (
            <Pressable key={s.id} onPress={() => { onChange(s.id); setOpen(false); }}><Text style={{ paddingVertical: 6, color: base.ink, fontWeight: value === s.id ? '700' : '400' }}>{s.favourite ? '★ ' : ''}{s.name}</Text></Pressable>
          ))}
          {!suppliers.length && <Muted>No suppliers set up yet — add them in Admin › Suppliers.</Muted>}
        </View>
      )}
    </View>
  );
}

function BranchPick({ branches, value, onChange }: { branches: Branch[]; value: Branch | null; onChange: (b: Branch | null) => void }) {
  if (!branches.length) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      <Muted style={{ fontWeight: '700' }}>Branch / address</Muted>
      <Pressable onPress={() => onChange(null)}><Text style={{ paddingVertical: 5, color: base.ink }}>{!value ? '◉' : '○'} Any branch / not specified</Text></Pressable>
      {branches.map((b) => (
        <Pressable key={b.id} onPress={() => onChange({ id: b.id, name: b.name || '', address: b.address || '', phone: b.phone || '', email: b.email || '' })}>
          <Text style={{ paddingVertical: 5, color: base.ink }}>{value?.id === b.id ? '◉' : '○'} {branchLabel(b)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function AddBox({ suppliers, addrs, onSave }: { suppliers: FullSupplier[]; addrs: { id: string; name: string }[] | null; onSave: (rows: CollDraft[]) => Promise<boolean> }) {
  const toast = useToast();
  const [queue, setQueue] = useState<CollDraft[]>([]);
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('');
  const [sup, setSup] = useState<string | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const current = (): CollDraft | null => (item.trim() ? { item: item.trim(), qty: qty.trim() || null, supplier_id: sup, supplier_branch: branch, sub_site_id: sub } : null);
  return (
    <Card style={{ marginTop: 18 }}>
      <SectionTitle>Add item</SectionTitle>
      {queue.length > 0 && (
        <Card style={{ backgroundColor: base.paper }}>
          <Muted>{queue.length} row{queue.length > 1 ? 's' : ''} queued — not saved yet:</Muted>
          {queue.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ flex: 1, color: base.ink }}>{r.item}{r.qty ? ` — qty ${r.qty}` : ''}</Text>
              <Pressable onPress={() => setQueue(queue.filter((_, j) => j !== i))}><Text style={{ color: base.red }}>🗑</Text></Pressable>
            </View>
          ))}
        </Card>
      )}
      <TextInput value={item} onChangeText={setItem} placeholder="Item" style={box} />
      <TextInput value={qty} onChangeText={(t) => setQty(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="Quantity (optional)" style={box} />
      <SupplierPick suppliers={suppliers} value={sup} onChange={(s) => { setSup(s); setBranch(null); }} />
      <BranchPick branches={branchesOf(suppliers.find((s) => s.id === sup))} value={branch} onChange={setBranch} />
      {addrs && (
        <View style={{ marginBottom: 8 }}>
          <Muted style={{ fontWeight: '700' }}>Address</Muted>
          <Pressable onPress={() => setSub(null)}><Text style={{ paddingVertical: 5, color: base.ink }}>{!sub ? '◉' : '○'} Not on the list</Text></Pressable>
          {addrs.map((a) => <Pressable key={a.id} onPress={() => setSub(a.id)}><Text style={{ paddingVertical: 5, color: base.ink }}>{sub === a.id ? '◉' : '○'} {a.name}</Text></Pressable>)}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button kind="ghost" title="Add More" onPress={() => {
          const c = current(); if (!c) { toast('Enter an item first.'); return; }
          setQueue([...queue, c]); setItem(''); setQty(''); toast('Row queued — add another or tap Complete List');
        }} /></View>
        <View style={{ flex: 1 }}><Button title="Complete List" onPress={async () => {
          const c = current(); const rows = c ? [...queue, c] : queue;
          if (!rows.length) { toast('Enter at least one item.'); return; }
          if (await onSave(rows)) { setQueue([]); setItem(''); setQty(''); setSup(null); setBranch(null); setSub(null); }
        }} /></View>
      </View>
    </Card>
  );
}

function EmailBox({ title, managers, meId, fixed, lines, onSend, onCancel }: {
  title: string; managers: { id: string; name: string; email: string | null }[]; meId: string; fixed: string | null; lines: string[];
  onSend: (recipients: string[]) => Promise<void>; onCancel: () => void;
}) {
  const toast = useToast();
  const [ticked, setTicked] = useState<Set<string>>(new Set(managers.filter((p) => p.id === meId).map((p) => p.email as string)));
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card style={{ borderColor: base.blue, borderWidth: 1.5 }}>
      <SectionTitle>{title}</SectionTitle>
      {fixed ? <Muted>Sending to <Text style={{ fontWeight: '700' }}>{fixed}</Text> — {lines.length} item{lines.length > 1 ? 's' : ''}:</Muted> : <Muted>Tick who should receive it, or add another address below.</Muted>}
      {!fixed && managers.map((p) => (
        <Pressable key={p.id} onPress={() => { const s = new Set(ticked); if (s.has(p.email as string)) s.delete(p.email as string); else s.add(p.email as string); setTicked(s); }}>
          <Text style={{ paddingVertical: 5, color: base.ink }}>{ticked.has(p.email as string) ? '☑' : '☐'} {p.name} <Text style={{ color: base.slate }}>({p.email})</Text></Text>
        </Pressable>
      ))}
      {!fixed && <TextInput value={extra} onChangeText={setExtra} autoCapitalize="none" keyboardType="email-address" placeholder="Add another address" style={[box, { marginTop: 6 }]} />}
      {fixed && <View style={{ marginVertical: 6 }}>{lines.map((l, i) => <Text key={i} style={{ color: base.ink, fontSize: 12.5 }}>{l}</Text>)}</View>}
      <Button busy={busy} title="Confirm & Send" onPress={async () => {
        const r = fixed ? [fixed] : [...ticked];
        if (!fixed && extra.trim()) { if (!isEmail(extra)) { toast('Enter a valid email address.'); return; } r.push(extra.trim()); }
        const rec = [...new Set(r)];
        if (!rec.length) { toast('Tick or enter at least one recipient.'); return; }
        setBusy(true); await onSend(rec); setBusy(false);
      }} />
      <Button kind="ghost" title="Cancel" onPress={onCancel} />
    </Card>
  );
}
