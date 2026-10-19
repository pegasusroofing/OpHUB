import { createClient } from 'npm:@supabase/supabase-js@2';

// OpHUB Finance invoice inbox: receives supplier invoices forwarded from an
// email inbox (Power Automate, Zapier, Make or any service that can POST).
// Authenticated by the company's secret inbox key (Finance settings), not a
// login. Each PDF / image attachment is stored in finance-docs/<org>/inbox/
// and listed in the Finance inbox, where the app reads it and files it to a
// job and PO.
//   POST /functions/v1/finance-inbox?key=<inbox key>
//   { "from": "accounts@supplier.co.uk", "subject": "Invoice 123",
//     "attachments": [ { "filename": "inv.pdf", "content_type": "application/pdf", "content_base64": "..." } ] }
// Power Automate's "attachments" array ({Name, ContentType, ContentBytes}) is accepted as-is too.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-inbox-key' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const OK_TYPES = /^(application\/pdf|image\/(jpeg|png|heic|heif|webp))$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const url = new URL(req.url);
    const key = (url.searchParams.get('key') || req.headers.get('x-inbox-key') || '').trim();
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
      if (!ins.error) saved.push(ins.data.id);
    }
    return json({ ok: true, saved: saved.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
