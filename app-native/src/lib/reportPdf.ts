// Report / survey PDF (430 buildReportPdf + buildReportPdfFresh): branded
// header band, title page (name, Complete badge, score, title-section answers),
// a heading bar per section with coloured answer bars, traffic-light key and
// conditions, notes, photos (numbered once), A3 drawing pages with their pin
// key, signature, then the 4-a-page Media summary and page numbers.
import { DEFAULT_BRAND1, drawFit, exportFilename, fetchBytes, fetchScaled, hexToRgb, INK, PDFDocument, rgb, safe, siteLabel, SLATE, StandardFonts, storageImage, WHITE, wrap, type PDFImage, type PDFPage } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import {
  isTitleSection, itemAllowsMedia, itemAllowsNote, itemTrafficLevel, itemVisible, pfLbl, reportDrawingKeys, reportListsItem, reportListsSection,
  scoreLabel, scoreSections, trafficHex, trafficLevels, type Answers, type ReportItem, type ReportSection,
} from '@/lib/rules/reports';
import { supabase } from '@/lib/supabase';
import type { Organization, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type PdfSub = {
  id: string; site_id: string | null; template_id: string | null; template_name: string; sections: ReportSection[]; answers: Answers; status: string;
  submitted_by: string | null; submitted_at: string | null; general_label?: string | null; pdf_path?: string | null;
};

/** Uses the template's current "show unanswered questions" setting, as the current app does. */
async function liveShowUnanswered(sub: PdfSub) {
  try {
    if (!sub.template_id || !sub.sections?.[0]) return;
    const r = await db.from('report_templates').select('sections').eq('id', sub.template_id).limit(1);
    const live = ((r.data as { sections: ReportSection[] }[] | null) ?? [])[0]?.sections?.[0];
    if (!live) return;
    if (live.showUnanswered === false) sub.sections[0].showUnanswered = false; else delete sub.sections[0].showUnanswered;
  } catch { /* keep as saved */ }
}

export async function buildReportPdf(subIn: PdfSub, site: Site | null, org: Organization | null, nameOf: (id: string | null | undefined) => string, opts: { fromBriefing?: boolean; onProgress?: (msg: string) => void } = {}): Promise<{ bytes: Uint8Array; filename: string; failures: number } | null> {
  const sub: PdfSub = { ...subIn, sections: JSON.parse(JSON.stringify(subIn.sections || [])), answers: subIn.answers || {} };
  await liveShowUnanswered(sub);
  const generalLabel = !sub.site_id ? sub.general_label || '' : '';
  const filename = exportFilename(site ? site.name : generalLabel, sub.template_name, 'pdf');
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const LINE = rgb(0.88, 0.88, 0.9), FAINT = rgb(0.85, 0.84, 0.8), HEADBAR = rgb(0.933, 0.941, 0.961);
  const GREEN = rgb(0.122, 0.573, 0.322), RED = rgb(0.757, 0.231, 0.231), GRAY = rgb(0.463, 0.463, 0.478), BLUE = rgb(0.231, 0.435, 0.851);
  const BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 44, CONTENT_W = PAGE_W - 2 * MARGIN;
  const BAR_X = MARGIN + CONTENT_W * 0.46, BAR_W = PAGE_W - MARGIN - BAR_X;
  const companyName = org?.name || 'OpHUB';
  const scoreInfo = scoreSections(sub.sections, sub.answers);
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  const T = (page: PDFPage, text: string, o: Parameters<PDFPage['drawText']>[1]) => page.drawText(safe(String(text ?? '')), o);
  const W = (t: string, f: typeof bold, s: number) => f.widthOfTextAtSize(safe(t), s);

  let page!: PDFPage, y = 0;
  const editHistory = Array.isArray((sub.answers as { _editHistory?: unknown })._editHistory) ? (sub.answers as { _editHistory: { at: string; by?: string; byName?: string }[] })._editHistory : [];
  const lastEdit = editHistory.length ? editHistory[editHistory.length - 1] : null;
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: BRAND });
    if (logo) {
      const dim = logo.scale(1), s = 40 / Math.max(dim.width, dim.height);
      page.drawRectangle({ x: MARGIN, y: PAGE_H - 76, width: 40, height: 40, color: WHITE });
      page.drawImage(logo, { x: MARGIN + (40 - dim.width * s) / 2, y: PAGE_H - 76 + (40 - dim.height * s) / 2, width: dim.width * s, height: dim.height * s });
    }
    const tx = logo ? MARGIN + 52 : MARGIN;
    T(page, 'INSPECTION REPORT', { x: tx, y: PAGE_H - 40, size: 9, font: bold, color: WHITE, opacity: 0.85 });
    T(page, sub.template_name.length > 44 ? `${sub.template_name.slice(0, 41)}…` : sub.template_name, { x: tx, y: PAGE_H - 60, size: 16, font: bold, color: WHITE });
    drawFit(page, companyName + (site ? ` · ${siteLabel(site)}` : generalLabel ? ` · ${generalLabel}` : ''), { x: tx, y: PAGE_H - 76, size: 9.5, font: reg, color: WHITE, opacity: 0.9 });
    page.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_W - MARGIN, y: 34 }, thickness: 0.75, color: FAINT });
    T(page, 'Generated via OpHUB', { x: MARGIN, y: 20, size: 8, font: reg, color: SLATE });
    if (lastEdit) {
      const t = `Edited ${new Date(lastEdit.at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} by ${lastEdit.byName || nameOf(lastEdit.by)}`;
      T(page, t, { x: PAGE_W - MARGIN - W(t, reg, 8), y: 20, size: 8, font: reg, color: SLATE });
    }
    y = PAGE_H - 118;
  };
  const ensure = (h: number) => { if (y - h < 50) newPage(); };
  const lines = (text: string, f: typeof bold, size: number, maxW: number) => wrap(safe(String(text)), f, size, maxW);
  const headingBar = (label: string, score: string | null, size = 11.5) => {
    const h = 26; ensure(h + 4);
    page.drawRectangle({ x: MARGIN, y: y - h, width: CONTENT_W, height: h, color: HEADBAR });
    drawFit(page, label, { x: MARGIN + 10, y: y - h + 8, size, font: bold, color: INK, maxWidth: CONTENT_W - 100 });
    if (score) T(page, score, { x: PAGE_W - MARGIN - 10 - W(score, bold, size - 1.5), y: y - h + 8, size: size - 1.5, font: bold, color: INK });
    y -= h + 8;
  };
  const answerRow = (label: string, value: string, bar: ReturnType<typeof rgb>) => {
    const ls = lines(label, bold, 10.5, BAR_X - MARGIN - 16), rowH = Math.max(26, ls.length * 13 + 10);
    ensure(rowH + 2);
    const top = y;
    page.drawRectangle({ x: BAR_X, y: top - rowH, width: BAR_W, height: rowH, color: bar });
    ls.forEach((l, i) => page.drawText(l, { x: MARGIN + 2, y: top - 16 - i * 13, size: 10.5, font: bold, color: INK }));
    if (value) drawFit(page, value, { x: Math.max(BAR_X + 8, PAGE_W - MARGIN - 10 - W(value, bold, 10.5)), y: top - rowH + (rowH - 10.5) / 2 + 1, size: 10.5, font: bold, color: WHITE, maxWidth: BAR_W - 16 });
    page.drawLine({ start: { x: MARGIN, y: top - rowH }, end: { x: PAGE_W - MARGIN, y: top - rowH }, thickness: 0.75, color: LINE });
    y -= rowH;
  };
  const paragraph = (label: string, text: string) => {
    ensure(30);
    drawFit(page, label, { x: MARGIN, y: y - 14, size: 10.5, font: bold, color: INK, maxWidth: CONTENT_W });
    y -= 20;
    String(text).split(/\r?\n/).flatMap((p) => lines(p, reg, 10, CONTENT_W)).forEach((l) => { ensure(14); page.drawText(l, { x: MARGIN, y: y - 10, size: 10, font: reg, color: INK }); y -= 14; });
    y -= 8;
  };

  // Every photo is fetched and shrunk once, up front; size drops as the count grows.
  const found = new Set<string>();
  const scan = (v: unknown) => {
    if (typeof v === 'string') { if (v.startsWith('data:image') || /^https?:\/\/.+\/storage\/v1\/object\//.test(v)) found.add(v); }
    else if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === 'object') Object.values(v).forEach(scan);
  };
  const drawingIds = new Set<string>();
  sub.sections.forEach((s) => (s.items || []).forEach((it) => { if (it.type === 'drawing') drawingIds.add(it.id); }));
  Object.keys(sub.answers).forEach((k) => { if (!drawingIds.has(k.replace(/__(orig|ops)$/, ''))) scan(sub.answers[k]); });
  const all = [...found];
  let dim = 1500, q = 0.82;
  if (all.length > 300) { dim = 850; q = 0.72; } else if (all.length > 150) { dim = 1000; q = 0.74; } else if (all.length > 60) { dim = 1200; q = 0.78; }
  const images = new Map<string, Promise<PDFImage | null>>();
  const embed = (url: string) => {
    if (!images.has(url)) images.set(url, (async () => { const b = await fetchScaled(url, dim, q); if (!b) return null; try { return await doc.embedJpg(b); } catch { try { return await doc.embedPng(b); } catch { return null; } } })());
    return images.get(url) as Promise<PDFImage | null>;
  };
  { let next = 0, done = 0; const worker = async () => { while (next < all.length) { await embed(all[next++]); done++; if (done % 4 === 0) opts.onProgress?.(`Preparing photos… ${done} of ${all.length}`); } }; await Promise.all([worker(), worker(), worker(), worker()]); }
  let failures = 0;
  const allPhotos: { url: string; num: number }[] = [];
  const collect = (urls: string[]) => urls.map((url) => { const e = { url, num: allPhotos.length + 1 }; allPhotos.push(e); return e; });
  const missing = (cx: number, top: number, w: number, h: number, num: number) => {
    failures++;
    page.drawRectangle({ x: cx, y: top - h, width: w, height: h, color: HEADBAR });
    page.drawText(`Photo ${num} - could not be loaded`, { x: cx + 8, y: top - h / 2, size: 9, font: reg, color: SLATE });
  };
  const photoGrid = async (entries: { url: string; num: number }[]) => {
    const colW = (CONTENT_W - 16) / 2, boxH = 180, capH = 16;
    for (let i = 0; i < entries.length; i += 2) {
      ensure(boxH + capH + 10);
      for (let c = 0; c < 2 && i + c < entries.length; c++) {
        const e = entries[i + c], cx = MARGIN + c * (colW + 16), img = await embed(e.url);
        if (img) { const d = img.scale(1), sc = Math.min(colW / d.width, boxH / d.height, 1); page.drawImage(img, { x: cx, y: y - d.height * sc, width: d.width * sc, height: d.height * sc }); }
        else missing(cx, y, colW, boxH, e.num);
        page.drawText(`Photo ${e.num}`, { x: cx, y: y - boxH - 13, size: 8.5, font: reg, color: SLATE });
      }
      y -= boxH + capH + 10;
    }
  };
  const mediaGrid = async (entries: { url: string; num: number }[]) => {
    const gutter = 14, capH = 16, cellW = (CONTENT_W - gutter) / 2;
    for (let i = 0; i < entries.length; i += 4) {
      if (i > 0) newPage();
      const startY = y, cellH = Math.max(80, (startY - 60 - gutter - capH * 2) / 2);
      const group = entries.slice(i, i + 4);
      for (let r = 0; r < 2; r++) {
        const row = group.slice(r * 2, r * 2 + 2); if (!row.length) break;
        const rowTop = startY - r * (cellH + capH + gutter);
        for (let c = 0; c < row.length; c++) {
          const e = row[c], cx = MARGIN + c * (cellW + gutter), img = await embed(e.url);
          if (img) { const d = img.scale(1), sc = Math.min(cellW / d.width, cellH / d.height, 1) * 0.8, w = d.width * sc, h = d.height * sc; page.drawImage(img, { x: cx + (cellW - w) / 2, y: rowTop - cellH + (cellH - h) / 2, width: w, height: h }); }
          else missing(cx, rowTop, cellW, cellH, e.num);
          page.drawText(`Photo ${e.num}`, { x: cx, y: rowTop - cellH - 13, size: 8.5, font: reg, color: SLATE });
        }
      }
      y = startY - 2 * (cellH + capH + gutter);
    }
  };
  const fmtAnswer = (it: ReportItem, val: unknown) => {
    if (it.type === 'date' && typeof val === 'string' && val) { const d = new Date(`${val}T00:00:00`); if (!isNaN(+d)) return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
    return val != null && val !== '' ? String(val) : '—';
  };
  const listed = (it: ReportItem) => itemVisible(it, sub.answers) && reportListsItem(sub.sections, it, sub.answers);

  /* title page */
  newPage();
  const titleSec = isTitleSection(sub.sections[0]) ? sub.sections[0] : null;
  const body = titleSec ? sub.sections.slice(1) : sub.sections;
  {
    const rowH = 30;
    drawFit(page, sub.template_name, { x: MARGIN + 8, y: y - 20, size: 12.5, font: reg, color: INK, maxWidth: CONTENT_W - 110 });
    const b = sub.status === 'completed' ? 'Complete' : 'In Progress';
    T(page, b, { x: PAGE_W - MARGIN - 10 - W(b, bold, 10.5), y: y - 19, size: 10.5, font: bold, color: sub.status === 'completed' ? GREEN : SLATE });
    page.drawLine({ start: { x: MARGIN, y: y - rowH }, end: { x: PAGE_W - MARGIN, y: y - rowH }, thickness: 0.75, color: LINE });
    y -= rowH;
  }
  if (scoreInfo.overall.possible > 0) {
    page.drawRectangle({ x: MARGIN, y: y - 30, width: CONTENT_W, height: 30, color: HEADBAR });
    T(page, 'Score', { x: MARGIN + 8, y: y - 20, size: 11, font: bold, color: INK });
    const st = scoreLabel(scoreInfo.overall);
    T(page, st, { x: PAGE_W - MARGIN - 10 - W(st, bold, 11), y: y - 20, size: 11, font: bold, color: INK });
    y -= 30;
  }
  for (const it of titleSec?.items ?? []) {
    if (!listed(it)) continue;
    const d = fmtAnswer(it, sub.answers[it.id]);
    ensure(30);
    drawFit(page, it.label, { x: MARGIN + 8, y: y - 20, size: 11, font: bold, color: INK, maxWidth: CONTENT_W * 0.45 });
    drawFit(page, d, { x: Math.max(MARGIN + CONTENT_W * 0.5, PAGE_W - MARGIN - 10 - W(d, reg, 10.5)), y: y - 20, size: 10.5, font: reg, color: INK, maxWidth: CONTENT_W * 0.48 });
    page.drawLine({ start: { x: MARGIN, y: y - 30 }, end: { x: PAGE_W - MARGIN, y: y - 30 }, thickness: 0.75, color: LINE });
    y -= 30;
  }

  /* body */
  newPage();
  headingBar(sub.template_name, scoreInfo.overall.possible > 0 ? scoreLabel(scoreInfo.overall) : null, 12.5);
  const levels = trafficLevels(sub.sections);
  if (levels) {
    ensure(22 + levels.length * 16);
    T(page, 'Condition key', { x: MARGIN, y: y - 12, size: 10.5, font: bold, color: INK }); y -= 20;
    levels.forEach((l) => { ensure(16); page.drawRectangle({ x: MARGIN + 2, y: y - 11, width: 22, height: 10, color: hexToRgb(trafficHex(l.color)) }); T(page, l.label || '', { x: MARGIN + 32, y: y - 10, size: 9.5, font: reg, color: INK }); y -= 16; });
    y -= 8;
  }
  for (const s of body) {
    if (!reportListsSection(sub.sections, s, sub.answers)) continue;
    const sc = scoreInfo.bySection[s.id];
    headingBar(s.title || '', sc ? scoreLabel(sc) : null);
    for (const it of s.items || []) {
      if (!listed(it)) continue;
      const val = sub.answers[it.id];
      if (it.type === 'instruction') {
        ensure(24);
        lines(it.label, reg, 9.5, CONTENT_W).forEach((l) => { page.drawText(l, { x: MARGIN, y: y - 10, size: 9.5, font: reg, color: SLATE }); y -= 13; });
        y -= 6; continue;
      }
      if (it.type === 'drawing') {
        const arr = Array.isArray(val) ? (val as string[]) : [];
        if (!arr.length) continue;
        for (let di = 0; di < arr.length; di++) {
          const bytes = await fetchScaled(arr[di], 3600, 0.86);
          let img: PDFImage | null = null;
          if (bytes) { try { img = await doc.embedJpg(bytes); } catch { try { img = await doc.embedPng(bytes); } catch { img = null; } } }
          if (!img) { failures++; ensure(24); T(page, `${it.label || 'Drawing'} ${di + 1} - could not be loaded`, { x: MARGIN, y: y - 12, size: 10, font: reg, color: SLATE }); y -= 20; continue; }
          const d = img.scale(1), land = d.width >= d.height, PW = land ? 1190.55 : 841.89, PH = land ? 841.89 : 1190.55, M = 28;
          const dp = doc.addPage([PW, PH]);
          drawFit(dp, `${it.label || 'Drawing'}${arr.length > 1 ? ` (${di + 1} of ${arr.length})` : ''} - ${sub.general_label || sub.template_name || ''}`.slice(0, 140), { x: M, y: PH - M - 12, size: 12, font: bold, color: INK, maxWidth: PW - 2 * M });
          const aw = PW - 2 * M, ah = PH - 2 * M - 28, s2 = Math.min(aw / d.width, ah / d.height);
          dp.drawImage(img, { x: M + (aw - d.width * s2) / 2, y: M + (ah - d.height * s2) / 2, width: d.width * s2, height: d.height * s2 });
          dp.drawText('Generated via OpHUB', { x: M, y: 12, size: 8, font: reg, color: SLATE });
        }
        y = 0;
        const keys = reportDrawingKeys(sub.sections, sub.answers);
        if (keys.length) {
          ensure(40);
          T(page, 'Drawing key', { x: MARGIN, y: y - 14, size: 12, font: bold, color: INK }); y -= 24;
          for (const k of keys) {
            const kl = lines(k.label + (k.tl ? ` (${k.tl})` : ''), bold, 10, CONTENT_W - 34), al = k.answer ? lines(k.answer, reg, 9.5, CONTENT_W - 34) : [];
            ensure(16 + kl.length * 13 + al.length * 12);
            page.drawCircle({ x: MARGIN + 9, y: y - 10, size: 9, color: hexToRgb(k.color || '#E53935') });
            const ns = String(k.n), nfs = ns.length > 2 ? 7 : 9;
            page.drawText(ns, { x: MARGIN + 9 - bold.widthOfTextAtSize(ns, nfs) / 2, y: y - 10 - nfs * 0.35, size: nfs, font: bold, color: WHITE });
            let ly = y;
            kl.forEach((l) => { page.drawText(l, { x: MARGIN + 28, y: ly - 10, size: 10, font: bold, color: INK }); ly -= 13; });
            al.forEach((l) => { page.drawText(l, { x: MARGIN + 28, y: ly - 10, size: 9.5, font: reg, color: SLATE }); ly -= 12; });
            y = Math.min(ly, y - 22) - 6;
          }
          y -= 6;
        }
        continue;
      }
      if (it.type === 'photo') {
        const arr = Array.isArray(val) ? (val as string[]) : val ? [val as string] : [];
        if (!arr.length) continue;
        ensure(24); drawFit(page, it.label, { x: MARGIN, y: y - 12, size: 10.5, font: bold, color: INK, maxWidth: CONTENT_W }); y -= 20;
        await photoGrid(collect(arr)); continue;
      }
      if (it.type === 'operatives') {
        const list = Array.isArray(val) ? (val as { included?: boolean; name: string; role?: string }[]).filter((r) => r.included) : [];
        ensure(24); drawFit(page, it.label, { x: MARGIN, y: y - 14, size: 10.5, font: bold, color: INK, maxWidth: CONTENT_W }); y -= 20;
        if (!list.length) { T(page, 'None recorded', { x: MARGIN, y: y - 10, size: 10, font: reg, color: SLATE }); y -= 14; }
        else list.forEach((r) => { ensure(14); drawFit(page, r.role ? `${r.name} — ${r.role}` : r.name, { x: MARGIN, y: y - 10, size: 10, font: reg, color: INK, maxWidth: CONTENT_W }); y -= 14; });
        y -= 8; continue;
      }
      if (it.type === 'signature') {
        if (!val) continue;
        ensure(80); drawFit(page, it.label, { x: MARGIN, y: y - 12, size: 10.5, font: bold, color: INK, maxWidth: CONTENT_W }); y -= 20;
        const bytes = await fetchBytes(publicUrl('signatures', String(val)));
        let img: PDFImage | null = null;
        if (bytes) { try { img = await doc.embedPng(bytes); } catch { try { img = await doc.embedJpg(bytes); } catch { img = null; } } }
        if (img) {
          const d = img.scale(1), s2 = Math.min(130 / d.width, 46 / d.height, 1), h = d.height * s2;
          page.drawImage(img, { x: MARGIN, y: y - h, width: d.width * s2, height: h });
          T(page, nameOf(sub.submitted_by), { x: MARGIN + 150, y: y - 16, size: 9.5, font: reg, color: INK });
          const when = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '';
          if (!opts.fromBriefing && when) T(page, when, { x: MARGIN + 150, y: y - 29, size: 9, font: reg, color: SLATE });
          y -= h + 16;
        } else { failures++; T(page, 'Signature could not be loaded', { x: MARGIN, y: y - 10, size: 9, font: reg, color: SLATE }); y -= 20; }
        page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: LINE }); y -= 12;
        continue;
      }
      if (['text', 'textarea', 'number', 'date'].includes(it.type)) paragraph(it.label, fmtAnswer(it, val));
      else {
        let display = '—', color = GRAY;
        if (it.type === 'checkbox') { display = val === true ? 'Yes' : val === false ? 'No' : '—'; color = val === true ? GREEN : val === false ? RED : GRAY; }
        else if (it.type === 'passfail' && val) { display = pfLbl(it, String(val)); color = val === 'Pass' ? GREEN : val === 'Fail' ? RED : GRAY; }
        else if (it.type === 'multichoice') { display = Array.isArray(val) && val.length ? val.join(', ') : '—'; color = BLUE; }
        else if (it.type === 'choice' && val) { display = String(val); color = val === 'Yes' ? GREEN : val === 'No' ? RED : val === 'N/A' || val === 'Not Visible' ? GRAY : BLUE; }
        answerRow(it.label, display, color);
      }
      const tl = itemTrafficLevel(sub.sections, it, sub.answers);
      if (tl) {
        const t = `Condition: ${tl.label || ''}`, tw = Math.min(W(t, bold, 9.5) + 16, CONTENT_W);
        ensure(24);
        page.drawRectangle({ x: MARGIN, y: y - 20, width: tw, height: 16, color: hexToRgb(trafficHex(tl.color)) });
        drawFit(page, t, { x: MARGIN + 8, y: y - 15.5, size: 9.5, font: bold, color: WHITE, maxWidth: tw - 12 });
        y -= 26;
      }
      const note = itemAllowsNote(it) ? String(sub.answers[`${it.id}__note`] || '').trim() : '';
      if (note) { `Note: ${note}`.split(/\r?\n/).flatMap((p) => lines(p, reg, 9.5, CONTENT_W - 12)).forEach((l) => { ensure(14); page.drawText(l, { x: MARGIN + 6, y: y - 10, size: 9.5, font: reg, color: SLATE }); y -= 13; }); y -= 5; }
      const extra = itemAllowsMedia(it) && Array.isArray(sub.answers[`${it.id}__media`]) ? (sub.answers[`${it.id}__media`] as string[]) : [];
      if (extra.length) await photoGrid(collect(extra));
    }
    y -= 6;
  }
  if (allPhotos.length) { newPage(); headingBar('Media summary', null, 12.5); await mediaGrid(allPhotos); }
  const total = doc.getPageCount();
  doc.getPages().forEach((p, i) => p.drawText(`${i + 1}/${total}`, { x: p.getWidth() - MARGIN - 26, y: 26, size: 8.5, font: reg, color: SLATE }));
  doc.setTitle(filename.replace(/\.pdf$/i, ''));
  return { bytes: await doc.save(), filename, failures };
}
