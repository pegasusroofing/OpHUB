// Site Inductions (550). Operatives fill in the company's own induction form (Andy, 20 Nov 2026: "a bit more of a
// customisable form ... adding info missing, ie next of kin etc"): a tab per section, then Sign; next of kin and the
// like come from their last induction. A manager deletes one if it needs redoing. Managers: Outstanding / Completed,
// view a signed PDF, delete one; the form itself is edited in Admin › H&S › Induction Form.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { promptEmail } from '@/components/EmailPrompt';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { FinTabs } from '@/components/FinNav';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { InductionFill } from '@/components/InductionFill';
import { deleteCompletion, useInductionForm, useInductions, useSiteRules } from '@/data/inductions';
import { unlinkFolder } from '@/data/onedrive';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { deliverPdf, exportFilename, fetchBytes } from '@/lib/fileOut';
import { PDFDocument } from '@/lib/pdfLazy';
import { publicUrl } from '@/lib/privateFiles';
import { supabase } from '@/lib/supabase';

import { isFullManager, isManager } from '@/lib/roles';
import { base, page as pageStyle, radius, space } from '@/theme/theme';

const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** Emails stored induction PDFs (550 emailSiteInductionPdf / emailSelectedInductions). Gives the problem, or null. */
async function emailInductions(siteId: string, to: { to: string; cc?: string | null; clientCc?: string | null }, items: { operative_name: string; storage_path: string }[]): Promise<string | null> {
  try {
    const r = await supabase.functions.invoke('send-site-induction-email', { body: { site_id: siteId, recipient_email: to.to, cc_email: to.cc ?? null, client_cc_email: to.clientCc ?? null, items: items.map((i) => ({ ...i, file_url: publicUrl('mc-documents', i.storage_path) })) } });
    const said = (r.data as { error?: string } | null)?.error;
    return r.error || said ? said || 'Could not send the email — please try again.' : null;
  } catch { return 'Could not send the email — please try again.'; }
}

