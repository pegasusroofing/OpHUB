import { createClient } from 'npm:@supabase/supabase-js@2';

// OpHUB Finance <-> Xero.
// One function does both halves:
//   GET  ?code=..&state=..        Xero sends the user back here after they allow access (OAuth callback)
//   POST {action, ...}            called by the app with the user's login (finance users only)
// Needs Supabase secrets XERO_CLIENT_ID and XERO_CLIENT_SECRET (from a Xero app at developer.xero.com)
// with redirect URI  https://<project>.supabase.co/functions/v1/xero
// Optional XERO_SCOPES to override the default scopes.
// Tokens live in xero_connections (RLS on, no policies: only this function can read them).

const cors = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
// ---- CORS allow-list (security review L8, 25 Oct 2026) ----
// Only the OpHUB web app (live domain, Vercel production + preview URLs) and
// the phone apps get a CORS grant; every other website's browser is refused.
// Calls with no Origin header (cron, Power Automate, server-to-server) are
// not affected by CORS at all. withCors() sets the header on every response
// the handler returns, so the code below can keep using corsHeaders as before.
const OPHUB_ORIGINS = new Set([
  'https://operativehub.co.uk',
  'https://www.operativehub.co.uk',
  'https://ophub-ten.vercel.app',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
]);
function ophubOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (OPHUB_ORIGINS.has(origin)) return true;
  if (/^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(origin)) return true; // Vercel preview deployments
  if (/^http:\/\/localhost:\d{2,5}$/.test(origin)) return true; // local dev server
  return false;
}
function withCors(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const res = await handler(req);
    const origin = req.headers.get('Origin');
    const headers = new Headers(res.headers);
    headers.delete('Access-Control-Allow-Origin');
    if (ophubOriginAllowed(origin)) headers.set('Access-Control-Allow-Origin', origin as string);
    headers.append('Vary', 'Origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
// ---- end CORS allow-list ----

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const text = (t: string, status = 200) => new Response(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

const CLIENT_ID = Deno.env.get('XERO_CLIENT_ID') || '';
const CLIENT_SECRET = Deno.env.get('XERO_CLIENT_SECRET') || '';
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const REDIRECT = SB_URL + '/functions/v1/xero';
// Apps created after 2 March 2026 must use Xero's granular scopes.
const SCOPES = Deno.env.get('XERO_SCOPES') || 'openid profile email offline_access accounting.invoices accounting.payments.read accounting.contacts accounting.settings accounting.attachments payroll.employees.read payroll.settings.read';
const PAYROLL = 'https://api.xero.com/payroll.xro/2.0';
const API = 'https://api.xero.com/api.xro/2.0';

const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const basic = () => 'Basic ' + btoa(CLIENT_ID + ':' + CLIENT_SECRET);

async function tokenCall(body: Record<string, string>) {
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Xero sign-in failed: ' + (j.error || res.status));
  return j as { access_token: string; refresh_token: string; expires_in: number };
}

// ---------- OAuth callback ----------
async function callback(url: URL) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  if (url.searchParams.get('error')) return text('Xero connection was cancelled. You can close this tab and go back to OpHUB.');
  if (!code || !state) return text('Missing code. Start again from OpHUB › Finance › Settings.', 400);
  const { data: st } = await admin.from('xero_oauth_states').select('*').eq('state', state).maybeSingle();
  if (!st) return text('This link has expired. Start again from OpHUB › Finance › Settings.', 400);
  await admin.from('xero_oauth_states').delete().eq('state', state);
  if (Date.now() - new Date(st.created_at).getTime() > 15 * 60 * 1000) return text('This link has expired. Start again from OpHUB › Finance › Settings.', 400);
  const tok = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT });
  const cRes = await fetch('https://api.xero.com/connections', { headers: { Authorization: 'Bearer ' + tok.access_token } });
  const conns = await cRes.json().catch(() => []);
  const org = (Array.isArray(conns) ? conns : []).filter((c: any) => c.tenantType === 'ORGANISATION');
  if (!org.length) return text('No Xero organisation was chosen. Start again and pick your company.', 400);
  const t = org[org.length - 1]; // most recently authorised
  await admin.from('xero_connections').upsert({
    org_id: st.org_id, tenant_id: t.tenantId, tenant_name: t.tenantName,
    access_token: tok.access_token, refresh_token: tok.refresh_token,
    expires_at: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(),
    connected_by: st.user_id, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  await admin.from('fin_settings').upsert({ org_id: st.org_id, xero_tenant_name: t.tenantName, xero_connected_at: new Date().toISOString() }, { onConflict: 'org_id' });
  return text(`Connected to Xero (${t.tenantName}). You can close this tab and go back to OpHUB.`);
}

// ---------- Xero API helper ----------
async function xero(orgId: string) {
  const { data: c } = await admin.from('xero_connections').select('*').eq('org_id', orgId).maybeSingle();
  if (!c) throw new Error('Xero is not connected');
  let access = c.access_token;
  if (!c.expires_at || new Date(c.expires_at).getTime() < Date.now() + 30000) {
    const tok = await tokenCall({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
    access = tok.access_token;
    await admin.from('xero_connections').update({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('org_id', orgId);
  }
  const call = async (method: string, path: string, body?: unknown, raw?: { bytes: Uint8Array; type: string }, base?: string) => {
    const headers: Record<string, string> = { Authorization: 'Bearer ' + access, 'xero-tenant-id': c.tenant_id, Accept: 'application/json' };
    let payload: BodyInit | undefined;
    if (raw) { headers['Content-Type'] = raw.type; payload = raw.bytes as unknown as BodyInit; }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch((base || API) + path, { method, headers, body: payload });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const ve = j?.Elements?.[0]?.ValidationErrors?.map((v: any) => v.Message).join('; ');
      throw new Error(ve || j?.Message || j?.Detail || ('Xero error ' + res.status));
    }
    return j;
  };
  return { call, tenant: c.tenant_name };
}

// Find a contact by name; create it if missing; fill in missing email / address in Xero from what OpHUB has.
async function contactFor(call: any, name: string, email?: string | null, address?: string | null) {
  const nm = (name || '').trim() || 'Unknown contact';
  const found = await call('GET', '/Contacts?where=' + encodeURIComponent(`Name=="${nm.replace(/"/g, '')}"`));
  const c = found?.Contacts?.[0];
  const addr = address ? (() => { const parts = String(address).split(/\n|,/).map(s => s.trim()).filter(Boolean); return { AddressType: 'POBOX', AddressLine1: parts[0] || '', AddressLine2: parts[1] || '', City: parts.length > 3 ? parts[parts.length - 2] : '', PostalCode: parts.length > 2 ? parts[parts.length - 1] : '' }; })() : null;
  if (c) {
    const patch: any = { ContactID: c.ContactID };
    if (email && !c.EmailAddress) patch.EmailAddress = email;
    const hasAddr = (c.Addresses || []).some((a: any) => a.AddressLine1);
    if (addr && !hasAddr) patch.Addresses = [addr];
    if (Object.keys(patch).length > 1) await call('POST', '/Contacts', { Contacts: [patch] }).catch(() => null);
    return { ContactID: c.ContactID };
  }
  const made = await call('POST', '/Contacts', { Contacts: [{ Name: nm, EmailAddress: email || undefined, Addresses: addr ? [addr] : undefined }] });
  return { ContactID: made.Contacts[0].ContactID };
}

// Project tracking: uses the tracking category named in settings (default "Project"); adds the project as an option if missing.
async function trackingFor(call: any, catName: string, option: string) {
  if (!catName || !option) return undefined;
  try {
    const cats = await call('GET', '/TrackingCategories');
    const cat = (cats.TrackingCategories || []).find((c: any) => String(c.Name).toLowerCase() === catName.toLowerCase());
    if (!cat) return undefined;
    const opt = option.slice(0, 100);
    if (!(cat.Options || []).some((o: any) => o.Name === opt)) {
      await call('PUT', `/TrackingCategories/${cat.TrackingCategoryID}/Options`, { Name: opt }).catch(() => null);
    }
    return [{ Name: cat.Name, Option: opt }];
  } catch (_e) { return undefined; }
}

async function attach(call: any, invoiceId: string, path: string | null, name: string) {
  if (!path) return;
  try {
    const { data } = await admin.storage.from('finance-docs').download(path);
    if (!data) return;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const fname = encodeURIComponent((name || 'document.pdf').replace(/[^A-Za-z0-9._ -]+/g, '_'));
    await call('PUT', `/Invoices/${invoiceId}/Attachments/${fname}?IncludeOnline=true`, undefined, { bytes, type: data.type || 'application/pdf' });
  } catch (_e) { /* attachment is a nice-to-have */ }
}

const jobLabel = (site: any) => site ? [site.job_number, site.name].filter(Boolean).join(' ') : '';
const salesTax = (t: string) => t === 'reverse_charge' ? 'DRCHARGESUPPLY20' : t === 'zero' ? 'ZERORATEDOUTPUT' : 'OUTPUT2';
// VAT chosen on each invoice line in OpHUB -> Xero UK tax type.
const LINE_TAX: Record<string, string> = { '20': 'OUTPUT2', '5': 'RROUTPUT', '0': 'ZERORATEDOUTPUT', 'ex': 'EXEMPTOUTPUT', 'rc20': 'DRCHARGESUPPLY20', 'rc5': 'DRCHARGESUPPLY5' };

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  try {
    if (req.method === 'GET') return await callback(url);
  } catch (e) { return text('Could not connect to Xero: ' + String((e as Error).message || e), 500); }
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    // who is calling?
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'Please sign in again' }, 401);
    const { data: me } = await admin.from('profiles').select('id, org_id, role, finance_enabled').eq('id', u.user.id).maybeSingle();
    if (!me || !me.finance_enabled) return json({ error: 'Finance access only' }, 403);
    const orgId = me.org_id;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const configured = !!(CLIENT_ID && CLIENT_SECRET);

    if (action === 'status') {
      const { data: c } = await admin.from('xero_connections').select('tenant_name, connected_at').eq('org_id', orgId).maybeSingle();
      return json({ configured, connected: !!c, tenant_name: c?.tenant_name || null, connected_at: c?.connected_at || null });
    }
    if (action === 'connect') {
      if (!configured) return json({ error: 'not_configured' }, 400);
      const state = crypto.randomUUID() + crypto.randomUUID().slice(0, 8);
      await admin.from('xero_oauth_states').insert({ state, org_id: orgId, user_id: me.id });
      const q = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT, scope: SCOPES, state });
      return json({ url: 'https://login.xero.com/identity/connect/authorize?' + q.toString() });
    }
    if (action === 'disconnect') {
      const { data: c } = await admin.from('xero_connections').select('refresh_token').eq('org_id', orgId).maybeSingle();
      if (c?.refresh_token && configured) {
        await fetch('https://identity.xero.com/connect/revocation', { method: 'POST', headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: c.refresh_token }).toString() }).catch(() => null);
      }
      await admin.from('xero_connections').delete().eq('org_id', orgId);
      await admin.from('fin_settings').update({ xero_tenant_name: null, xero_connected_at: null }).eq('org_id', orgId);
      return json({ ok: true });
    }

    const { call } = await xero(orgId);
    const { data: st } = await admin.from('fin_settings').select('*').eq('org_id', orgId).maybeSingle();
    const s = st || {};

    if (action === 'accounts') {
      const [a, t] = await Promise.all([call('GET', '/Accounts?where=' + encodeURIComponent('Status=="ACTIVE"')), call('GET', '/TrackingCategories')]);
      return json({
        accounts: (a.Accounts || []).filter((x: any) => x.Code).map((x: any) => ({ code: x.Code, name: x.Name, type: x.Type, class: x.Class })),
        tracking: (t.TrackingCategories || []).map((x: any) => x.Name),
      });
    }

    if (action === 'contact') {
      const nm = String(body.name || '').trim();
      if (!nm) return json({ error: 'Name needed' }, 400);
      const r = await call('GET', '/Contacts?searchTerm=' + encodeURIComponent(nm));
      return json({ contacts: (r.Contacts || []).slice(0, 8).map((c: any) => {
        const a = (c.Addresses || []).find((x: any) => x.AddressLine1) || {};
        return { id: c.ContactID, name: c.Name, email: c.EmailAddress || '', address: [a.AddressLine1, a.AddressLine2, a.AddressLine3, a.City, a.Region, a.PostalCode].filter(Boolean).join('\n') };
      }) });
    }

    if (action === 'customers' || action === 'suppliers') {
      // Every active customer / supplier in Xero (Finance › Directory › Pull from Xero), with tax and payment terms.
      const TAXMAP: Record<string, string> = { OUTPUT2: '20', INPUT2: '20', RROUTPUT: '5', RRINPUT: '5', ZERORATEDOUTPUT: '0', ZERORATEDINPUT: '0', EXEMPTOUTPUT: 'ex', EXEMPTINPUT: 'ex', DRCHARGESUPPLY20: 'rc20', DRCHARGE20: 'rc20', DRCHARGESUPPLY5: 'rc5', DRCHARGE5: 'rc5', NONE: 'none' };
      const TERMS: Record<string, string> = { DAYSAFTERBILLDATE: 'days_after_bill', DAYSAFTERBILLMONTH: 'days_after_month', OFCURRENTMONTH: 'of_current_month', OFFOLLOWINGMONTH: 'of_following_month' };
      const sup = action === 'suppliers';
      const out: any[] = [];
      for (let page = 1; page <= 20; page++) {
        const r = await call('GET', '/Contacts?page=' + page + '&where=' + encodeURIComponent((sup ? 'IsSupplier' : 'IsCustomer') + '==true AND ContactStatus=="ACTIVE"'));
        const cs = r.Contacts || [];
        cs.forEach((c: any) => {
          const a = (c.Addresses || []).find((x: any) => x.AddressLine1) || {};
          const ph = (c.Phones || []).find((x: any) => x.PhoneNumber) || {};
          const pt = (c.PaymentTerms || {})[sup ? 'Bills' : 'Sales'] || null;
          out.push({ id: c.ContactID, name: c.Name, email: c.EmailAddress || '', phone: [ph.PhoneAreaCode, ph.PhoneNumber].filter(Boolean).join(' '),
            address: [a.AddressLine1, a.AddressLine2, a.AddressLine3, a.City, a.Region].filter(Boolean).join('\n'), postcode: a.PostalCode || '',
            vat_number: c.TaxNumber || '', company_number: c.CompanyNumber || '',
            sales_vat: TAXMAP[c.AccountsReceivableTaxType || ''] || '', purchase_vat: TAXMAP[c.AccountsPayableTaxType || ''] || '',
            terms_days: pt && pt.Day != null ? Number(pt.Day) : null, terms_type: pt ? (TERMS[pt.Type] || '') : '' });
        });
        if (cs.length < 100) break;
      }
      return json(sup ? { suppliers: out } : { customers: out });
    }

    if (action === 'create_contact') {
      // New customer in Xero (Finance › project › Billing › "+ New customer").
      const nm = String(body.name || '').trim().slice(0, 255);
      if (!nm) return json({ error: 'Name needed' }, 400);
      const found = await call('GET', '/Contacts?where=' + encodeURIComponent(`Name=="${nm.replace(/"/g, '')}"`));
      const ex = found?.Contacts?.[0];
      const addr = { AddressType: 'POBOX', AddressLine1: String(body.line1 || '').slice(0, 500), AddressLine2: String(body.line2 || '').slice(0, 500), City: String(body.city || '').slice(0, 255), PostalCode: String(body.postcode || '').slice(0, 50) };
      const shape = (c: any) => { const a = (c.Addresses || []).find((x: any) => x.AddressLine1) || {}; return { id: c.ContactID, name: c.Name, email: c.EmailAddress || '', address: [a.AddressLine1, a.AddressLine2, a.AddressLine3, a.City, a.Region, a.PostalCode].filter(Boolean).join('\n') }; };
      if (ex) return json({ ok: true, existed: true, contact: shape(ex) });
      const c: any = { Name: nm };
      if (!body.supplier) c.IsCustomer = true;
      if (body.email) c.EmailAddress = String(body.email).slice(0, 255);
      if (body.first_name) c.FirstName = String(body.first_name).slice(0, 255);
      if (body.last_name) c.LastName = String(body.last_name).slice(0, 255);
      if (body.phone) c.Phones = [{ PhoneType: 'DEFAULT', PhoneNumber: String(body.phone).slice(0, 50) }];
      if (addr.AddressLine1 || addr.PostalCode) c.Addresses = [addr];
      const made = await call('POST', '/Contacts', { Contacts: [c] });
      return json({ ok: true, contact: shape(made.Contacts[0]) });
    }

    if (action === 'workers') {
      // Subcontractors: Xero contacts in a group called "Subcontractors" (or similar), else suppliers with CIS switched on.
      const people: any[] = []; const notes: string[] = [];
      const groups = await call('GET', '/ContactGroups');
      const grp = (groups.ContactGroups || []).find((g: any) => g.Status === 'ACTIVE' && /subcontract|labour|cis/i.test(g.Name || ''));
      let ids: string[] = [];
      if (grp) {
        const gg = await call('GET', `/ContactGroups/${grp.ContactGroupID}`);
        ids = ((gg.ContactGroups || [])[0]?.Contacts || []).map((c: any) => c.ContactID);
        notes.push(`Subcontractors from your Xero group “${grp.Name}”.`);
      } else {
        const r = await call('GET', '/Contacts?where=' + encodeURIComponent('IsSupplier==true AND ContactStatus=="ACTIVE"'));
        ids = (r.Contacts || []).map((c: any) => c.ContactID);
        notes.push('No “Subcontractors” contact group in Xero, so suppliers with CIS switched on are shown.');
      }
      ids = ids.slice(0, 150);
      const details: any[] = [];
      for (let i = 0; i < ids.length; i += 40) { const r = await call('GET', '/Contacts?IDs=' + ids.slice(i, i + 40).join(',')); details.push(...(r.Contacts || [])); }
      let cisCalls = 0;
      for (const c of details) {
        let cis: any = null;
        if (cisCalls < 45) { cisCalls++; try { const r = await call('GET', `/Contacts/${c.ContactID}/CISSettings`); cis = (r.CISSettings || [])[0] || null; } catch (_e) { cis = null; } }
        if (!grp && !(cis && cis.CISEnabled)) continue;
        const ph = (c.Phones || []).find((p: any) => p.PhoneNumber);
        people.push({ kind: 'sub', xero_contact_id: c.ContactID, name: c.Name, email: c.EmailAddress || '', phone: ph ? [ph.PhoneAreaCode, ph.PhoneNumber].filter(Boolean).join(' ') : '',
          vat_registered: !!c.TaxNumber, cis_rate: cis && cis.CISEnabled ? (cis.Rate != null ? Number(cis.Rate) : 20) : null });
      }
      if (cisCalls >= 45 && details.length > 45) notes.push('CIS rates were read for the first 45 only (Xero limit) — check the rest.');
      // PAYE: Xero Payroll (UK) employees and their pay rate.
      try {
        const e = await call('GET', '/Employees', undefined, undefined, PAYROLL);
        const emps = (e.employees || e.Employees || []).filter((x: any) => !x.endDate);
        let n = 0;
        for (const x of emps.slice(0, 40)) {
          let rate: number | null = null, note = '';
          try {
            const w = await call('GET', `/Employees/${x.employeeID}/SalaryAndWages`, undefined, undefined, PAYROLL);
            const sw = (w.salaryAndWages || []).find((y: any) => (y.status || 'Active') === 'Active') || (w.salaryAndWages || [])[0];
            if (sw) {
              if (String(sw.paymentType || '').toLowerCase() === 'salary' && sw.annualSalary) { rate = Math.round(Number(sw.annualSalary) / 260 * 100) / 100; note = 'Salary ÷ 260 working days'; }
              else if (sw.ratePerUnit) { const h = sw.numberOfUnitsPerDay || (sw.numberOfUnitsPerWeek ? sw.numberOfUnitsPerWeek / 5 : 8); rate = Math.round(Number(sw.ratePerUnit) * Number(h) * 100) / 100; note = `£${sw.ratePerUnit}/hour × ${Math.round(Number(h) * 10) / 10} hours`; }
            }
          } catch (_e) { /* no pay details */ }
          n++;
          people.push({ kind: 'paye', xero_employee_id: x.employeeID, name: [x.firstName, x.lastName].filter(Boolean).join(' '), email: x.email || '', day_rate: rate, rate_note: note });
        }
        if (emps.length > 40) notes.push('Only the first 40 employees were read.');
      } catch (e) {
        const m = String((e as Error).message || e);
        notes.push(/403|401|scope|unauthor/i.test(m) ? 'PAYE staff: OpHUB needs permission to read Xero Payroll — disconnect and connect Xero again in Finance › Settings to allow it.' : 'PAYE staff couldn’t be read from Xero Payroll (' + m.slice(0, 120) + ').');
      }
      return json({ ok: true, people, notes });
    }

    if (action === 'push_invoice') {
      const { data: inv } = await admin.from('fin_invoices').select('*').eq('id', body.id).eq('org_id', orgId).maybeSingle();
      if (!inv) return json({ error: 'Invoice not found' }, 404);
      if (inv.status === 'draft') return json({ error: 'Issue the invoice first' }, 400);
      // Posted once only. The one exception: voiding an invoice that's already in Xero voids it there too.
      if (inv.xero_id && inv.status !== 'void') return json({ error: 'Already posted to Xero' }, 400);
      if (!inv.xero_id && inv.xero_post === false) return json({ error: 'This invoice is set not to post to Xero' }, 400);
      const { data: site } = await admin.from('sites').select('name, job_number').eq('id', inv.site_id).maybeSingle();
      try {
        const contact = await contactFor(call, inv.bill_name, inv.bill_email, inv.bill_address);
        const tracking = await trackingFor(call, s.xero_tracking_name || 'Project', jobLabel(site));
        const tax = salesTax(inv.vat_treatment);
        const lines = (inv.lines || []).filter((l: any) => r2(l.amount) !== 0).map((l: any) => ({
          Description: String(l.description || '').slice(0, 4000) || 'Works', Quantity: 1, UnitAmount: r2(l.amount),
          AccountCode: s.xero_sales_account || '200', TaxType: (l.vat && LINE_TAX[l.vat]) || tax, Tracking: tracking,
        }));
        const x: any = {
          Type: 'ACCREC', Contact: contact, InvoiceNumber: inv.number, Reference: [inv.client_po, site?.job_number].filter(Boolean).join(' / ').slice(0, 255),
          Date: inv.issue_date, DueDate: inv.due_date || inv.issue_date, LineAmountTypes: 'Exclusive', LineItems: lines,
          Status: inv.status === 'void' ? 'VOIDED' : 'AUTHORISED',
        };
        if (inv.xero_id) x.InvoiceID = inv.xero_id;
        if (inv.status === 'void' && !inv.xero_id) return json({ error: 'Void invoices are not sent to Xero' }, 400);
        const r = await call('POST', '/Invoices', { Invoices: [x] });
        const xi = r.Invoices[0];
        await admin.from('fin_invoices').update({ xero_id: xi.InvoiceID, xero_synced_at: new Date().toISOString(), xero_error: null }).eq('id', inv.id);
        if (!inv.xero_id) await attach(call, xi.InvoiceID, inv.pdf_path, (inv.number || 'invoice') + '.pdf');
        const diff = r2(xi.Total) - r2(inv.total);
        return json({ ok: true, xero_id: xi.InvoiceID, warning: Math.abs(diff) > 0.02 ? `Xero total is ${xi.Total} (OpHUB ${inv.total}) — check VAT settings` : null });
      } catch (e) {
        await admin.from('fin_invoices').update({ xero_error: String((e as Error).message || e).slice(0, 500) }).eq('id', inv.id);
        throw e;
      }
    }

    if (action === 'push_bill') {
      const { data: pi } = await admin.from('purchase_invoices').select('*').eq('id', body.id).eq('org_id', orgId).maybeSingle();
      if (!pi) return json({ error: 'Purchase invoice not found' }, 404);
      if (pi.status !== 'approved') return json({ error: 'Approve it first' }, 400);
      if (pi.xero_id) return json({ error: 'Already posted to Xero' }, 400);
      if (pi.xero_post === false) return json({ error: 'This invoice is set not to post to Xero' }, 400);
      // Directory › Suppliers › "Don't send this supplier's bills to Xero"
      {
        const q = admin.from('fin_suppliers').select('no_sync').eq('org_id', orgId);
        const { data: fs } = pi.supplier_id ? await q.eq('supplier_id', pi.supplier_id).maybeSingle() : await q.ilike('name', String(pi.supplier_name || '').replace(/[%_]/g, '')).limit(1).maybeSingle();
        if ((fs as any)?.no_sync) return json({ error: 'This supplier is set not to send bills to Xero (Directory › Suppliers)' }, 400);
      }
      const [{ data: site }, { data: po }] = await Promise.all([
        admin.from('sites').select('name, job_number').eq('id', pi.site_id).maybeSingle(),
        pi.po_id ? admin.from('purchase_orders').select('number, split').eq('id', pi.po_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      try {
        const { data: sup } = pi.supplier_id ? await admin.from('suppliers').select('email').eq('id', pi.supplier_id).maybeSingle() : { data: null };
        const contact = await contactFor(call, pi.supplier_name || 'Supplier', (sup as any)?.email || null, null);
        const tracking = await trackingFor(call, s.xero_tracking_name || 'Project', jobLabel(site));
        const vat = r2(pi.vat);
        const desc = pi.description || ('Materials' + (po ? ' — ' + po.number : ''));
        const taxType = vat > 0 ? 'INPUT2' : 'ZERORATEDINPUT';
        let lineItems: any[] = [{ Description: desc.slice(0, 4000), Quantity: 1, UnitAmount: r2(pi.net),
            AccountCode: s.xero_purchase_account || '310', TaxType: taxType, TaxAmount: vat, Tracking: tracking }];
        // FA-28: a bill split across projects in OpHUB (its own split, or its PO's split when it
        // follows the PO) goes to Xero as one line per project, each tracked to that project.
        // Net and VAT are shared by the split %; the last line takes any rounding penny.
        const sp: any[] | null = Array.isArray(pi.split) && pi.split.length ? pi.split
          : (!pi.sub_job_id && Array.isArray((po as any)?.split) && (po as any).split.length ? (po as any).split : null);
        if (sp) {
          const by: Record<string, number> = {};
          sp.forEach((e: any) => { if (e && e.site_id) by[e.site_id] = (by[e.site_id] || 0) + (Number(e.pct) || 0); });
          const parts = Object.keys(by).filter(k => by[k] > 0).map(k => ({ site_id: k, pct: by[k] })).sort((a, b) => b.pct - a.pct);
          if (parts.length > 1) {
            const { data: ss } = await admin.from('sites').select('id, name, job_number').eq('org_id', orgId).in('id', parts.map(p => p.site_id));
            const tot = parts.reduce((t, p) => t + p.pct, 0) || 100;
            let netLeft = r2(pi.net), vatLeft = vat;
            const out: any[] = [];
            for (let i = 0; i < parts.length; i++) {
              const last = i === parts.length - 1;
              const n = last ? netLeft : r2(Number(pi.net || 0) * parts[i].pct / tot);
              const v = last ? r2(vatLeft) : r2(vat * parts[i].pct / tot);
              netLeft = r2(netLeft - n); vatLeft = r2(vatLeft - v);
              const ps = (ss || []).find((x: any) => x.id === parts[i].site_id);
              const label = jobLabel(ps);
              out.push({ Description: (desc + ' — ' + (Math.round(parts[i].pct / tot * 10000) / 100) + '%' + (label ? ' ' + label : '')).slice(0, 4000), Quantity: 1, UnitAmount: n,
                AccountCode: s.xero_purchase_account || '310', TaxType: taxType, TaxAmount: v, Tracking: label ? await trackingFor(call, s.xero_tracking_name || 'Project', label) : undefined });
            }
            lineItems = out;
          }
        }
        const x: any = {
          Type: 'ACCPAY', Contact: contact, InvoiceNumber: pi.invoice_no || undefined,
          Reference: [po?.number, site?.job_number].filter(Boolean).join(' / ').slice(0, 255) || undefined,
          Date: pi.invoice_date, DueDate: pi.due_date || pi.invoice_date, LineAmountTypes: 'Exclusive', Status: 'AUTHORISED',
          LineItems: lineItems,
        };
        if (pi.xero_id) x.InvoiceID = pi.xero_id;
        const r = await call('POST', '/Invoices', { Invoices: [x] });
        const xi = r.Invoices[0];
        await admin.from('purchase_invoices').update({ xero_id: xi.InvoiceID, xero_synced_at: new Date().toISOString(), xero_error: null }).eq('id', pi.id);
        if (!pi.xero_id) await attach(call, xi.InvoiceID, pi.file_path, pi.file_name || 'invoice.pdf');
        return json({ ok: true, xero_id: xi.InvoiceID });
      } catch (e) {
        await admin.from('purchase_invoices').update({ xero_error: String((e as Error).message || e).slice(0, 500) }).eq('id', pi.id);
        throw e;
      }
    }

    if (action === 'push_sub_payment') {
      const { data: p } = await admin.from('fin_sub_payments').select('*').eq('id', body.id).eq('org_id', orgId).maybeSingle();
      if (!p) return json({ error: 'Payment not found' }, 404);
      if (!['approved', 'paid'].includes(p.status)) return json({ error: 'Approve it first' }, 400);
      if (p.xero_id) return json({ error: 'Already posted to Xero' }, 400);
      if (p.xero_post === false) return json({ error: 'This one is set not to post to Xero' }, 400);
      try {
        const contact = await contactFor(call, p.name || 'Subcontractor', null, null);
        const items: any[] = [];
        if (r2(p.labour)) items.push({ Description: `Labour ${p.period_start} to ${p.period_end}`, Quantity: 1, UnitAmount: r2(p.labour), AccountCode: s.xero_labour_account || '320', TaxType: 'NONE' });
        if (r2(p.materials)) items.push({ Description: `Materials ${p.period_start} to ${p.period_end}`, Quantity: 1, UnitAmount: r2(p.materials), AccountCode: s.xero_purchase_account || '310', TaxType: 'NONE' });
        // FIN-NEW-01: a contra charge (goods / plant / services we supplied
        // to the subcontractor) is part of the CIS gross - HMRC treats it as
        // paid to them - so it stays inside the labour line above, and comes
        // off the bill here as a negative line. The bill then equals what is
        // actually paid before CIS. Same account as the line it came out of
        // (labour; materials if there is no labour line).
        const contra = r2(p.contra);
        if (contra > 0) items.push({ Description: `Contra charge ${p.period_start} to ${p.period_end}`, Quantity: 1, UnitAmount: -contra, AccountCode: r2(p.labour) ? (s.xero_labour_account || '320') : (s.xero_purchase_account || '310'), TaxType: 'NONE' });
        const x: any = { Type: 'ACCPAY', Contact: contact, InvoiceNumber: p.invoice_no || undefined, Reference: `CIS ${p.period_start}–${p.period_end}`, Date: p.paid_on || p.period_end, DueDate: p.paid_on || p.period_end, LineAmountTypes: 'NoTax', Status: 'AUTHORISED', LineItems: items };
        if (p.xero_id) x.InvoiceID = p.xero_id;
        const r = await call('POST', '/Invoices', { Invoices: [x] });
        const xi = r.Invoices[0];
        await admin.from('fin_sub_payments').update({ xero_id: xi.InvoiceID, xero_synced_at: new Date().toISOString(), xero_error: null }).eq('id', p.id);
        return json({ ok: true, xero_id: xi.InvoiceID });
      } catch (e) {
        await admin.from('fin_sub_payments').update({ xero_error: String((e as Error).message || e).slice(0, 500) }).eq('id', p.id);
        throw e;
      }
    }

    if (action === 'pull_payments') {
      // For sent invoices still owing: if Xero shows more paid than OpHUB, record the difference as a payment.
      const { data: invs } = await admin.from('fin_invoices').select('id, total, paid, xero_id').eq('org_id', orgId).in('status', ['issued', 'sent', 'part_paid']).not('xero_id', 'is', null).order('issue_date', { ascending: true }).limit(2000);
      let added = 0, amount = 0;
      const list = invs || [];
      for (let i = 0; i < list.length; i += 40) {
        const chunk = list.slice(i, i + 40);
        const r = await call('GET', '/Invoices?IDs=' + chunk.map((x: any) => x.xero_id).join(','));
        for (const xi of (r.Invoices || [])) {
          const mine = chunk.find((x: any) => x.xero_id === xi.InvoiceID);
          if (!mine) continue;
          const diff = r2(r2(xi.AmountPaid) + r2(xi.AmountCredited) - r2(mine.paid));
          if (diff > 0.009) {
            const paidOn = (xi.FullyPaidOnDate && /\d{10,}/.test(xi.FullyPaidOnDate)) ? new Date(Number(xi.FullyPaidOnDate.match(/\d{10,}/)[0])).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
            await admin.from('fin_payments').insert({ org_id: orgId, invoice_id: mine.id, amount: diff, paid_on: paidOn, note: 'From Xero', created_by: me.id });
            added++; amount = r2(amount + diff);
          }
        }
      }
      return json({ ok: true, checked: list.length, added, amount });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 400);
  }
}));
