import { createClient } from 'npm:@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, cache-control, pragma',
};

function ok(obj: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...obj }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Same refresh pattern as onedrive-upload — kept independent here since this
// runs from a nightly cron with no signed-in user, so it authenticates by
// org_id (read straight off the site row) instead of a caller's JWT.
async function refreshIfNeeded(admin: any, conn: any) {
  if (new Date(conn.expires_at).getTime() > Date.now() + 60000) return conn.access_token;
  const AZURE_CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID');
  const AZURE_CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET');
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: AZURE_CLIENT_ID!,
      client_secret: AZURE_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await admin.from('onedrive_connections').update({ access_token: data.access_token, refresh_token: data.refresh_token || conn.refresh_token, expires_at: expiresAt }).eq('org_id', conn.org_id);
  return data.access_token;
}

function d(v: string | null) { return v ? (/[T ]\d{2}:\d{2}/.test(v) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(v)) : v.slice(0, 10)) : ''; }
function yn(v: boolean | null) { return v ? 'Y' : 'N'; }

// Same column layout/order as the Axis Repair Tracker template — this is
// both what a fresh file gets built with AND what mergeJobsIntoWorkbook
// looks for by exact header text when matching against an existing file,
// so an existing tracker the org has been using (formulas, colour-coding,
// extra columns and all) reads as the same sheet.
const HEADER = ['Job Number','Address','Description of Call out','Survey Required (Y/N/NA)','Survey Date','Survey Notes / Quoted works','Variation Works (£)','Scaffolding Required (Y/N/Tower)','Scaff Requirements','Quote Approved (Y/N)','Scaffold Booking Date','Scaffold Erection Date','Repair Return Date','Repair Completed? (Y/N)','Closed on Portal','Invoiced? (Y/N)','Job Status','Overdue?'];

// One job -> the same ordered array of values the header above describes,
// used both when building a brand new file and when merging into an
// existing one (only whichever columns the existing file actually has get
// written — see mergeJobsIntoWorkbook).
function jobToRowValues(j: any, todayStr: string): (string | number)[] {
  const overdue = !j.closed && j.repair_return_date && j.repair_return_date < todayStr ? 'Y' : '';
  const scaffReq = (j.access_requirement === 'scaffold' || j.access_requirement === 'tower') ? (j.access_requirement === 'tower' ? 'Tower' : 'Y') : 'N';
  return [
    j.job_number || '', j.address || '', j.description || '', j.survey_required || '', d(j.survey_date), j.survey_notes || '',
    j.variation_cost != null ? Number(j.variation_cost) : '', scaffReq, j.access_notes || '', j.quote_approved == null ? '' : yn(j.quote_approved),
    d(j.scaffold_booking_date), d(j.scaffold_erection_date), d(j.repair_return_date), yn(j.works_completed), yn(j.closed), yn(j.invoiced),
    j.job_status || '', overdue,
  ];
}

