// The enquiry's details (Andy, 11 Nov 2026): New Enquiry, and Edit Details on a quote. Every box the same height and lined
// up; Discipline and Who Is Pricing It are drop-downs; Discipline Other lets you type your own; Save For This Client sits
// level with the mark-up box at the same height; + Multiple Clients picks the other clients tendering the same job.
// Picking a client fills the contact from its estimator (Directory › Estimating) only, not its accounts email; with none
// saved, Save To Directory keeps the contact typed in as their estimator (Andy, 11 Nov 2026).
import * as DocumentPicker from 'expo-document-picker';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { Pop } from '@/components/Pop';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { clientId, receivedOn, searchClients, setClientEstimator, setClientMarkup, type ClientHit, type Quote } from '@/data/quotes';
import { useAuth } from '@/lib/auth';
import { DISCIPLINES } from '@/lib/rules/quotes';
import { base, radius, space, useDesk } from '@/theme/theme';

// chase: from the client's Directory › Estimating setting when one is picked ('no' starts a new quote with the chaser off).
export type QForm = { client: string; contact: string; email: string; phone: string; title: string; address: string; postcode: string; discipline: string; other: string; markup: string; pricedBy: string; pricedName: string; received: string; ret: string; notes: string; chase?: '' | 'yes' | 'no' };
export const EMPTY_FORM: QForm = { client: '', contact: '', email: '', phone: '', title: '', address: '', postcode: '', discipline: '', other: '', markup: '', pricedBy: '', pricedName: '', received: '', ret: '', notes: '', chase: '' };
export const formOf = (q: Quote): QForm => {
  const known = !q.discipline || DISCIPLINES.includes(q.discipline);
  return { client: q.client_name, contact: q.contact_name ?? '', email: q.contact_email ?? '', phone: q.contact_phone ?? '', title: q.title, address: q.address ?? '', postcode: q.postcode ?? '', discipline: known ? q.discipline ?? '' : 'Other', other: known ? '' : q.discipline ?? '', markup: q.guide_markup_pct == null ? '' : String(q.guide_markup_pct), pricedBy: q.priced_by ?? '', pricedName: q.priced_by_name ?? '', received: receivedOn(q) ?? '', ret: q.return_date ?? '', notes: q.notes ?? '' };
};
/** Discipline as saved: Other with words typed is those words. */
export const disciplineOf = (v: QForm) => (v.discipline === 'Other' && v.other.trim() ? v.other.trim() : v.discipline || null);

const H = 44; // every box on the form is this tall
const lab = { fontSize: 12, fontWeight: '600' as const, color: base.slate, marginBottom: 4 };
const boxStyle = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 12, height: H, fontSize: 15, color: base.ink, backgroundColor: base.card };
export function QBox({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize, multiline, tall }: { label: string; value: string; onChangeText: (t: string) => void; placeholder?: string; keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'decimal-pad' | 'number-pad'; autoCapitalize?: 'none' | 'words'; multiline?: boolean; tall?: boolean }) {
  return (
    <View style={{ marginBottom: space.m }}>
      <Text style={lab}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={base.slateLight} keyboardType={keyboardType} autoCapitalize={autoCapitalize} multiline={multiline}
        style={[boxStyle, multiline ? { height: tall ? 220 : 88, paddingTop: 10, textAlignVertical: 'top' } : null]} />
    </View>
  );
}
export function QPick({ label, value, placeholder = 'Choose…', onPress }: { label: string; value: string; placeholder?: string; onPress: () => void }) {
  return (
    <View style={{ marginBottom: space.m }}>
      <Text style={lab}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ ...boxStyle, flexDirection: 'row', alignItems: 'center' }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: value ? base.ink : base.slateLight }}>{value || placeholder}</Text>
        <Text style={{ color: base.slate, fontSize: 12 }}>▾</Text>
      </Pressable>
    </View>
  );
}
const Two = ({ desk, children }: { desk: boolean; children: ReactNode }) => <View style={desk ? { flexDirection: 'row', gap: 10 } : undefined}>{children}</View>;
const Half = ({ desk, children }: { desk: boolean; children: ReactNode }) => <View style={desk ? { flex: 1, minWidth: 0 } : undefined}>{children}</View>;

