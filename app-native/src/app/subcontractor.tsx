// The public subcontractor sign-up form, in the new app (Andy, 18 Nov 2026: "The sign up link in the beta is still a
// html, can we change that for beta but keep the html link live for old original app?"). The same questions, files and
// declaration as subcontractor.html, sent to the same server function (subcontractor-apply: org, upload, submit), so
// applications land in Admin › People › Subcontractor Sign-Up either way. No sign-in: /subcontractor?org=<company id>.
// subcontractor.html stays for the current app's links.
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { SelectBox } from '@/components/SelectBox';
import { Button } from '@/components/ui';
import { fnUrl, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { base, radius, useDesk } from '@/theme/theme';

type Org = { name?: string; colour?: string; logo?: string };
type Pick = { label: string; name: string; size: number; type: string; file: Blob | null; uri: string };
type Op = { name: string; trade: string; card: string; expiry: string };

const TRADES = ['Flat roofing — felt', 'Single ply / EPDM', 'Liquid roofing', 'Pitched roofing — tiling / slating', 'Leadwork', 'Roof carpentry', 'Cladding', 'Fascias, soffits & gutters', 'Green roofs', 'Scaffolding', 'Labour only', 'Other'];
const ACCREDS = ['CHAS', 'SMAS Worksafe', 'Constructionline', 'SafeContractor', 'Acclaim', 'NFRC', 'CompetentRoofer', 'ISO 9001', 'ISO 14001', 'ISO 45001'];
const opt = (l: string[]): [string, string][] => l.map((x) => [x, x]);
// Each document box: what it's called on the application, whether one or several, required, and what it takes.
const FILES = [
  { label: 'Public liability certificate', title: 'Public Liability Certificate', multi: false, req: true },
  { label: 'Employers liability certificate', title: 'Employers Liability Certificate', multi: false, req: false },
  { label: 'Accreditation certificate', title: 'Accreditation Certificates', multi: true, req: false },
  { label: 'H&S policy', title: 'H&S Policy Document', multi: false, req: false },
  { label: 'CSCS / skills card', title: 'CSCS / Skills Cards', multi: true, req: false },
];
const OK_TYPE = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif|gif)|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
const REQ: [string, string][] = [['company_name', 'Company Name'], ['company_type', 'Business Type'], ['cis_status', 'CIS Status'], ['address', 'Business Address'], ['postcode', 'Postcode'],
  ['contact_name', 'Your Name'], ['email', 'Email'], ['phone', 'Mobile'], ['trades', 'Trades'], ['pl_cover', 'Public Liability Cover'], ['pl_expiry', 'Public Liability Expiry'],
  ['hs_policy', 'H&S Policy'], ['rams_ability', 'Own RAMS'], ['riddor', 'RIDDOR Incidents'], ['enforcement', 'HSE Notices']];

/** A key for this form's uploads (made once, when it opens). */
const newKey = () => `${Date.now().toString(36)}${Math.random().toString(16).slice(2)}`.replace(/[^a-z0-9-]/gi, '').slice(0, 36);

/** One question: its label (red when it needs filling in), a hint, and its box. Outside the page so boxes keep focus. */
function QBox({ label, req, children, hint, bad, desk }: { label: string; req?: boolean; children: ReactNode; hint?: string; bad: boolean; desk: boolean }) {
  return (
    <View style={{ marginVertical: 8 }}>
      <Text style={{ fontWeight: '700', fontSize: 14, color: bad ? base.warn : base.ink, marginBottom: 5 }}>{label}{req ? <Text style={{ color: base.warn }}> *</Text> : null}</Text>
      {!!hint && <Text style={{ fontSize: 12.5, color: base.slate, marginTop: -3, marginBottom: 5 }}>{hint}</Text>}
      {children}
    </View>
  );
}

async function api<T>(org: string, payload: Record<string, unknown>): Promise<T> {
  const r = await fetch(fnUrl('subcontractor-apply'), {
    method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ org, ...payload }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || 'Something went wrong — please try again.');
  return d as T;
}

