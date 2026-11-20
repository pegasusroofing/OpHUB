// A subcontractor's RAMS sent back by the PM or site manager (Andy, 20 Nov 2026: "they then have a tick to sign or a reject &
// comment (this enables the pm/site manager to add text and highlight areas in the rams"). Say what needs changing; on the
// office laptop, mark up any page of the RAMS (text, pen, rings, arrows, hatching) - the marked-up pages go back with it as
// a PDF. Their admin sees the comments and the marked-up copy, and uploads a revised version.
import { useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { pdfPageCount, pdfPageImage } from '@/components/DocViewer';
import { MarkupEditor } from '@/components/MarkupEditor';
import { Popup, PopupButtons } from '@/components/Popup';
import { chooseAction, useToast } from '@/components/toast';
import { Muted } from '@/components/ui';
import { openDocLink, type HsDoc } from '@/data/hs';
import { PDFDocument } from '@/lib/pdfLazy';
import type { MarkOp } from '@/lib/rules/markup';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';
import { base, radius } from '@/theme/theme';

type Marked = { page: number; image: string; ops: MarkOp[] };

/** The marked-up pages as one PDF, each page the size of its picture fitted to A4 width. */
async function markedPdf(pages: Marked[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const p of [...pages].sort((a, b) => a.page - b.page)) {
    const bytes = new Uint8Array(await (await fetch(p.image)).arrayBuffer());
    const im = bytes[0] === 0x89 && bytes[1] === 0x50 ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    const w = 595.28, h = (im.height / im.width) * w;
    out.addPage([w, h]).drawImage(im, { x: 0, y: 0, width: w, height: h });
  }
  return out.save();
}

export function RamsSendBack({ doc, site, onClose, onDone }: { doc: HsDoc; site: Site; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [pages, setPages] = useState<Marked[]>([]);
  const [mark, setMark] = useState<{ page: number; src: string; ops: MarkOp[] } | null>(null);
  const [busy, setBusy] = useState('');
  const web = Platform.OS === 'web';

  const markPage = async () => {
    setBusy('page');
    try {
      const url = await openDocLink('rams-docs', doc.storage_path);
      if (!url) { toast('Could not open the RAMS.'); return; }
      const n = (await pdfPageCount(url)) || 1;
      let page = 1;
      if (n > 1) {
        const k = await chooseAction('Which Page?', Array.from({ length: Math.min(n, 60) }, (_, i) => ({ key: String(i + 1), label: `Page ${i + 1}${pages.some((x) => x.page === i + 1) ? ' (marked up)' : ''}` })));
        if (!k) return;
        page = Number(k);
      }
      const had = pages.find((x) => x.page === page);
      const src = await pdfPageImage(url, page);
      if (!src) { toast('Could not draw that page — try again.'); return; }
      setMark({ page, src, ops: had?.ops ?? [] });
    } finally { setBusy(''); }
  };
  const send = async () => {
    if (!note.trim()) { toast('Say what needs changing, so they know what to fix.'); return; }
    setBusy('send');
    try {
      let path: string | null = null;
      if (pages.length) {
        const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
        const up = await supabase.storage.from('rams-docs').upload(`${site.id}/rams-review/${doc.id}-${rid}.pdf`, await markedPdf(pages), { contentType: 'application/pdf' });
        if (up.error) { toast('Could not save the marked-up pages — check your signal and try again.'); return; }
        path = up.data.path;
      }
      const r = await supabase.from('rams_docs').update({ approval_status: 'rejected', approval_note: note.trim(), approval_markup_path: path } as never).eq('id', doc.id).select('id');
      if (r.error || !r.data?.length) { toast(r.error?.message?.includes('sign it off') ? r.error.message : 'Could not send it back — try again.'); return; }
      onDone();
    } finally { setBusy(''); }
  };

  if (mark) return (
    <MarkupEditor plan title={`Mark Up RAMS — Page ${mark.page}`} src={mark.src} ops={mark.ops} onClose={(out) => {
      const m = mark; setMark(null);
      if (out) setPages((ps) => [...ps.filter((x) => x.page !== m.page), { page: m.page, image: out.image, ops: out.ops }]);
    }} />
  );
  return (
    <Popup title={`Send Back "${doc.name}"`} onClose={onClose} width={460}
      footer={<PopupButtons yes={busy === 'send' ? 'Sending…' : 'Send Back'} no="Cancel" onYes={() => void send()} onNo={onClose} />}>
      <Muted style={{ marginBottom: 6 }}>Say what needs changing. They see it with the RAMS and upload a revised version; nobody signs it until it’s approved.</Muted>
      <TextInput value={note} onChangeText={setNote} multiline placeholder="What needs changing" accessibilityLabel="What needs changing"
        style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, minHeight: 90, color: base.ink, textAlignVertical: 'top', marginBottom: 8, backgroundColor: base.card }} />
      {web ? (
        <>
          {pages.sort((a, b) => a.page - b.page).map((p) => (
            <View key={p.page} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
              <Text style={{ flex: 1, color: base.ink }}>✏️ Page {p.page} marked up</Text>
              <Pressable accessibilityLabel={`Remove page ${p.page} mark-up`} onPress={() => setPages((ps) => ps.filter((x) => x.page !== p.page))}><Text style={{ color: base.slate, fontSize: 16 }}>✕</Text></Pressable>
            </View>
          ))}
          <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void markPage()} style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.input, borderWidth: 1, borderColor: base.line, backgroundColor: base.card, marginBottom: 4 }}>
            <Text style={{ color: base.ink, fontWeight: '600' }}>{busy === 'page' ? 'Opening…' : '✏️ Mark Up A Page (Text / Highlight)'}</Text>
          </Pressable>
        </>
      ) : <Muted>Marking up the pages is on the office laptop.</Muted>}
    </Popup>
  );
}
