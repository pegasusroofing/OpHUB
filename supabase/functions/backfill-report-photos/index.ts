import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// One-time migration: older report_submissions rows saved photo answers as
// raw data: URLs directly in the answers JSONB (see the recent app.html fix
// — submitReport now uploads to Storage like every other photo feature).
// This walks existing rows, uploads any embedded data: URL photos to the
// site-photos bucket, and rewrites the answer to the resulting public URL —
// same shape newly-submitted reports already use, so their exported/emailed
// PDFs (and the in-app viewer) pick them up without further changes.
// Idempotent: only rows whose answers still contain a data: URL are
// touched, so this is safe to call more than once (e.g. to work through a
// large backlog a batch at a time).
//
// #(admin-migration-auth-gate): this uses the service-role client to write
// arbitrary report_submissions rows, so — same pattern as auto-checkout-2359
// / send-signout-reminder — it must not be callable by anyone who finds the
// URL. Gated on the shared CRON_SECRET even though this isn't cron-fired;
// call it manually with the same x-cron-secret header.
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

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

    const body = await req.json().catch(() => ({}));
    const offset = Number(body.offset) || 0;
    const pageSize = Math.min(Number(body.pageSize) || 25, 50);

    // PostgREST can't ilike a jsonb column directly (no ~~* operator for
    // jsonb), so page through report_submissions in id order and filter for
    // an embedded data: URL client-side instead of trying to push that down
    // as a query filter.
    const { data: page, error } = await admin
      .from('report_submissions')
      .select('id, site_id, answers')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const rows = (page || []).filter(r => r.answers && JSON.stringify(r.answers).includes('data:image'));

    let rowsProcessed = 0, photosUploaded = 0, photosFailed = 0;
    for (const row of rows || []) {
      const answers = row.answers || {};
      let changed = false;
      for (const key of Object.keys(answers)) {
        const val = answers[key];
        if (Array.isArray(val)) {
          for (let i = 0; i < val.length; i++) {
            const v = val[i];
            if (typeof v === 'string' && v.startsWith('data:image')) {
              try {
                const [meta, b64] = v.split(',');
                const ext = /jpeg|jpg/.test(meta) ? 'jpg' : (/png/.test(meta) ? 'png' : 'jpg');
                const bytes = b64ToBytes(b64);
                const path = `${row.site_id}/reports/${crypto.randomUUID()}.${ext}`;
                const { error: upErr } = await admin.storage.from('site-photos').upload(path, bytes, {
                  contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
                  upsert: false,
                });
                if (upErr) { photosFailed++; continue; }
                val[i] = `${SUPABASE_URL}/storage/v1/object/public/site-photos/${path}`;
                changed = true;
                photosUploaded++;
              } catch (_e) { photosFailed++; }
            }
          }
        } else if (typeof val === 'string' && val.startsWith('data:image')) {
          try {
            const [meta, b64] = val.split(',');
            const ext = /jpeg|jpg/.test(meta) ? 'jpg' : (/png/.test(meta) ? 'png' : 'jpg');
            const bytes = b64ToBytes(b64);
            const path = `${row.site_id}/reports/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await admin.storage.from('site-photos').upload(path, bytes, {
              contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
              upsert: false,
            });
            if (!upErr) {
              answers[key] = `${SUPABASE_URL}/storage/v1/object/public/site-photos/${path}`;
              changed = true;
              photosUploaded++;
            } else photosFailed++;
          } catch (_e) { photosFailed++; }
        }
      }
      if (changed) {
        const { error: updErr } = await admin.from('report_submissions').update({ answers }).eq('id', row.id);
        if (!updErr) rowsProcessed++;
      }
    }

    return new Response(JSON.stringify({
      ok: true, pageScanned: (page || []).length, candidatesFound: rows.length, rowsProcessed, photosUploaded, photosFailed,
      nextOffset: offset + pageSize,
      more: (page || []).length === pageSize,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
