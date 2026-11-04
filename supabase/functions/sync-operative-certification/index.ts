import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};

// #(cors-cache-pragma-fix) 2026-09-24: same class of bug as
// notify-site-assignment/notify-todo-assigned — the app's shared sbFetch()
// helper always sends Cache-Control/Pragma headers on every request
// (added to stop the Android WebView serving stale GETs from its HTTP
// cache), including on this function's POSTs. Those two headers weren't in
// this function's Access-Control-Allow-Headers, so the browser's CORS
// preflight (OPTIONS) succeeded but the browser then silently refused to
// send the actual POST at all — it never reached Supabase. That's exactly
// the "sync error" symptom reported from the Operatives page's Sync Now
// button, despite nothing showing up as an actual error server-side.

async function refreshIfNeeded(admin: any, conn: any){
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

function normalizeFileName(name: string){
  return String(name || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .toLowerCase()
    .replace(/\s*[\(\[]\s*(copy|\d+)\s*[\)\]]\s*$/i, '')
    .replace(/\s*-\s*copy\s*$/i, '')
    .replace(/\s*v\d+\s*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function childrenUrl(driveId: string | null, folderId: string){
  return driveId
    ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children?$select=id,name,file,folder,size,parentReference&$top=200`
    : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}/children?$select=id,name,file,folder,size,parentReference&$top=200`;
}

async function listFilesRecursive(accessToken: string, driveId: string | null, folderId: string, depth: number): Promise<any[]> {
  const res = await fetch(childrenUrl(driveId, folderId), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('OneDrive list failed: ' + await res.text());
  const data = await res.json();
  const items = data.value || [];
  let files = items.filter((it: any) => it.file);
  if (depth > 0) {
    const folders = items.filter((it: any) => it.folder);
    for (const f of folders) {
      const nested = await listFilesRecursive(accessToken, f.parentReference?.driveId || driveId, f.id, depth - 1);
      files = files.concat(nested);
    }
  }
  return files;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: caller } = await admin.from('profiles').select('role, org_id').eq('id', userData.user.id).maybeSingle();
    // Project managers/admins can sync (push+pull) any operative's folder from
    // their record. An operative themselves may also trigger the explicit
    // "push selected certificates to OneDrive" action from their own
    // Dashboard/Certifications view, but only for their own certificates —
    // never a pull, and never someone else's operative_id.
    const body = await req.json().catch(() => ({}));
    // 4 Nov 2026: manual_operative_id = an operative added by hand on the Operatives dashboard who hasn't
    // signed up yet. Same push / pull, against manual_operatives and certificates' manual_operative_id.
    const manualId = body.manual_operative_id ? String(body.manual_operative_id) : null;
    const operativeId = manualId ? null : body.operative_id;
    const explicitCertIds: string[] | null = Array.isArray(body.cert_ids) && body.cert_ids.length ? body.cert_ids.map(String) : null;
    const isSelfPush = !!explicitCertIds && !!caller && operativeId === userData.user.id;
    if (!caller || ((manualId || !isSelfPush) && caller.role !== 'pm' && caller.role !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden — project managers and admins only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!operativeId && !manualId) return new Response(JSON.stringify({ error: 'operative_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: operative } = manualId
      ? await admin.from('manual_operatives').select('id, name, org_id, onedrive_folder_id, onedrive_folder_name, onedrive_drive_id').eq('id', manualId).maybeSingle()
      : await admin.from('profiles').select('id, name, org_id, role, onedrive_folder_id, onedrive_folder_name, onedrive_drive_id').eq('id', operativeId).maybeSingle();
    const ownerCol = manualId ? 'manual_operative_id' : 'operative_id';
    const ownerId = manualId || operativeId;
    if (!operative || operative.org_id !== caller.org_id) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!operative.onedrive_folder_id) return new Response(JSON.stringify({ error: 'Link a OneDrive folder for this operative first, from their record.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', caller.org_id).maybeSingle();
    if (!conn || !conn.access_token) return new Response(JSON.stringify({ error: "OneDrive isn't connected for your company yet." }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const accessToken = await refreshIfNeeded(admin, conn);
    const folder = { id: operative.onedrive_folder_id, driveId: operative.onedrive_drive_id || null, name: operative.onedrive_folder_name };

    // ---- PUSH ----
    // #337: pushing to OneDrive is no longer automatic on every sync. A
    // phone-uploaded certificate (source='upload') sits as "not yet pushed"
    // until the user explicitly multi-selects it and fires the "Upload to
    // OneDrive" bulk action, which calls this function with `cert_ids` set —
    // only those rows get pushed. A plain sync call (no cert_ids) does a
    // PULL only and pushes nothing, so newly uploaded phone files stay put
    // until deliberately sent up.
    let pushed = 0;
    if (explicitCertIds) {
      const { data: toPush } = await admin.from('operative_certifications').select('*').in('id', explicitCertIds).eq(ownerCol, ownerId).eq('source', 'upload').is('item_id', null);
      for (const row of toPush || []) {
        try {
          const dlRes = await admin.storage.from('certifications').download(row.storage_path);
          if (dlRes.error || !dlRes.data) continue;
          const buf = new Uint8Array(await dlRes.data.arrayBuffer());
          const uploadUrl = folder.driveId
            ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(folder.driveId)}/items/${encodeURIComponent(folder.id)}:/${encodeURIComponent(row.name)}:/content`
            : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folder.id)}:/${encodeURIComponent(row.name)}:/content`;
          const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' }, body: buf });
          if (!putRes.ok) continue;
          const putData = await putRes.json();
          await admin.from('operative_certifications').update({ item_id: putData.id, drive_id: putData.parentReference?.driveId || folder.driveId || null, synced_at: new Date().toISOString(), pushed_to_onedrive_at: new Date().toISOString() }).eq('id', row.id);
          pushed++;
        } catch (_e) { /* skip this file, keep going */ }
      }

      // An explicit push call is push-only — it does not also pull, so the
      // count returned is exactly what the user asked to send up.
      return new Response(JSON.stringify({ ok: true, pushed, pulled: 0, folderName: folder.name }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- PULL: OneDrive files not yet in OpHUB (recurse one level so files
    // moved into a subfolder inside the operative's folder still get picked up) ----
    const files = await listFilesRecursive(accessToken, folder.driveId, folder.id, 1);
    const { data: existing } = await admin.from('operative_certifications').select('item_id, name').eq(ownerCol, ownerId);
    const alreadyIds = new Set((existing || []).map((r: any) => r.item_id).filter(Boolean));
    const alreadyNames = new Set((existing || []).map((r: any) => normalizeFileName(r.name)));
    const toImport = files.filter((f: any) => !alreadyIds.has(f.id) && !alreadyNames.has(normalizeFileName(f.name)));

    let pulled = 0;
    const importedNamesThisRun = new Set();
    for (const f of toImport) {
      try {
        const norm = normalizeFileName(f.name);
        if (importedNamesThisRun.has(norm)) continue;
        if ((f.size || 0) > 20 * 1024 * 1024) continue;
        const driveIdForItem = f.parentReference?.driveId || folder.driveId || null;
        const contentUrl = driveIdForItem
          ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveIdForItem)}/items/${encodeURIComponent(f.id)}/content`
          : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(f.id)}/content`;
        const fileRes = await fetch(contentUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!fileRes.ok) continue;
        const buf = new Uint8Array(await fileRes.arrayBuffer());
        const safeName = (f.name || 'file').replace(/[^a-zA-Z0-9.\-]+/g, '_');
        const storagePath = `${operative.org_id}/${manualId ? 'm-' + manualId : operativeId}/${f.id}-${safeName}`;
        const { error: upErr } = await admin.storage.from('certifications').upload(storagePath, buf, { contentType: 'application/octet-stream', upsert: true });
        if (upErr) continue;
        await admin.from('operative_certifications').insert({
          org_id: operative.org_id, operative_id: operativeId, manual_operative_id: manualId, category: 'other', name: f.name,
          item_id: f.id, drive_id: driveIdForItem, storage_path: storagePath, size: f.size || null,
          source: 'onedrive', synced_at: new Date().toISOString(),
        });
        importedNamesThisRun.add(norm);
        pulled++;
      } catch (_e) { /* skip this file, keep going */ }
    }

    await admin.from(manualId ? 'manual_operatives' : 'profiles').update({ onedrive_last_synced_at: new Date().toISOString() }).eq('id', ownerId);

    return new Response(JSON.stringify({ ok: true, pushed, pulled, folderName: folder.name }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
