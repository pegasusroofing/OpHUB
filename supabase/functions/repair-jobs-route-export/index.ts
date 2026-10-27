import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
};

// Fixed yard/depot postcode every route starts from (Andy's request — CM3
// 8DQ). Geocoded once and cached in geocode_cache like any other address,
// so this only ever hits an external API on the very first call.
const DEPOT_QUERY = 'CM3 8DQ';

// Mirrors the client-side REPAIR_CATEGORY_DEFS in app.html exactly (the two
// live in separate codebases with no shared import, so any change to one
// must be copied to the other by hand). job_status is now the canonical
// state machine (status workflow v2) — tower/ladder jobs no longer need
// scaffold, only access_requirement==='scaffold' does.
function repairJobNeedsScaffold(j: any) { return j.access_requirement === 'scaffold'; }
const CATEGORY_MATCH: Record<string, (j: any) => boolean> = {
  survey: (j) => !j.closed && (!j.job_status || j.job_status === 'To Survey'),
  scaffold: (j) => !j.closed && j.job_status === 'Approved - Awaiting Scaffold',
  approved: (j) => !j.closed && j.job_status === 'Approved - To Do',
};

// Straight-line ("as the crow flies") distance in miles — not actual road
// distance. Good enough for ordering a milk-run; Andy chose the free
// geocoding option over paid road-routing.
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// #(route-export-nominatim-blocked) 2026-09-25 — every Nominatim call, not
// just the depot, was coming back HTTP 403 "Access denied" (confirmed via
// this function's own logs) — OpenStreetMap's free Nominatim API blocking
// Supabase Edge Functions' shared outbound IP range under its usage
// policy, not a bug in our request or a one-off outage. Switched primary
// geocoding to postcodes.io — a free, unlimited, UK-government-backed
// postcode lookup API built for exactly this (bulk UK postcode -> lat/lng,
// no key, no per-IP blocking) — which also fixes the depot for good since
// CM3 8DQ is itself a plain postcode. A UK postcode is pulled out of each
// query with a regex and looked up in ONE batched request (up to 100 at a
// time).
//
// #(route-export-timeout-on-unpostcoded-jobs) 2026-09-25 — this fix wasn't
// enough on its own: a lot of real job addresses in the tracker have no
// postcode in the stored text at all (older/manually-typed addresses, or
// ones imported before the PDF-import fix that used to truncate the
// address before it reached the postcode). Every one of those used to fall
// back to a THROTTLED, ONE-AT-A-TIME Nominatim call — and since Nominatim
// is completely and permanently blocked for this IP (confirmed: 41/41
// attempts logged as 403, zero ever succeeding), each of those calls was
// pure wasted time: ~2-3s to fail, every single time, for every
// unresolvable address. A site with a dozen such jobs pushed the whole
// export past the client's 20s fetch timeout, so the export always failed
// with a generic "check your connection" error — even though the server
// was still plugging away in the background and would eventually have
// finished (just far too late for the app to still be listening).
// Since Nominatim has never once succeeded from here, the fallback is
// removed outright rather than kept as a slow, doomed safety net. A job
// whose address has no recognisable UK postcode now goes straight into
// the "unlocated" list (same as before — still exported, still flagged,
// still fixable by adding a postcode to the address) instead of stalling
// the whole route export waiting on a call that was never going to work.
const UK_POSTCODE_RE = /\b([A-Za-z]{1,2}\d[A-Za-z\d]?)\s*(\d[A-Za-z]{2})\b/;
function extractPostcode(text: string): string | null {
  const m = text.match(UK_POSTCODE_RE);
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null;
}

