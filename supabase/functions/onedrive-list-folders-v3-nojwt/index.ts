// #(onedrive-diagnostic-v3-retired): this was a one-off diagnostic used to
// test whether verify_jwt itself was causing the onedrive-authheader-hang
// bug (see onedrive-list-folders-v2 / other onedrive-* functions for the
// real, fixed implementation). It only ever echoed the request body back
// with no auth check and no real functionality. Confirmed unreferenced by
// app.html (grep for this slug and onedrive-list-folders-v2 both return no
// matches) — retired rather than left reachable with zero auth.
Deno.serve(async () => {
  return new Response(JSON.stringify({ error: 'Retired diagnostic endpoint' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  });
});
