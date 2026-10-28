// Material Requests (720). Operatives: Live/Pending and Closed, raise a request,
// edit or cancel their own while it waits. Managers: To action and Completed; close,
// reopen, edit, delete, group several into one request, move to Collections.
// A request on a sent PO is locked here (changes are made in Finance) — 9219zr.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { GrnDetail } from '@/components/Grn';
import { OrderPanel } from '@/components/OrderPanel';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import {
  addMaterial, cancelMaterial, deleteMaterials, editMaterial, groupMaterials, poLock, reopenMaterials,
  reemailOrder, setMaterialsStatus, yardBookInCan, yardCanEdit, toCollections, ungroupMaterials, useCollectionsOpenCount, useMaterialRequests, useSubAddresses, useSuppliers, type MatTab, type SubAddr,
} from '@/data/materials';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { localISODate } from '@/lib/rules/driver';
import { cancelReasonText, doneEntries, isEmail, liveEntries, matAgo, OP_STATUS_LABEL, orderEmailFor, readIsoDate, subAddrLabel, wasOrdered, type Branch, type Mat } from '@/lib/rules/materials';
import { isFinanceUser, isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const long = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };

export default function MaterialRequests() {
  const { id, add } = useLocalSearchParams<{ id: string; add?: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const mgr = !!me && isManager(me);
  const fin = isFinanceUser(me, org);
  const [tab, setTab] = useState<MatTab>(mgr ? 'pending' : 'live');
  const { data: list, isLoading, refetch, isRefetching } = useMaterialRequests(id, tab);
  const { data: collectN } = useCollectionsOpenCount(id, mgr);
  const { data: addrs } = useSubAddresses(id, !!site?.multi_site);
  const { data: people } = usePeople();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Mat | null>(null);
  const [busy, setBusy] = useState(false);
  const [ordering, setOrdering] = useState<{ mats: Mat[]; again: boolean } | null>(null);
  const { data: suppliers } = useSuppliers(mgr ? me?.org_id : null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;

  const done = tab === 'done' || tab === 'closed';
  const items = list ?? [];
  const selectable = mgr ? (tab === 'done' ? items.filter((m) => m.merchant !== 'Yard stock') : items) : [];
  const picked = items.filter((m) => sel.has(m.id));
  const refresh = () => { setSel(new Set()); void qc.invalidateQueries({ queryKey: ['materials', id] }); };
  const toggle = (ids: string[]) => { const n = new Set(sel); const all = ids.every((x) => n.has(x)); ids.forEach((x) => (all ? n.delete(x) : n.add(x))); setSel(n); };
  const flip = (k: string) => { const n = new Set(open); if (n.has(k)) n.delete(k); else n.add(k); setOpen(n); };
  const locked = async (ms: Mat[]) => { const msg = await poLock(ms.map((m) => m.id), mgr); if (msg) showAlert(msg); return !!msg; };
  const act = async (fn: () => Promise<boolean | string | null>, ok: string) => {
    setBusy(true); const r = await fn(); setBusy(false);
    if (typeof r === 'string') toast(r); else if (r === false) toast('Could not save — try again.'); else toast(ok);
    refresh();
  };

  const close = (ms: Mat[]) => act(() => setMaterialsStatus(me, id, ms, 'closed'), ms.length > 1 ? 'Requests closed' : 'Material request closed');
  const collections = async (ms: Mat[]) => {
    if (!(await confirmAsk(ms.length > 1 ? `Add these ${ms.length} items to Collections?\n\nYou can then choose who collects them.` : `Add "${ms[0].item}"${ms[0].qty ? ` × ${ms[0].qty}` : ''} to Collections?\n\nYou can then choose who collects it.`, 'Add'))) return;
    void act(async () => ((await toCollections(me, id, ms)) ? null : 'Could not add to Collections'), 'Added to Collections');
  };
  const del = async (ms: Mat[]) => {
    if (await locked(ms)) return;
    if (!(await confirmAsk(ms.length > 1 ? `Delete ${ms.length} material requests? This can't be undone.` : "Delete this material request? This can't be undone.", 'Delete'))) return;
    void act(() => deleteMaterials(me, id, ms, mgr), ms.length > 1 ? 'Requests deleted' : 'Material request deleted');
  };
  const edit = async (m: Mat) => { if (!(await locked([m]))) setEditing(m); };
  const cancel = async (m: Mat) => {
    if (await locked([m])) return;
    const reason = await promptText('Why are you cancelling this request? This will be visible to your Project Manager.');
    if (reason === null) return;
    if (!reason.trim()) { toast('A reason is required to cancel.'); return; }
    void act(() => cancelMaterial(me, m.id, reason.trim(), mgr), 'Request cancelled');
  };
  const startOrder = async (ms: Mat[], again: boolean) => {
    if (again && (await locked(ms))) return;
    setOrdering({ mats: ms, again }); setSel(new Set());
    scroll.current?.scrollTo({ y: 0, animated: true });
  };
  const reemail = async (m: Mat) => {
    if (await locked([m])) return;
    const sup = suppliers?.find((x) => x.id === m.supplier_id);
    if (!sup) { toast('Could not find that supplier.'); return; }
    const email = await promptText('Re-email order — this order was emailed to the address below. Edit it if you need to send it somewhere else this time.', orderEmailFor(sup, (m as Mat & { supplier_branch?: Branch | null }).supplier_branch ?? null));
    if (email === null) return;
    if (!isEmail(email)) { toast('Enter a valid email address.'); return; }
    setBusy(true); const msg = await reemailOrder(id, m, email.trim(), sup.name); setBusy(false);
    showAlert(msg, msg.startsWith('Re-email failed') ? 'OpHUB' : '✓ Email sent'); refresh();
  };

  const body = (m: Mat) => (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        {mgr && (m.status === 'pending' || m.status === 'sent' || done) && (
          <Pressable onPress={() => toggle([m.id])} hitSlop={8}><Text style={{ fontSize: 18 }}>{sel.has(m.id) ? '☑' : '☐'}</Text></Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: base.ink }}>{m.item} <Text style={{ fontSize: 11, color: base.slate, fontWeight: '400' }}>{matAgo(m.created_at)}</Text></Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            <Chip text={`Qty ${m.qty || '1'}`} />
            <Chip text={`👷 ${nameOf(people, m.requested_by)}`} />
            {!!m.required_by_date && <Chip text={`📅 Needed ${short(m.required_by_date)}`} tone="due" />}
            {!!m.order_note && <Chip text={`📝 ${m.order_note}`} />}
            {!!m.sub_site_label && <Chip text={`📍 ${m.sub_site_label}`} />}
          </View>
        </View>
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: m.status === 'pending' ? base.warn : m.status === 'cancelled' ? base.red : base.slate }}>{mgr ? m.status : OP_STATUS_LABEL[m.status] || m.status}</Text>
        {mgr && (
          <Pressable hitSlop={8} onPress={async () => {
            const k = await chooseAction(m.item, [{ key: 'edit', label: '✎ Edit' }, { key: 'del', label: '🗑 Delete', danger: true }]);
            if (k === 'edit') void edit(m); else if (k === 'del') void del([m]);
          }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
        )}
      </View>
      {m.grn && <GrnDetail g={m.grn} />}
      {(m.status === 'sent' || (m.status === 'closed' && m.merchant)) && mgr && (
        <View style={{ marginTop: 6 }}>
          {m.merchant === 'Yard stock' ? <Muted>🏗 From yard stock</Muted>
            : <Muted>{m.status === 'sent' ? `→ ${m.merchant || 'Supplier'} · ` : ''}{m.email_sent_at ? `✓ Emailed ${long(m.email_sent_at)}` : 'Email pending'}</Muted>}
          {!!m.required_for_delivery && <Muted>Required for delivery: <Text style={{ fontWeight: '700' }}>{short(m.required_for_delivery)}</Text></Muted>}
          {fin && !!m.po_number && <Muted>PO {m.po_number}</Muted>}
        </View>
      )}
      {m.status === 'cancelled' && <Text style={{ color: base.warn, marginTop: 6 }}>Cancelled by {nameOf(people, m.cancelled_by ?? null)}{m.cancel_reason ? ` — ${cancelReasonText(m.cancel_reason, mgr)}` : ''}</Text>}
      {m.status === 'pending' && !mgr && <Muted style={{ marginTop: 6 }}>Awaiting action from project manager</Muted>}
      {!mgr && m.status === 'pending' && m.requested_by === me.id && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <View style={{ flex: 1 }}><Button kind="ghost" title="✎ Edit request" onPress={() => void edit(m)} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel request" onPress={() => void cancel(m)} /></View>
        </View>
      )}
      {mgr && m.status === 'pending' && !sel.has(m.id) && (
        <View style={{ marginTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button title="🚚 Order from merchant" onPress={() => void startOrder([m], false)} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="📦 Add to collections" onPress={() => void collections([m])} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {yardCanEdit(me, fin) && <View style={{ flex: 1 }}><Button kind="ghost" title="🏗 From yard stock" onPress={() => router.push(`/sites/${id}/materials/yard?mat=${m.id}` as never)} /></View>}
            <View style={{ flex: 1 }}><Button kind="ghost" title="Close request" onPress={() => void close([m])} /></View>
          </View>
        </View>
      )}
      {mgr && m.status === 'sent' && !sel.has(m.id) && (
        <View style={{ marginTop: 6 }}>
          <Button kind="ghost" title="✎ Edit order" onPress={() => void edit(m)} />
          <Button kind="ghost" title="↻ Resend order" onPress={() => void startOrder([m], true)} />
          <Button kind="ghost" title="✓ Received — close" onPress={() => void close([m])} />
        </View>
      )}
      {mgr && m.status === 'closed' && !sel.has(m.id) && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          {wasOrdered(m) && m.merchant !== 'Yard stock' && <View style={{ flex: 1 }}><Button kind="ghost" title="✎ Edit order" onPress={() => void edit(m)} /></View>}
          {wasOrdered(m) && m.merchant !== 'Yard stock' && !!m.merchant && !!m.supplier_id && <View style={{ flex: 1 }}><Button kind="ghost" title="↻ Resend order" onPress={() => void reemail(m)} /></View>}
        </View>
      )}
      {mgr && m.status === 'closed' && !sel.has(m.id) && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button kind="ghost" title={wasOrdered(m) && m.merchant !== 'Yard stock' ? 'Send to another supplier' : 'Order it'} onPress={() => void startOrder([m], true)} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Reopen" onPress={() => void act(() => reopenMaterials([m]), 'Material request reopened')} /></View>
        </View>
      )}
    </View>
  );

  const row = (m: Mat) => done ? (
    <View key={m.id}>
      <Pressable onPress={() => flip(m.id)} style={rowStyle}>
        <Text style={{ flex: 1, color: base.ink, fontWeight: '700' }}>{open.has(m.id) ? '▼' : '▶'} {m.item}{m.qty ? <Text style={{ color: base.slate, fontWeight: '600' }}> × {m.qty}</Text> : null}</Text>
        <Text style={{ fontSize: 11, color: base.slate }}>{doneTag(m)}</Text>
      </Pressable>
      {open.has(m.id) && <Card>{body(m)}</Card>}
    </View>
  ) : <Card key={m.id}>{body(m)}</Card>;

  const entries = done ? doneEntries(items) : mgr ? liveEntries(items) : items.map((m) => ({ m, items: [m] }));

  return (
    <ScrollView ref={scroll} contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
      <Stack.Screen options={{ title: 'Material Requests' }} />
      {mgr && <Card style={{ backgroundColor: '#F1E4FA' }}><Text style={{ color: '#4E1F6E' }}><Text style={{ fontWeight: '700' }}>Requests from operatives.</Text> Order them from a merchant, or give them to an operative to collect — those move to Collections. Tick several to group them into one request.</Text></Card>}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {(mgr ? [['pending', 'To action'], ['collect', `Collections${collectN ? ` (${collectN})` : ''}`], ['done', 'Completed']] : [['live', 'Live/Pending'], ['closed', 'Closed']]).map(([k, l]) => (
          <Pressable key={k} onPress={() => { if (k === 'collect') { router.push(`/sites/${id}/materials/collections` as never); return; } setSel(new Set()); setTab(k as MatTab); }}
            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: tab === k ? base.ink : base.line, backgroundColor: tab === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: tab === k ? '#fff' : base.ink }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {ordering && (
        <Card style={{ borderColor: base.ink, borderWidth: 1.5 }}>
          <OrderPanel siteId={id} mats={ordering.mats} again={ordering.again} onDone={() => { setOrdering(null); refresh(); }} onCancel={() => setOrdering(null)} />
        </Card>
      )}
      {mgr && (yardCanEdit(me, fin) || yardBookInCan(me, fin)) && tab !== 'closed' && (
        <Pressable onPress={() => router.push(`/sites/${id}/materials/yard` as never)} style={{ marginBottom: 10 }}>
          <Text style={{ color: base.blue, fontWeight: '700' }}>📦 Yard stock · ⬇ Book into yard →</Text>
        </Pressable>
      )}
      {mgr && selectable.length > 1 && (sel.size > 0 || !done) && (
        <Pressable onPress={() => setSel(sel.size >= selectable.length ? new Set() : new Set(selectable.map((m) => m.id)))} style={{ marginBottom: 10 }}>
          <Text style={{ fontWeight: '700', color: base.ink }}>{sel.size >= selectable.length ? '☑' : '☐'} Select all ({selectable.length}){sel.size > 0 && sel.size < selectable.length ? ` · ${sel.size} selected` : ''}</Text>
        </Pressable>
      )}
      {mgr && picked.length > 0 && (
        <Card style={{ borderColor: base.ink, borderWidth: 1.5 }}>
          <SectionTitle>{done ? `${picked.length} completed order${picked.length > 1 ? 's' : ''} selected` : `${picked.length} request${picked.length > 1 ? 's' : ''} selected for a grouped order`}</SectionTitle>
          {!done && picked.length > 1 && <Button kind="ghost" title="🔗 Group into one request" onPress={() => void act(() => groupMaterials(picked), `${picked.length} requests grouped into one`)} />}
          <Button title={done ? `Send Again (${picked.length})` : picked.length > 1 ? `Send as one grouped order (${picked.length} items)` : 'Send Order (1 item)'} onPress={() => void startOrder(picked, done)} />
          {done && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Reopen selected" onPress={() => void act(() => reopenMaterials(picked), 'Reopened')} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Delete selected" onPress={() => void del(picked)} /></View>
            </View>
          )}
          <Button kind="ghost" title="Clear selection" onPress={() => setSel(new Set())} />
        </Card>
      )}

      {isLoading ? <Muted>Loading…</Muted> : entries.length ? entries.map((e) => {
        if (e.items.length < 2) return row(e.m);
        const ids = e.items.map((x) => x.id);
        if (done) {
          const k = `grp:${e.m.id}`;
          return (
            <View key={k}>
              <Pressable onPress={() => flip(k)} style={rowStyle}>
                {mgr && <Pressable onPress={() => toggle(ids)} hitSlop={8}><Text style={{ fontSize: 18 }}>{ids.every((x) => sel.has(x)) ? '☑' : '☐'}</Text></Pressable>}
                <Text style={{ flex: 1, color: base.ink, fontWeight: '700' }}>{open.has(k) ? '▼' : '▶'} {e.m.item} <Text style={{ color: '#4E1F6E' }}>· {e.items.length} items</Text>{fin && e.m.po_number ? <Text style={{ color: base.blue }}> · {e.m.po_number}</Text> : null}</Text>
                <Text style={{ fontSize: 11, color: base.slate }}>{doneTag(e.m)}</Text>
              </Pressable>
              {open.has(k) && (
                <View style={{ marginLeft: 8 }}>
                  <Muted>Grouped order{e.m.sent_at ? ` · sent ${long(e.m.sent_at)}` : ''}{mgr && e.m.merchant ? ` · ${e.m.merchant}` : ''} · {e.items.length} items</Muted>
                  {e.items.map((x) => <Card key={x.id}>{body(x)}</Card>)}
                </View>
              )}
            </View>
          );
        }
        const due = e.items.map((x) => x.required_by_date).filter(Boolean).sort()[0];
        return (
          <Card key={`g:${e.m.group_id}`} style={{ borderLeftWidth: 4, borderLeftColor: '#6A2C91' }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Pressable onPress={() => toggle(ids)} hitSlop={8}><Text style={{ fontSize: 18 }}>{ids.every((x) => sel.has(x)) ? '☑' : '☐'}</Text></Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>🔗 Grouped request · {e.items.length} items</Text>
                <Muted>{due ? `📅 First needed ${short(due)} · ` : ''}👷 {[...new Set(e.items.map((x) => nameOf(people, x.requested_by)))].join(', ')}</Muted>
              </View>
            </View>
            {e.items.map((x) => <Text key={x.id} style={{ color: base.ink, marginTop: 6 }}>• <Text style={{ fontWeight: '700' }}>{x.item}</Text> · Qty {x.qty || '1'}{x.order_note ? ` · 📝 ${x.order_note}` : ''}{x.sub_site_label ? ` · 📍 ${x.sub_site_label}` : ''}</Text>)}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Button title="🚚 Order from merchant" onPress={() => void startOrder(e.items, false)} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="📦 Add to collections" onPress={() => void collections(e.items)} /></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Ungroup" onPress={() => void act(() => ungroupMaterials(e.items), 'Ungrouped')} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Close request" onPress={async () => {
                if (await confirmAsk(`Close this grouped request (${e.items.length} items) without ordering?`, 'Close')) void close(e.items);
              }} /></View>
            </View>
          </Card>
        );
      }) : <Empty>{mgr ? (tab === 'pending' ? 'Nothing to action — no new requests from operatives.' : 'Nothing completed yet.') : `No ${tab === 'live' ? 'live' : 'closed'} material requests.`}</Empty>}

      {editing && <EditBox m={editing} busy={busy} onCancel={() => setEditing(null)} onSave={async (f) => {
        setBusy(true); const err = await editMaterial(me, id, editing.id, f, mgr); setBusy(false);
        if (err) { toast(err); return; }
        toast('Request updated'); setEditing(null); refresh();
      }} />}
      {(tab === 'live' || tab === 'pending') && !editing && (
        <RequestBox autoFocus={add === '1'} addrs={site.multi_site ? addrs ?? [] : null} busy={busy} onSubmit={async (f) => {
          setBusy(true); const ok = await addMaterial(me, id, f); setBusy(false);
          if (!ok) { toast('Could not save — try again.'); return false; }
          toast('Request added'); refresh(); return true;
        }} />
      )}
      {mgr && <Muted style={{ marginTop: space.m }}>Still to come here: adding new yard items and Import from Excel (both in Finance / the old app for now).</Muted>}
    </ScrollView>
  );
}

const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 12, marginBottom: 8 };
const doneTag = (m: Mat) => (m.status === 'cancelled' ? 'Cancelled' : m.merchant === 'Yard stock' ? 'Yard stock' : m.email_sent_at ? `Emailed ${long(m.email_sent_at)}` : wasOrdered(m) ? 'Ordered' : 'Closed');

function Chip({ text, tone }: { text: string; tone?: 'due' }) {
  return <Text style={{ fontSize: 11.5, color: tone === 'due' ? base.warn : base.slate, backgroundColor: base.paper, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' }}>{text}</Text>;
}

function RequestBox({ addrs, busy, autoFocus, onSubmit }: { addrs: SubAddr[] | null; busy: boolean; autoFocus: boolean; onSubmit: (f: { item: string; qty: string; requiredBy: string | null; sub: SubAddr | null }) => Promise<boolean> }) {
  const toast = useToast();
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('');
  const [by, setBy] = useState('');
  const [sub, setSub] = useState<SubAddr | null>(null);
  return (
    <Card style={{ marginTop: 18 }}>
      <SectionTitle>Request material</SectionTitle>
      {addrs && (
        <View style={{ marginBottom: 8 }}>
          <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Which address on this job?</Muted>
          {addrs.length ? addrs.map((a) => (
            <Pressable key={a.id} onPress={() => setSub(a)}><Text style={{ paddingVertical: 6, color: base.ink, fontWeight: sub?.id === a.id ? '700' : '400' }}>{sub?.id === a.id ? '◉' : '○'} {subAddrLabel(a)}</Text></Pressable>
          )) : <Muted>No addresses added to this job yet — add them in the job's Settings › Multi-Site.</Muted>}
        </View>
      )}
      <TextInput autoFocus={autoFocus} value={item} onChangeText={setItem} placeholder="Item" style={box} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={qty} onChangeText={setQty} placeholder="Quantity" style={[box, { flex: 1 }]} />
        <TextInput value={by} onChangeText={setBy} placeholder="Required by (YYYY-MM-DD)" autoCapitalize="none" style={[box, { flex: 1 }]} />
      </View>
      <Button busy={busy} title="Request Material Order" onPress={async () => {
        if (!item.trim()) return;
        if (addrs && addrs.length && !sub) { toast('Choose which address on this job.'); return; }
        const d = readIsoDate(by);
        if (d === 'bad') { toast('Enter the date as YYYY-MM-DD, e.g. 2026-11-03'); return; }
        if (d && d < localISODate(new Date())) { toast('The required-by date has passed.'); return; }
        if (await onSubmit({ item: item.trim(), qty: qty.trim(), requiredBy: d, sub })) { setItem(''); setQty(''); setBy(''); setSub(null); }
      }} />
    </Card>
  );
}

function EditBox({ m, busy, onSave, onCancel }: { m: Mat; busy: boolean; onSave: (f: { item: string; qty: string; requiredBy: string | null }) => void; onCancel: () => void }) {
  const toast = useToast();
  const [item, setItem] = useState(m.item);
  const [qty, setQty] = useState(m.qty || '');
  const [by, setBy] = useState(m.required_by_date || '');
  const sent = m.status === 'sent' || (m.status === 'closed' && !!m.merchant);
  return (
    <Card style={{ marginTop: 18, borderColor: base.ink, borderWidth: 1.5 }}>
      <SectionTitle>Edit material request</SectionTitle>
      {sent && <Text style={{ color: base.warn, marginBottom: 8 }}>This order has already been sent. Changing it here does not tell the supplier — use Send again if they need the new details.</Text>}
      <Muted style={{ fontWeight: '700' }}>Item</Muted>
      <TextInput value={item} onChangeText={setItem} style={box} />
      <Muted style={{ fontWeight: '700' }}>Quantity</Muted>
      <TextInput value={qty} onChangeText={setQty} style={box} />
      <Muted style={{ fontWeight: '700' }}>Required by (optional, YYYY-MM-DD)</Muted>
      <TextInput value={by} onChangeText={setBy} autoCapitalize="none" style={box} />
      <Button busy={busy} title="Save changes" onPress={() => {
        if (!item.trim()) { toast('Enter the item.'); return; }
        const d = readIsoDate(by);
        if (d === 'bad') { toast('Enter the date as YYYY-MM-DD, e.g. 2026-11-03'); return; }
        onSave({ item: item.trim(), qty: qty.trim(), requiredBy: d });
      }} />
      <Button kind="ghost" title="Cancel" onPress={onCancel} />
    </Card>
  );
}
