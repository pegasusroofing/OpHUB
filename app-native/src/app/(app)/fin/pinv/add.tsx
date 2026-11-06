// Add Invoices (Andy, 7 Nov 2026): one page for adding purchase invoices. Drop files on it (laptop) or choose them, one or
// many; each becomes its own invoice in Received, read automatically where it can be, to allocate. One file: Type It In
// opens it beside its PDF. Several: they're listed, tap one to process it, or go back to the list. No file: type one in.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { fdb } from '@/data/finance';
import { uploadToInbox, type Added, type UpFile } from '@/data/finInboxUpload';
import { readNewInvoices } from '@/data/invoiceRead';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/rules/finance';
import { base, page, useTheme } from '@/theme/theme';

type Row = Record<string, any>;

export default function AddInvoices() {
  const { site } = useLocalSearchParams<{ site?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const t = useTheme();
  const qc = useQueryClient();
  const [busy, setBusy] = useState('');
  const [added, setAdded] = useState<Added[]>([]);
  const [over, setOver] = useState(false);
  const drop = useRef<ComponentRef<typeof View>>(null);

  const add = async (files: UpFile[]) => {
    if (!me || !files.length) return;
    setBusy(`Adding ${files.length} file${files.length === 1 ? '' : 's'}…`);
    try {
      const r = await uploadToInbox(me, files, site || null);
      setAdded((a) => [...a, ...r.added]);
      if (r.skipped.length) toast(`Not added: ${r.skipped.join(', ')}`);
      void qc.invalidateQueries({ queryKey: ['finPurchases'] });
      void readNewInvoices(me).then(() => qc.invalidateQueries({ queryKey: ['finAddedRows'] })).catch(() => undefined);
    } finally { setBusy(''); }
  };
  const choose = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
    if (!r.canceled) void add(r.assets.map((f) => ({ uri: f.uri, name: f.name, mimeType: f.mimeType, size: f.size })));
  };
  // Laptop: drop files anywhere on the box.
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const el = drop.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return undefined;
    const onOver = (e: DragEvent) => { e.preventDefault(); setOver(true); };
    const onLeave = () => setOver(false);
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); setOver(false);
      const fs = Array.from(e.dataTransfer?.files || []).filter((f) => /pdf|image/i.test(f.type) || /\.(pdf|jpe?g|png|heic|webp)$/i.test(f.name));
      if (!fs.length) { toast('Drop PDF or photo files.'); return; }
      void add(fs.map((f) => ({ uri: URL.createObjectURL(f), name: f.name, mimeType: f.type, size: f.size })));
    };
    el.addEventListener('dragover', onOver); el.addEventListener('dragleave', onLeave); el.addEventListener('drop', onDrop);
    return () => { el.removeEventListener('dragover', onOver); el.removeEventListener('dragleave', onLeave); el.removeEventListener('drop', onDrop); };
  });

  // What each added one is now (read or not), refreshed every few seconds while any are still being read.
  const ids = added.map((a) => a.id);
  const { data: rows = [] } = useQuery({ queryKey: ['finAddedRows', ids.join(',')], enabled: ids.length > 0, refetchInterval: 5000,
    queryFn: async () => ((await fdb.from('fin_inbox').select('id,file_name,extracted,status,purchase_invoice_id').in('id', ids)).data as Row[] | null) ?? [] });
  const rowOf = (id: string) => rows.find((r) => r.id === id);
  const back = () => router.replace((site ? `/fin/job/${site}?tab=purchases` : '/fin/purchases?tab=invoices') as never);

  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Add Invoices' }} />
      <View ref={drop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose invoice files" onPress={() => void choose()} disabled={!!busy}
          style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: over ? t.brand1 : '#c3c8d0', borderRadius: 12, padding: 26, alignItems: 'center', backgroundColor: over ? '#FFF6F5' : '#fff', marginBottom: 12 }}>
          <Text style={{ fontSize: 26 }}>📄</Text>
          <Text style={{ fontWeight: '600', color: base.ink, fontSize: 16, marginTop: 6 }}>{busy || (Platform.OS === 'web' ? 'Drop Invoices Here, Or Click To Choose' : 'Choose Invoices')}</Text>
          <Muted style={{ textAlign: 'center', marginTop: 4 }}>PDFs, photos or scans. One or many: each one becomes its own invoice in Received, read where it can be, to allocate.</Muted>
        </Pressable>
      </View>
      {added.length > 0 && (
        <Card>
          <SectionTitle>Added ({added.length})</SectionTitle>
          {added.map((a, k) => { const r = rowOf(a.id), ex = (r?.extracted || {}) as Row; const read = !!r?.extracted && (Array.isArray(ex.lines) && ex.lines.length || ex.total != null); return (
            <Pressable key={a.id} accessibilityRole="button" onPress={() => router.push(`/fin/inbox/${a.id}` as never)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: k ? 1 : 0, borderTopColor: '#F0F1F4' }, pressed && { backgroundColor: '#F8F9FB' }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontWeight: '600', color: base.ink }}>{read ? ex.supplier || a.file_name : a.file_name}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12.5, color: read ? base.slate : '#B35A00' }}>{r?.purchase_invoice_id ? 'Saved' : read ? [ex.invoice_no, ex.total != null ? money(Number(ex.total)) : ''].filter(Boolean).join(' · ') || 'Read' : r?.extracted ? 'Unable to read: fill it in' : 'Waiting to be read'}</Text>
              </View>
              <Text style={{ color: t.brand1, fontWeight: '500', fontSize: 13 }}>{added.length === 1 ? 'Type It In ›' : 'Open ›'}</Text>
            </Pressable>
          ); })}
        </Card>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 }}>
        {added.length === 1 && <Button title="Type It In Now" onPress={() => router.push(`/fin/inbox/${added[0].id}` as never)} />}
        <Button kind="ghost" title={added.length ? 'Back To Purchase Invoices' : '‹ Back'} onPress={back} />
      </View>
      <Pressable onPress={() => router.push((site ? `/fin/pinv/new?site=${site}` : '/fin/pinv/new') as never)} style={{ alignSelf: 'center', marginTop: 14 }}>
        <Text style={{ color: base.blue, fontSize: 13 }}>No file? Type an invoice in without one</Text>
      </Pressable>
    </ScrollView>
  );
}