// #(route-export-postcodesio-hang) 2026-09-27 — the client's own fetch has
// a fixed 20s timeout (sbFetch), and this function used to have NO timeout
// at all on the call out to postcodes.io — a plain `fetch` with nothing
// bounding how long it could take. Edge function logs showed a real
// invocation that booted at 15:01:53 and didn't shut down until 15:03:08 —
// 75 SECONDS — with no corresponding response ever logged, meaning
// postcodes.io just occasionally hangs (or answers very slowly) rather
// than erroring outright, and the old code would sit there waiting for as
// long as it took. The client gave up at 20s and showed Andy a generic
// "check your connection" failure, even though the server was still
// plugging away — and a retry a minute later would succeed instantly
// because the geocode_cache was warm by then. That's exactly the
// "works sometimes" pattern reported: it was never actually failing, it
// was racing a hung external call against the client's own timeout.
// Fixed by bounding every postcodes.io call to a short timeout (via
// AbortController) with one quick retry — worst case ~13s total, safely
// inside the client's 20s budget — and treating a timeout exactly like any
// other lookup failure: those postcodes just come back unresolved (so the
// job lands in "unlocated", still exported, still fixable) instead of
// stalling the whole export indefinitely.
async function fetchWithTimeout(url: string, opts: any, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Bulk postcode -> {lat,lng} via postcodes.io (POST /postcodes, up to 100
// per call, no auth, no rate-limit issues from a shared cloud IP). Returns
// a Map<postcode, {lat,lng}|null>.
async function geocodePostcodesBulk(postcodes: string[]): Promise<Map<string, { lat: number; lng: number } | null>> {
  const result = new Map<string, { lat: number; lng: number } | null>();
  const unique = [...new Set(postcodes)];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    let resolved = false;
    // One retry, each bounded — a slow/hung postcodes.io call is far more
    // common than a genuinely wrong request, so a quick second attempt
    // recovers most transient stalls without risking the client's own
    // 20s timeout (2 x 6s attempts = 12s worst case, still well inside it).
    for (let attempt = 0; attempt < 2 && !resolved; attempt++) {
      try {
        const res = await fetchWithTimeout('https://api.postcodes.io/postcodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postcodes: batch }),
        }, 6000);
        if (!res.ok) {
          const bodyText = await res.text().catch(() => '');
          console.error(`[geocodePostcodesBulk] HTTP ${res.status}: ${bodyText.slice(0, 300)}`);
          continue; // try again (or fall through to "unresolved" below)
        }
        const data = await res.json().catch(() => null);
        const rows = (data && data.result) || [];
        const found = new Set<string>();
        rows.forEach((row: any) => {
          if (row.result) {
            result.set(row.query, { lat: row.result.latitude, lng: row.result.longitude });
            found.add(row.query);
          }
        });
        batch.forEach((p) => { if (!found.has(p)) result.set(p, null); });
        resolved = true;
      } catch (e) {
        console.error(`[geocodePostcodesBulk] attempt ${attempt + 1} failed/timed out: ${String(e)}`);
      }
    }
    if (!resolved) batch.forEach((p) => result.set(p, null));
  }
  return result;
}

