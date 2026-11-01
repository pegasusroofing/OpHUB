// One made-up invoice through the AI reader, as Sandbox's admin. Does it read lines, VAT and totals, and the site? No email, nothing saved.
const fs = require('fs'), path = require('path');
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await step('AI reader: reads a made-up invoice', async () => {
    await a.go('/home', 4000);
    const anon = (fs.readFileSync(path.join(__dirname, '../../../app-native/src/lib/supabase.ts'), 'utf8').match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
    const token = await a.page.evaluate(() => JSON.parse(localStorage.getItem('ophub-native-session') || '{}').access_token);
    const text = 'INVOICE INV-4471  Date 28/10/2026  ZZ Roofing Supplies Ltd  VAT No 123456789\nDeliver to: 12 Paton Street, London. Your PO: SBX-113-PO-001\nBauder underlay 20 rolls @ 42.50  850.00\nCode 4 lead 3 rolls @ 96.00  288.00\nDelivery 1 @ 35.00  35.00\nNet 1173.00  VAT 20% 234.60  Total 1407.60';
    const r = await a.ctx.request.post('https://dtrfupmcazoioubhwdml.supabase.co/functions/v1/finance-ai-read', {headers: {apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, data: {text, kind: 'invoice'}, timeout: 90000});
    const body = await r.text();
    console.log(r.status(), body.slice(0, 900));
    return {ok: r.ok(), note: String(r.status())};
  });
};
