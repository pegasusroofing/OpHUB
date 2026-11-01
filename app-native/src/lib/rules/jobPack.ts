// New job pack: reads the rules out of Andy's Excel, "New Job Pack - what goes where". The tab and column names are
// his sheet's; a rule is known by its App area and When, so he can reword anything else.
export type PackRule = { on: boolean; folder: string };
export type PackConfig = {
  parent_path: string; template_path: string;
  folders: string[];
  files: { folder: string; name: string }[];
  rules: Record<string, PackRule>;
  weekly: { name: string; addDate: boolean; weekStart: number; week1: 'start' | 'first' };
};
type Sheet = { name: string; rows: (string | number)[][] };

/** "App area|When" as written in the Auto sync tab, and the name the app knows that rule by. */
export const RULE_KEYS: Record<string, string> = {
  'schedule of works|pre-start photo saved': 'sow_prestart',
  'schedule of works|progress or completed photo saved': 'sow_progress',
  'schedule of works|export pressed, then onedrive': 'sow_export',
  'rams|rams issued': 'rams_issued',
  'rams|rams superseded': 'rams_superseded',
  'toolbox talks|talk issued on this job': 'tbt_issued',
  'coshh|coshh sheet added to this job': 'coshh_added',
  'data sheets|selected in the o&m': 'om_manual',
  'inductions|induction completed': 'induction',
  'permits|permit closed': 'permit_closed',
  'incidents|incident submitted': 'incident',
  'daily briefings|briefing submitted': 'briefing',
  'inspections and reports|report submitted': 'report',
  'variations|variation approved': 'variation_approved',
  'drawings|file added in the app': 'drawing_out',
  'drawings|file added in onedrive': 'drawing_in',
  'material orders|file added in onedrive': 'material_orders_in',
};
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const txt = (c: unknown) => String(c ?? '').trim();
const yes = (c: unknown) => /^y/i.test(txt(c));
// Rows under a tab's header row, picked out by the header's words so an added column doesn't matter.
function table(sheets: Sheet[], tab: string, first: string): { col: (h: string) => number; rows: (string | number)[][] } | null {
  const s = sheets.find((x) => x.name.trim().toLowerCase() === tab);
  if (!s) return null;
  const at = s.rows.findIndex((r) => txt(r[0]).toLowerCase() === first);
  if (at < 0) return null;
  const head = s.rows[at].map((h) => txt(h).toLowerCase());
  return { col: (h) => head.findIndex((x) => x.startsWith(h)), rows: s.rows.slice(at + 1).filter((r) => txt(r[0])) };
}

/** The rules, or what's wrong in plain words. */
export function parseJobPack(sheets: Sheet[], where: { parent_path: string; template_path: string }): { config: PackConfig } | { error: string } {
  const folders = table(sheets, 'folders', 'folder'), files = table(sheets, 'template files', 'in folder'), sync = table(sheets, 'auto sync', 'app area'), weekly = table(sheets, 'weekly folders', 'rule');
  const missing = [!folders && 'Folders', !files && 'Template files', !sync && 'Auto sync', !weekly && 'Weekly folders'].filter(Boolean);
  if (!folders || !files || !sync || !weekly) return { error: `This isn't the job pack Excel: can't find the ${missing.join(', ')} tab.` };
  const rules: Record<string, PackRule> = {};
  const unknown: string[] = [];
  for (const r of sync.rows) {
    const k = RULE_KEYS[`${txt(r[sync.col('app area')]).toLowerCase()}|${txt(r[sync.col('when')]).toLowerCase()}`];
    if (!k) { unknown.push(`${txt(r[sync.col('app area')])}: ${txt(r[sync.col('when')])}`); continue; }
    rules[k] = { on: yes(r[sync.col('on?')]), folder: txt(r[sync.col('to this folder')]).replace(/\\/g, '/') };
  }
  if (unknown.length) return { error: `The app doesn't know these Auto sync rows, so leave their first two columns as they were: ${unknown.join('; ')}` };
  const setting = (name: string) => { const row = weekly.rows.find((r) => txt(r[0]).toLowerCase() === name); return row ? txt(row[1]) : ''; };
  const day = DAYS.indexOf(setting('week starts on').toLowerCase());
  return { config: {
    ...where,
    folders: folders.rows.filter((r) => yes(r[folders.col('make it?')])).map((r) => txt(r[0]).replace(/\\/g, '/')),
    files: files.rows.filter((r) => yes(r[files.col('copy to new job?')])).map((r) => ({ folder: txt(r[0]).startsWith('(') ? '' : txt(r[0]).replace(/\\/g, '/'), name: txt(r[files.col('file')]) })),
    rules,
    weekly: {
      name: setting('name of each week folder') || '{order}. Week {n}',
      addDate: yes(setting('add the date to the name?')),
      weekStart: day < 0 ? 1 : day,
      week1: /first/i.test(setting('week 1 starts')) ? 'first' : 'start',
    },
  } };
}