// Geocodes a batch of free-text queries, checking geocode_cache first,
// then pulling a UK postcode out of each remaining query and resolving
// those in one batched postcodes.io call. A query with no extractable
// postcode (or one postcodes.io doesn't recognise) is left unresolved —
// see #(route-export-timeout-on-unpostcoded-jobs) above for why this no
// longer falls back to Nominatim. Returns Map<original query,
// {lat,lng}|null>, cached against the ORIGINAL query text so the cache
// stays compatible with rows written by earlier versions.
async function geocodeAll(admin: any, queries: string[]) {
  const unique = [...new Set(queries)];
  const result = new Map<string, { lat: number; lng: number } | null>();
  if (!unique.length) return result;

  const { data: cached } = await admin.from('geocode_cache').select('query, lat, lng').in('query', unique);
  const cachedSet = new Set<string>();
  (cached || []).forEach((row: any) => { result.set(row.query, { lat: row.lat, lng: row.lng }); cachedSet.add(row.query); });

  const toFetch = unique.filter((q) => !cachedSet.has(q));
  if (!toFetch.length) return result;

  // Postcode-extractable queries, one batched request for all of them.
  const postcodeByQuery = new Map<string, string>();
  toFetch.forEach((q) => { const pc = extractPostcode(q); if (pc) postcodeByQuery.set(q, pc); });
  const postcodeHits = await geocodePostcodesBulk([...postcodeByQuery.values()]);

  for (const q of toFetch) {
    const pc = postcodeByQuery.get(q);
    const hit = pc ? postcodeHits.get(pc) : undefined;
    if (hit) {
      result.set(q, hit);
      await admin.from('geocode_cache').upsert({ query: q, lat: hit.lat, lng: hit.lng });
    } else {
      // No postcode in the text, or postcodes.io didn't recognise it —
      // leave unresolved; the caller reports it as "unlocated" rather than
      // burning time on a Nominatim call that would never succeed.
      result.set(q, null);
    }
  }

  return result;
}

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


Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: caller } = await admin.from('profiles').select('id, org_id, role').eq('id', userData.user.id).maybeSingle();
    if (!caller) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!['pm', 'admin', 'site_manager'].includes(caller.role)) {
      return new Response(JSON.stringify({ error: 'Project managers and admins only.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const { site_id, category } = body || {};
    if (!site_id || !category || !CATEGORY_MATCH[category]) {
      return new Response(JSON.stringify({ error: 'site_id and a valid category (survey, scaffold, approved) are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: site } = await admin.from('sites').select('id, name, org_id').eq('id', site_id).maybeSingle();
    if (!site || site.org_id !== caller.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // NOTE: must include every column CATEGORY_MATCH's predicates read
    // (closed, job_status) as well as the columns the response actually
    // returns per stop — a prior version of this select omitted the
    // match-only columns, so every predicate silently treated them as
    // undefined and categories filtered incorrectly.
    const { data: allJobs } = await admin.from('repair_jobs').select('id, job_number, address, description, survey_notes, access_notes, access_requirement, variation_cost, scaffold_booking_date, scaffold_erection_date, repair_return_date, survey_required, quote_approved, works_completed, closed, job_status').eq('site_id', site_id);
    const jobs = (allJobs || []).filter(CATEGORY_MATCH[category]).filter((j: any) => j.address && j.address.trim());

    if (!jobs.length) {
      await admin.from('repair_route_exports').upsert({
        org_id: caller.org_id,
        site_id,
        category,
        depot: DEPOT_QUERY,
        stops: [],
        unlocated: [],
        generated_at: new Date().toISOString(),
        generated_by: caller.id,
      }, { onConflict: 'site_id,category' });
      return new Response(JSON.stringify({ ok: true, stops: [], unlocated: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const queries = [DEPOT_QUERY, ...jobs.map((j: any) => j.address.trim() + ', UK')];
    const geocoded = await geocodeAll(admin, queries);
    const depot = geocoded.get(DEPOT_QUERY);
    if (!depot) {
      return new Response(JSON.stringify({ error: 'Could not locate the yard postcode (CM3 8DQ) right now — the map lookup may be temporarily unavailable. Check the Edge Function logs for the exact reason, or try again shortly.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const located: any[] = [];
    const unlocated: any[] = [];
    for (const j of jobs) {
      const pt = geocoded.get(j.address.trim() + ', UK');
      if (pt) located.push({ ...j, lat: pt.lat, lng: pt.lng });
      else unlocated.push(j);
    }

    // Greedy nearest-neighbour route from the depot — not a true optimal
    // travelling-salesman solve, but the same practical "closest next"
    // logic Andy described the existing system doing, and fast enough to
    // run on every export rather than needing to be precomputed.
    const remaining = [...located];
    const stops: any[] = [];
    let curLat = depot.lat, curLng = depot.lng;
    let order = 1;
    while (remaining.length) {
      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversineMiles(curLat, curLng, remaining[i].lat, remaining[i].lng);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      stops.push({
        order: order++,
        distance_from_previous_mi: Math.round(bestDist * 10) / 10,
        id: next.id,
        job_number: next.job_number,
        address: next.address,
        description: next.description,
        survey_notes: next.survey_notes,
        access_notes: next.access_notes,
        access_requirement: next.access_requirement,
        variation_cost: next.variation_cost,
        scaffold_booking_date: next.scaffold_booking_date,
        scaffold_erection_date: next.scaffold_erection_date,
        repair_return_date: next.repair_return_date,
      });
      curLat = next.lat; curLng = next.lng;
    }

    const unlocatedOut = unlocated.map((j: any) => ({ id: j.id, job_number: j.job_number, address: j.address }));

    // #(route-export-last-run) 2026-09-27 — save every successful export as
    // this site+category's "last run" (one row each, upserted on
    // site_id+category so a re-run replaces rather than piles up). Lets the
    // app show a saved copy to view/work from immediately, without waiting
    // on the geocoding round-trip again, and gives PMs something to fall
    // back on if a re-run ever fails.
    await admin.from('repair_route_exports').upsert({
      org_id: caller.org_id,
      site_id,
      category,
      depot: DEPOT_QUERY,
      stops,
      unlocated: unlocatedOut,
      generated_at: new Date().toISOString(),
      generated_by: caller.id,
    }, { onConflict: 'site_id,category' });

    return new Response(JSON.stringify({
      ok: true,
      depot: DEPOT_QUERY,
      stops,
      unlocated: unlocatedOut,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('repair-jobs-route-export failed', e);
    return new Response(JSON.stringify({ error: 'Something went wrong — please try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
