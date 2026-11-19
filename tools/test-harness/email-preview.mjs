// A picture of the OpHUB welcome email (supabase/functions/send-invite-email/welcome.ts), without sending one.
// node email-preview.mjs
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('./harness');
const w = await import(pathToFileURL(path.join(here, '..', '..', 'supabase', 'functions', 'send-invite-email', 'welcome.ts')).href);
const html = w.welcomeHtml({ company: 'RTB Construction Group', link: 'https://app.operativehub.co.uk/join/245356d5-697a-45a2-a611-da47f7aaeb63', expires: '03 December 2026' });
const b = await chromium.launch();
for (const [vw, name] of [[720, 'laptop'], [390, 'phone']]) {
  const p = await b.newPage({ viewport: { width: vw, height: 900 } });
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.screenshot({ path: path.join(here, 'shots', `welcome-email-${name}.png`), fullPage: true });
}
await b.close();
console.log('subject:', w.welcomeSubject('RTB Construction Group'));
