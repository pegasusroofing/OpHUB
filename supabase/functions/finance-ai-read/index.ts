import { createClient } from 'npm:@supabase/supabase-js@2';

// OpHUB Finance — AI document reader.
// Reads a supplier invoice or quote (PDF, photo, or text from a spreadsheet)
// and returns the header figures and every line: description, quantity, unit,
// unit price, amount. Uses Claude via the Anthropic API.
//   POST { path: '<org>/…' (finance-docs) | text: '…', kind: 'invoice' | 'quote' }
// Needs the Supabase secret ANTHROPIC_API_KEY (optional ANTHROPIC_MODEL).
// Finance users only; files only from their own company's folder.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';

const SCHEMA = {
  type: 'object',
  properties: {
    doc_type: { type: 'string', enum: ['invoice', 'credit_note', 'quote', 'order_confirmation', 'delivery_note', 'other'] },
    supplier: { type: 'string', description: 'Company that issued the document' },
    doc_number: { type: 'string', description: 'Invoice / quote number' },
    doc_date: { type: 'string', description: 'YYYY-MM-DD' },
    due_date: { type: 'string', description: 'YYYY-MM-DD if shown' },
    po_number: { type: 'string', description: 'Customer purchase order / order reference quoted on the document' },
    site_reference: { type: 'string', description: 'Delivery address, site or job reference if shown' },
    net: { type: 'number' }, vat: { type: 'number' }, total: { type: 'number' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Supplier product code if shown' },
          description: { type: 'string' },
          qty: { type: 'number' },
          unit: { type: 'string', description: 'e.g. nr, m, m2, box, roll, bag, pack' },
          unit_price: { type: 'number', description: 'Price per unit excluding VAT, after any line discount' },
          amount: { type: 'number', description: 'Line total excluding VAT' },
          kind: { type: 'string', enum: ['item', 'delivery', 'discount', 'other'] },
        },
        required: ['description'],
      },
    },
  },
  required: ['lines'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!API_KEY) return json({ error: 'not_configured' }, 200);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: 'Please sign in again' }, 401);
    const { data: me } = await admin.from('profiles').select('org_id, finance_enabled').eq('id', u.user.id).maybeSingle();
    if (!me || !me.finance_enabled) return json({ error: 'Finance access only' }, 403);
    const body = await req.json().catch(() => ({}));
    const kind = body.kind === 'quote' ? 'quote' : 'invoice';
    const content: any[] = [];
    if (body.path) {
      const path = String(body.path);
      if (!path.startsWith(me.org_id + '/') || path.includes('..')) return json({ error: 'Forbidden' }, 403);
      const { data: blob, error } = await admin.storage.from('finance-docs').download(path);
      if (error || !blob) return json({ error: 'File not found' }, 404);
      const buf = new Uint8Array(await blob.arrayBuffer());
      if (buf.length > 15 * 1024 * 1024) return json({ error: 'File too large to read' }, 413);
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
      const b64 = btoa(bin);
      const type = (blob.type || '').toLowerCase() || (/\.pdf$/i.test(path) ? 'application/pdf' : 'image/jpeg');
      if (type.includes('pdf')) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
      else if (/image\/(jpeg|png|gif|webp)/.test(type)) content.push({ type: 'image', source: { type: 'base64', media_type: type, data: b64 } });
      else return json({ error: 'Only PDFs and photos can be read' }, 400);
    } else if (body.text) {
      content.push({ type: 'text', text: 'Document contents (from a spreadsheet):\n' + String(body.text).slice(0, 60000) });
    } else return json({ error: 'Nothing to read' }, 400);
    content.push({ type: 'text', text: `This is a UK construction ${kind === 'quote' ? 'supplier quotation / price list' : 'supplier invoice'} for a roofing contractor. Record it with the record_document tool. List every priced line in order, exactly as written (keep product codes and sizes in the description). Use numbers without currency symbols or thousands separators. Unit prices exclude VAT. Put delivery charges and discounts in their own lines with kind set. Leave out anything you cannot read rather than guessing.` });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, tools: [{ name: 'record_document', description: 'Record the document header and lines', input_schema: SCHEMA }], tool_choice: { type: 'tool', name: 'record_document' }, messages: [{ role: 'user', content }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: 'Reader error: ' + (j?.error?.message || res.status) }, 502);
    const tool = (j.content || []).find((c: any) => c.type === 'tool_use');
    if (!tool) return json({ error: 'Could not read the document' }, 422);
    return json({ ok: true, model: MODEL, data: tool.input });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
