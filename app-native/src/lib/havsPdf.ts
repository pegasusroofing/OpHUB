// HAVS exposure report PDF (660 buildHavsPdf): one set of pages per operative
// (Monday–Friday, each tool session with magnitude, minutes, partial A(8) and
// points, daily totals coloured by EAV / ELV, weekly total), then the HSE
// Tool Exposure Reference page. Logo sits top-right, as RTB asked.
import { DEFAULT_BRAND1, drawFit, exportFilename, hexToRgb, INK, PDFDocument, rgb, safe, siteLabel, SLATE, StandardFonts, storageImage, WHITE, wrap, type PDFImage, type PDFPage } from '@/lib/pdf';
import { localISODate } from '@/lib/rules/driver';
import { a8, HAVS_DAY_LABELS, points, titleCaseWords } from '@/lib/rules/havs';
import { supabase } from '@/lib/supabase';
import type { Organization, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Tool = { id: string; name: string; vibration_magnitude: number | null };
type Entry = { user_id: string; entry_date: string; tool_id: string; minutes: number };
const LOGO = 46, LOGO_X = 595.28 - 44 - LOGO;

export async function buildHavsPdf(site: Site, org: Organization | null, days: Date[], weekLabel: string, operatives: { id: string; name: string }[], label: string) {
  const from = localISODate(days[0]), to = localISODate(days[4]);
  const [t, e] = await Promise.all([
    db.from('havs_tools').select('*').eq('org_id', org?.id || site.org_id || ''),
    db.from('havs_entries').select('*').eq('site_id', site.id).gte('entry_date', from).lte('entry_date', to).order('entry_date'),
  ]);
  const tools = (t.data as Tool[] | null) ?? [], entries = (e.data as Entry[] | null) ?? [];
  const byId: Record<string, Tool> = Object.fromEntries(tools.map((x) => [x.id, x]));
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica), italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const LINE = rgb(0.85, 0.85, 0.85), HEADBG = rgb(0.95, 0.94, 0.91), RED = rgb(0.757, 0.231, 0.231), AMBER = rgb(0.8, 0.53, 0.02), GREEN = rgb(0.122, 0.573, 0.322);
  const BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1);
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  const drawLogo = (page: PDFPage, img: PDFImage | null) => {
    if (!img) return; const d = img.scale(1), s = LOGO / Math.max(d.width, d.height);
    page.drawRectangle({ x: LOGO_X, y: 841.89 - 72, width: LOGO, height: LOGO, color: WHITE });
    page.drawImage(img, { x: LOGO_X + (LOGO - d.width * s) / 2, y: 841.89 - 72 + (LOGO - d.height * s) / 2, width: d.width * s, height: d.height * s });
  };

  for (const op of operatives) {
    const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 44, TABLE_W = PAGE_W - 2 * MARGIN;
    const COLS: [string, number][] = [['Day', 56], ['Tool', 168], ['Mag (m/s²)', 74], ['Mins', 48], ['Partial A(8)', 84], ['Points', TABLE_W - 56 - 168 - 74 - 48 - 84]];
    const colX = (i: number) => MARGIN + COLS.slice(0, i).reduce((s, c) => s + c[1], 0);
    let page!: PDFPage, y = 0;
    const newPage = () => {
      page = doc.addPage([PAGE_W, PAGE_H]);
      page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: BRAND });
      drawLogo(page, logo);
      const mw = PAGE_W - 2 * MARGIN - (logo ? LOGO + 8 : 0);
      page.drawText('HAVS EXPOSURE REPORT', { x: MARGIN, y: PAGE_H - 34, size: 9, font: bold, color: WHITE, opacity: 0.85 });
      drawFit(page, op.name, { x: MARGIN, y: PAGE_H - 54, size: 16, font: bold, color: WHITE, maxWidth: mw });
      drawFit(page, `${siteLabel(site)} · Week ${weekLabel}`, { x: MARGIN, y: PAGE_H - 70, size: 9.5, font: reg, color: WHITE, opacity: 0.9, maxWidth: mw });
      page.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_W - MARGIN, y: 34 }, thickness: 0.75, color: LINE });
      page.drawText('Generated via OpHUB', { x: MARGIN, y: 20, size: 8, font: reg, color: SLATE });
      page.drawText('EAV (action) = 100 pts/day · ELV (limit) = 400 pts/day', { x: PAGE_W - MARGIN - 220, y: 20, size: 8, font: reg, color: SLATE });
      y = PAGE_H - 100;
      page.drawRectangle({ x: MARGIN, y: y - 20, width: TABLE_W, height: 20, color: HEADBG });
      COLS.forEach((c, i) => { const lbl = safe(c[0]); const tw = i >= 2 ? bold.widthOfTextAtSize(lbl, 7.5) : 0; page.drawText(lbl, { x: i >= 2 ? colX(i) + (c[1] - tw) / 2 : colX(i) + 6, y: y - 14, size: 7.5, font: bold, color: INK }); });
      page.drawLine({ start: { x: MARGIN, y: y - 20 }, end: { x: MARGIN + TABLE_W, y: y - 20 }, thickness: 1, color: INK });
      y -= 20;
    };
    const row = (cells: string[], o: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
      const f = o.bold ? bold : reg, size = 8.5;
      const wrapped = cells.map((c, i) => wrap(safe(String(c)), f, size, COLS[i][1] - 12));
      const rh = Math.max(16, Math.max(1, ...wrapped.map((w) => w.length)) * 10.5 + 7);
      if (y - rh < 60) newPage();
      const top = y;
      wrapped.forEach((ls, i) => ls.forEach((l, li) => { const tw = i >= 2 ? f.widthOfTextAtSize(l, size) : 0; page.drawText(l, { x: i >= 2 ? colX(i) + (COLS[i][1] - tw) / 2 : colX(i) + 6, y: top - 12 - li * 10.5, size, font: f, color: o.color || INK }); }));
      page.drawLine({ start: { x: MARGIN, y: top - rh }, end: { x: MARGIN + TABLE_W, y: top - rh }, thickness: 0.5, color: LINE });
      y = top - rh;
    };
    newPage();
    let weekly = 0, maxDay = 0;
    days.forEach((d, di) => {
      const ds = localISODate(d), sessions = entries.filter((x) => x.user_id === op.id && x.entry_date === ds);
      const dl = `${HAVS_DAY_LABELS[di]} ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
      if (!sessions.length) { row([dl, 'No tool use logged', '—', '—', '—', '—'], { color: SLATE }); return; }
      let day = 0;
      sessions.forEach((s, i) => {
        const tool = byId[s.tool_id], mag = tool ? Number(tool.vibration_magnitude) || 0 : 0, pts = points(mag, s.minutes);
        day += pts;
        row([i === 0 ? dl : '', tool ? titleCaseWords(tool.name) : '(removed tool)', mag.toFixed(1), String(s.minutes), a8(mag, s.minutes).toFixed(2), pts.toFixed(1)]);
      });
      weekly += day; maxDay = Math.max(maxDay, day);
      row(['', '', '', '', 'Daily total:', `${day.toFixed(1)} pts`], { bold: true, color: day >= 400 ? RED : day >= 100 ? AMBER : GREEN });
    });
    if (y - 22 < 60) newPage();
    y -= 6; page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + TABLE_W, y }, thickness: 1, color: INK }); y -= 4;
    row(['', '', '', '', 'Weekly Total:', `${weekly.toFixed(1)} pts`], { bold: true });
    if (y - 12 < 60) newPage();
    page.drawText('(informational — limits are daily)', { x: colX(4) + 6, y: y - 6, size: 4.25, font: italic, color: SLATE });
    y -= 12;
    if (maxDay < 100) {
      if (y - 20 < 60) newPage();
      page.drawRectangle({ x: MARGIN, y: y - 18, width: TABLE_W, height: 18, color: rgb(0.91, 0.97, 0.93) });
      page.drawText('Exposure likely to be below 2.5m/s2A(8) EAV (100 points daily)', { x: MARGIN + 8, y: y - 12, size: 8.5, font: bold, color: GREEN });
      y -= 18;
    }
  }

  /* HSE calculator reference page */
  {
    const PAGE_W = 660.28, PAGE_H = 841.89, MARGIN = 44, TABLE_W = PAGE_W - 2 * MARGIN, TW = (TABLE_W - 210 - 80 - 75) / 2;
    const COLS: [string, number, string | null][] = [['Tool', 210, null], ['Mag (m/s²)', 80, null], ['Pts / hour', 75, null], ['Time to EAV', TW, '(100pts)'], ['Time to ELV', TW, '(400pts)']];
    const colX = (i: number) => MARGIN + COLS.slice(0, i).reduce((s, c) => s + c[1], 0);
    const hrs = (h: number) => { if (!isFinite(h) || h <= 0) return '—'; const m = Math.round(h * 60), hh = Math.floor(m / 60); return `${hh ? `${hh}h ` : ''}${m % 60}m`; };
    let page = doc.addPage([PAGE_W, PAGE_H]), y = PAGE_H - 100;
    const head = () => {
      page.drawRectangle({ x: MARGIN, y: y - 22, width: TABLE_W, height: 22, color: HEADBG });
      COLS.forEach(([l, w, note], i) => {
        const lbl = safe(l), mw = bold.widthOfTextAtSize(lbl, 7.5), nw = note ? italic.widthOfTextAtSize(` ${note}`, 6.4) : 0;
        if (i === 0) { page.drawText(lbl, { x: colX(0) + 6, y: y - 15, size: 7.5, font: bold, color: INK }); return; }
        const x0 = colX(i) + (w - mw - nw) / 2;
        page.drawText(lbl, { x: x0, y: y - 15, size: 7.5, font: bold, color: INK });
        if (note) page.drawText(` ${note}`, { x: x0 + mw, y: y - 15, size: 6.4, font: italic, color: SLATE });
      });
      page.drawLine({ start: { x: MARGIN, y: y - 22 }, end: { x: MARGIN + TABLE_W, y: y - 22 }, thickness: 1, color: INK });
      y -= 22;
    };
    page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: BRAND });
    drawLogo(page, logo);
    page.drawText('HSE HAND-ARM VIBRATION CALCULATOR', { x: MARGIN, y: PAGE_H - 34, size: 9, font: bold, color: WHITE, opacity: 0.85 });
    page.drawText('Tool Exposure Reference', { x: MARGIN, y: PAGE_H - 54, size: 16, font: bold, color: WHITE });
    drawFit(page, 'Trigger times to the Exposure Action Value (EAV) and Exposure Limit Value (ELV), per HSE methodology', { x: MARGIN, y: PAGE_H - 70, size: 8.5, font: reg, color: WHITE, opacity: 0.9, maxWidth: PAGE_W - 2 * MARGIN - (logo ? LOGO + 8 : 0) });
    head();
    const room = (h: number) => {
      if (y - h >= 90) return;
      page = doc.addPage([PAGE_W, PAGE_H]);
      page.drawRectangle({ x: 0, y: PAGE_H - 50, width: PAGE_W, height: 50, color: BRAND });
      page.drawText('HSE HAND-ARM VIBRATION CALCULATOR (cont.)', { x: MARGIN, y: PAGE_H - 30, size: 11, font: bold, color: WHITE });
      y = PAGE_H - 70; head();
    };
    if (!tools.length) { room(18); page.drawText('No HAVS tools set up yet.', { x: MARGIN + 6, y: y - 13, size: 9, font: reg, color: SLATE }); y -= 18; }
    const centre = (t: string, i: number, ty: number) => page.drawText(t, { x: colX(i) + (COLS[i][1] - reg.widthOfTextAtSize(t, 8.5)) / 2, y: ty, size: 8.5, font: reg, color: INK });
    tools.forEach((tl) => {
      const mag = Number(tl.vibration_magnitude) || 0, pph = 2 * mag * mag;
      const nl = wrap(safe(titleCaseWords(tl.name)), reg, 8.5, 198), rh = Math.max(18, nl.length * 10.5 + 7);
      room(rh);
      const top = y;
      nl.forEach((l, li) => page.drawText(l, { x: colX(0) + 6, y: top - 12 - li * 10.5, size: 8.5, font: reg, color: INK }));
      centre(mag.toFixed(1), 1, top - 12); centre(pph.toFixed(1), 2, top - 12);
      centre(hrs(pph > 0 ? 100 / pph : Infinity), 3, top - 12); centre(hrs(pph > 0 ? 400 / pph : Infinity), 4, top - 12);
      page.drawLine({ start: { x: MARGIN, y: top - rh }, end: { x: MARGIN + TABLE_W, y: top - rh }, thickness: 0.5, color: LINE });
      y = top - rh;
    });
    room(48); y -= 10;
    wrap(safe("Points/hour and trigger times are calculated from each tool's recorded vibration magnitude using the HSE exposure-points method: A(8) = magnitude x sqrt(minutes / 480); points = A(8)^2 x 100 / 6.25. Update a tool's magnitude in Admin Centre - HAVS Tools and this page updates to match."), reg, 7.5, TABLE_W)
      .forEach((l) => { page.drawText(l, { x: MARGIN, y, size: 7.5, font: reg, color: SLATE }); y -= 10; });
  }
  return { bytes: await doc.save(), filename: exportFilename(site.name, `HAVS - ${label} - ${weekLabel}`, 'pdf') };
}

/** Emails the register to the person sending it (send-havs-email), optionally CC client. */
export async function emailHavsPdf(siteId: string, bytes: Uint8Array, filename: string, weekLabel: string, clientCc: string | null): Promise<string> {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await supabase.functions.invoke('send-havs-email', { body: { site_id: siteId, filename, content_base64: btoa(bin), week_label: weekLabel, client_cc_email: clientCc } });
  const d = r.data as { error?: string } | null;
  return r.error || d?.error ? `Email failed — ${d?.error || 'try again'}` : 'HAVS register emailed to you';
}