/** Pick the other clients tendering the same job: search the Directory and tick as many as you like. */
export function ClientsPop({ have, onDone, onClose }: { have: string[]; onDone: (picked: { name: string; email?: string | null; phone?: string | null; contact?: string | null }[]) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [picked, setPicked] = useState<{ name: string; email?: string | null; phone?: string | null; contact?: string | null }[]>([]);
  const taken = (n: string) => [...have, ...picked.map((p) => p.name)].some((x) => x.toLowerCase() === n.toLowerCase());
  return (
    <Pop title="Clients Tendering" onClose={onClose} footer={(
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}>
        <Button title={picked.length ? `Add ${picked.length} Client${picked.length === 1 ? '' : 's'}` : 'Done'} onPress={() => onDone(picked)} />
      </View>
    )}>
      <Muted style={{ marginBottom: 8 }}>The same job priced for more than one client. Tick each one.</Muted>
      <TextInput accessibilityLabel="Search clients" value={q} autoFocus placeholder="Search Your Directory" placeholderTextColor={base.slateLight} style={{ ...boxStyle, marginBottom: 8 }}
        onChangeText={(t) => { setQ(t); if (t.trim().length >= 2) void searchClients(t.trim()).then(setHits); else setHits([]); }} />
      {picked.map((p) => (
        <Pressable key={p.name} onPress={() => setPicked(picked.filter((x) => x.name !== p.name))} style={{ flexDirection: 'row', gap: 8, paddingVertical: 8 }}>
          <Text style={{ fontSize: 15 }}>☑</Text><Text style={{ flex: 1, color: base.ink, fontWeight: '600' }}>{p.name}</Text>
        </Pressable>
      ))}
      {hits.filter((h) => !taken(h.name)).map((h) => (
        <Pressable key={h.id} onPress={() => setPicked([...picked, { name: h.name, email: h.estimator_email || h.email, phone: h.estimator_phone || h.phone, contact: h.estimator_name || null }])} style={{ flexDirection: 'row', gap: 8, paddingVertical: 8 }}>
          <Text style={{ fontSize: 15 }}>☐</Text><Text style={{ flex: 1, color: base.ink }}>{h.name}</Text>
        </Pressable>
      ))}
      {q.trim().length >= 2 && !taken(q.trim()) && !hits.some((h) => h.name.toLowerCase() === q.trim().toLowerCase()) && (
        <Pressable onPress={() => { setPicked([...picked, { name: q.trim() }]); setQ(''); setHits([]); }} style={{ paddingVertical: 8 }}>
          <Text style={{ color: base.blue, fontWeight: '600' }}>+ Add &quot;{q.trim()}&quot; As A New Client</Text>
        </Pressable>
      )}
    </Pop>
  );
}

