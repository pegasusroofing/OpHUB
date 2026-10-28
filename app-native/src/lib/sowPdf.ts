// Schedule of Works progress report PDF (500 buildSchedulePdfBytes): the tab
// being looked at (To Do / In Progress, Complete, All), optionally only one
// period's photos; counts and overall progress; tasks in the schedule's own
// order with a status pill and their photos grouped Before / In Progress /
// Completed (day breaks marked); then every photo in the Media summary.
import { appendMediaSummary, DEFAULT_BRAND1, drawFit, embedImage, exportFilename, fetchBytes, fetchScaled, hexToRgb, INK, PDFDocument, rgb, safe, siteLabel, SLATE, StandardFonts, storageImage, WHITE, type PDFPage } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { overallPct } from '@/lib/rules/sow';
import { supabase } from '@/lib/supabase';
import type { Organization, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Task = { id: string; name: string; status: string; percent_complete: number | null; section_id: string | null; completed_at: string | null };
type Photo = { id: string; task_id: string; storage_path: string; mid_path: string | null; thumb_path: string | null; uploaded_at: string; stage: string | null };
export type SowPeriod = { from: number; to: number; label: string; file: string } | null;
export type SowTab = 'active' | 'done' | 'all';
const TAB_LABEL: Record<SowTab, string> = { active: 'To Do / In Progress', done: 'Complete', all: 'All' };

/** Today / this week / last week / chosen dates (500 sowPeriodRange). */
export function sowPeriod(key: string, fromIso?: string, toIso?: string): SowPeriod | 'bad' {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const day = 864e5, fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), dash = (d: Date) => d.toLocaleDateString('en-GB').replace(/\//g, '-');
  if (key === 'today') return { from: +d0, to: +d0 + day, label: `Today ${fmt(d0)}`, file: `Daily ${dash(d0)}` };
  if (key === 'week' || key === 'lastweek') {
    const mon = new Date(d0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); if (key === 'lastweek') mon.setDate(mon.getDate() - 7);
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    return { from: +mon, to: +sun + day, label: `Week ${fmt(mon)} – ${fmt(sun)}`, file: `Week commencing ${dash(mon)}` };
  }
  if (key === 'custom') {
    const f = new Date(`${fromIso}T00:00:00`), t = new Date(`${toIso}T00:00:00`);
    if (isNaN(+f) || isNaN(+t) || t < f) return 'bad';
    return { from: +f, to: +t + day, label: `${fmt(f)} – ${fmt(t)}`, file: `${dash(f)} to ${dash(t)}` };
  }
  return null;
}

export async function buildSowPdf(site: Site, org: Organization | null, tab: SowTab, period: SowPeriod, onStatus?: (m: string) => void): Promise<{ bytes: Uint8Array; filename: string } | string> {
  const all = ((await db.from('schedule_tasks').select('*').eq('site_id', site.id).order('position', { ascending: true, nullsFirst: false }).order('created_at')).data as Task[] | null) ?? [];
  if (!all.length) return 'No tasks to export yet.';
  let tasks = tab === 'all' ? all : tab === 'done' ? all.filter((t) => t.status === 'done') : all.filter((t) => t.status === 'todo' || t.status === 'progress');
  if (!tasks.length) return `No tasks match the current filter ("${TAB_LABEL[tab]}") to export.`;
  let photos: Photo[] = [];
  for (let i = 0; i < tasks.length; i += 150) photos.push(...(((await db.from('schedule_photos').select('*').in('task_id', tasks.slice(i, i + 150).map((t) => t.id)).order('uploaded_at')).data as Photo[] | null) ?? []));
  if (period) {
    const inP = (ts: string | null) => { const v = ts ? new Date(ts).getTime() : NaN; return v >= period.from && v < period.to; };
    photos = photos.filter((p) => inP(p.uploaded_at));
    const withPh = new Set(photos.map((p) => p.task_id));
    tasks = tasks.filter((t) => withPh.has(t.id) || inP(t.completed_at));
    if (!tasks.length) return `Nothing was uploaded or completed in that period (${period.label}).`;
  }
  const byTask: Record<string, Photo[]> = {};
  photos.forEach((p) => { (byTask[p.task_id] ||= []).push(p); });
  onStatus?.(photos.length > 40 ? `Building PDF — ${photos.length} photos…` : 'Building PDF…');

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1);
  const FAINT = rgb(0.85, 0.84, 0.8), CARDBG = rgb(0.976, 0.969, 0.949), OK = rgb(0.2, 0.55, 0.35), OKBG = rgb(0.9, 0.95, 0.91);
  const PROG = rgb(0.16, 0.4, 0.7), PROGBG = rgb(0.87, 0.92, 0.98), TODO = rgb(0.38, 0.39, 0.44), TODOBG = rgb(0.9, 0.9, 0.92);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 42;
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  let page!: PDFPage, y = 0, current: { label: string; color: ReturnType<typeof rgb> } | null = null;
  const sectionText = (label: string, color: ReturnType<typeof rgb>) => {
    drawFit(page, label, { x: MARGIN, y, size: 11.5, font: bold, color, maxWidth: PAGE_W - 2 * MARGIN });
    y -= 6; page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: PAGE_W - MARGIN, y: y - 2 }, thickness: 1, color: FAINT }); y -= 16;
  };
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: BRAND });
    if (logo) { const d = logo.scale(1), s = 40 / Math.max(d.width, d.height); page.drawRectangle({ x: MARGIN, y: PAGE_H - 76, width: 40, height: 40, color: WHITE }); page.drawImage(logo, { x: MARGIN + (40 - d.width * s) / 2, y: PAGE_H - 76 + (40 - d.height * s) / 2, width: d.width * s, height: d.height * s }); }
    const tx = logo ? MARGIN + 52 : MARGIN;
    drawFit(page, `SCHEDULE OF WORKS — PROGRESS REPORT${period ? `  ·  ${period.label.toUpperCase()}` : ''}${tab !== 'all' ? `  ·  ${TAB_LABEL[tab].toUpperCase()} ONLY` : ''}`, { x: tx, y: PAGE_H - 40, size: 9, font: bold, color: WHITE, opacity: 0.85 });
    drawFit(page, siteLabel(site), { x: tx, y: PAGE_H - 60, size: 16, font: bold, color: WHITE });
    drawFit(page, `${org?.name || 'OpHUB'} · as of ${new Date().toLocaleDateString('en-GB')}`, { x: tx, y: PAGE_H - 76, size: 9.5, font: reg, color: WHITE, opacity: 0.9 });
    y = PAGE_H - 118;
    if (current) sectionText(current.label, current.color);
  };
  newPage();
  const chipW = 112, chipGap = 10, chipY = y - 34;
  [
    { l: period ? 'Tasks this period' : 'Total tasks', v: tasks.length, bg: CARDBG, fg: INK }, { l: 'To do', v: tasks.filter((t) => t.status === 'todo').length, bg: TODOBG, fg: TODO },
    { l: 'In progress', v: tasks.filter((t) => t.status === 'progress').length, bg: PROGBG, fg: PROG }, { l: 'Complete', v: tasks.filter((t) => t.status === 'done').length, bg: OKBG, fg: OK },
  ].forEach((c, i) => {
    const x = (PAGE_W - (4 * chipW + 3 * chipGap)) / 2 + i * (chipW + chipGap), v = String(c.v), l = c.l.toUpperCase();
    page.drawRectangle({ x, y: chipY, width: chipW, height: 44, color: c.bg });
    page.drawText(v, { x: x + (chipW - bold.widthOfTextAtSize(v, 16)) / 2, y: chipY + 22, size: 16, font: bold, color: c.fg });
    page.drawText(l, { x: x + (chipW - bold.widthOfTextAtSize(l, 7)) / 2, y: chipY + 8, size: 7, font: bold, color: c.fg, opacity: 0.85 });
  });
  y = chipY - 22;
  const pct = overallPct(all as never), barW = PAGE_W - 2 * MARGIN;
  page.drawText(`Overall progress: ${pct}%`, { x: MARGIN, y, size: 9, font: bold, color: INK }); y -= 10;
  page.drawRectangle({ x: MARGIN, y: y - 8, width: barW, height: 8, color: TODOBG });
  page.drawRectangle({ x: MARGIN, y: y - 8, width: barW * (pct / 100), height: 8, color: OK });
  y -= 28;
  const sectionHeader = (label: string) => { current = { label, color: INK }; if (y - 24 < 60) newPage(); else sectionText(label, INK); };
  const STAGES = [{ key: 'todo', label: 'Before' }, { key: 'progress', label: 'In Progress' }, { key: 'done', label: 'Completed Photos' }];
  const dayOf = (p: Photo) => { try { return new Date(p.uploaded_at).toLocaleDateString('en-GB'); } catch { return ''; } };

  const drawTask = async (t: Task) => {
    const [pill, pillBg] = t.status === 'done' ? [OK, OKBG] : t.status === 'progress' ? [PROG, PROGBG] : [TODO, TODOBG];
    const buckets: Record<string, Photo[]> = { todo: [], progress: [], done: [] };
    (byTask[t.id] || []).forEach((p) => { const s = p.stage === 'todo' || p.stage === 'progress' || p.stage === 'done' ? p.stage : t.status; (buckets[s] || buckets.todo).push(p); });
    const cardW = PAGE_W - 2 * MARGIN, pad = 14, left = MARGIN + pad, thumb = 74, gap = 8, usable = cardW - 2 * pad;
    const headerH = 30, ROW_H = thumb + gap, LABEL_H = 14, BOTTOM = 60, PAD_B = 12, SEP_W = 14;
    type Ent = { sep: true } | { p: Photo; dayStart: boolean; day: string };
    const items: { stage: { label: string }; total: number; photos: Ent[]; first: boolean }[] = [];
    STAGES.forEach((st) => {
      const ph = buckets[st.key]; if (!ph.length) return;
      const rows: Ent[][] = []; let cur: Ent[] = [], w = 0, last: string | null = null;
      ph.forEach((p) => {
        const day = dayOf(p), newDay = day !== last, sep = newDay && last !== null && cur.length > 0;
        if (cur.length && w + (sep ? SEP_W : 0) + thumb > usable) { rows.push(cur); cur = []; w = 0; }
        if (newDay && last !== null && cur.length) { cur.push({ sep: true }); w += SEP_W; }
        cur.push({ p, dayStart: newDay, day }); w += thumb + gap; last = day;
      });
      if (cur.length) rows.push(cur);
      rows.forEach((r, i) => items.push({ stage: st, total: ph.length, photos: r, first: i === 0 }));
    });
    let idx = 0, first = true;
    while (first || idx < items.length) {
      const hH = first ? headerH : 20;
      if (y - (hH + (idx < items.length ? LABEL_H + ROW_H : 0) + PAD_B) < BOTTOM) newPage();
      const room = y - BOTTOM - PAD_B;
      let used = hH, end = idx;
      while (end < items.length) { const it = items[end]; const h = ROW_H + (it.first || end === idx ? LABEL_H : 0) + (it.first && end > idx ? 6 : 0); if (used + h > room && end > idx) break; used += h; end++; }
      const blockH = used + PAD_B, top = y;
      page.drawRectangle({ x: MARGIN, y: top - blockH, width: cardW, height: blockH, color: CARDBG });
      let ty = top - 20;
      if (first) {
        const pctL = t.status === 'progress' && t.percent_complete != null ? ` ${t.percent_complete}%` : '';
        const pillW = pctL ? 100 : 76, pillX = MARGIN + cardW - 16 - pillW;
        drawFit(page, t.name, { x: left, y: ty, size: 11, font: bold, color: INK, maxWidth: pillX - 8 - left });
        page.drawRectangle({ x: pillX, y: ty - 3, width: pillW, height: 15, color: pillBg });
        page.drawText(t.status === 'todo' ? 'TO DO' : t.status === 'progress' ? `IN PROGRESS${pctL}` : 'COMPLETE', { x: pillX + 8, y: ty + 1, size: 7.5, font: bold, color: pill });
        ty -= 22;
      } else { drawFit(page, `${t.name} (continued)`, { x: left, y: ty, size: 10, font: bold, color: SLATE, maxWidth: cardW - 2 * pad }); ty -= 16; }
      for (let k = idx; k < end; k++) {
        const it = items[k];
        if (it.first || k === idx) { if (it.first && k > idx) ty -= 6; page.drawText(`${it.stage.label.toUpperCase()} (${it.total})${it.first ? '' : ' continued'}`, { x: left, y: ty, size: 8, font: bold, color: SLATE }); ty -= 12; }
        let cx = left;
        for (const e of it.photos) {
          if ('sep' in e) { const lx = cx + (SEP_W - gap) / 2; page.drawLine({ start: { x: lx, y: ty + 2 }, end: { x: lx, y: ty - thumb - 2 }, thickness: 1.6, color: BRAND }); cx += SEP_W; continue; }
          const b = e.p.thumb_path ? await fetchBytes(publicUrl('site-photos', e.p.thumb_path)) : await fetchScaled(publicUrl('site-photos', e.p.storage_path), thumb * 3, 0.78);
          const img = await embedImage(doc, b);
          if (img) { const d = img.scale(1), sc = thumb / Math.max(d.width, d.height), w = d.width * sc, h = d.height * sc; page.drawImage(img, { x: cx + (thumb - w) / 2, y: ty - thumb + (thumb - h) / 2, width: w, height: h }); }
          if (e.dayStart && e.day) { const tag = e.day.slice(0, 5), tw = bold.widthOfTextAtSize(tag, 6.5) + 6; page.drawRectangle({ x: cx, y: ty - 10, width: tw, height: 10, color: INK, opacity: 0.72 }); page.drawText(tag, { x: cx + 3, y: ty - 7.5, size: 6.5, font: bold, color: WHITE }); }
          cx += thumb + gap;
        }
        ty -= ROW_H;
      }
      idx = end; y = top - blockH - 10; first = false;
    }
  };

  const secs = ((await db.from('schedule_sections').select('id,name').eq('site_id', site.id).order('position', { ascending: true, nullsFirst: false }).order('created_at')).data as { id: string; name: string | null }[] | null) ?? [];
  const groups: { label: string; tasks: Task[] }[] = [];
  const loose = tasks.filter((t) => !t.section_id); if (loose.length) groups.push({ label: 'SCHEDULE OF WORKS', tasks: loose });
  secs.forEach((s) => { const l = tasks.filter((t) => t.section_id === s.id); if (l.length) groups.push({ label: String(s.name || 'Section').toUpperCase(), tasks: l }); });
  const known = new Set(secs.map((s) => s.id)), orphan = tasks.filter((t) => t.section_id && !known.has(t.section_id));
  if (orphan.length) groups.push({ label: 'OTHER', tasks: orphan });
  let done = 0;
  for (const g of groups) {
    sectionHeader(`${safe(g.label)} (${g.tasks.length})`);
    for (const t of g.tasks) { await drawTask(t); done++; if (done % 5 === 0) onStatus?.(`Adding tasks ${done} of ${tasks.length}…`); }
    y -= 6;
  }
  const refs: { path: string; caption?: string }[] = [];
  tasks.forEach((t) => (byTask[t.id] || []).forEach((p) => refs.push({ path: p.mid_path || p.storage_path, caption: dayOf(p) })));
  onStatus?.(`Adding ${refs.length} photos…`);
  const big = refs.length > 120;
  await appendMediaSummary(doc, refs, { maxDim: big ? 600 : 900, quality: big ? 0.6 : 0.72 });
  const n = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    p.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_W - MARGIN, y: 34 }, thickness: 0.75, color: FAINT });
    p.drawText('Generated via OpHUB', { x: MARGIN, y: 20, size: 8, font: reg, color: SLATE });
    p.drawText(`Page ${i + 1} of ${n}`, { x: PAGE_W - MARGIN - 52, y: 20, size: 8, font: reg, color: SLATE });
  });
  const filename = exportFilename(site.name, `Schedule of Works${period ? ` - ${period.file}` : ''}${tab !== 'all' ? ` - ${TAB_LABEL[tab]}` : ''}`, 'pdf');
  doc.setTitle(filename.replace(/\.pdf$/i, ''));
  return { bytes: await doc.save(), filename };
}

/** Emails the report to the chosen people (send-schedule-email), uploaded first so size doesn't matter. */
export async function emailSowPdf(siteId: string, bytes: Uint8Array, filename: string, recipients: string[], clientCc: string | null): Promise<string | null> {
  const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const up = await supabase.storage.from('mc-documents').upload(`${siteId}/schedule-exports/${id}-${filename.replace(/[^a-z0-9.-]+/gi, '_')}`, bytes, { contentType: 'application/pdf' });
  if (up.error) return 'Could not upload the PDF — try again.';
  const r = await supabase.functions.invoke('send-schedule-email', { body: { site_id: siteId, filename, storage_path: up.data.path, storage_bucket: 'mc-documents', recipients, client_cc_email: clientCc } });
  const d = r.data as { error?: string } | null;
  return r.error || d?.error ? `Email failed — ${String(d?.error || 'try again.').slice(0, 140)}` : null;
}
