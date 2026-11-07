import { createClient } from 'npm:@supabase/supabase-js@2';
// A client approving or rejecting a repair job's quote online (Andy, 7 Nov 2026). The quote email has a link to
// operativehub.co.uk/quote.html?t=<code>; that page calls this:
//   { t, action: 'view' }                      → the quote (company, contract, job, lines, totals, where it stands)
//   { t, action: 'approve' | 'reject', name, note } → records the decision on the job (and a note on it)
// Only when the contract has "Client Approves Quotes Online" switched on (Finance › Project Admin), and only once: a
// quote already approved or rejected just says so. The code is a random uuid kept on the job. Opening the page does
// nothing; only pressing Approve or Reject does (so email link checkers can't approve it by visiting the link).
// Public (the page sends the anon key); everything is read and written here with the service key.
const corsHeaders = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma' };
const OPHUB_ORIGINS = new Set(['https://operativehub.co.uk', 'https://www.operativehub.co.uk', 'https://ophub-ten.vercel.app', 'capacitor://localhost', 'https://localhost', 'http://localhost']);
const originOk = (o: string | null) => !!o && (OPHUB_ORIGINS.has(o) || /^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(o) || /^http:\/\/localhost:\d{2,5}$/.test(o));
const reply = (req: Request, obj: unknown, status = 200) => {
  const h = new Headers({ ...corsHeaders, 'Content-Type': 'application/json', Vary: 'Origin' });
  const o = req.headers.get('Origin');
  if (originOk(o)) h.set('Access-Control-Allow-Origin', o as string);
  return new Response(JSON.stringify(obj), { status, headers: h });
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
type Line = { code?: string | null; description?: string; unit?: string | null; qty?: number; rate?: number; sor?: boolean };
// The same sums as the app (lib/rules/repairQuote.ts): rates less the contract's discount (or plus its uplift), lines
// typed in at their price, the contract's VAT once at the bottom.
function totals(lines: Line[], pct: number, vat: string) {
  const val = (l: Line) => r2(Number(l.qty || 0) * Number(l.rate || 0) * (l.sor ? 1 - (pct || 0) / 100 : 1));
  const net = r2(lines.reduce((t, l) => t + val(l), 0));
  const vatPct = vat === 'reverse_charge' || vat === 'zero' ? 0 : 20;
  const v = r2(net * vatPct / 100);
  return { lines: lines.map((l) => ({ code: l.code || null, description: String(l.description || ''), unit: l.unit || null, qty: Number(l.qty || 0), value: val(l) })), net, vatPct, vat: v, total: r2(net + v), vatNote: vat === 'reverse_charge' ? 'Domestic reverse charge: the customer accounts for the VAT.' : vat === 'zero' ? 'Zero rated.' : '' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(req, { ok: true });
  if (req.method !== 'POST') return reply(req, { error: 'Not found' }, 404);
  try {
    const body = await req.json().catch(() => ({}));
    const t = String(body.t || '').trim(), action = String(body.action || 'view');
    if (!UUID.test(t)) return reply(req, { error: 'This link isn’t right. Please use the link in the email.' }, 400);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: job } = await admin.from('repair_jobs').select('id, org_id, site_id, job_number, address, description, quote_lines, quote_discount_pct, variation_cost, priced_schedule_of_works, variation_issued_at, quote_approved, quote_approved_at, quote_sent_by, created_by, quote_decided_online_at').eq('quote_token', t).maybeSingle();
    if (!job) return reply(req, { error: 'This quote can’t be found. It may have been withdrawn — please contact us.' }, 404);
    const { data: site } = await admin.from('sites').select('id, org_id, name, job_number, repair_online_approval').eq('id', job.site_id).maybeSingle();
    if (!site || site.org_id !== job.org_id || !site.repair_online_approval) return reply(req, { error: 'Online approval isn’t switched on for this contract. Please reply to the email instead.' }, 403);
    const [{ data: org }, { data: jf }, { data: fs }] = await Promise.all([
      admin.from('organizations').select('name, logo_path, color_primary').eq('id', job.org_id).maybeSingle(),
      admin.from('job_finance').select('vat_treatment').eq('site_id', site.id).maybeSingle(),
      admin.from('fin_settings').select('default_vat').eq('org_id', job.org_id).maybeSingle(),
    ]);
    const vat = String(jf?.vat_treatment || fs?.default_vat || 'standard');
    const saved: Line[] = Array.isArray(job.quote_lines) ? job.quote_lines as Line[] : job.variation_cost != null ? [{ description: job.priced_schedule_of_works || 'Works as described', qty: 1, rate: Number(job.variation_cost) }] : [];
    const status = job.quote_approved === true ? 'approved' : job.quote_approved === false ? 'rejected' : job.variation_issued_at ? 'awaiting' : 'draft';

    if (action === 'view') {
      return reply(req, {
        company: org?.name || 'OpHUB', brand: org?.color_primary || null,
        logo: org?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${org.logo_path}` : null,
        contract: site.name, job: { number: job.job_number || '', address: job.address || '', description: job.description || '' },
        discount: Number(job.quote_discount_pct || 0), ...totals(saved, Number(job.quote_discount_pct || 0), vat),
        status, sentAt: job.variation_issued_at, decidedAt: job.quote_decided_online_at || job.quote_approved_at || null,
      });
    }
    if (action !== 'approve' && action !== 'reject') return reply(req, { error: 'Unknown action' }, 400);
    if (status !== 'awaiting') return reply(req, { error: status === 'approved' ? 'This quote has already been approved — thank you.' : status === 'rejected' ? 'This quote has already been turned down.' : 'This quote hasn’t been sent yet.', status });
    const name = String(body.name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
    const note = String(body.note || '').trim().slice(0, 1000);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = action === 'approve'
      ? { quote_approved: true, quote_approved_at: now, self_authorized: false, job_status: 'Approved - To Do' }
      : { quote_approved: false, job_status: 'Rejected' };
    Object.assign(patch, { quote_decided_online_at: now, quote_decision_note: [name ? `${name}:` : '', note].filter(Boolean).join(' ') || null });
    // Only if it's still awaiting (two presses, or two people, can't both decide).
    const { data: done, error } = await admin.from('repair_jobs').update(patch).eq('id', job.id).is('quote_approved', null).select('id');
    if (error || !done?.length) return reply(req, { error: 'This quote has already been decided.' });
    // A note on the job, so the office sees it (and who).
    const author = job.quote_sent_by || job.created_by;
    if (author) {
      await admin.from('repair_job_notes').insert({ org_id: job.org_id, repair_job_id: job.id, author_id: author, author_name: `${name || 'The client'} (online)`, body: `${action === 'approve' ? 'Quote approved online.' : 'Quote turned down online.'}${note ? ` ${note}` : ''}` }).then(() => {}, () => {});
    }
    return reply(req, { ok: true, status: action === 'approve' ? 'approved' : 'rejected' });
  } catch (e) {
    console.error('repair-quote-decision failed', e);
    return reply(req, { error: 'Something went wrong — please try again.' }, 500);
  }
});