export function QuoteForm({ v, setV, isNew, people, others, onOthers, docs, setDocs, busy, onSave, onCancel, saveTitle }: {
  v: QForm; setV: (f: (x: QForm) => QForm) => void; isNew: boolean; people: { id: string; name: string | null; email?: string | null }[];
  others: { name: string }[]; onOthers: () => void; docs?: { uri: string; name: string }[]; setDocs?: (d: { uri: string; name: string }[]) => void;
  busy: string; onSave: () => void; onCancel?: () => void; saveTitle: string;
}) {
  const { me } = useAuth();
  const toast = useToast();
  const desk = useDesk();
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [picked, setPicked] = useState<ClientHit | null>(null);
  const [saving, setSaving] = useState(false);
  const [estSaved, setEstSaved] = useState('');
  const set = (k: keyof QForm) => (t: string) => setV((f) => ({ ...f, [k]: t }));
  const typeClient = (t: string) => { set('client')(t); if (t.trim().length >= 2) void searchClients(t.trim()).then(setHits); else setHits([]); };
  // The client picked from the list, if the name hasn't been changed since.
  const pk = picked && picked.name.toLowerCase() === v.client.trim().toLowerCase() ? picked : null;
  // Save To Directory (Andy, 11 Nov 2026): on a new enquiry, when the client has no estimator saved yet and a contact is
  // typed in, keep them as the client's estimator in Directory › Estimating.
  const hasContact = !!(v.contact.trim() || v.email.trim() || v.phone.trim());
  const canSaveEst = isNew && !!v.client.trim() && hasContact && estSaved !== v.client.trim().toLowerCase() && !(pk && (pk.estimator_name || pk.estimator_email || pk.estimator_phone));
  const saveEst = async () => {
    const name = v.client.trim(), email = v.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Check the email address.'); return; }
    setSaving(true);
    // Typed rather than picked: an existing client's estimator is only replaced if you say so.
    const known = pk ?? (await searchClients(name)).find((h) => h.name.toLowerCase() === name.toLowerCase()) ?? null;
    if (known && (known.estimator_name || known.estimator_email || known.estimator_phone)) {
      setSaving(false);
      if (!(await confirmAsk(`${known.name} already has ${known.estimator_name || known.estimator_email} as their estimator. Replace them?`, 'Yes', 'No'))) return;
      setSaving(true);
    }
    const cid = known?.id ?? (await clientId(name, email, v.phone.trim()));
    const err = cid ? await setClientEstimator(cid, { name: v.contact.trim(), email, phone: v.phone.trim() }) : 'Could not add the client to the Directory.';
    setSaving(false);
    if (err) { toast(err); return; }
    setPicked({ ...(known ?? { id: cid as string, name, email: null, phone: null }), estimator_name: v.contact.trim() || null, estimator_email: email || null, estimator_phone: v.phone.trim() || null });
    setEstSaved(name.toLowerCase());
  };
  const canSaveMarkup = !!v.client.trim() && v.markup.trim() !== '' && (picked ? String(picked.markup ?? '') !== v.markup.trim() : true);
  return (
    <Card>
      <SectionTitle>Customer</SectionTitle>
      <QBox label="Client *" value={v.client} onChangeText={typeClient} placeholder="Start Typing To Search Your Directory" />
      {hits.filter((h) => h.name.toLowerCase() !== v.client.trim().toLowerCase()).map((h) => (
        <Pressable key={h.id} onPress={() => { setV((f) => ({ ...f, client: h.name, contact: f.contact || h.estimator_name || '', email: f.email || h.estimator_email || '', phone: f.phone || h.estimator_phone || '', markup: f.markup || (h.markup != null ? String(h.markup) : ''), chase: h.quote_chase === false ? 'no' : 'yes' })); setPicked(h); setHits([]); }} style={{ paddingVertical: 8, marginTop: -6 }}>
          <Text style={{ color: base.blue, fontWeight: '600' }}>{h.name}</Text>
        </Pressable>
      ))}
      {/* Other clients pricing the same job: a button, not a box on the page (Andy, 11 Nov 2026). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: space.m }}>
        {others.map((o) => <Text key={o.name} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: base.line, color: base.ink, fontSize: 12.5, overflow: 'hidden' }}>{o.name}</Text>)}
        <Button small kind="ghost" title={others.length ? '+ More Clients' : '+ Multiple Clients'} onPress={onOthers} />
      </View>
      <QBox label="Contact Name" value={v.contact} onChangeText={set('contact')} />
      <Two desk={desk}>
        <Half desk={desk}><QBox label="Contact Number" value={v.phone} onChangeText={set('phone')} keyboardType="phone-pad" /></Half>
        <Half desk={desk}><QBox label="Contact Email (For The Chaser)" value={v.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" /></Half>
      </Two>
      {canSaveEst && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -4, marginBottom: space.m }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Save To Directory" disabled={saving} onPress={() => void saveEst()}
            style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.input, backgroundColor: '#DFE3EA', alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '500', color: base.ink }}>{saving ? 'Saving…' : 'Save To Directory'}</Text>
          </Pressable>
          <Muted style={{ flex: 1, fontSize: 12 }}>Keeps this contact as {v.client.trim()}’s estimator (Directory › Estimating).</Muted>
        </View>
      )}
      {isNew && estSaved === v.client.trim().toLowerCase() && !!estSaved && <Muted style={{ marginTop: -4, marginBottom: space.m, fontSize: 12 }}>✓ In The Directory As {v.client.trim()}’s Estimator</Muted>}
      <SectionTitle>Project</SectionTitle>
      <QBox label="Project Name *" value={v.title} onChangeText={set('title')} />
      <Two desk={desk}>
        <Half desk={desk}><QBox label="Address" value={v.address} onChangeText={set('address')} /></Half>
        <Half desk={desk}><QBox label="Postcode" value={v.postcode} onChangeText={(t) => set('postcode')(t.toUpperCase())} /></Half>
      </Two>
      <Two desk={desk}>
        <Half desk={desk}><QPick label="Discipline" value={v.discipline} onPress={async () => { const k = await chooseAction('Discipline', DISCIPLINES.map((d) => ({ key: d, label: `${v.discipline === d ? '✓ ' : ''}${d}` }))); if (k) set('discipline')(k); }} /></Half>
        <Half desk={desk}>{v.discipline === 'Other' ? <QBox label="Discipline (Type It)" value={v.other} onChangeText={set('other')} placeholder="e.g. Cladding" /> : (
          <QPick label={isNew ? 'Who Is Pricing It' : 'Priced By'} value={v.pricedName || (isNew ? `${me?.name || 'Me'} (Me)` : '')} onPress={async () => { const k = await chooseAction(isNew ? 'Who Is Pricing It' : 'Priced By', people.map((p) => ({ key: p.id, label: p.name || p.email || 'Unknown' }))); const p = people.find((x) => x.id === k); if (p) setV((f) => ({ ...f, pricedBy: p.id, pricedName: p.name || '' })); }} />
        )}</Half>
      </Two>
      {v.discipline === 'Other' && <QPick label={isNew ? 'Who Is Pricing It' : 'Priced By'} value={v.pricedName || (isNew ? `${me?.name || 'Me'} (Me)` : '')} onPress={async () => { const k = await chooseAction(isNew ? 'Who Is Pricing It' : 'Priced By', people.map((p) => ({ key: p.id, label: p.name || p.email || 'Unknown' }))); const p = people.find((x) => x.id === k); if (p) setV((f) => ({ ...f, pricedBy: p.id, pricedName: p.name || '' })); }} />}
      {/* Guide mark-up: the client's estimating mark-up from the Directory to start; Save For This Client makes a new figure theirs. */}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginBottom: space.m }}>
        <View style={{ flex: 1 }}>
          <Text style={lab}>Guide Mark-Up %</Text>
          <TextInput accessibilityLabel="Guide Mark-Up %" value={v.markup} onChangeText={set('markup')} keyboardType="decimal-pad" placeholder={picked?.markup != null ? `${picked.markup} (Client)` : 'e.g. 15'} placeholderTextColor={base.slateLight} style={boxStyle} />
        </View>
        {canSaveMarkup && (
          <Pressable accessibilityRole="button" accessibilityLabel="Save For This Client" disabled={saving} onPress={async () => {
            const n = Number(v.markup.replace(/[%\s]/g, '')); if (!isFinite(n)) { toast('The mark-up needs to be a number.'); return; }
            setSaving(true);
            const cid = picked?.id ?? (await clientId(v.client.trim(), v.email.trim(), v.phone.trim()));
            const ok = !!cid && (await setClientMarkup(cid, n));
            setSaving(false);
            if (ok) setPicked({ ...(picked ?? { id: cid as string, name: v.client.trim(), email: null, phone: null }), markup: n }); else toast('Could not save it to the client.');
          }} style={{ flex: 1, height: H, borderRadius: radius.input, backgroundColor: '#DFE3EA', alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '500', color: base.ink }}>{saving ? 'Saving…' : 'Save For This Client'}</Text>
          </Pressable>
        )}
      </View>
      <Two desk={desk}>
        <Half desk={desk}>
          <Text style={lab}>Enquiry Received</Text>
          <DateBox value={v.received} onChange={set('received')} title="Enquiry Received" style={{ marginBottom: space.m, height: H, paddingVertical: 0 }} />
        </Half>
        <Half desk={desk}>
          <Text style={lab}>Tender Due Back</Text>
          <DateBox value={v.ret} onChange={set('ret')} title="Tender Due Back" style={{ marginBottom: space.m, height: H, paddingVertical: 0 }} />
        </Half>
      </Two>
      <QBox label="Notes And Feedback" value={v.notes} onChangeText={set('notes')} multiline />
      {isNew && docs && setDocs && (
        <View style={{ marginBottom: space.m }}>
          <Text style={lab}>Tender Documents</Text>
          {docs.map((d, i) => <Pressable key={d.uri} onPress={() => setDocs(docs.filter((_, j) => j !== i))}><Text style={{ color: base.ink, paddingVertical: 3 }}>📎 {d.name}  ✕</Text></Pressable>)}
          <Button kind="ghost" title="📎 Add Documents" onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true }); if (!r.canceled) setDocs([...docs, ...r.assets.map((a) => ({ uri: a.uri, name: a.name || 'file' }))]); }} />
          <Muted style={{ marginTop: 6 }}>They go in the enquiry’s 1. Tender Documents folder in OneDrive.</Muted>
        </View>
      )}
      {busy && busy !== 'save' && isNew ? <Muted style={{ marginBottom: 8, textAlign: 'center' }}>{busy}</Muted> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        <View style={{ flex: 2 }}><Button busy={!!busy} title={saveTitle} onPress={onSave} /></View>
        {onCancel && <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={onCancel} /></View>}
      </View>
    </Card>
  );
}
