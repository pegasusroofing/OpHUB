/* ================= Supabase data layer ================= */
let SESSION = null; // {access_token, refresh_token, expires_at, user:{id,email}}

// Every network call in this app used to be a bare fetch() with no
// timeout — one stalled request (bad signal, a blocking extension,
// anything) could freeze that whole code path forever with nothing to
// click and no error shown. This wraps fetch with an AbortController so a
// stalled request fails the same way a rejected one already did, after a
// bounded wait, instead of hanging indefinitely. Every fetch(SUPABASE_URL...)
// call in the app goes through this now — see ensureFreshToken, sbFetch,
// uploadToStorage, signUp and signIn below.
function fetchWithTimeout(url, opts, ms){
  opts = opts || {};
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), ms || 15000);
  const merged = Object.assign({}, opts, {signal: controller.signal});
  return fetch(url, merged).finally(()=>clearTimeout(timeout));
}
// On a poor/limited signal, a request can drop or time out for reasons that
// have nothing to do with the request itself (a brief dead spot on site,
// signal handover). Retrying once, only for GET (safe to repeat) and only
// after a genuine network-level failure (not a proper HTTP error response,
// which is retried zero times since the server already answered), turns a
// lot of those into a short delay instead of a hard failure.
async function fetchWithRetry(url, opts, ms){
  const method = (opts && opts.method) || 'GET';
  try{
    return await fetchWithTimeout(url, opts, ms);
  }catch(e){
    if(method !== 'GET') throw e;
    await new Promise(r=>setTimeout(r, 900));
    return fetchWithTimeout(url, opts, ms);
  }
}
// Several requests fired together after the token has expired (every
// Promise.all of selects does this) used to each start their OWN refresh
// with the same refresh token — and any one of those coming back non-OK
// signed the user out. Now there is one refresh in flight at a time that
// everybody waits on.
let _tokenRefreshInFlight = null;
async function ensureFreshToken(){
  if(!SESSION) return;
  if(Date.now() < SESSION.expires_at - 60000) return;
  // No connection at all — don't burn a 10s timeout finding that out; the
  // stale-but-present token gets sent as-is, and dbSelect's own offline
  // fallback (cache, or navigator.onLine's fast-path) takes it from there.
  if(navigator.onLine === false) return;
  if(!_tokenRefreshInFlight){
    _tokenRefreshInFlight = _refreshTokenNow().finally(()=>{ _tokenRefreshInFlight = null; });
  }
  return _tokenRefreshInFlight;
}
async function _refreshTokenNow(){
  const session = SESSION;
  if(!session) return;
  try{
    const res = await fetchWithTimeout(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token', {
      method:'POST',
      headers:{'apikey':SUPABASE_ANON_KEY,'Content-Type':'application/json'},
      body: JSON.stringify({refresh_token: session.refresh_token})
    }, 10000);
    if(SESSION !== session) return; // signed out (or in as someone else) while this was in the air
    if(res.ok){
      const d = await res.json();
      SESSION = {access_token:d.access_token, refresh_token:d.refresh_token, expires_at:Date.now()+(d.expires_in*1000), user:session.user};
      await setJSON(K_SESSION, SESSION, false);
    } else if(res.status===400 || res.status===401 || res.status===403){
      // The server actually answered and said the refresh token itself is
      // no good (expired/revoked) — this really is a "log in again" case.
      SESSION = null; ME = null; await sdelete(K_SESSION, false); await sdelete(K_BOOT, false);
    }
    // Anything else (429 rate limit, a 5xx blip) says nothing about the
    // token — keep the session and let the next request try again.
  }catch(e){
    // A genuine network-level failure (timeout, connection drop) trying to
    // reach the refresh endpoint — NOT proof the refresh token is bad. Leave
    // the existing session in place (the caller will still send the old
    // access token, which may well still be valid) instead of silently
    // logging the user out from what could be a one-off blip.
  }
}
async function sbFetch(path, opts){
  opts = opts || {};
  // Optional per-call override of the default 20s timeout — e.g. an Edge
  // Function that downloads a file from Storage and re-encodes it
  // server-side (send-schedule-email, send-snags-email) genuinely needs
  // more than 20s for a larger PDF, and the default was too short: the
  // client gave up and aborted before the function finished, which looked
  // exactly like "could not reach the server" on a perfectly working
  // connection (the request just hadn't gotten a response back YET).
  // Destructured out here so it never gets passed through to fetch() itself.
  const timeoutMs = opts.timeoutMs;
  // Anything that isn't a plain read may have changed data — forget what
  // the screen re-draw memory was holding.
  if(String(opts.method||'GET').toUpperCase() !== 'GET') uiReadCacheClear();
  await ensureFreshToken();
  // #(no-stale-reads): every dbSelect() GET goes through here, and this app
  // is loaded inside an Android WebView, which — unlike a normal browser tab
  // — will sometimes serve a GET straight out of its on-disk HTTP cache
  // instead of re-hitting the network, even for an API response with no
  // Cache-Control header at all. That silently returned stale data: e.g. the
  // Outstanding Tasks page/badge still counting a RAMS/COSHH signature as
  // missing after the last person who needed to sign it had already been
  // removed from the site (or had actually signed), because the WebView
  // handed back the same cached JSON it fetched minutes/hours earlier
  // instead of asking the server again. `cache:'no-store'` plus explicit
  // no-cache headers force every request — reads included — to always go to
  // the network.
  const headers = Object.assign({
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + (SESSION ? SESSION.access_token : SUPABASE_ANON_KEY),
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  }, opts.headers||{});
  return fetchWithRetry(SUPABASE_URL + path, Object.assign({cache:'no-store'}, opts, {headers}), timeoutMs || 20000);
}
async function safeErr(res){ try{ const j = await res.json(); return j.message||j.error_description||j.error||res.status; }catch(e){ return res.status; } }
// sbFetch's own retry (fetchWithRetry) only ever retries GETs — a POST is
// left alone there because retrying a POST that already reached the server
// (e.g. an insert) risks doing it twice. The OneDrive browse/download calls
// are POSTs only because they carry a JSON body, not because they write
// anything of ours — Microsoft Graph reads are as safe to retry as a GET.
// Without this, a single dropped connection on "onedrive-list-folders" (the
// common case on a flaky mobile signal) surfaced as "Could not reach
// OneDrive" with no second attempt at all.
async function sbFetchIdempotent(path, opts){
  try{ return await sbFetch(path, opts); }
  catch(e){ await new Promise(r=>setTimeout(r, 900)); return sbFetch(path, opts); }
}
// #(onedrive-authheader-hang): 2026-09-13 — every OneDrive edge function call
// hung with zero response (proven across many redeploys — different code,
// different verify_jwt setting, brand-new functions, a full project restart
// — none of it mattered) whenever the request's Authorization header carried
// a real signed-in user's token. Requests with no user token in Authorization
// (a plain browser hit with nothing, or the scheduled background jobs that
// use the service-role key) always completed instantly. So for the OneDrive
// functions specifically, the user's token now travels in a custom header
// (X-User-Token) instead, with Authorization left as just the anon key —
// the matching server-side change reads it from there. Every other call in
// the app is untouched; this is scoped to the one code path that was hanging.
async function sbFetchOD(path, opts){
  opts = Object.assign({}, opts || {});
  // Uploads to OneDrive carry a whole file in the request, so they get a
  // minute rather than the usual 20 seconds (or whatever timeoutMs asks for).
  uiReadCacheClear();
  const odTimeoutMs = opts.timeoutMs || (/onedrive-upload/.test(path) ? 60000 : 20000);
  delete opts.timeoutMs;
  await ensureFreshToken();
  const headers = Object.assign({
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    'X-User-Token': SESSION ? SESSION.access_token : '',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  }, opts.headers||{});
  return fetchWithTimeout(SUPABASE_URL + path, Object.assign({cache:'no-store'}, opts, {headers}), odTimeoutMs);
}
async function sbFetchODIdempotent(path, opts){
  try{ return await sbFetchOD(path, opts); }
  catch(e){ await new Promise(r=>setTimeout(r, 900)); return sbFetchOD(path, opts); }
}

let lastNetworkToastAt = 0;
function toastNetworkIssue(){
  // Throttled so one screen that fires several dbSelect calls in a row
  // during a dead spot doesn't stack multiple identical toasts.
  if(Date.now() - lastNetworkToastAt < 8000) return;
  lastNetworkToastAt = Date.now();
  toast('Connection is weak — some data may not have loaded. Pull to refresh once signal improves.');
}
