// On a Pricing Element (390 / 410 / 380): its price files (quotes, drawings,
// spreadsheets — "apply to all" puts one file on every price at that address),
// its labour invoices, and — for managers — who can see it (one tick gives an
// operative both the price / build-up and the labour invoices). Files open
// through the access functions (signed links); spreadsheets show in a table.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Check, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { siteOperatives } from '@/data/priceSheets';
import { csvRows, readXlsx, type Cell } from '@/lib/rules/xlsxRead';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';
import { base } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type F = { id: string; filename: string; storage_path: string; uploaded_at?: string; element_id: string | null; uploaded_by: string | null };
const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);

export function PriceFiles({ me, site, el, mgr, canPrice, canLabour }: { me: Profile; site: Site; el: { id: string; sub_site_id: string | null }; mgr: boolean; canPrice: boolean; canLabour: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: people } = usePeople();
  const [allPrices, setAllPrices] = useState(false);
  const [busy, setBusy] = useState('');
  const [sheet, setSheet] = useState<{ name: string; rows: Cell[][] } | null>(null);
  const { data } = useQuery({ queryKey: ['priceFiles', el.id], queryFn: async () => {
    const [own, all, lab, pa, la, ops] = await Promise.all([
      canPrice ? db.from('price_files').select('*').eq('element_id', el.id) : null,
      canPrice ? (el.sub_site_id ? db.from('price_files').select('*').eq('site_id', site.id).is('element_id', null).eq('sub_site_id', el.sub_site_id) : db.from('price_files').select('*').eq('site_id', site.id).is('element_id', null).is('sub_site_id', null)) : null,
      canLabour ? db.from('labour_invoices').select('*').eq('element_id', el.id).order('uploaded_at', { ascending: false }) : null,
      mgr ? db.from('site_price_access').select('user_id').eq('element_id', el.id) : null,
      mgr ? db.from('site_labour_invoice_access').select('user_id').eq('element_id', el.id) : null,
      mgr ? siteOperatives(site.id) : Promise.resolve([]),
    ]);
    const rows = (r: { data: unknown } | null) => ((r?.data as F[] | null) ?? []);
    const files = [...rows(own), ...rows(all)].sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')));
    const access = new Set([...((pa?.data as { user_id: string }[] | null) ?? []), ...((la?.data as { user_id: string }[] | null) ?? [])].map((x) => x.user_id));
    return { files, labour: rows(lab), access, ops };
  } });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['priceFiles', el.id] });
  const upload = async (kind: 'price' | 'labour') => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (r.canceled || !r.assets.length) return;
    setBusy(kind); let n = 0;
    for (const a of r.assets) {
      const name = a.name || 'file';
      const bucket = kind === 'price' ? 'price-files' : 'labour-invoices';
      const path = `${site.id}/${kind === 'price' ? 'price' : 'invoices'}/${rid()}-${name.replace(/[^a-z0-9.\-_]/gi, '_')}`;
      try {
        const up = await supabase.storage.from(bucket).upload(path, await (await fetch(a.uri)).arrayBuffer(), { contentType: a.mimeType || undefined });
        if (up.error) continue;
        const row = kind === 'price'
          ? { site_id: site.id, element_id: allPrices ? null : el.id, sub_site_id: allPrices ? el.sub_site_id || null : null, filename: name, storage_path: up.data.path, content_type: a.mimeType || null, uploaded_by: me.id }
          : { site_id: site.id, element_id: el.id, filename: name, storage_path: up.data.path, content_type: a.mimeType || null, uploaded_by: me.id };
        if (!(await db.from(kind === 'price' ? 'price_files' : 'labour_invoices').insert(row as never)).error) n++;
      } catch { /* next file */ }
    }
    setBusy(''); setAllPrices(false);
    toast(n ? (n === 1 ? 'File uploaded' : `${n} files uploaded`) : 'Upload failed — check your signal and try again.'); refresh();
  };
  const open = async (kind: 'price' | 'labour', f: F) => {
    const r = await supabase.functions.invoke(kind === 'price' ? 'price-file-access' : 'labour-invoice-access', { body: { site_id: site.id, storage_path: f.storage_path } });
    const url = (r.data as { url?: string } | null)?.url;
    if (r.error || !url) { toast((r.data as { error?: string } | null)?.error || 'Could not open the file.'); return; }
    if (/\.(xlsx|csv)$/i.test(f.filename)) {
      try { const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer()); const rows = /\.csv$/i.test(f.filename) ? csvRows(new TextDecoder().decode(bytes)) : (await readXlsx(bytes))[0]?.rows ?? []; setSheet({ name: f.filename, rows }); return; } catch { /* open it instead */ }
    }
    void Linking.openURL(url);
  };
  const del = async (kind: 'price' | 'labour', f: F) => {
    if (!(await confirmAsk(kind === 'price' ? 'Delete this price file? This can’t be undone. If it was applied to all elements, it will be removed from all of them.' : 'Delete this invoice? This can’t be undone.', 'Delete'))) return;
    const ok = !(await db.from(kind === 'price' ? 'price_files' : 'labour_invoices').delete().eq('id', f.id)).error;
    if (!ok) { toast('Could not delete — try again.'); return; }
    try { await supabase.storage.from(kind === 'price' ? 'price-files' : 'labour-invoices').remove([f.storage_path]); } catch { /* row gone */ }
    if (me.org_id) void db.from('site_activity_log').insert({ org_id: me.org_id, site_id: site.id, actor_id: me.id, action: kind === 'price' ? 'price_file_deleted' : 'labour_invoice_deleted', description: `Deleted ${kind === 'price' ? 'price file' : 'labour invoice'} "${f.filename}"` } as never);
    toast(kind === 'price' ? 'File deleted' : 'Invoice deleted'); refresh();
  };
  const row = (kind: 'price' | 'labour', f: F) => (
    <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: base.line }}>
      <Pressable style={{ flex: 1 }} onPress={() => void open(kind, f)}>
        <Text style={{ color: base.blue, fontWeight: '600' }}>{f.filename}{kind === 'price' && !f.element_id ? '  (all prices)' : ''}</Text>
        <Muted style={{ fontSize: 11 }}>{f.uploaded_by ? nameOf(people, f.uploaded_by) : ''}{f.uploaded_at ? ` · ${new Date(f.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}</Muted>
      </Pressable>
      {(mgr || f.uploaded_by === me.id) && <Pressable hitSlop={6} onPress={() => void del(kind, f)}><Text style={{ color: base.red }}>✕</Text></Pressable>}
    </View>
  );
  if (!data) return null;
  return (
    <>
      {canPrice && (
        <>
          <SectionTitle>Price files</SectionTitle>
          <Card>
            {data.files.length ? data.files.map((f) => row('price', f)) : <Muted>No price files yet.</Muted>}
            {mgr && <><Check label="Apply to all prices at this address" value={allPrices} onChange={setAllPrices} /><Button kind="ghost" busy={busy === 'price'} title="⬆ Upload price files" onPress={() => void upload('price')} /></>}
          </Card>
        </>
      )}
      {canLabour && (
        <>
          <SectionTitle>Labour invoices</SectionTitle>
          <Card>
            {data.labour.length ? data.labour.map((f) => row('labour', f)) : <Muted>No labour invoices yet.</Muted>}
            <Button kind="ghost" busy={busy === 'labour'} title="⬆ Upload labour invoices" onPress={() => void upload('labour')} />
          </Card>
        </>
      )}
      {mgr && (
        <>
          <SectionTitle>Who can see this price</SectionTitle>
          <Card>
            {data.ops.length ? data.ops.map((o) => { const on = data.access.has(o.id); return (
              <Check key={o.id} label={o.name} value={on} onChange={async () => {
                const tables = ['site_price_access', 'site_labour_invoice_access'];
                const res = on
                  ? await Promise.all(tables.map((t) => db.from(t).delete().eq('element_id', el.id).eq('user_id', o.id)))
                  : await Promise.all(tables.map((t) => db.from(t).insert({ site_id: site.id, element_id: el.id, user_id: o.id, granted_by: me.id } as never)));
                toast(res.some((x) => x.error) ? (on ? 'Could not remove access' : 'Could not grant access') : on ? 'Access removed' : 'Access granted'); refresh();
              }} />
            ); }) : <Muted>No operatives assigned to this job yet.</Muted>}
            <Muted style={{ marginTop: 4 }}>A tick lets an operative see this price, its build-up and its labour invoices.</Muted>
          </Card>
        </>
      )}
      {sheet && (
        <Card style={{ borderColor: base.blue, borderWidth: 1.5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{sheet.name}</Text><Pressable onPress={() => setSheet(null)}><Text style={{ color: base.blue }}>Close</Text></Pressable></View>
          <ScrollView horizontal><View>{sheet.rows.slice(0, 200).map((r, i) => <View key={i} style={{ flexDirection: 'row' }}>{r.map((c, j) => <Text key={j} style={{ width: 110, padding: 3, borderWidth: 0.5, borderColor: base.line, fontSize: 11.5, color: base.ink }} numberOfLines={2}>{String(c)}</Text>)}</View>)}</View></ScrollView>
        </Card>
      )}
    </>
  );
}
