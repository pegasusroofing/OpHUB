// PUWER tool inspection PDF (680 buildPuwerCollectivePdf / drawPuwerInspectionPage):
// a page set per operative — question grid with Y / N per tool, status row,
// verdict box, comments, inspected by, then a photo summary per tool.
import { DEFAULT_BRAND1, drawFit, embedImage, exportFilename, fetchBytes, hexToRgb, INK, PDFDocument, rgb, safe, siteLabel, SLATE, StandardFonts, storageImage, WHITE, wrap, type PDFPage } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { PUWER_QUESTIONS, toolPasses, type PuwerKey } from '@/lib/rules/puwer';
import { supabase } from '@/lib/supabase';
import type { Organization, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Tool = { name: string; serial_number: string | null; photo_path: string | null } & Record<PuwerKey, boolean>;
const LOGO = 46, LOGO_X = 595.28 - 44 - LOGO;

/** "02 Nov – 06 Nov 2026" for the week starting on that Monday. */
export function puwerWeekLabel(weekStart: string) {
  const s = new Date(`${weekStart}T00:00:00`), e = new Date(s.getTime() + 4 * 864e5);
  return `${s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${e.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

export async function buildPuwerPdf(site: Site, org: Organization | null, weekStart: string, operatives: { id: string; name: string }[], label: string, nameOf: (id: string | null | undefined) => string) {
  const weekLabel = puwerWeekLabel(weekStart);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica), italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const LINE = rgb(0.85, 0.85, 0.85), HEADBG = rgb(0.95, 0.94, 0.91), RED = rgb(0.757, 0.231, 0.231), GREEN = rgb(0.122, 0.573, 0.322), BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1);
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 44, TABLE_W = PAGE_W - 2 * MARGIN;
  for (const op of operatives) {
    const insp = (((await db.from('puwer_inspections').select('*').eq('site_id', site.id).eq('user_id', op.id).eq('week_start', weekStart)).data as { id: string; comments: string | null; inspected_by: string | null; created_at: string }[] | null) ?? [])[0] || null;
    const tools = insp ? (((await db.from('puwer_inspection_tools').select('*').eq('inspection_id', insp.id).order('sort_order')).data as Tool[] | null) ?? []) : [];
    let page!: PDFPage, y = 0;
    const newPage = () => {
      page = doc.addPage([PAGE_W, PAGE_H]);
      page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: BRAND });
      if (logo) { const d = logo.scale(1), s = LOGO / Math.max(d.width, d.height); page.drawRectangle({ x: LOGO_X, y: PAGE_H - 72, width: LOGO, height: LOGO, color: WHITE }); page.drawImage(logo, { x: LOGO_X + (LOGO - d.width * s) / 2, y: PAGE_H - 72 + (LOGO - d.height * s) / 2, width: d.width * s, height: d.height * s }); }
      const mw = PAGE_W - 2 * MARGIN - (logo ? LOGO + 8 : 0);
      page.drawText('PUWER TOOL INSPECTION', { x: MARGIN, y: PAGE_H - 34, size: 9, font: bold, color: WHITE, opacity: 0.85 });
      drawFit(page, op.name, { x: MARGIN, y: PAGE_H - 54, size: 16, font: bold, color: WHITE, maxWidth: mw });
      drawFit(page, `${siteLabel(site)} · Week ${weekLabel}`, { x: MARGIN, y: PAGE_H - 70, size: 9.5, font: reg, color: WHITE, opacity: 0.9, maxWidth: mw });
      page.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_W - MARGIN, y: 34 }, thickness: 0.75, color: LINE });
      page.drawText('Generated via OpHUB', { x: MARGIN, y: 20, size: 8, font: reg, color: SLATE });
      y = PAGE_H - 100;
    };
    const room = (h: number) => { if (y - h < 60) newPage(); };
    newPage();
    if (!insp) { page.drawText('No PUWER inspection recorded this week.', { x: MARGIN, y, size: 10, font: italic, color: SLATE }); continue; }
    const QW = 150, tw = tools.length ? (TABLE_W - QW) / tools.length : 0;
    const colX = (i: number) => (i === 0 ? MARGIN : MARGIN + QW + (i - 1) * tw);
    if (tools.length) {
      room(38);
      page.drawRectangle({ x: MARGIN, y: y - 28, width: TABLE_W, height: 28, color: HEADBG });
      page.drawText('Question', { x: MARGIN + 6, y: y - 18, size: 8, font: bold, color: INK });
      tools.forEach((t, i) => wrap(safe(t.name), bold, 8, tw - 10).slice(0, 2).forEach((l, li) => page.drawText(l, { x: colX(i + 1) + (tw - bold.widthOfTextAtSize(l, 8)) / 2, y: y - 10 - li * 10, size: 8, font: bold, color: INK })));
      page.drawLine({ start: { x: MARGIN, y: y - 28 }, end: { x: MARGIN + TABLE_W, y: y - 28 }, thickness: 1, color: INK });
      y -= 28;
      PUWER_QUESTIONS.forEach((q) => {
        const lines = wrap(q.text, reg, 7.5, QW - 12), rh = Math.max(24, 28 + (lines.length - 1) * 9.5);
        room(rh);
        const top = y;
        page.drawText(q.label, { x: MARGIN + 6, y: top - 11, size: 8.5, font: bold, color: INK });
        lines.forEach((l, li) => page.drawText(l, { x: MARGIN + 6, y: top - 22 - li * 9.5, size: 7.5, font: reg, color: SLATE }));
        tools.forEach((t, i) => { const m = t[q.key] ? 'Y' : 'N'; page.drawText(m, { x: colX(i + 1) + (tw - bold.widthOfTextAtSize(m, 11)) / 2, y: top - rh / 2 - 4, size: 11, font: bold, color: t[q.key] ? GREEN : RED }); });
        page.drawLine({ start: { x: MARGIN, y: top - rh }, end: { x: MARGIN + TABLE_W, y: top - rh }, thickness: 0.5, color: LINE });
        y = top - rh;
      });
      room(26);
      page.drawText('Status', { x: MARGIN + 6, y: y - 16, size: 8.5, font: bold, color: INK });
      tools.forEach((t, i) => { const p = toolPasses(t), l = p ? 'Acceptable' : 'Cannot be used'; page.drawText(l, { x: colX(i + 1) + (tw - bold.widthOfTextAtSize(l, 7.5)) / 2, y: y - 16, size: 7.5, font: bold, color: p ? GREEN : RED }); });
      page.drawLine({ start: { x: MARGIN, y: y - 26 }, end: { x: MARGIN + TABLE_W, y: y - 26 }, thickness: 1, color: INK });
      y -= 32; room(20);
      const all = tools.every(toolPasses);
      page.drawRectangle({ x: MARGIN, y: y - 18, width: TABLE_W, height: 18, color: all ? rgb(0.91, 0.97, 0.93) : rgb(0.98, 0.92, 0.92) });
      page.drawText(all ? 'All tools inspected are acceptable for use.' : 'One or more tools cannot be used until brought in line with PUWER regulations.', { x: MARGIN + 8, y: y - 12, size: 8.5, font: bold, color: all ? GREEN : RED });
      y -= 18;
    }
    y -= 14; room(24);
    page.drawText('Any Other Comments', { x: MARGIN, y, size: 9, font: bold, color: INK }); y -= 14;
    String(insp.comments || '—').split(/\r?\n/).flatMap((p) => wrap(safe(p), reg, 8.5, TABLE_W)).forEach((l) => { room(12); page.drawText(l, { x: MARGIN, y, size: 8.5, font: reg, color: INK }); y -= 12; });
    y -= 10; room(20);
    drawFit(page, `Inspected by ${insp.inspected_by ? nameOf(insp.inspected_by) : '—'} · ${new Date(insp.created_at).toLocaleDateString('en-GB')}`, { x: MARGIN, y, size: 8.5, font: italic, color: SLATE, maxWidth: TABLE_W });
    y -= 20;
    if (tools.length) {
      room(24); page.drawText('TOOL PHOTO SUMMARY', { x: MARGIN, y, size: 11, font: bold, color: INK }); y -= 18;
      for (let i = 0; i < tools.length; i++) {
        const t = tools[i], pass = toolPasses(t);
        room(160);
        drawFit(page, `Tool ${i + 1}: ${t.name}`, { x: MARGIN, y, size: 10, font: bold, color: INK, maxWidth: TABLE_W }); y -= 14;
        drawFit(page, `Item ID: ${t.serial_number || '—'}`, { x: MARGIN, y, size: 8.5, font: reg, color: SLATE, maxWidth: TABLE_W }); y -= 12;
        let imgH = 0;
        if (t.photo_path) {
          const img = await embedImage(doc, await fetchBytes(publicUrl('operative-tools', t.photo_path)));
          if (img) { const d = img.scale(1), s = Math.min(140 / d.width, 105 / d.height, 1), h = d.height * s; room(h + 10); page.drawImage(img, { x: MARGIN, y: y - h, width: d.width * s, height: h }); imgH = h; }
        }
        page.drawRectangle({ x: MARGIN + 160, y: y - 16, width: 200, height: 16, color: pass ? GREEN : RED });
        page.drawText(pass ? 'Compliant' : 'Non-Compliant', { x: MARGIN + 168, y: y - 11, size: 8.5, font: bold, color: WHITE });
        y = y - Math.max(imgH, 20) - 14;
        if (!pass) { room(10); page.drawText('Cannot be used until brought in line with PUWER regulations.', { x: MARGIN, y, size: 7.5, font: italic, color: RED }); y -= 10; }
        y -= 8; page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + TABLE_W, y }, thickness: 0.5, color: LINE }); y -= 10;
      }
    }
  }
  return { bytes: await doc.save(), filename: exportFilename(site.name, `PUWER - ${label} - ${weekLabel}`, 'pdf'), weekLabel };
}

export async function emailPuwerPdf(siteId: string, bytes: Uint8Array, filename: string, weekLabel: string, operativeName: string, clientCc: string | null): Promise<string> {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await supabase.functions.invoke('send-puwer-email', { body: { site_id: siteId, filename, content_base64: btoa(bin), week_label: weekLabel, operative_name: operativeName, client_cc_email: clientCc } });
  const d = r.data as { error?: string } | null;
  return r.error || d?.error ? `Email failed — ${d?.error || 'try again'}` : 'PUWER report emailed to you';
}