// Builds a brand new tracker-style workbook from scratch — only used the
// very first time (no existing "OpHUB Repair Tracker.xlsx" in the linked
// folder yet). Every later run merges into this same file instead of
// rebuilding it, so this is the only place a fresh sheet gets created.
function buildFreshWorkbook(jobs: any[]) {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const rows = jobs.map((j) => jobToRowValues(j, todayStr));
  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
  ws['!cols'] = [{wch:12},{wch:28},{wch:30},{wch:14},{wch:12},{wch:32},{wch:14},{wch:16},{wch:26},{wch:14},{wch:16},{wch:16},{wch:14},{wch:14},{wch:12},{wch:12},{wch:18},{wch:10}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Repairs Tracker');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

function norm(s: any) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }

// Downloads the existing tracker file (if any), finds the Job Number column
// by matching HEADER text on row 1 (not by fixed column position — a site
// may have reordered columns), matches existing rows to app jobs by Job
// Number, updates ONLY the cell VALUES in columns the app recognises
// (leaving every other column, formula, and all styling/conditional
// formatting on the sheet completely untouched), and appends any job with
// no matching row as a new row at the bottom. Falls back to Address
// matching for the rare job with no job number.
//
// Known limitation: SheetJS (the library available here) rebuilds the
// workbook's XML from its own parsed model on write, so while cell values,
// formulas in untouched cells, number formats, fonts/fills and column
// widths round-trip correctly, Excel conditional-formatting RULES
// (colour scales, icon sets, data bars) are not modelled by this library
// and will not survive a merge. If that turns out to matter, a different,
// lower-level approach (patching the sheet XML directly instead of a full
// parse/rewrite) would be needed — flag it if this bites.
//
// Returns { buf, changed } on success, or null if the existing file's
// header row couldn't be matched at all (so the caller skips overwriting
// rather than risk mangling a sheet with a completely different layout).
function mergeJobsIntoWorkbook(existingBuf: ArrayBuffer, jobs: any[]): { buf: ArrayBufferLike } | null {
  const wb = XLSX.read(existingBuf, { type: 'array', cellStyles: true, cellFormula: true, cellDates: true });
  const sheetName = wb.SheetNames.includes('Repairs Tracker') ? 'Repairs Tracker' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws['!ref']) return null;
  const range = XLSX.utils.decode_range(ws['!ref']);

  // Match this sheet's actual header row against our known column labels —
  // by text, not position, so a reordered/trimmed-down sheet still merges
  // correctly into whichever columns really exist.
  const colIndex: Record<string, number> = {}; // HEADER label -> sheet column index
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
    if (!cell || cell.v == null) continue;
    const idx = HEADER.findIndex((h) => norm(h) === norm(cell.v));
    if (idx > -1) colIndex[HEADER[idx]] = c;
  }
  if (colIndex['Job Number'] == null || colIndex['Address'] == null) return null; // unrecognised layout — bail, don't touch it

  const headerRow = range.s.r;
  // Existing rows: Job Number (and, as a fallback for the rare job with none, Address) -> row index.
  const rowByJobNumber = new Map<string, number>();
  const rowByAddress = new Map<string, number>();
  let lastRow = headerRow;
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const jnCell = ws[XLSX.utils.encode_cell({ r, c: colIndex['Job Number'] })];
    const addrCell = colIndex['Address'] != null ? ws[XLSX.utils.encode_cell({ r, c: colIndex['Address'] })] : null;
    const jn = jnCell && jnCell.v != null ? String(jnCell.v).trim() : '';
    const addr = addrCell && addrCell.v != null ? String(addrCell.v).trim() : '';
    if (jn || addr) lastRow = r; // track the last row that actually has data, for appending after it
    if (jn) rowByJobNumber.set(jn, r);
    else if (addr && !rowByAddress.has(addr)) rowByAddress.set(addr, r);
  }

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  let nextAppendRow = lastRow + 1;

  function setCell(r: number, c: number, value: string | number) {
    const ref = XLSX.utils.encode_cell({ r, c });
    const existing = ws[ref];
    if (existing) {
      // Mutate value/type in place — never replace the cell object, which
      // is what would drop its style index (.s) and number format (.z).
      existing.v = value;
      existing.t = typeof value === 'number' ? 'n' : 's';
      delete existing.f; // these are app-owned data columns, not somewhere a formula should live
      delete existing.w; // stale cached display string — let Excel recompute it from v/t
    } else {
      ws[ref] = { t: typeof value === 'number' ? 'n' : 's', v: value };
    }
  }

  for (const job of jobs) {
    const values = jobToRowValues(job, todayStr);
    const jn = (job.job_number || '').trim();
    const addr = (job.address || '').trim();
    let targetRow = jn ? rowByJobNumber.get(jn) : undefined;
    if (targetRow == null && addr) targetRow = rowByAddress.get(addr);
    if (targetRow == null) {
      targetRow = nextAppendRow;
      nextAppendRow++;
      if (jn) rowByJobNumber.set(jn, targetRow);
      else if (addr) rowByAddress.set(addr, targetRow);
    }
    HEADER.forEach((label, i) => {
      const c = colIndex[label];
      if (c == null) return; // this sheet doesn't have that column (deleted/renamed by the user) — leave it alone entirely
      setCell(targetRow!, c, values[i]);
    });
    if (targetRow > range.e.r) range.e.r = targetRow;
  }

  ws['!ref'] = XLSX.utils.encode_range(range);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
  return { buf };
}