export default function Inductions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = useInductions(id);
  const { data: people } = usePeople();
  const [tab, setTab] = useState<'outstanding' | 'completed'>('outstanding');
  const [sel, setSel] = useState<Set<string>>(new Set());
  // The site rules and layout, read and signed with the induction (Andy, 20 Nov 2026).
  const { data: rules = [] } = useSiteRules(id);
  const { data: form } = useInductionForm(org);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['inductions', id] }); void qc.invalidateQueries({ queryKey: ['mcTiles', id] }); };
  const view = async (path: string | null) => { if (!path) { toast('PDF not available.'); return; } const u = await openDocLink('mc-documents', path); if (u) viewDoc(u); else toast('Could not open the PDF.'); };

  if (isManager(me) || me.role === 'client') {
    const mgr = isManager(me);
    const odFolder = (site as { site_inductions_folder_id?: string | null; site_inductions_folder_name?: string | null } | undefined)?.site_inductions_folder_id ? ((site as { site_inductions_folder_name?: string | null }).site_inductions_folder_name || 'the linked folder') : null;
    const roster = data?.roster ?? [];
    const byOp = data?.byOp ?? {};
    const shown = tab === 'completed' ? roster.filter((u) => byOp[u]).sort((a, b) => byOp[b].completed_at.localeCompare(byOp[a].completed_at)) : roster.filter((u) => !byOp[u]);
    return (
      <ScrollView contentContainerStyle={pageStyle(720)} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Site Inductions' }} />
        {/* The Finance-style tabs, not red pill buttons (Andy, 20 Nov 2026). */}
        <FinTabs even value={tab} onChange={(k) => setTab(k as 'outstanding' | 'completed')} items={[['outstanding', 'Outstanding'], ['completed', 'Completed Inductions']]} />
        {/* The form operatives fill in is the company's own (Admin › H&S › Induction Form, 20 Nov 2026). */}
        {mgr && tab === 'outstanding' && isFullManager(me) && <View style={{ alignItems: 'center', marginBottom: 8 }}><Button small kind="ghost" title="✎ Edit The Induction Form" onPress={() => router.push('/pm/admin/inductionform' as never)} /></View>}
        <Muted style={{ marginBottom: 8 }}>{roster.length} on the roster · {data?.total ?? 0} completed</Muted>
        {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((u) => {
          const c = byOp[u];
          return (
            <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
              {c && mgr && <Pressable hitSlop={8} onPress={() => setSel((x) => { const n = new Set(x); if (n.has(u)) n.delete(u); else n.add(u); return n; })}><Text style={{ fontSize: 18 }}>{sel.has(u) ? '☑' : '☐'}</Text></Pressable>}
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>{nameOf(people, u)}</Text>
                <Muted>{c ? `✓ Completed ${day(c.completed_at)}` : '○ Not yet completed'}</Muted>
              </View>
              {c && <Pressable onPress={() => void view(c.pdf_path)}><Text>👁</Text></Pressable>}
              {c && mgr && <Pressable hitSlop={8} onPress={async () => {
                const k = await chooseAction(nameOf(people, u), [{ key: 'view', label: '⬇️ View PDF' }, { key: 'pdf', label: '📄 Export PDF' }, { key: 'email', label: '✉ Email PDF' }, { key: 'del', label: "🗑 Delete — they'll need to redo it", danger: true }]);
                if (k === 'view') void view(c.pdf_path);
                else if (k === 'pdf' || k === 'email') {
                  const url = c.pdf_path ? await openDocLink('mc-documents', c.pdf_path) : null;
                  const bytes = url ? await fetchBytes(url) : null;
                  if (!bytes) { toast('PDF not available.'); return; }
                  const filename = exportFilename(site?.name || '', `Site Induction - ${nameOf(people, u)}`, 'pdf');
                  if (k === 'pdf') { if (!(await deliverPdf(bytes, filename))) toast('Could not save the PDF.'); return; }
                  const to = await promptEmail('Email this signed induction to:', { myEmail: me?.email, clientEmail: site?.client_email }); if (!to) return;
                  const err = await emailInductions(id, to, [{ operative_name: nameOf(people, u), storage_path: c.pdf_path as string }]);
                  toast(err || 'Emailed');
                }
                else if (k === 'del' && await confirmAsk('Delete this completed induction? The operative will need to complete it again.', 'Delete') && await deleteCompletion(c.id)) { toast('Deleted — they can now redo their induction'); refresh(); }
              }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>}
            </View>
          );
        }) : <Empty>{tab === 'completed' ? 'No completed inductions yet.' : 'No outstanding operatives — everyone on the roster has completed their induction.'}</Empty>}
        {/* 550: once linked, say where signed inductions go, with Change Folder / Unlink. */}
        {mgr && tab === 'completed' && (odFolder ? (
          <Pressable onPress={async () => {
            const k = await chooseAction('OneDrive folder', [{ key: 'change', label: '📁 Change Folder' }, { key: 'unlink', label: '🗑 Unlink', danger: true }]);
            if (k === 'change') router.push({ pathname: '/pm/onedrive-pick', params: { target: 'siteinductions', id } } as never);
            else if (k === 'unlink' && await confirmAsk('Unlink this OneDrive folder? Signed inductions already there stay put; new ones won’t be pushed.', 'Unlink')) {
              if (await unlinkFolder('siteinductions', id)) void qc.invalidateQueries(); else toast('Could not unlink — try again.');
            }
          }} style={{ marginTop: space.m }}><Text style={{ color: base.ok }}>📁 Signed inductions are pushed to “<Text style={{ textDecorationLine: 'underline' }}>{odFolder}</Text>”</Text></Pressable>
        ) : <Button kind="ghost" title="☁️ Link OneDrive inductions folder" onPress={() => router.push({ pathname: '/pm/onedrive-pick', params: { target: 'siteinductions', id } } as never)} />)}
        {mgr && roster.some((u) => byOp[u]?.pdf_path) && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: space.m }}>
            {([['pdf', sel.size ? `📄 Export ${sel.size} selected` : '📄 Export all completed'], ['email', sel.size ? `✉ Email ${sel.size} selected` : '✉ Email all completed']] as const).map(([k, l]) => <View key={k} style={{ flex: 1 }}><Button kind="ghost" title={l} onPress={async () => {
              // The ticked inductions, or every completed one (550 exportSelectedInductions / emailSelectedInductions).
              const who = roster.filter((u) => byOp[u]?.pdf_path && (!sel.size || sel.has(u)));
              let to: Awaited<ReturnType<typeof promptEmail>> = null;
              if (k === 'email') { to = await promptEmail(`Email ${who.length} induction${who.length === 1 ? '' : 's'} to:`, { myEmail: me.email, clientEmail: site?.client_email }); if (!to) return; }
              const paths = who.map((u) => byOp[u]?.pdf_path).filter(Boolean) as string[];
              toast('Building PDF…');
              const merged = await PDFDocument.create(); let failed = 0;
              for (const p of paths) { try { const b = await fetchBytes(publicUrl('mc-documents', p)); if (!b) { failed++; continue; } const src = await PDFDocument.load(b, { ignoreEncryption: true }); (await merged.copyPages(src, src.getPageIndices())).forEach((pg) => merged.addPage(pg)); } catch { failed++; } }
              if (!merged.getPageCount()) { toast('Could not load the induction PDFs — check your connection and try again.'); return; }
              const name = exportFilename(site?.name || '', `Site Inductions (${paths.length - failed})`, 'pdf'), bytes = await merged.save();
              if (k === 'pdf') { if (!(await deliverPdf(bytes, name))) toast('Could not save the PDF.'); }
              else if (to) { const err = await emailInductions(id, to, who.map((u) => ({ operative_name: nameOf(people, u), storage_path: byOp[u]?.pdf_path as string }))); toast(err || `Emailed to ${to.to}`); if (!err) setSel(new Set()); }
              if (failed) toast(`${failed} induction PDF${failed === 1 ? '' : 's'} could not be included — check your connection.`);
            }} /></View>)}
          </View>
        )}
      </ScrollView>
    );
  }

  const mine = data?.byOp[me.id];
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (mine) {
    return (
      <ScrollView contentContainerStyle={pageStyle(720)}>
        <Stack.Screen options={{ title: 'Site Inductions' }} />
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 34 }}>✅</Text>
          <SectionTitle>Induction completed</SectionTitle>
          <Muted style={{ marginBottom: 12 }}>You completed this site&apos;s induction on {day(mine.completed_at)}.</Muted>
          <Button kind="ghost" title="View My Induction" onPress={() => void view(mine.pdf_path)} />
        </Card>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={pageStyle(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Site Inductions' }} />
      {form ? <InductionFill site={site} form={form} rules={rules} onView={(p) => void view(p)} onDone={() => { toast('Induction completed', { confirm: true }); refresh(); }} /> : <Muted>Loading…</Muted>}
    </ScrollView>
  );
}
