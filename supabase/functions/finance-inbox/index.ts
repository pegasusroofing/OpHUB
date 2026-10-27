import { createClient } from 'npm:@supabase/supabase-js@2';

// OpHUB Finance invoice inbox: receives supplier invoices forwarded from an
// email inbox (Power Automate, Zapier, Make or any service that can POST).
// Authenticated by the company's secret inbox key (Finance settings), not a
// login. Each PDF / image attachment is stored in finance-docs/<org>/inbox/
// and listed in the Finance inbox, where the app reads it and files it to a
// job and PO.
//   POST /functions/v1/finance-inbox      with header  x-inbox-key: <inbox key>   (preferred)
//   POST /functions/v1/finance-inbox?key=<inbox key>                              (still accepted)
//   { "from": "accounts@supplier.co.uk", "subject": "Invoice 123",
//     "attachments": [ { "filename": "inv.pdf", "content_type": "application/pdf", "content_base64": "..." } ] }
// Power Automate's "attachments" array ({Name, ContentType, ContentBytes}) is accepted as-is too.
const cors = { 'Access-Control-Allow-Headers': 'content-type, x-inbox-key' };
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
const OK_TYPES = /^(application\/pdf|image\/(jpeg|png|heic|heif|webp))$/i;
const API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const norm = (s: unknown) => String(s || '').toUpperCase().replace(/\s+/g, '');
// L5: supplier names compared loosely ("Jewson Ltd" = "JEWSON LIMITED" = "Jewson").
const supKey = (s: unknown) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\b(ltd|limited|plc|llp|uk|the|co|company|group|trading|t\/a)\b/g, ' ').replace(/\s+/g, ' ').trim();
const sameSupplier = (a: unknown, b: unknown) => { const x = supKey(a), y = supKey(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

// Read the invoice with Claude (only when ANTHROPIC_API_KEY is set; otherwise the app reads it when Finance is opened).
async function readDoc(bytes: Uint8Array, type: string) {
  if (!API_KEY) return null;
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  const b64 = btoa(bin);
  const doc = type.includes('pdf') ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : /image\/(jpeg|png|gif|webp)/.test(type) ? { type: 'image', source: { type: 'base64', media_type: type, data: b64 } } : null;
  if (!doc) return null;
  const schema = { type: 'object', properties: {
    doc_type: { type: 'string', enum: ['invoice', 'credit_note', 'statement', 'remittance', 'other'] },
    supplier: { type: 'string' }, invoice_no: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' },
    po_number: { type: 'string', description: 'Customer order / PO reference quoted' },
    job_reference: { type: 'string', description: 'Any job / contract / site reference quoted' },
    delivery_address: { type: 'string', description: 'Delivery or site address, including postcode' },
    net: { type: 'number' }, vat: { type: 'number' }, total: { type: 'number' } }, required: ['doc_type'] };
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, tools: [{ name: 'record', description: 'Record the invoice header', input_schema: schema }], tool_choice: { type: 'tool', name: 'record' },
      messages: [{ role: 'user', content: [doc, { type: 'text', text: 'UK supplier invoice to a roofing contractor. Record the header with the record tool. Numbers without £ or commas. Leave out anything you cannot read.' }] }] }) });
  if (!res.ok) return null;
  const j = await res.json().catch(() => ({}));
  const t = (j.content || []).find((c: any) => c.type === 'tool_use');
  return t ? t.input : null;
}
// Work out the job: our PO number, then the job number, then the site postcode / address.
async function matchJob(admin: any, orgId: string, ex: any) {
  const hay = [ex.po_number, ex.job_reference, ex.delivery_address].filter(Boolean).join(' ');
  const { data: pos } = await admin.from('purchase_orders').select('id, number, site_id, supplier_id, value').eq('org_id', orgId).neq('status', 'cancelled');
  const po = (pos || []).find((p: any) => p.number && (norm(ex.po_number) === norm(p.number) || norm(hay).includes(norm(p.number))));
  if (po) return { site_id: po.site_id, po, how: 'our PO number ' + po.number };
  const { data: sites } = await admin.from('sites').select('id, job_number, name, address, postcode, status').eq('org_id', orgId).neq('status', 'closed');
  const list = sites || [];
  const byNo = list.filter((s: any) => s.job_number && String(s.job_number).length >= 3 && new RegExp('\\b' + String(s.job_number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(hay));
  if (byNo.length === 1) return { site_id: byNo[0].id, how: 'job number ' + byNo[0].job_number };
  const pcs = new Set<string>(); const re = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi; let m; while ((m = re.exec(hay))) pcs.add(norm(m[1] + m[2]));
  const byPc = list.filter((s: any) => s.postcode && pcs.has(norm(s.postcode)));
  if (byPc.length === 1) return { site_id: byPc[0].id, how: 'site postcode ' + byPc[0].postcode };
  const low = hay.toLowerCase();
  const byAddr = list.filter((s: any) => { const l1 = String(s.address || '').split(/,|\n/)[0].trim().toLowerCase(); return (l1.length > 6 && low.includes(l1)) || (s.name && s.name.length > 6 && low.includes(String(s.name).toLowerCase())); });
  if (byAddr.length === 1) return { site_id: byAddr[0].id, how: 'site address' };
  return { why: byNo.length + byPc.length + byAddr.length > 1 ? 'More than one job matches — choose which' : 'Couldn’t find a PO, job number or site address on it' };
}
async function autoProcess(admin: any, orgId: string, inboxId: string, path: string, name: string, bytes: Uint8Array, type: string, from: string) {
  const ex: any = await readDoc(bytes, type).catch(() => null);
  if (!ex) return; // no reader configured — the app reads it when Finance opens
  const extracted: any = { read: true, ai: true, supplier: ex.supplier || null, invoice_no: ex.invoice_no || null, date: ex.date || null, net: ex.net ?? null, vat: ex.vat ?? null, total: ex.total ?? null, po_number: ex.po_number || null };
  if (ex.doc_type && !['invoice', 'credit_note'].includes(ex.doc_type)) {
    await admin.from('fin_inbox').update({ extracted, stage: 'query', query_reason: 'This looks like a ' + String(ex.doc_type).replace('_', ' ') + ', not an invoice' }).eq('id', inboxId); return;
  }
  const job: any = await matchJob(admin, orgId, ex);
  let net = ex.net, vat = ex.vat, total = ex.total;
  if (net == null && total != null) { net = vat != null ? r2(total - vat) : r2(total / 1.2); if (vat == null) vat = r2(total - net); }
  if (vat == null) vat = 0; if (total == null && net != null) total = r2(net + vat);
  if (!job.site_id || net == null || !extracted.supplier) {
    await admin.from('fin_inbox').update({ extracted: Object.assign(extracted, job.site_id ? { site_id: job.site_id, match: job.how } : {}), site_id: job.site_id || null, po_id: job.po?.id || null, stage: 'query',
      query_reason: job.site_id ? (net == null ? 'Couldn’t read the amounts' : 'Couldn’t tell the supplier') : job.why }).eq('id', inboxId);
    return;
  }
  // L5: the AI read the supplier and PO off a document anyone can email in.
  // Before linking it to one of our POs, the supplier on the invoice must
  // match the PO's supplier - otherwise it goes to the inbox as a query for a
  // person to check, and nothing is filed.
  if (job.po) {
    const poNames: string[] = [];
    const { data: poRow } = await admin.from('purchase_orders').select('supplier_name').eq('id', job.po.id).maybeSingle();
    if (poRow?.supplier_name) poNames.push(poRow.supplier_name);
    if (job.po.supplier_id) { const { data: sup } = await admin.from('suppliers').select('name').eq('id', job.po.supplier_id).maybeSingle(); if (sup?.name) poNames.push(sup.name); }
    if (!poNames.some((n) => sameSupplier(n, extracted.supplier))) {
      await admin.from('fin_inbox').update({ extracted: Object.assign(extracted, { site_id: job.site_id, match: job.how }), site_id: job.site_id, po_id: job.po.id, stage: 'query',
        query_reason: `Supplier on the invoice (${String(extracted.supplier).slice(0, 80)}) doesn’t match PO ${job.po.number}${poNames[0] ? ' (' + String(poNames[0]).slice(0, 80) + ')' : ''} — check before filing` }).eq('id', inboxId);
      return;
    }
  }
  const flags: string[] = [];
  if (extracted.invoice_no) {
    const { data: dup } = await admin.from('purchase_invoices').select('id, supplier_name').eq('org_id', orgId).eq('invoice_no', extracted.invoice_no);
    if ((dup || []).some((d: any) => String(d.supplier_name || '').trim().toLowerCase() === String(extracted.supplier).toLowerCase())) flags.push('possible duplicate of an invoice already entered');
  }
  if (job.po && job.po.value != null) {
    const { data: others } = await admin.from('purchase_invoices').select('net').eq('po_id', job.po.id).neq('status', 'rejected');
    const sofar = (others || []).reduce((t: number, i: any) => t + Number(i.net || 0), 0) + Number(net);
    if (sofar > Number(job.po.value) + 0.005) flags.push('£' + r2(sofar - Number(job.po.value)).toFixed(2) + ' over the PO value');
  }
  // Never auto-approved: an auto-filed invoice is always 'to_approve' or 'query'.
  const { data: pi } = await admin.from('purchase_invoices').insert({ org_id: orgId, site_id: job.site_id, po_id: job.po?.id || null, no_po: !job.po, kind: 'invoice', supplier_id: job.po?.supplier_id || null,
    supplier_name: extracted.supplier, invoice_no: extracted.invoice_no, invoice_date: extracted.date || new Date().toISOString().slice(0, 10), net: r2(net), vat: r2(vat), total: r2(total),
    status: flags.length ? 'query' : 'to_approve', query_note: flags.length ? flags.join('; ') : null, file_path: path, file_name: name }).select('id').single();
  if (!pi) return;
  await admin.from('fin_inbox').update({ extracted: Object.assign(extracted, { site_id: job.site_id, match: job.how }), site_id: job.site_id, po_id: job.po?.id || null, status: 'filed', stage: 'auto', auto_filed: true,
    purchase_invoice_id: pi.id, comments: [{ name: 'OpHUB', at: new Date().toISOString(), text: 'Read and filed to the job automatically (' + job.how + ').' }] }).eq('id', inboxId);
}

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const url = new URL(req.url);
    // L5: the x-inbox-key header is preferred (query strings end up in logs);
    // ?key= keeps working so existing Power Automate flows don't break.
    const headerKey = (req.headers.get('x-inbox-key') || '').trim();
    const key = (headerKey || url.searchParams.get('key') || '').trim();
    // SEC-L5 (fix3c): the old ?key= link still works for now (the mail
    // forwarder may use it) but is logged, so the forwarder can be moved to
    // the x-inbox-key header and the link then retired. The key is never logged.
    if (!headerKey && key) console.warn('finance-inbox: called with the old ?key= link - please switch the forwarder to the x-inbox-key header');
    if (!/^[A-Za-z0-9_-]{24,80}$/.test(key)) return json({ error: 'Missing or invalid key' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: st } = await admin.from('fin_settings').select('org_id').eq('inbox_key', key).maybeSingle();
    if (!st) return json({ error: 'Unknown key' }, 401);
    const len = Number(req.headers.get('content-length') || 0);
    if (len > 25 * 1024 * 1024) return json({ error: 'Too large (25 MB max)' }, 413);
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Send JSON' }, 400);
    const from = String(body.from || body.From || '').slice(0, 200);
    const subject = String(body.subject || body.Subject || '').slice(0, 300);
    const atts = (Array.isArray(body.attachments) ? body.attachments : Array.isArray(body.Attachments) ? body.Attachments : []).slice(0, 15);
    const saved: string[] = [];
    for (const a of atts) {
      const name = String(a.filename || a.Name || a.name || 'attachment').replace(/[^A-Za-z0-9._ -]+/g, '_').slice(-100);
      let type = String(a.content_type || a.ContentType || a.contentType || '').toLowerCase();
      if (!type) type = /\.pdf$/i.test(name) ? 'application/pdf' : /\.(jpe?g)$/i.test(name) ? 'image/jpeg' : /\.png$/i.test(name) ? 'image/png' : '';
      if (!OK_TYPES.test(type)) continue; // skip signatures, logos in other formats, etc.
      const b64 = String(a.content_base64 || a.ContentBytes || a.contentBytes || a.content || '');
      if (!b64) continue;
      let bytes: Uint8Array;
      try { const bin = atob(b64.replace(/\s+/g, '')); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); } catch (_e) { continue; }
      if (bytes.length < 200 || bytes.length > 20 * 1024 * 1024) continue;
      // tiny images are usually email signature logos
      if (type.startsWith('image/') && bytes.length < 15000) continue;
      const path = `${st.org_id}/inbox/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${name.replace(/\s+/g, '_')}`;
      const up = await admin.storage.from('finance-docs').upload(path, bytes, { contentType: type, upsert: false });
      if (up.error) continue;
      const ins = await admin.from('fin_inbox').insert({ org_id: st.org_id, source: 'email', from_email: from || null, subject: subject || null, file_path: path, file_name: name, content_type: type }).select('id').single();
      if (!ins.error) { saved.push(ins.data.id); try { await autoProcess(admin, st.org_id, ins.data.id, path, name, bytes, type, from); } catch (_e) { /* the app reads it later */ } }
    }
    return json({ ok: true, saved: saved.length });
  } catch (e) {
    console.error('finance-inbox failed', e);
    return json({ error: 'Something went wrong — the attachments may not have been saved.' }, 500);
  }
}));