// Fetches the current bytes of the linked folder's tracker file, or null if
// it doesn't exist yet (first run for this site). Throws on any other
// failure so the caller's try/catch logs it per-site instead of silently
// treating a real error the same as "not found yet".
async function fetchExistingTrackerBytes(accessToken: string, site: any, filename: string): Promise<ArrayBuffer | null> {
  const base = site.onedrive_drive_id
    ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(site.onedrive_drive_id)}/items/${encodeURIComponent(site.onedrive_folder_id)}:/${encodeURIComponent(filename)}:`
    : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(site.onedrive_folder_id)}:/${encodeURIComponent(filename)}:`;
  const res = await fetch(base + '/content', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Could not read existing tracker: ' + (await res.text()));
  return await res.arrayBuffer();
}

// Nightly cron (see pg_cron job 'repair-tracker-nightly-push') — for every
// Maintenance/Repair Contract site that's been linked to a OneDrive folder
// (Settings & Admin > Sync Folder), pushes the latest repair_jobs data into
// "OpHUB Repair Tracker.xlsx" in that folder. As of this version it no
// longer rebuilds the file from scratch each night: it downloads whatever's
// there, updates matching rows and appends new ones IN PLACE (see
// mergeJobsIntoWorkbook), so any formulas, extra columns, or formatting the
// org has added to that file survive. Only falls back to building a fresh
// file when none exists yet, or when an existing file's header row can't be
// matched at all (renamed beyond recognition — logged as an error rather
// than risking overwriting something unrelated).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') || '';
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: sites } = await admin.from('sites')
      .select('id, name, org_id, onedrive_folder_id, onedrive_drive_id')
      .eq('repair_contract', true)
      .not('onedrive_folder_id', 'is', null);

    if (!sites || !sites.length) return ok({ sites: 0, pushed: 0 });

    let pushed = 0; let failed = 0; const errors: string[] = [];
    for (const site of sites) {
      try {
        const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', site.org_id).maybeSingle();
        if (!conn || !conn.access_token) { errors.push(site.name + ': org not connected to OneDrive'); continue; }
        const { data: jobs } = await admin.from('repair_jobs').select('*').eq('site_id', site.id).order('created_at', { ascending: false });

        const accessToken = await refreshIfNeeded(admin, conn);
        const filename = 'OpHUB Repair Tracker.xlsx';

        let buf: ArrayBufferLike;
        const existingBytes = await fetchExistingTrackerBytes(accessToken, site, filename);
        if (existingBytes) {
          const merged = mergeJobsIntoWorkbook(existingBytes, jobs || []);
          if (!merged) { failed++; errors.push(site.name + ": existing tracker's header row wasn't recognised — left untouched, check it manually"); continue; }
          buf = merged.buf;
        } else {
          buf = buildFreshWorkbook(jobs || []);
        }

        let uploadUrl: string;
        if (site.onedrive_drive_id) {
          uploadUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(site.onedrive_drive_id)}/items/${encodeURIComponent(site.onedrive_folder_id)}:/${encodeURIComponent(filename)}:/content`;
        } else {
          uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(site.onedrive_folder_id)}:/${encodeURIComponent(filename)}:/content`;
        }
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          body: buf,
        });
        if (!uploadRes.ok) { failed++; errors.push(site.name + ': ' + (await uploadRes.text())); continue; }
        await admin.from('sites').update({ onedrive_last_synced_at: new Date().toISOString() }).eq('id', site.id);
        pushed++;
      } catch (e) {
        failed++; errors.push(site.name + ': ' + String(e));
      }
    }

    return ok({ sites: sites.length, pushed, failed, errors: errors.slice(0, 10) });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
