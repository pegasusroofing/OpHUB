// The PM/admin PPE page (650): Issue PPE to one or more of the job's operatives
// (handed over in person, so it's signed straight away), PPE Requests to fulfil or
// cancel, and each operative's Site Issued PPE history with delete.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle, Toggle } from '@/components/ui';
import { orThrow } from '@/lib/offlineCache';
import { nameOf, usePeople } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { deliverPdf } from '@/lib/pdf';
import { ppeEmailPdfs, ppeExportPdf } from '@/lib/ppePdf';
import { cap1, currentPpe, PPE_STANDARD_ITEMS, type Issuance } from '@/lib/rules/ppe';
import { supabase } from '@/lib/supabase';
import { exportTablePdf } from '@/lib/tableExport';
import type { Site } from '@/lib/types';
import { base, radius } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Req = { id: string; user_id: string; item_name: string; status: string; date_needed: string | null; created_at: string; fulfilled_at: string | null };
const long = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function useSitePpe(siteId: string) {
  return useQuery({
    queryKey: ['sitePpe', siteId],
    queryFn: async () => {
      const [a, p] = await Promise.all([db.from('site_assignments').select('user_id').eq('site_id', siteId), db.from('profiles').select('id,name,role').eq('role', 'operative').order('name')]);
      const on = new Set(((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id));
      const ops = ((orThrow(p) as { id: string; name: string }[]) ?? []).filter((x) => on.has(x.id));
      const [iss, req] = await Promise.all([
        ops.length ? db.from('ppe_issuances').select('*').in('user_id', ops.map((o) => o.id)).order('issued_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        db.from('ppe_requests').select('*').eq('site_id', siteId).order('created_at', { ascending: false }),
      ]);
      return { ops, issuances: orThrow(iss) as Issuance[], requests: orThrow(req) as Req[] };
    },
  });
}

export function PpeManager({ site }: { site: Site }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useSitePpe(site.id);
  const { data: people } = usePeople();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pdfBusy, setPdfBusy] = useState<'pdf' | 'email' | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [who, setWho] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [reqOpen, setReqOpen] = useState(false);
  const [reqPick, setReqPick] = useState<Set<string>>(new Set()); // 650 #263: tick requests to export / email them
  const [openFor, setOpenFor] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (isLoading || !data) return <Muted>Loading…</Muted>;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['sitePpe', site.id] });
  const pendingReqs = data.requests.filter((r) => r.status === 'pending');
  const flip = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <View>
      {issueOpen ? (
        <Card>
          <SectionTitle>Issue PPE</SectionTitle>
          <Muted style={{ fontWeight: '700' }}>Operative(s) — tick one or more to issue the same PPE to all of them</Muted>
          {data.ops.length ? data.ops.map((p) => (
            <Pressable key={p.id} onPress={() => setWho(flip(who, p.id))}><Text style={{ paddingVertical: 6, color: base.ink }}>{who.includes(p.id) ? '☑' : '☐'} {p.name}</Text></Pressable>
          )) : <Empty>No operatives assigned to this site.</Empty>}
          <Muted style={{ fontWeight: '700', marginTop: 8 }}>Items</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
            {PPE_STANDARD_ITEMS.map((it) => {
              const on = items.includes(it);
              return <Pressable key={it} onPress={() => setItems(flip(items, it))} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}><Text style={{ fontWeight: '700', color: on ? '#fff' : base.ink }}>{it}</Text></Pressable>;
            })}
          </View>
          <TextInput value={custom} onChangeText={setCustom} placeholder="Add another item, e.g. Safety Glasses" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
          <Button busy={busy} title={`Issue PPE${who.length > 1 ? ` to ${who.length}` : ''}`} onPress={async () => {
            const all = [...items, ...(custom.trim() ? [custom.trim()] : [])];
            if (!who.length || !all.length) { toast('Tick at least one operative and one item.'); return; }
            setBusy(true);
            const now = new Date().toISOString();
            const r = await db.from('ppe_issuances').insert(who.map((u) => ({ org_id: me.org_id, site_id: site.id, user_id: u, items: all, issued_by: me.id, status: 'signed', signed_at: now })) as never);
            setBusy(false);
            if (r.error) { toast('Could not save — try again.'); return; }
            toast(`PPE issued to ${who.length} operative${who.length === 1 ? '' : 's'}`); setIssueOpen(false); setWho([]); setItems([]); setCustom(''); refresh();
          }} />
          <Button kind="ghost" title="Cancel" onPress={() => setIssueOpen(false)} />
          <Muted>Issuing marks this as fulfilled straight away — hand the items to each operative as you issue them.</Muted>
        </Card>
      ) : <Button title="+ Issue PPE" onPress={() => setIssueOpen(true)} />}

      <Toggle title={`PPE Requests${pendingReqs.length ? ` (${pendingReqs.length} pending)` : ''}`} open={reqOpen} onPress={() => setReqOpen(!reqOpen)} />
      {reqOpen && (
        <Card>
          <Muted style={{ marginBottom: 8 }}>Fulfilled requests move into Site Issued PPE below, under the operative&apos;s name. Tick requests to export / email them, same as issued PPE.</Muted>
          {data.requests.filter((r) => r.status !== 'fulfilled').length ? data.requests.filter((r) => r.status !== 'fulfilled').map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.line }}>
              <Pressable hitSlop={6} onPress={() => setReqPick((x) => { const n = new Set(x); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}>
                <Text style={{ fontSize: 17, color: base.ink }}>{reqPick.has(r.id) ? '☑' : '☐'}</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{data.ops.find((o) => o.id === r.user_id)?.name ?? 'Operative'} — {r.item_name}</Text>
                <Muted>{r.date_needed ? `Needed by ${long(`${r.date_needed}T00:00:00`)}` : 'No date given'}</Muted>
              </View>
              {r.status === 'pending' ? (
                <>
                  <Button title="Fulfil" onPress={async () => { if (!!(await db.from('ppe_requests').update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfilled_by: me.id } as never).eq('id', r.id).select('id')).data?.length) { toast('Marked fulfilled'); refresh(); } }} />
                  <Button kind="ghost" title="Cancel" onPress={async () => { if (!!(await db.from('ppe_requests').update({ status: 'cancelled', fulfilled_at: new Date().toISOString(), fulfilled_by: me.id } as never).eq('id', r.id).select('id')).data?.length) { toast('Request cancelled'); refresh(); } }} />
                </>
              ) : <Text style={{ color: base.slate }}>{cap1(r.status)}</Text>}
            </View>
          )) : <Empty>No requests yet.</Empty>}
          {reqPick.size > 0 && (() => {
            const build = async () => {
              const list = data.requests.filter((r) => reqPick.has(r.id));
              let out: { bytes: Uint8Array; filename: string } | null = null;
              const ok = await exportTablePdf({ title: `Requested PPE (${list.length})`, site: site.name, sub: site.name, cols: [{ l: 'Operative', w: 140 }, { l: 'Item', w: 160 }, { l: 'Status', w: 80 }, { l: 'Needed by', w: 80 }, { l: 'Requested', w: 80 }], rows: list.map((r) => [nameOf(people, r.user_id), r.item_name, cap1(r.status), r.date_needed ? new Date(`${r.date_needed}T00:00:00`).toLocaleDateString('en-GB') : '', new Date(r.created_at).toLocaleDateString('en-GB')]) }, org, async (bytes, filename) => { out = { bytes, filename }; return true; });
              return ok ? out as { bytes: Uint8Array; filename: string } | null : null;
            };
            return (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1 }}><Button kind="ghost" busy={pdfBusy === 'pdf'} title={`Export ${reqPick.size} (PDF)`} onPress={async () => {
                  setPdfBusy('pdf');
                  try { const b = await build(); if (!b) toast('Could not build the PDF.'); else if (await deliverPdf(b.bytes, b.filename)) setReqPick(new Set()); } catch { toast('Could not build the PDF.'); } finally { setPdfBusy(null); }
                }} /></View>
                <View style={{ flex: 1 }}><Button kind="ghost" busy={pdfBusy === 'email'} title={`Email ${reqPick.size}`} onPress={async () => {
                  setPdfBusy('email');
                  try {
                    const b = await build(); if (!b) { toast('Could not build the PDF.'); return; }
                    let bin = ''; for (let k = 0; k < b.bytes.length; k += 0x8000) bin += String.fromCharCode(...b.bytes.subarray(k, k + 0x8000));
                    const r = await supabase.functions.invoke('send-report-email', { body: { attachments: [{ filename: b.filename, content_base64: btoa(bin) }] } });
                    const d = r.data as { error?: string } | null;
                    if (r.error || d?.error) toast(`Email failed — ${d?.error || 'try again'}`); else { toast(`Requested PPE emailed to ${me.email || 'you'}`); setReqPick(new Set()); }
                  } catch { toast('Email failed — could not reach the server.'); } finally { setPdfBusy(null); }
                }} /></View>
              </View>
            );
          })()}
        </Card>
      )}

      <SectionTitle>Site Issued PPE — {site.name}</SectionTitle>
      {data.ops.length ? data.ops.map((p) => {
        const history = [
          ...data.issuances.filter((i) => i.user_id === p.id).map((i) => ({ kind: 'issuance' as const, id: i.id, items: i.items || [], status: i.status, at: i.issued_at })),
          ...data.requests.filter((r) => r.user_id === p.id && r.status === 'fulfilled').map((r) => ({ kind: 'request' as const, id: r.id, items: [r.item_name], status: 'fulfilled', at: r.fulfilled_at || r.created_at })),
        ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
        const isOpen = openFor.has(p.id);
        const cur = currentPpe(data.issuances, p.id);
        return (
          <View key={p.id}>
            <Toggle title={`${p.name}${cur.length ? ` · ${cur.join(', ')}` : ''}`} open={isOpen} onPress={() => { const n = new Set(openFor); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); setOpenFor(n); }} />
            {isOpen && (
              <Card>
                {history.length ? history.map((i) => (
                  <View key={`${i.kind}${i.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: base.line }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: base.ink }}>{i.items.join(', ')}{i.kind === 'request' ? ' (via request)' : ''}</Text>
                      <Muted>Issued {long(i.at)}</Muted>
                    </View>
                    <Text style={{ fontSize: 11, color: base.slate }}>{i.kind === 'request' ? 'Fulfilled' : i.status === 'signed' ? 'Signed' : 'Pending'}</Text>
                    {i.kind === 'issuance' && (
                      <Pressable hitSlop={6} onPress={() => setPicked((x) => { const n = new Set(x); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })}>
                        <Text style={{ fontSize: 17, color: base.ink }}>{picked.has(i.id) ? '☑' : '☐'}</Text>
                      </Pressable>
                    )}
                    {i.kind === 'issuance' && i.status === 'signed' && (
                      <Pressable hitSlop={6} onPress={async () => {
                        toast('Building PDF…');
                        try { const b = await ppeExportPdf([i.id], site, org, (u) => nameOf(people, u)); if (!b || !(await deliverPdf(b.bytes, b.filename))) toast('Could not build the PDF.'); } catch { toast('Could not build the PDF.'); }
                      }}><Text style={{ color: base.blue, fontSize: 12 }}>Export signed PDF ↗</Text></Pressable>
                    )}
                    {i.kind === 'issuance' && (
                      <Pressable hitSlop={6} onPress={async () => {
                        if (!(await confirmAsk('Delete this PPE issuance record? This cannot be undone.', 'Delete'))) return;
                        if (!!(await db.from('ppe_issuances').delete().eq('id', i.id).select('id')).data?.length) {
                          toast('Record deleted');
                          if (me.org_id) void db.from('site_activity_log').insert({ site_id: site.id, org_id: me.org_id, actor_id: me.id, action: 'ppe_issuance_deleted', description: `Deleted PPE issuance record for ${p.name}` } as never).then(undefined, () => undefined);
                          refresh();
                        }
                      }}><Text style={{ color: base.red }}>🗑</Text></Pressable>
                    )}
                  </View>
                )) : <Empty>No history yet.</Empty>}
              </Card>
            )}
          </View>
        );
      }) : <Empty>No operatives assigned to this site yet.</Empty>}
      {picked.size > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}><Button kind="ghost" busy={pdfBusy === 'pdf'} title={`Export ${picked.size} (PDF)`} onPress={async () => {
            setPdfBusy('pdf'); toast('Building PDF…');
            try {
              const b = await ppeExportPdf([...picked], site, org, (u) => nameOf(people, u));
              if (!b) toast('Could not build any of the selected records.');
              else if (await deliverPdf(b.bytes, b.filename)) setPicked(new Set());
            } catch { toast('Could not build the combined PDF.'); } finally { setPdfBusy(null); }
          }} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" busy={pdfBusy === 'email'} title={`Email ${picked.size}`} onPress={async () => {
            setPdfBusy('email'); toast('Building PDFs…');
            try { const r = await ppeEmailPdfs([...picked], site, org, (u) => nameOf(people, u)); toast(r.msg); if (r.ok) setPicked(new Set()); } catch { toast('Email failed — could not reach the server.'); } finally { setPdfBusy(null); }
          }} /></View>
        </View>
      )}
      <Muted style={{ marginTop: 12 }}>Tick issued records to export or email them. The company PPE Register is in Admin › PPE Log.</Muted>
    </View>
  );
}
