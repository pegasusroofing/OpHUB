// Projects does everything a PM needs; Finance is only the money (Andy, 8 Nov 2026), part 2. The pieces a manager uses on a
// job, with no money anywhere: the client's PO (Client Info), hired plant on and off hire (Plant), subcontract orders
// (Materials › Subcontract Orders) and the job's supplier POs (Material PO's). Finance adds the values.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { viewDoc } from '@/components/DocViewer';
import { FinForm } from '@/components/FinForm';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { CLIENT_PO_MAX_BYTES, deleteClientPo, saveClientPo } from '@/data/finBook';
import { openDocLink } from '@/data/hs';
import { amendSitePo, cancelSitePo, deletePlantHire, deleteSubOrder, PO_STATUS, poChangeable, poFiles, savePlantHire, saveSubOrder, useSiteClientPos, usePlantHires, useSitePos, useSubOrders, useSubPeople, type ClientPo, type PlantHire, type SitePo, type SubOrder } from '@/data/siteOrders';
import { useAuth } from '@/lib/auth';
import { base } from '@/theme/theme';

const fd = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const today = () => new Date().toISOString().slice(0, 10);
const head = (t: string) => <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginBottom: 8 }}>{t}</Text>;
const chip = (t: string) => <Text style={{ fontSize: 11, fontWeight: '600', color: base.ink, backgroundColor: '#F0F1F4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' }}>{t}</Text>;
const rowStyle = (i: number) => ({ paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' });

/* ---------- the client's PO (Client Info) ---------- */
export function ClientPoCard({ siteId }: { siteId: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: pos = [] } = useSiteClientPos(siteId);
  const [edit, setEdit] = useState<ClientPo | 'new' | null>(null);
  const [files, setFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  if (!me) return null;
  const po = edit && edit !== 'new' ? edit : null;
  const refresh = () => { ['siteClientPos', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const open = async (path: string, name: string) => { const u = await openDocLink('finance-docs', path); if (u) viewDoc(u, name); else toast('Could not open the file.'); };
  return (
    <Card>
      {head('CLIENT PO')}
      {pos.length ? pos.map((p, i) => (
        <View key={p.id} style={rowStyle(i)}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Client PO ${p.po_number}`} onPress={() => { setFiles([]); setEdit(p); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: base.ink }}>PO {p.po_number}{p.po_date ? <Text style={{ fontWeight: '400', color: base.slate }}> · {fd(p.po_date)}</Text> : null}</Text>
            {p.is_primary && pos.length > 1 && chip('Main')}
            <Text style={{ color: base.blue, fontWeight: '600' }}>Edit ›</Text>
          </Pressable>
          {!!p.description && <Muted style={{ marginTop: 2 }}>{p.description}</Muted>}
          {poFiles(p).map((f) => <Text key={f.path} onPress={() => void open(f.path, f.name)} style={{ color: base.blue, marginTop: 3 }}>📄 {f.name}</Text>)}
        </View>
      )) : <Muted>No client PO yet. It goes on every invoice and application.</Muted>}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}><Button small kind="ghost" title="+ Add Client PO" onPress={() => { setFiles([]); setEdit('new'); }} /></View>
      {edit && (
        <FinForm title={po ? `Client PO ${po.po_number}` : 'Client PO'} note="The client's order number and their PO. No value here: Finance keeps the contract value."
          initial={po ? { po_number: po.po_number, po_date: po.po_date || '', description: po.description || '', main: po.is_primary ? 'yes' : 'no' } : { po_date: today(), main: pos.length ? 'no' : 'yes' }}
          onClose={() => setEdit(null)}
          fields={[{ k: 'po_number', label: 'PO Number', half: true }, { k: 'po_date', label: 'Date', kind: 'date', half: true }, { k: 'description', label: 'Description (Optional)' }, ...(pos.length > (po ? 1 : 0) ? [{ k: 'main', label: 'The Main PO For This Job?', kind: 'choice' as const, options: [['yes', 'Yes'], ['no', 'No']] as [string, string][] }] : [])]}
          extra={(
            <View style={{ marginBottom: 6, gap: 4 }}>
              {po && poFiles(po).map((f) => <Text key={f.path} onPress={() => void open(f.path, f.name)} style={{ color: base.blue }}>📄 {f.name}</Text>)}
              {files.map((f) => <Text key={f.uri} style={{ color: base.ink }}>📎 {f.name} <Text style={{ color: base.slate }}>(Uploads When Saved)</Text></Text>)}
              <Pressable accessibilityRole="button" accessibilityLabel="Attach PO files" onPress={async () => {
                const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
                if (r.canceled || !r.assets.length) return;
                const big = r.assets.filter((a) => (a.size || 0) > CLIENT_PO_MAX_BYTES);
                if (big.length) toast(`${big.map((a) => a.name).join(', ')} ${big.length === 1 ? 'is' : 'are'} over 20 MB, so ${big.length === 1 ? 'it wasn’t' : 'they weren’t'} added.`);
                setFiles((x) => [...x, ...r.assets.filter((a) => (a.size || 0) <= CLIENT_PO_MAX_BYTES)]);
              }}><Text style={{ color: base.blue, fontWeight: '600' }}>📎 {po && poFiles(po).length ? 'Attach More Files' : 'Attach The PO'}</Text></Pressable>
            </View>
          )}
          onSave={async (v) => {
            const n = String(v.po_number || '').trim(); if (!n) return 'Enter the PO number.';
            const e = await saveClientPo(me, siteId, po?.id ?? null, { po_number: n, po_date: String(v.po_date || '') || null, description: String(v.description || '').trim() || null, is_primary: !pos.length || v.main === 'yes' || (!!po?.is_primary && pos.length === 1) }, files.map((f) => ({ uri: f.uri, name: f.name || 'PO', mimeType: f.mimeType, size: f.size })));
            if (e) return e;
            setFiles([]); refresh(); return null;
          }}
          onDelete={po ? async () => ((await deleteClientPo(po.id)) ? (refresh(), null) : 'Could not remove — try again.') : undefined} />
      )}
    </Card>
  );
}

/* ---------- hired plant (Plant) ---------- */
export function HiredPlantCard({ siteId }: { siteId: string }) {
  const qc = useQueryClient();
  const { data: hires = [] } = usePlantHires(siteId);
  const [edit, setEdit] = useState<PlantHire | 'new' | null>(null);
  const [off, setOff] = useState<PlantHire | null>(null);
  const h = edit && edit !== 'new' ? edit : null;
  const refresh = () => { ['sitePlantHires', 'finPurchases', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const onHire = hires.filter((x) => !x.off_hire);
  return (
    <Card>
      {head(`HIRED PLANT${onHire.length ? ` · ${onHire.length} ON HIRE` : ''}`)}
      {hires.length ? hires.map((x, i) => (
        <View key={x.id} style={[rowStyle(i), { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${x.item}, change`} onPress={() => setEdit(x)} style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink }}>{x.item}</Text>
            <Muted>{[x.supplier_name, x.hire_ref ? `Ref ${x.hire_ref}` : '', `On Hire ${fd(x.on_hire)}`, x.off_hire ? `Off Hire ${fd(x.off_hire)}` : ''].filter(Boolean).join(' · ')}</Muted>
          </Pressable>
          {x.off_hire ? chip('Off Hire') : <Button small kind="ghost" title="Off Hire" onPress={() => setOff(x)} />}
        </View>
      )) : <Muted>Nothing on hire. Put plant on hire here; Finance adds the rate.</Muted>}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}><Button small kind="ghost" title="+ Plant On Hire" onPress={() => setEdit('new')} /></View>
      {edit && (
        <FinForm title={h ? h.item : 'Plant On Hire'} note="What's on hire and when. Finance adds the hire rate." onClose={() => setEdit(null)}
          initial={h ? { item: h.item, supplier: h.supplier_name || '', ref: h.hire_ref || '', on: h.on_hire, off: h.off_hire || '', notes: h.notes || '' } : { on: today() }}
          fields={[{ k: 'item', label: 'What’s On Hire' }, { k: 'supplier', label: 'Supplier', half: true }, { k: 'ref', label: 'Hire Ref', half: true }, { k: 'on', label: 'On Hire', kind: 'date', half: true }, { k: 'off', label: 'Off Hire (Blank = Still On Hire)', kind: 'date', half: true }, { k: 'notes', label: 'Notes', kind: 'multiline' }]}
          onSave={async (v) => { const e = await savePlantHire(siteId, h?.id ?? null, { item: String(v.item || '').trim(), supplier: String(v.supplier || ''), ref: String(v.ref || ''), on: String(v.on || ''), off: String(v.off || ''), notes: String(v.notes || '') }); if (!e) refresh(); return e; }}
          onDelete={h && !h.costed ? async () => { const e = await deletePlantHire(h.id); if (!e) refresh(); return e; } : undefined} />
      )}
      {off && (
        <FinForm title={`Off Hire: ${off.item}`} saveLabel="Off Hire" onClose={() => setOff(null)} initial={{ off: today() }} fields={[{ k: 'off', label: 'Off Hire Date', kind: 'date' }]}
          onSave={async (v) => { const e = await savePlantHire(siteId, off.id, { item: off.item, supplier: off.supplier_name || '', ref: off.hire_ref || '', on: off.on_hire, off: String(v.off || '') || today(), notes: off.notes || '' }); if (e) return e; refresh(); return null; }} />
      )}
    </Card>
  );
}

/* ---------- subcontract orders (Materials › Subcontract Orders) ---------- */
export function SubOrdersList({ siteId }: { siteId: string }) {
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useSubOrders(siteId);
  const [edit, setEdit] = useState<SubOrder | 'new' | null>(null);
  const { data: people = [] } = useSubPeople(!!edit);
  const sc = edit && edit !== 'new' ? edit : null;
  const refresh = () => { ['siteSubOrders', 'finSubs', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  if (isLoading) return <Muted>Loading…</Muted>;
  return (
    <View>
      <Muted style={{ marginBottom: 10 }}>Who’s doing what on this job. Finance adds the order value, CIS and retention, and pays their applications.</Muted>
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10 }}><Button title="+ New Subcontract Order" onPress={() => setEdit('new')} /></View>
      {list.length ? (
        <Card>
          {list.map((x, i) => (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`${x.number} ${x.name}`} onPress={() => setEdit(x)} style={[rowStyle(i), { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink }}>{x.number} · {x.name}</Text>
                {!!x.description && <Muted>{x.description}</Muted>}
                <Muted style={{ fontSize: 11.5 }}>{x.valued ? 'Valued In Finance' : 'Finance To Add The Value'}</Muted>
              </View>
              {chip(x.status === 'complete' ? 'Complete' : 'Active')}
              <Text style={{ color: base.slate, fontSize: 18 }}>›</Text>
            </Pressable>
          ))}
        </Card>
      ) : <Muted style={{ textAlign: 'center' }}>No subcontract orders on this job yet.</Muted>}
      {edit && (
        <FinForm title={sc ? `${sc.number} · ${sc.name}` : 'New Subcontract Order'} onClose={() => setEdit(null)}
          initial={sc ? { name: sc.name, email: sc.email || '', description: sc.description || '', notes: sc.notes || '', status: sc.status === 'complete' ? 'complete' : 'active' } : { worker: '' }}
          onChange={(k, next) => { if (k !== 'worker') return; const w = people.find((p) => p.id === next.worker); return w ? { name: w.name, email: w.email || '' } : undefined; }}
          fields={[
            ...(!sc && people.length ? [{ k: 'worker', label: 'From Your Subcontractors (Optional)', kind: 'choice' as const, options: [['', 'Someone Else'], ...people.map((p) => [p.id, p.name] as [string, string])] as [string, string][] }] : []),
            { k: 'name', label: 'Subcontractor', half: true }, { k: 'email', label: 'Email', kind: 'email', half: true },
            { k: 'description', label: 'Scope Of Works', kind: 'multiline', ph: 'E.g. Leadwork to chimneys and valleys' },
            { k: 'notes', label: 'Notes', kind: 'multiline' },
            ...(sc ? [{ k: 'status', label: 'Status', kind: 'choice' as const, options: [['active', 'Active'], ['complete', 'Complete']] as [string, string][] }] : []),
          ]}
          onSave={async (v) => { const e = await saveSubOrder(siteId, sc?.id ?? null, { name: String(v.name || '').trim(), email: String(v.email || '').trim(), description: String(v.description || ''), notes: String(v.notes || ''), status: sc ? String(v.status || 'active') : undefined, worker: sc ? null : String(v.worker || '') || null }); if (!e) refresh(); return e; }}
          onDelete={sc && !sc.valued ? async () => { const e = await deleteSubOrder(sc.id); if (!e) refresh(); return e; } : undefined} />
      )}
    </View>
  );
}

/* ---------- the job's supplier POs, no prices (Material PO's) ---------- */
export function SitePosCard({ siteId }: { siteId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: pos = [] } = useSitePos(siteId);
  const [open, setOpen] = useState('');
  const [form, setForm] = useState<{ k: 'date' | 'note' | 'lines'; po: SitePo } | null>(null);
  if (!pos.length) return null;
  const refresh = () => { ['sitePos', 'materials', 'finPurchases', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const lineText = (l: SitePo['items'][number]) => `${l.qty ? `${l.qty} × ` : ''}${l.item || 'Item'}${l.sub_label ? ` (${l.sub_label})` : ''}`;
  const act = async (po: SitePo) => {
    const k = await chooseAction(`PO ${po.number}`, [
      { key: 'date', label: 'Change The Delivery Date' }, { key: 'note', label: 'Change The Note' },
      ...(po.items.length > 1 ? [{ key: 'lines', label: 'Take Lines Off' }] : []), { key: 'cancel', label: 'Cancel The PO' },
    ]);
    if (!k) return;
    if (k === 'cancel') {
      if (!(await confirmAsk(`Cancel PO ${po.number}? Its material requests are cancelled too. This doesn’t email ${po.supplier_name || 'the supplier'}, so let them know.`, 'Cancel The PO', 'Keep It'))) return;
      const r = await cancelSitePo(po.id); if (r.error) { toast(r.error); return; }
      refresh(); return;
    }
    setForm({ k: k as 'date' | 'note' | 'lines', po });
  };
  return (
    <Card>
      {head('PURCHASE ORDERS')}
      <Muted style={{ marginBottom: 6 }}>This job’s orders, without prices. Changes here don’t email the supplier, so let them know.</Muted>
      {pos.map((p, i) => (
        <View key={p.id} style={rowStyle(i)}>
          <Pressable accessibilityRole="button" accessibilityLabel={`PO ${p.number}`} onPress={() => setOpen(open === p.id ? '' : p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink }}>{p.number} · {p.supplier_name || 'Supplier'}{p.supplier_branch ? ` (${p.supplier_branch})` : ''}</Text>
              <Muted>{[`${p.items.length} Line${p.items.length === 1 ? '' : 's'}`, p.required_by ? `Needed ${fd(p.required_by)}` : '', p.ordered_by_name ? `By ${p.ordered_by_name}` : ''].filter(Boolean).join(' · ')}</Muted>
            </View>
            {chip(p.invoiced && p.status === 'open' ? 'Invoiced In Part' : PO_STATUS[p.status] || p.status)}
            <Text style={{ color: base.slate }}>{open === p.id ? '▴' : '▾'}</Text>
          </Pressable>
          {open === p.id && (
            <View style={{ marginTop: 6, paddingLeft: 4 }}>
              {p.items.map((l, j) => <Text key={j} style={{ fontSize: 13, color: base.ink, marginTop: 2 }}>{lineText(l)}{l.material_id && p.received[l.material_id] ? '  ✓ Received' : ''}</Text>)}
              {!!p.note && <Muted style={{ marginTop: 4 }}>Note: {p.note}</Muted>}
              {poChangeable(p) ? <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8 }}><Button small kind="ghost" title="Change ▾" onPress={() => void act(p)} /></View>
                : p.status === 'open' ? <Muted style={{ marginTop: 6 }}>It has invoices against it, so it’s changed in Finance.</Muted> : null}
            </View>
          )}
        </View>
      ))}
      {form?.k === 'date' && (
        <FinForm title={`PO ${form.po.number}: Delivery Date`} onClose={() => setForm(null)} initial={{ d: form.po.required_by || '' }} fields={[{ k: 'd', label: 'Needed On', kind: 'date' }]}
          onSave={async (v) => { if (!v.d) return 'Choose the date.'; const r = await amendSitePo(form.po.id, { required: String(v.d) }); if (r.error) return r.error; refresh(); return null; }} />
      )}
      {form?.k === 'note' && (
        <FinForm title={`PO ${form.po.number}: Note`} onClose={() => setForm(null)} initial={{ n: form.po.note || '' }} fields={[{ k: 'n', label: 'Note', kind: 'multiline' }]}
          onSave={async (v) => { const r = await amendSitePo(form.po.id, { note: String(v.n || '') }); if (r.error) return r.error; refresh(); return null; }} />
      )}
      {form?.k === 'lines' && (
        <FinForm title={`PO ${form.po.number}: Take Lines Off`} saveLabel="Take Them Off" note="Tick the lines to take off. Their material requests are cancelled. Lines already received stay." onClose={() => setForm(null)}
          fields={form.po.items.map((l, j) => ({ k: `l${j}`, label: lineText(l), kind: 'check' as const })).filter((_, j) => !(form.po.items[j].material_id && form.po.received[form.po.items[j].material_id as string]))}
          onSave={async (v) => {
            const drop = form.po.items.map((_, j) => j).filter((j) => !!v[`l${j}`]);
            if (!drop.length) return 'Tick at least one line.';
            const r = await amendSitePo(form.po.id, { drop }); if (r.error) return r.error; refresh(); return null;
          }} />
      )}
    </Card>
  );
}
