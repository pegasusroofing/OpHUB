Deno.serve(async (_req) => new Response(JSON.stringify({error:'disabled'}), { status: 404, headers: { 'Content-Type': 'application/json' } }));