export default function SubcontractorSignUp() {
  const { org: orgParam } = useLocalSearchParams<{ org?: string }>();
  const org = typeof orgParam === 'string' ? orgParam : '';
  const desk = useDesk();
  const [key] = useState(newKey); // this form's own folder for its uploads
  const [info, setInfo] = useState<Org | null>(null);
  const [fetchErr, setFetchErr] = useState('');
  const loadErr = org ? fetchErr : 'This link is missing its company. Ask for the link again.';
  const [v, setV] = useState<Record<string, string | string[]>>({ trades: [], accreditations: [] });
  const [ops, setOps] = useState<Op[]>([{ name: '', trade: '', card: '', expiry: '' }, { name: '', trade: '', card: '', expiry: '' }]);
  const [files, setFiles] = useState<Pick[]>([]);
  const [agree, setAgree] = useState(false);
  const [signed, setSigned] = useState('');
  const [bad, setBad] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (org) api<Org>(org, { action: 'org' }).then(setInfo).catch((e: Error) => setFetchErr(e.message));
  }, [org]);
  const brand = info?.colour && /^#[0-9a-f]{6}$/i.test(info.colour) ? info.colour : base.blue;
  const name = info?.name || 'us';
  const s = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
  const set = (k: string) => (x: string) => setV((o) => ({ ...o, [k]: x }));
  const list = (k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);
  const flip = (k: string, x: string) => setV((o) => { const l = Array.isArray(o[k]) ? (o[k] as string[]) : []; return { ...o, [k]: l.includes(x) ? l.filter((y) => y !== x) : [...l, x] }; });
  const isBad = (k: string) => bad.includes(k);
  const box = (k?: string) => ({ borderWidth: 1.5, borderColor: k && isBad(k) ? base.warn : base.line, borderRadius: radius.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: base.ink, backgroundColor: '#fff' });

  const text = (k: string, label: string, o: { req?: boolean; ph?: string; multi?: boolean; kb?: 'email-address' | 'phone-pad' | 'number-pad' } = {}) => (
    <QBox desk={desk} bad={isBad(k)} label={label} req={o.req}>
      <TextInput value={s(k)} onChangeText={set(k)} placeholder={o.ph} placeholderTextColor={base.slateLight} accessibilityLabel={label} multiline={o.multi} keyboardType={o.kb}
        autoCapitalize={o.kb === 'email-address' ? 'none' : 'sentences'} style={[box(k), o.multi ? { minHeight: 80, textAlignVertical: 'top' } : null]} />
    </QBox>
  );
  const choose = (k: string, label: string, opts: string[], req?: boolean) => (
    <QBox desk={desk} bad={isBad(k)} label={label} req={req}><SelectBox title={label} value={s(k) || null} options={opt(opts)} onChange={set(k)} placeholder="Choose…" style={isBad(k) ? { borderColor: base.warn } : undefined} /></QBox>
  );
  const date = (k: string, label: string, req?: boolean) => (
    <QBox desk={desk} bad={isBad(k)} label={label} req={req}><DateBox value={s(k) || null} onChange={set(k)} title={label} placeholder="Choose a date" style={isBad(k) ? { borderColor: base.warn, paddingVertical: 9 } : { paddingVertical: 9 }} /></QBox>
  );
  const yesNo = (k: string, label: string, req?: boolean, first: 'Yes' | 'No' = 'Yes') => (
    <QBox desk={desk} bad={isBad(k)} label={label} req={req}>
      <View style={{ flexDirection: 'row', alignSelf: 'flex-start', borderWidth: 1, borderColor: isBad(k) ? base.warn : base.line, borderRadius: 8, overflow: 'hidden' }}>
        {(first === 'Yes' ? ['Yes', 'No'] : ['No', 'Yes']).map((x) => (
          <Pressable key={x} accessibilityRole="radio" accessibilityState={{ checked: s(k) === x }} accessibilityLabel={`${label}: ${x}`} onPress={() => set(k)(x)}
            style={{ paddingHorizontal: 18, paddingVertical: 8, backgroundColor: s(k) === x ? base.ink : '#fff' }}>
            <Text style={{ fontWeight: '600', color: s(k) === x ? '#fff' : base.ink }}>{x}</Text>
          </Pressable>
        ))}
      </View>
    </QBox>
  );
  const ticks = (k: string, label: string, opts: string[], req?: boolean) => (
    <QBox desk={desk} bad={isBad(k)} label={label} req={req} hint="Tick all that apply">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14 }}>
        {opts.map((x) => (
          <Pressable key={x} accessibilityRole="checkbox" accessibilityState={{ checked: list(k).includes(x) }} accessibilityLabel={x} onPress={() => flip(k, x)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, width: desk ? 220 : '100%' }}>
            <Text style={{ fontSize: 17, color: list(k).includes(x) ? brand : base.slate }}>{list(k).includes(x) ? '☑' : '☐'}</Text>
            <Text style={{ fontSize: 14.5, color: base.ink, flexShrink: 1 }}>{x}</Text>
          </Pressable>
        ))}
      </View>
    </QBox>
  );
  const fileBox = (label: string) => {
    const f = FILES.find((x) => x.label === label)!;
    const mine = files.filter((x) => x.label === label);
    return (
      <QBox desk={desk} bad={isBad(`file:${label}`)} label={f.title} req={f.req}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${f.title}`} onPress={async () => {
          const r = await DocumentPicker.getDocumentAsync({ multiple: f.multi, copyToCacheDirectory: true, type: ['application/pdf', 'image/*', ...(label === 'H&S policy' ? ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] : [])] });
          if (r.canceled) return;
          const got: Pick[] = r.assets.map((a) => ({ label, name: a.name, size: a.size ?? 0, type: a.mimeType || '', file: (a as unknown as { file?: Blob }).file ?? null, uri: a.uri }));
          setFiles((o) => [...o.filter((x) => x.label !== label), ...got]);
        }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: mine.length ? 'solid' : 'dashed', borderColor: isBad(`file:${label}`) ? base.warn : mine.length ? base.ok : '#C3CAD6', borderRadius: radius.input, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: mine.length ? '#F2FBF6' : '#FAFBFC' }}>
          <Text style={{ fontWeight: '700', fontSize: 14 }}>📎 {f.multi ? 'Choose Files' : 'Choose File'}</Text>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, color: mine.length ? base.ok : base.slateLight, fontWeight: mine.length ? '700' : '400' }}>{mine.length ? (mine.length === 1 ? mine[0].name : `${mine.length} files`) : f.multi ? 'No files chosen' : 'No file chosen'}</Text>
        </Pressable>
      </QBox>
    );
  };
  const sec = (title: string, children: ReactNode, hint?: string) => (
    <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: base.line, borderRadius: 16, paddingHorizontal: desk ? 24 : 16, paddingTop: 16, paddingBottom: 8, marginBottom: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: base.ink }}>{title}</Text>
      {!!hint && <Text style={{ fontSize: 13.5, color: base.slate, marginTop: 2 }}>{hint}</Text>}
      {children}
    </View>
  );
  // Two questions side by side on a laptop, one under the other on a phone.
  const two = (a: ReactNode, b: ReactNode) => (desk ? <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1, minWidth: 0 }}>{a}</View><View style={{ flex: 1, minWidth: 0 }}>{b}</View></View> : <>{a}{b}</>);

  const submit = async () => {
    setErr('');
    const missing = REQ.filter(([k]) => (Array.isArray(v[k]) ? !(v[k] as string[]).length : !s(k).trim())).map(([k]) => k);
    if (s('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s('email').trim())) missing.push('email');
    FILES.filter((f) => f.req && !files.some((x) => x.label === f.label)).forEach((f) => missing.push(`file:${f.label}`));
    setBad(missing);
    if (missing.length) { setErr('Please fill in the questions marked in red.'); return; }
    if (!agree || !signed.trim()) { setErr('Please tick the declaration and type your name to sign.'); return; }
    if (files.length > 20) { setErr('Please attach 20 files or fewer in total.'); return; }
    const big = files.find((f) => f.size > 25 * 1024 * 1024); if (big) { setErr(`"${big.name}" is bigger than 25MB — please attach a smaller copy.`); return; }
    const odd = files.find((f) => !OK_TYPE.test(f.type)); if (odd) { setErr(`"${odd.name}" isn’t a PDF, photo or Word file — please attach one of those.`); return; }
    try {
      const uploaded: { label: string; name: string; path: string }[] = [];
      if (files.length) {
        setBusy('Uploading documents…');
        const { uploads } = await api<{ uploads: { signedUrl: string; path: string }[] }>(org, { action: 'upload', key: key, files: files.map((f) => ({ name: f.name, size: f.size })) });
        for (let i = 0; i < files.length; i++) {
          setBusy(`Uploading ${i + 1} Of ${files.length}…`);
          const body = files[i].file ?? (await (await fetch(files[i].uri)).blob());
          const r = await fetch(uploads[i].signedUrl, { method: 'PUT', headers: { 'Content-Type': files[i].type, 'x-upsert': 'false' }, body });
          if (!r.ok) throw new Error(`Could not upload "${files[i].name}" — please try again.`);
          uploaded.push({ label: files[i].label, name: files[i].name, path: uploads[i].path });
        }
      }
      setBusy('Sending…');
      const data = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Array.isArray(x) ? x : x.trim()]));
      await api(org, { action: 'submit', key: key, data: { ...data, operatives: ops.map((o) => ({ ...o, name: o.name.trim() })).filter((o) => o.name) }, files: uploaded, signed_name: signed.trim(), agree, website: '' });
      setDone(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: base.paper }} contentContainerStyle={{ maxWidth: 760, width: '100%', alignSelf: 'center', paddingHorizontal: 14, paddingTop: 22, paddingBottom: 70 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Subcontractor Sign-Up — ${name}` }} />
      <View style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: base.line, marginBottom: 12 }}>
        <View style={{ height: 10, backgroundColor: brand }} />
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: desk ? 22 : 16 }}>
          {!!info?.logo && <Image source={{ uri: info.logo }} style={{ width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: base.line }} resizeMode="contain" />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: desk ? 25 : 21, fontWeight: '800', color: base.ink }}>{info ? `${name} — Subcontractor Sign-Up` : 'Subcontractor Sign-Up'}</Text>
            <Text style={{ fontSize: 14.5, color: base.slate, marginTop: 4 }}>{loadErr || (info ? `Please fill this in to work with ${name}. It takes about 10 minutes — have your insurance certificates and CSCS cards to hand.` : 'Loading…')}</Text>
            {!done && !!info && <Text style={{ fontSize: 13, color: base.warn, marginTop: 6 }}>* Required</Text>}
          </View>
        </View>
      </View>
      {done ? (
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: base.line, borderRadius: 16, padding: 32, alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#E3F5EC', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Text style={{ color: base.ok, fontSize: 30, fontWeight: '900' }}>✓</Text></View>
          <Text style={{ fontSize: 19, fontWeight: '700', color: base.ink }}>Thanks — That&apos;s Sent</Text>
          <Text style={{ fontSize: 14.5, color: base.slate, marginTop: 6, textAlign: 'center' }}>{name} has your details and documents. A copy has been emailed to {s('email')}.</Text>
        </View>
      ) : !info ? null : (
        <>
          {sec('1. Your Company', <>
            {text('company_name', 'Company Name', { req: true })}
            {two(text('trading_name', 'Trading Name (If Different)'), choose('company_type', 'Business Type', ['Limited company', 'Sole trader', 'Partnership', 'LLP'], true))}
            {two(text('company_number', 'Company Number'), text('vat_number', 'VAT Number'))}
            {two(text('utr', 'UTR'), choose('cis_status', 'CIS Status', ['Gross payment', '20% deduction', '30% deduction (not registered)'], true))}
            {text('address', 'Business Address', { req: true, multi: true })}
            {two(text('postcode', 'Postcode', { req: true }), text('website_url', 'Website'))}
          </>)}
          {sec('2. Main Contact', <>
            {two(text('contact_name', 'Your Name', { req: true }), text('contact_role', 'Position'))}
            {two(text('email', 'Email', { req: true, kb: 'email-address' }), text('phone', 'Mobile', { req: true, kb: 'phone-pad' }))}
            {text('office_phone', 'Office Phone', { kb: 'phone-pad' })}
          </>)}
          {sec('3. Your Work', <>
            {ticks('trades', 'Trades', TRADES, true)}
            {text('other_trade', 'Other Trade')}
            {two(text('areas', 'Areas You Cover', { ph: 'e.g. London & Home Counties' }), text('team_size', 'Operatives Available', { kb: 'number-pad' }))}
            {yesNo('own_access', 'Do You Have Your Own Access Equipment?')}
            {text('plant', 'Plant / Equipment You Supply')}
          </>)}
          {sec('4. Insurance', <>
            {two(choose('pl_cover', 'Public Liability Cover', ['£1 million', '£2 million', '£5 million', '£10 million', 'Other'], true), date('pl_expiry', 'Public Liability Expiry', true))}
            {two(choose('el_cover', 'Employers Liability Cover', ['£5 million', '£10 million', 'Not applicable (no employees)', 'Other']), date('el_expiry', 'Employers Liability Expiry'))}
            {two(text('pi_cover', 'Professional Indemnity', { ph: 'If held' }), text('car_cover', 'Contract Works Cover', { ph: 'If held' }))}
            {fileBox('Public liability certificate')}
            {fileBox('Employers liability certificate')}
          </>, 'Upload your current certificates.')}
          {sec('5. Accreditations', <>
            {ticks('accreditations', 'Which Do You Hold?', ACCREDS)}
            {text('other_accreditation', 'Other Accreditation')}
            {fileBox('Accreditation certificate')}
          </>)}
          {sec('6. Health & Safety', <>
            {yesNo('hs_policy', 'Do You Have A Written Health & Safety Policy?', true)}
            {fileBox('H&S policy')}
            {yesNo('rams_ability', 'Can You Produce Your Own RAMS?', true)}
            {text('competent_person', 'Who Is Your Competent Person For Health & Safety?', { ph: 'Name and company' })}
            {yesNo('riddor', 'Any RIDDOR-Reportable Incidents In The Last 3 Years?', true, 'No')}
            {text('riddor_detail', 'If Yes, Give Details', { multi: true })}
            {yesNo('enforcement', 'Any HSE Improvement / Prohibition Notices In The Last 3 Years?', true, 'No')}
            {text('enforcement_detail', 'If Yes, Give Details', { multi: true })}
          </>)}
          {sec('7. Your Operatives', <>
            <View style={{ marginTop: 8 }}>
              {ops.map((o, i) => {
                const upd = (k: keyof Op) => (x: string) => setOps((l) => l.map((y, j) => (j === i ? { ...y, [k]: x } : y)));
                return (
                  <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <TextInput value={o.name} onChangeText={upd('name')} placeholder="Full Name" accessibilityLabel={`Operative ${i + 1} name`} placeholderTextColor={base.slateLight} style={[box(), { flexGrow: 1.4, flexBasis: desk ? 160 : '100%' }]} />
                    <TextInput value={o.trade} onChangeText={upd('trade')} placeholder="Trade" placeholderTextColor={base.slateLight} style={[box(), { flexGrow: 1, flexBasis: desk ? 110 : '40%' }]} />
                    <TextInput value={o.card} onChangeText={upd('card')} placeholder="CSCS Card No." placeholderTextColor={base.slateLight} style={[box(), { flexGrow: 1, flexBasis: desk ? 110 : '40%' }]} />
                    <DateBox value={o.expiry || null} onChange={upd('expiry')} title="Card Expiry" placeholder="Card Expiry" style={{ flexGrow: 1, flexBasis: desk ? 130 : '60%', paddingVertical: 9 }} />
                    <Pressable accessibilityLabel={`Remove operative ${i + 1}`} hitSlop={8} onPress={() => setOps((l) => l.filter((_, j) => j !== i))}><Text style={{ fontSize: 22, color: base.slate, paddingHorizontal: 6 }}>×</Text></Pressable>
                  </View>
                );
              })}
              <View style={{ alignSelf: 'flex-start' }}><Button small kind="ghost" title="+ Add Operative" onPress={() => setOps((l) => [...l, { name: '', trade: '', card: '', expiry: '' }])} /></View>
            </View>
            {fileBox('CSCS / skills card')}
          </>, 'Everyone who may work on our sites.')}
          {sec('8. References', <>
            {text('ref1', 'Reference 1', { ph: 'Company, contact name, phone or email' })}
            {text('ref2', 'Reference 2', { ph: 'Company, contact name, phone or email' })}
          </>, 'Two recent clients or main contractors.')}
          {sec('9. Anything Else', text('notes', 'Anything Else We Should Know?', { multi: true }))}
          {sec('Declaration', <>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} accessibilityLabel="I confirm the declaration" onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginTop: 10 }}>
              <Text style={{ fontSize: 18, color: agree ? brand : base.slate }}>{agree ? '☑' : '☐'}</Text>
              <Text style={{ flex: 1, fontSize: 14.5, color: base.ink }}>I confirm the information given is true and complete, the insurances above are in force, and I will tell you straight away if anything changes.</Text>
            </Pressable>
            <QBox desk={desk} bad={false} label="Type Your Full Name To Sign" req><TextInput value={signed} onChangeText={setSigned} accessibilityLabel="Type your full name to sign" style={box()} /></QBox>
            {!!err && <Text style={{ color: base.warn, backgroundColor: '#FDECEA', borderRadius: 10, padding: 11, fontSize: 14.5, marginTop: 8 }}>{err}</Text>}
            <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void submit()} style={{ marginTop: 12, marginBottom: 6, paddingVertical: 15, borderRadius: 12, backgroundColor: brand, opacity: busy ? 0.6 : 1, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16.5 }}>{busy || 'Submit'}</Text>
            </Pressable>
            <Text style={{ textAlign: 'center', color: base.slate, fontSize: 12.5, marginBottom: 10 }}>You&apos;ll get an email copy once it&apos;s sent.</Text>
          </>)}
        </>
      )}
      <Text style={{ textAlign: 'center', color: base.slateLight, fontSize: 12.5, marginTop: 12 }}>Secure form by OpHUB · operativehub.co.uk</Text>
    </ScrollView>
  );
}
