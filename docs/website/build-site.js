// The OpHUB website (Andy, 14 Nov 2026): style C (Blueprint) in layout 2 (Pick Your System), the How Finance Talks To
// Projects steps in style B's tinted boxes, no pricing for now. Projects and Finance are sold as two systems that talk
// to each other: one for site teams, one for complete cost management. Writes index.html, projects.html and
// finance.html at the top of the repo (Vercel serves them). The old home page is kept in docs/website/old-index.html,
// which also supplies the hero Andy likes and the site's base styles. node docs/website/build-site.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const old = fs.readFileSync(path.join(__dirname, 'old-index.html'), 'utf8');
const baseCss = old.slice(old.indexOf('<style>') + 7, old.indexOf('</style>'));
let hero = old.slice(old.indexOf('<section class="hero">'), old.indexOf('</section>', old.indexOf('<section class="hero">')) + 10);
hero = hero.replace('href="#features" class="btn btn-glass">See what\'s inside', 'href="#systems" class="btn btn-glass">See what\'s inside');
// The enquiry form (Andy, 14 Nov 2026: "keep it as enquire / quote"): what they'd like (a demo, a quote, or both) and which
// system, added to the start of their message, so the book-demo function needs no change. Prices are never shown.
const demoForm = old.slice(old.indexOf('<div class="democard">'), old.indexOf('</section>', old.indexOf('<div class="democard">')))
  .replace('<div class="formfield"><label for="dTeam">', `<div class="formrow">
          <div class="formfield"><label for="dWant">I'd like</label><select id="dWant"><option>A demo</option><option>A quote</option><option>A demo and a quote</option></select></div>
          <div class="formfield"><label for="dSys">For</label><select id="dSys"><option>Projects + Finance</option><option>OpHUB Projects</option><option>OpHUB Finance</option><option>Not sure yet</option></select></div>
        </div>
        <div class="formfield"><label for="dTeam">`)
  .replace('>Request a Demo</button>', '>Send Enquiry</button>');
const demoScript = old.slice(old.indexOf('<script>'), old.indexOf('</script>', old.indexOf('<script>')) + 9)
  .replace("message:v('dMsg')", "message:(v('dWant') + ' for ' + v('dSys') + '. ' + v('dMsg')).trim()")
  .replace("btn.textContent = 'Request a Demo';", "btn.textContent = 'Send Enquiry';")
  + `
<script>
  // A Get A Quote button (here or on the Projects / Finance pages, ?quote=projects) fills in the form's choices.
  function quoteFor(sys){ const w = document.getElementById('dWant'), f = document.getElementById('dSys'); if(w) w.value = 'A quote'; if(f && sys) f.value = sys; }
  (function(){ const q = new URLSearchParams(location.search).get('quote'); if(q) quoteFor(q === 'projects' ? 'OpHUB Projects' : q === 'finance' ? 'OpHUB Finance' : 'Projects + Finance'); })();
</script>`;
const phone = (() => {
  const a = hero.indexOf('<div class="phone">'); let depth = 0, i = a;
  const re = /<\/?div\b[^>]*>/g; re.lastIndex = a;
  for (let m; (m = re.exec(hero));) { depth += m[0].startsWith('</') ? -1 : 1; if (depth === 0) { i = re.lastIndex; break; } }
  return hero.slice(a, i);
})();

// The two systems' names, in one place (Andy may rename them).
const P = 'OpHUB Projects', F = 'OpHUB Finance';

const I = {
  site: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>', pound: '<path d="M17 20H7c2-2 2-4 2-7V8a3 3 0 0 1 6-1"/><path d="M6 13h8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', inv: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>', flask: '<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>', scale: '<path d="M12 3v18M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  quote: '<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>', truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>', pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>', tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>', doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>', van: '<path d="M2 7h12v9H2z"/><path d="M14 10h4l4 3v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>', book: '<path d="M4 4h9a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-4v16"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 4-5.5 7-5.5s6 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .8 3.4 2.6 4 5.5"/>', card: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M14 10h4M14 13h3"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', cloud: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>', brush: '<path d="M18 3l3 3-9 9-3-3z"/><path d="M9 12c-3 0-5 2-5 5 0 1-1 2-2 2 2 2 7 2 9-1 1-1.5 1-3 1-3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>', coins: '<circle cx="9" cy="9" r="6"/><path d="M15.5 9.5A6 6 0 1 1 9.5 15.5"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12h11l2-8H6"/>', hard: '<path d="M2 18h20"/><path d="M4 18v-2a8 8 0 0 1 16 0v2"/><path d="M10 8V5h4v3"/>',
  xero: '<circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>', lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};
const svg = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;
const esc = (s) => String(s).replace(/&(?!amp;|#)/g, '&amp;');
const kick = (t) => `<span class="kicker">${t}</span>`;

// ---------- pieces ----------
const head = (title, desc) => `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="assets/ophub-logo.png?v=2">
<meta name="theme-color" content="#0B0E14">
<link rel="apple-touch-icon" href="assets/ophub-logo.png?v=2">
<link rel="icon" href="assets/ophub-logo.png?v=2">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>${baseCss}${CSS}</style>
</head>
<body>`;
const nav = (on) => `<div class="nav"><div class="navrow">
  <a href="/" class="navlogo"><img src="assets/ophub-logo.png?v=2" alt="OpHUB" onerror="this.style.display='none'">OpHUB</a>
  <div class="navlinks"><a href="/projects.html"${on === 'p' ? ' class="cur"' : ''}>Projects</a><a href="/finance.html"${on === 'f' ? ' class="cur"' : ''}>Finance</a><a href="/#ai">AI</a><a href="/#pricing">Pricing</a></div>
  <div class="navcta"><a href="/app.html" class="btn btn-glass btn-sm">Sign In</a><a href="/#demo" class="btn btn-primary btn-sm">Book a Demo</a></div>
</div></div>`;
const footer = `<footer><div class="wrap"><div class="footrow">
  <a href="/" class="footlogo"><img src="assets/ophub-logo.png?v=2" alt="OpHUB" onerror="this.style.display='none'">OpHUB</a>
  <div class="footlinks"><a href="/projects.html">${P}</a><a href="/finance.html">${F}</a><a href="/#ai">AI</a><a href="/#demo">Book a Demo</a><a href="/app.html">Sign In</a><a href="/privacy.html">Privacy</a><a href="mailto:sales@operativehub.co.uk">Contact</a></div>
</div><p class="footmeta">© 2026 OpHUB · operativehub.co.uk · sales@operativehub.co.uk</p></div></footer>`;

const laptop = `<div class="laptop"><div class="lscreen"><div class="lbar"><b><span style="color:#2F6FB3">Op</span>HUB</b> <i>×</i> RTB Roofing Ltd</div>
<div class="ltabs"><span>Overview</span><span>Projects</span><span>Sales</span><span class="on">Purchases</span><span>Subcontractors</span><span>Reports</span></div>
<div class="lstats"><div><b style="color:#2457C5">2</b><small>Received, no job yet</small></div><div><b style="color:#17804A">£18,420</b><small>To pay suppliers</small></div><div><b style="color:#C0392B">1</b><small>Needs checking</small></div><div><b style="color:#B35A00">£82,000</b><small>Ordered, not invoiced</small></div></div>
<table class="ltable"><tr><th>Supplier</th><th>Invoice</th><th>Project</th><th>Status</th><th>Gross</th></tr>
<tr><td><b>SIG Roofing</b></td><td>SIG-88231</td><td>J101 · Studley Rd</td><td><span class="ok">Matched to PO</span></td><td><b>£2,160.00</b></td></tr>
<tr><td><b>Travis Perkins</b></td><td>TP-4410</td><td>J102 · Cleveland</td><td><span class="ai">Read by AI</span></td><td><b>£240.00</b></td></tr>
<tr><td><b>Jewson</b></td><td>JW-12</td><td>J101 · Studley Rd</td><td><span class="wait">With a PM</span></td><td><b>£600.00</b></td></tr>
<tr><td><b>Bauder</b></td><td>BD-2291</td><td>J103 · Senlis</td><td><span class="ok">Approved</span></td><td><b>£4,812.50</b></td></tr></table></div><div class="lbase"></div></div>`;

const flows = [
  ['Material request on site', 'PO priced from your price lists', 'Delivery booked and signed for', 'Supplier invoice read and matched', 'Cost on the job, live'],
  ['Variation raised on site', 'Priced and approved', 'Onto the next application', 'Certified and invoiced', 'Retention tracked to release'],
  ['Operatives check in by GPS', 'Hours and rates on the job', 'Subcontractor applications', 'CIS worked out', 'Labour cost on the job, live'],
];
const flowSection = (cls = 'alt') => `<section id="flow" class="s-paper ${cls}"><div class="wrap">
  <div class="sectionhead">${kick('How Finance talks to Projects')}<h2>From the site to the numbers, <em>without retyping a thing</em></h2><p>Every step on site is a step in the accounts. Three examples of how it flows.</p></div>
  <div class="flowlabel"><span><i class="kp"></i>Happens in ${P}</span><span><i class="kf"></i>Happens in ${F}</span></div>
  <div class="flows">${flows.map((f) => `<div class="flow">${f.map((s, i) => `<div class="step ${i < 2 ? 'p' : 'f'}">${s}</div>`).join('')}</div>`).join('')}</div>
</div></section>`;

const ai = [
  ['inv', 'Invoice Reader', 'Supplier invoices land in your inbox. OpHUB reads them, finds the PO and the job, and puts them in front of the right person to approve.', 'f'],
  ['shield', 'RAMS Builder', 'A site-specific RAMS from the job, the task and your own hazard library, ready for every operative to sign on the phone.', 'p'],
  ['flask', 'COSHH From Data Sheets', 'Upload a safety data sheet and the COSHH assessment is written for you, filed and shared across jobs.', 'p'],
  ['list', 'Price List Reader', 'Supplier price lists in Excel or PDF become your price book, so every PO is priced before the invoice arrives.', 'f'],
  ['scale', 'Statement Matching', 'Supplier statements matched to the invoices you have, with anything missing flagged.', 'f'],
  ['quote', 'Quote Reader', 'Supplier quotes read into line items you can order from, line by line.', 'f'],
];
const aiSection = `<section id="ai" class="s-paper"><div class="wrap">
  <div class="sectionhead">${kick(`${svg('spark', 14)} AI that does the admin`)}<h2>The paperwork <em>reads itself</em></h2><p>OpHUB's AI reads the invoices, writes the RAMS and keeps the price book up to date, so your team checks rather than types.</p></div>
  <div class="aigrid">${ai.map(([ic, h, p, k]) => `<div class="aicard"><div class="ic">${svg(ic, 22)}</div><span class="aiin ${k}">${k === 'p' ? P : F}</span><h3>${h}</h3><p>${p}</p></div>`).join('')}</div>
</div></section>`;

const simple = [
  ['check', 'Enter it once', 'An order on site is the PO, the delivery, the invoice match and the job cost. Nobody types it twice.'],
  ['pin', 'Everything finds its job', 'Photos, check-ins, invoices and variations land on the right project by themselves.'],
  ['truck', 'Built for the phone', 'Operatives and drivers get one simple app. The office gets the full picture on the laptop.'],
];
const simpleSection = `<section class="s-paper alt"><div class="wrap"><div class="sectionhead">${kick('Simple by design')}<h2>Less admin. <em>More proof.</em></h2><p>Built with one focus: one clear place for everything a job needs, on site and in the office.</p></div>
  <div class="simplegrid">${simple.map(([ic, h, p]) => `<div class="simple"><div class="ic">${svg(ic, 20)}</div><h3>${h}</h3><p>${p}</p></div>`).join('')}</div></div></section>`;

const demo = `<section id="demo" class="s-paper"><div class="wrap demogrid">
  <div class="demotext">${kick('Book a demo or get a quote')}<h2>See OpHUB with your own jobs in mind</h2>
    <p class="lead">Tell us a little about your company and we'll get in touch to arrange a walkthrough of ${P}, ${F}, or both.</p>
    <ul class="demolist"><li>A guided look from the operative, driver, PM and office side</li><li>How Finance and Projects talk to each other on your kind of job</li><li>Your questions answered by the people who built it</li><li>No obligation: see if it fits before you sign up</li></ul>
    <p class="alt">Prefer email? <a href="mailto:sales@operativehub.co.uk">sales@operativehub.co.uk</a></p></div>
  ${demoForm}</div></section>`;
const finalCta = (h, p, q) => `<section class="s-paper alt"><div class="wrap"><div class="finalcta"><h2>${h}</h2><p>${p}</p><div class="herobtns"><a href="/#demo" class="btn btn-primary">Book a Demo</a>${q ? `<a href="/?quote=${q}#demo" class="btn btn-glass">Get A Quote</a>` : '<a href="/app.html" class="btn btn-glass">Sign In</a>'}</div></div></div></section>`;

const quoteSection = `<section id="pricing" class="s-paper alt"><div class="wrap">
  <div class="sectionhead">${kick('Pricing')}<h2>One price per company, <em>tailored to your team</em></h2>
  <p>No per-user fees. Choose ${P}, ${F}, or both together for less. Tell us about your team and we'll send you a quote.</p></div>
  <div class="qgrid">
    <div class="qcard p"><span class="tag">${svg('site', 15)} ${P}</span><h3>For site teams</h3><p>Every site feature, on every phone, for your whole team.</p><a href="#demo" class="btn btn-primary" onclick="quoteFor('OpHUB Projects')">Get A Quote</a></div>
    <div class="qcard both"><span class="tag">Best value</span><h3>Projects + Finance</h3><p>The two systems talking to each other, for less than the two apart.</p><a href="#demo" class="btn btn-primary" onclick="quoteFor('Projects + Finance')">Get A Quote</a></div>
    <div class="qcard f"><span class="tag">${svg('pound', 15)} ${F}</span><h3>For cost management</h3><p>Forecasts, valuations, purchases, CIS, Xero and the AI.</p><a href="#demo" class="btn btn-primary" onclick="quoteFor('OpHUB Finance')">Get A Quote</a></div>
  </div></div></section>`;

// ---------- Home ----------
const chooser = `<section id="systems" class="s-paper"><div class="wrap">
  <div class="sectionhead">${kick('Two systems · one connection')}<h2>Which part of the business <em>are you running?</em></h2>
  <p>Each works on its own. Use both and everything done on site lands in the numbers by itself.</p></div>
  <div class="choose">
    <div class="cpanel p"><div class="ctext"><span class="tag">${svg('site', 15)} ${P}</span><h3>For site teams</h3>
      <p>Schedule of Works, RAMS and COSHH, GPS check-in, snagging, materials, deliveries and handover, in one branded app your operatives will actually use.</p>
      <ul class="mini"><li>Operatives, drivers and PMs</li><li>iPhone, Android and web</li><li>Works with no signal</li></ul>
      <a href="/projects.html" class="btn btn-primary">Explore ${P} ${svg('arrow', 16)}</a></div><div class="cart">${phone}</div></div>
    <div class="cpanel f"><div class="ctext"><span class="tag">${svg('pound', 15)} ${F}</span><h3>For complete cost management</h3>
      <p>Forecasts, valuations and applications, sales and purchase invoices, subcontractors and CIS, with Xero, and AI that reads the paperwork.</p>
      <ul class="mini"><li>Directors, QSs and accounts</li><li>Every pound on every job</li><li>Posts to Xero</li></ul>
      <a href="/finance.html" class="btn btn-primary">Explore ${F} ${svg('arrow', 16)}</a></div><div class="cart">${laptop}</div></div>
  </div></div></section>`;
const home = () => `${head('OpHUB: Projects for site teams, Finance for cost management', 'Two systems that talk to each other: OpHUB Projects runs your sites (Schedule of Works, RAMS & COSHH, check-in, snagging, materials, deliveries), OpHUB Finance runs the money (valuations, invoices, purchases, CIS, Xero), with AI that reads the invoices and writes the RAMS.')}
${nav('')}
${hero}
${chooser}
${flowSection()}
${aiSection}
${simpleSection}
${quoteSection}
${demo}
${finalCta('Ready to run every site, and every pound, from one place?', 'Book a demo and we\'ll show you OpHUB with your own jobs in mind.')}
${footer}
${demoScript}
</body>
</html>
`;

// ---------- a system's own page ----------
const group = (title, sub, cards, k) => `<div class="fgroup"><div class="fghead"><h3>${title}</h3><p>${sub}</p></div>
  <div class="featgrid2">${cards.map(([ic, h, p, isAi]) => `<div class="fcard ${k}"><div class="ic">${svg(ic, 20)}</div>${isAi ? '<span class="aibadge">AI</span>' : ''}<h4>${esc(h)}</h4><p>${esc(p)}</p></div>`).join('')}</div></div>`;
const productHero = (k, tagT, h1, lead, bullets, art, other) => `<section class="hero phero ${k}"><div class="wrap herogrid">
  <div><span class="kicker">${tagT}</span><h1>${h1}</h1><p class="lead">${lead}</p>
    <div class="chips">${bullets.map((b) => `<span>${esc(b)}</span>`).join('')}</div>
    <div class="herobtns"><a href="/#demo" class="btn btn-primary">Book a Demo</a><a href="${other[1]}" class="btn btn-glass">${other[0]} ${svg('arrow', 16)}</a></div></div>
  <div class="phonewrap" aria-hidden="true">${art}</div></div></section>`;
const together = (k, h, p, items) => `<section class="s-paper"><div class="wrap"><div class="together ${k}">
  <div class="tt">${kick(`${svg('link', 14)} Better together`)}<h2>${h}</h2><p>${p}</p></div>
  <ul>${items.map((x) => `<li>${svg('check', 16)}<span>${esc(x)}</span></li>`).join('')}</ul></div></div></section>`;

const projectsGroups = [
  ['On site, every day', 'What your operatives and supervisors use on every job.', [
    ['pin', 'GPS Check-in', 'Geofenced check-in and check-out, including multi-address jobs, so you always know who\'s on site.'],
    ['clip', 'Schedule of Works', 'Sections and tasks with progress and photos, built from your own library or imported, exported as a branded PDF.'],
    ['tag', 'Snagging & Variations', 'Log and photograph snags or variations, mark up the photo, close out with evidence and export a PDF.'],
    ['ruler', 'Drawings & Programme', 'Drawings, specs and programmes in folders, superseded versions kept, mark-up on the plan.'],
    ['doc', 'Reports & Surveys', 'Your own report templates, filled on site with photos and signatures, even with no signal.'],
  ]],
  ['Health & safety', 'Compliance that gets done, signed and filed, on the phone.', [
    ['shield', 'RAMS Builder', 'Build RAMS from your hazard library for the job and the task. Signed digitally by every operative.', true],
    ['flask', 'COSHH Builder & Library', 'Turn a safety data sheet into a COSHH assessment automatically, filed in folders with yearly review reminders.', true],
    ['chat', 'Toolbox Talks & Briefings', 'Live toolbox talks and daily briefings signed on the phone, plus inductions, site rules and your H&S policy.'],
    ['hard', 'PPE, Incidents & Inspections', 'PPE issue log, accident and near-miss reports, HAVS, PUWER, LOLER and permits to work.'],
  ]],
  ['Materials & logistics', 'From the request on site to the drop at the gate.', [
    ['box', 'Materials & Suppliers', 'Operatives request materials; you approve and the order goes to the right supplier branch, priced.'],
    ['truck', 'Delivery Scheduler', 'Plan the day\'s drops and collections slot by slot and assign them to drivers.'],
    ['van', 'Driver App', 'Drivers see today\'s runs in order, take completion photos and do their weekly vehicle checks.'],
    ['wrench', 'Yard & Plant', 'Every item of plant numbered and signed for, with who has it, where, and when it\'s due an inspection.'],
  ]],
  ['Running the company', 'The office side of every project and every person.', [
    ['wrench', 'Repairs & Maintenance', 'Repair jobs with surveys, photos, approval and close-out, ready to invoice.'],
    ['book', 'O&M Handover', 'Build the O&M manual from the job: data sheets, COSHH, guarantees and maintenance, to PDF or Word.'],
    ['users', 'HR & Holidays', 'Holiday requests and approvals with bank holidays booked automatically, plus policies and the handbook.'],
    ['card', 'Operatives & Training', 'Every operative\'s cards, certificates and expiry dates in a training matrix.'],
    ['building', 'Main Contractor Mode', 'Run subcontractors, their operatives, RAMS, COSHH and inspections when you\'re the main contractor.'],
    ['cal', 'Calendars & Dashboards', 'Key dates per job, a company calendar and a dashboard across every project.'],
    ['chat', 'HUB & Messaging', 'One inbox for messages, sign-offs and alerts, with push notifications.'],
    ['cloud', 'OneDrive & Your Branding', 'Photos and exports sync to each project\'s OneDrive folder; your logo and colours on the app and every PDF.'],
  ]],
];
const financeGroups = [
  ['Know where every job stands', 'The live picture of every project, not last month\'s.', [
    ['trend', 'Forecasts & OHP', 'Forecast final account, cost to complete and margin on every job, with overheads and profit worked in.'],
    ['chart', 'Cost Reports', 'Costs by job, by type and by plot, committed and spent, with budgets and cost codes.'],
    ['doc', 'Reports & Budgets', 'Retention ledger, VAT listing, aged debt and more, exported to Excel or PDF.'],
  ]],
  ['Get paid', 'Valuations and invoices that go out right and get chased.', [
    ['list', 'BoQ & Applications', 'Bill of Quantities, monthly applications for payment, certificates and payless notices.'],
    ['inv', 'Sales Invoices', 'Invoice jobs or application jobs, with VAT and domestic reverse charge handled.'],
    ['coins', 'Retention', 'Retention held, released and still owed on every job, with the PC date and release dates tracked.'],
    ['tag', 'Variations & Day Works', 'Raised on site in Projects, priced and approved, then onto the next application.'],
  ]],
  ['Control what you spend', 'Every order priced, every invoice matched.', [
    ['cart', 'Purchase Orders', 'POs priced from your price lists, raised on site or in the office, matched to what\'s invoiced.'],
    ['inv', 'Invoice Reader', 'Supplier invoices read from your inbox, matched to the PO and the job, and sent to the right PM to approve.', true],
    ['scale', 'Statements', 'Supplier statements matched against the invoices you have, with anything missing flagged.', true],
    ['list', 'Price Lists', 'Every supplier\'s prices in one place, from their price lists and picked up from quotes and invoices.', true],
    ['wrench', 'Plant Hire & Yard Stock', 'Plant on and off hire, and yard stock booked in and out to jobs at cost.'],
  ]],
  ['Pay your people', 'Subcontractors and labour, without the spreadsheet.', [
    ['users', 'Subcontractors & CIS', 'Subcontract orders, applications, certification, CIS verification and deductions, and the pay run.'],
    ['card', 'Labour Invoices & Rates', 'Operative invoices against their rates, booked to the right job and price.'],
    ['building', 'Directory', 'Clients, suppliers and labour in one directory, with their terms, VAT and CIS details.'],
  ]],
  ['Connected', 'Talks to the systems you already use.', [
    ['xero', 'Xero', 'Sales invoices and supplier bills post to Xero, with your codes and tracking.'],
    ['cloud', 'OneDrive & Email', 'Exports save to the project\'s OneDrive folder; invoices and applications email from OpHUB.'],
    ['lock', 'Access You Control', 'Finance is a switch per person, so PMs see what you choose and nothing more.'],
  ]],
];

const projectsPage = () => `${head(`${P}: the site app for trade & specialist contractors`, `${P}: Schedule of Works, RAMS & COSHH builders, GPS check-in, snagging, drawings, materials, deliveries, repairs, O&M handover and HR, in one branded app your operatives will actually use.`)}
${nav('p')}
${productHero('p', `${P} · for site teams`, 'Everything a job needs, <em>on every phone</em>', 'One branded app for operatives, drivers, supervisors and PMs. Simple enough that it actually gets used, every day, on every site.',
  ['iPhone, Android & web', 'Works with no signal', 'Your logo and colours', 'No per-user fees'], phone, [`See ${F}`, '/finance.html'])}
<section class="s-paper"><div class="wrap"><div class="sectionhead">${kick(`${svg('site', 14)} What's inside`)}<h2>From the first RAMS <em>to the final handover</em></h2><p>Set it up once, brand it as your own, and give every person on the job exactly what they need.</p></div>
${projectsGroups.map(([t, s, c]) => group(t, s, c, 'p')).join('\n')}</div></section>
${together('p', `Add ${F} and the site <em>runs the numbers</em>`, 'Everything your team does on site carries straight through to the accounts, with nobody retyping it.',
  ['Material requests become priced POs', 'Deliveries signed for on site are matched to the supplier\'s invoice', 'Variations raised on site go onto the next application', 'Check-ins and hours become labour cost on the job', 'Subcontractors\' work flows into their applications and CIS'])}
${flowSection()}
${finalCta('See the site side of OpHUB', 'Book a demo, or ask for a quote for your team.', 'projects')}
${footer}
</body>
</html>
`;

const financePage = () => `${head(`${F}: complete cost management for contractors`, `${F}: forecasts and OHP, BoQ and applications, sales invoices and retention, purchase orders and invoices with an AI invoice reader, subcontractors and CIS, yard stock and plant, reports and Xero.`)}
${nav('f')}
${productHero('f', `${F} · for complete cost management`, 'Every pound on every job, <em>as it happens</em>', 'Valuations, invoices, purchases, subcontractors and CIS in one place, with the numbers from site already in, and AI that reads the paperwork.',
  ['Forecasts & margin', 'Applications & retention', 'AI invoice reader', 'Posts to Xero'], laptop, [`See ${P}`, '/projects.html'])}
<section class="s-paper"><div class="wrap"><div class="sectionhead">${kick(`${svg('pound', 14)} What's inside`)}<h2>From the first order <em>to the final retention</em></h2><p>Complete cost management for contractors, built by a contractor.</p></div>
${financeGroups.map(([t, s, c]) => group(t, s, c, 'f')).join('\n')}</div></section>
${together('f', `Add ${P} and the numbers <em>fill themselves in</em>`, 'Your site teams do the job in ${P}; ${F} picks up every order, delivery, variation and hour as it happens.'.replace(/\$\{P\}/g, P).replace(/\$\{F\}/g, F),
  ['POs raised from material requests on site', 'Delivery notes ready to match the invoice', 'Variations and day works from site, ready to price', 'Labour cost from check-ins and timesheets', 'One set of jobs, one directory, no double entry'])}
${flowSection()}
${aiSection}
${finalCta('See the money side of OpHUB', 'Book a demo, or ask for a quote for your team.', 'finance')}
${footer}
</body>
</html>
`;

// ---------- styles ----------
var CSS = `
/* ---- style C, Blueprint ---- */
.s-paper{background:#F3F6FA;background-image:linear-gradient(rgba(47,111,179,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(47,111,179,.07) 1px,transparent 1px);background-size:28px 28px;}
.s-paper.alt{background-color:#EEF2F8;}
.s-paper .kicker{font-family:'JetBrains Mono',monospace;font-weight:600;letter-spacing:.04em;background:#0B0E14;color:#9CC8F2;border-radius:6px;}
.sectionhead h2 em,.together h2 em{font-style:normal;color:#2F6FB3;text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:8px;text-decoration-color:rgba(78,143,209,.4);}
.navlinks a.cur{color:#fff;}
.tag{display:inline-flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;padding:6px 11px;border-radius:4px;}
.p .tag{background:#2F6FB3;color:#fff;} .f .tag{background:#1F9D62;color:#fff;}
/* home: pick your system */
.choose{display:grid;gap:30px;}
.cpanel{display:grid;grid-template-columns:1fr 1fr;gap:34px;align-items:center;background:#fff;border:1.5px solid;border-radius:6px;padding:40px;}
.cpanel.p{border-color:#2F6FB3;box-shadow:8px 8px 0 #2F6FB3;} .cpanel.f{border-color:#1F9D62;box-shadow:8px 8px 0 #1F9D62;}
.cpanel h3{font-size:34px;margin:16px 0 10px;letter-spacing:-.02em;} .cpanel p{color:#566072;font-size:16.5px;margin-bottom:18px;}
.cpanel .btn-primary{margin-top:6px;} .cpanel.f .btn-primary{background:#1F9D62;box-shadow:0 8px 20px -8px rgba(31,157,98,.6);} .cpanel.f .btn-primary:hover{background:#17804A;}
.mini{list-style:none;padding:0;margin:0 0 22px;display:flex;flex-wrap:wrap;gap:8px;}
.mini li{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;padding:5px 10px;border-radius:4px;border:1px solid;}
.p .mini li{color:#2F6FB3;border-color:#BCD3EC;background:#F3F8FD;} .f .mini li{color:#17804A;border-color:#BFE3CF;background:#F2FAF5;}
.cart{display:flex;justify-content:center;} .cart .phone{transform:rotate(2deg) scale(.92);}
/* the flow, in style B's tinted boxes */
.flowlabel{display:flex;gap:18px;justify-content:center;margin-bottom:18px;font-size:13px;font-weight:700;color:#566072;flex-wrap:wrap;}
.flowlabel span{display:inline-flex;align-items:center;gap:7px;} .flowlabel i{width:12px;height:12px;border-radius:4px;display:inline-block;}
.flowlabel i.kp{background:#4E8FD1;} .flowlabel i.kf{background:#1F9D62;}
.flows{display:grid;gap:14px;} .flow{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;}
.step{position:relative;border-radius:14px;padding:14px 14px 14px 16px;font-size:14px;font-weight:700;line-height:1.3;display:flex;align-items:center;border:1px solid #E3E7EE;box-shadow:0 8px 20px -14px rgba(11,14,20,.25);}
.step.p{background:#EEF4FC;border-color:#CFE0F4;color:#1F4E86;} .step.f{background:#EAF6EF;border-color:#C9E8D6;color:#14653B;}
.step:not(:last-child):after{content:"";position:absolute;right:-9px;top:50%;width:8px;height:8px;transform:translateY(-50%) rotate(45deg);z-index:2;background:#fff;border-top:1.5px solid #9AA5B5;border-right:1.5px solid #9AA5B5;}
/* AI */
.aigrid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
.aicard{background:#fff;border:1.5px solid #D4DCE7;border-radius:6px;position:relative;padding:26px;}
.aicard:after{content:"AI";position:absolute;top:18px;right:18px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:#2F6FB3;border:1px solid #2F6FB3;border-radius:3px;padding:1px 5px;}
.aicard .ic{width:46px;height:46px;border-radius:6px;background:#0B0E14;color:#9CC8F2;display:flex;align-items:center;justify-content:center;margin-bottom:14px;}
.aiin{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;margin-bottom:6px;} .aiin.p{color:#2F6FB3;} .aiin.f{color:#17804A;}
.aicard h3{font-size:18px;} .aicard p{font-size:14.5px;margin-top:8px;color:#566072;line-height:1.55;}
/* simple */
.simplegrid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}
.simple{background:#fff;border:1.5px solid #D4DCE7;border-radius:6px;padding:28px;} .simple .ic{width:42px;height:42px;border-radius:6px;background:#2F6FB3;color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:14px;}
.simple h3{font-size:18px;} .simple p{font-size:14.5px;margin-top:8px;color:#566072;}
/* demo + final */
#demo .democard{border-radius:6px;border:1.5px solid #0B0E14;box-shadow:8px 8px 0 #2F6FB3;}
.demolist li:before{border-radius:4px;}
.finalcta{background:#0B0E14;border-radius:8px;box-shadow:10px 10px 0 #2F6FB3;}
.finalcta .btn-primary{background:#4E8FD1;color:#fff;} .finalcta .btn-primary:hover{background:#2F6FB3;}
/* pricing, no figures */
.qgrid{display:grid;grid-template-columns:1fr 1.1fr 1fr;gap:22px;align-items:stretch;}
.qcard{background:#fff;border:1.5px solid #D4DCE7;border-radius:6px;padding:30px;display:flex;flex-direction:column;gap:12px;}
.qcard.p{box-shadow:8px 8px 0 #2F6FB3;border-color:#2F6FB3;} .qcard.f{box-shadow:8px 8px 0 #1F9D62;border-color:#1F9D62;}
.qcard.both{background:#0B0E14;color:#fff;border-color:#0B0E14;box-shadow:8px 8px 0 #4E8FD1;} .qcard.both .tag{background:#4E8FD1;color:#fff;}
.qcard .tag{align-self:flex-start;} .qcard h3{font-size:22px;} .qcard p{color:#566072;flex:1;} .qcard.both p{color:rgba(255,255,255,.7);}
.qcard.f .btn-primary{background:#1F9D62;} .qcard.f .btn-primary:hover{background:#17804A;}
@media (max-width:900px){ .qgrid{grid-template-columns:1fr;} }
/* laptop mock */
.laptop{width:100%;max-width:520px;margin:0 auto;}
.lscreen{background:#F4F5F7;border:10px solid #0B0E14;border-bottom-width:14px;border-radius:14px 14px 4px 4px;overflow:hidden;font-size:11px;color:#0B0E14;}
.lbase{height:12px;background:linear-gradient(#cfd5de,#9aa3b0);border-radius:0 0 14px 14px;margin:0 -28px;}
.lbar{background:#fff;padding:9px 12px;text-align:center;font-weight:700;color:#C0392B;border-bottom:1px solid #E6E8EC;} .lbar b{color:#111318;} .lbar i{color:#8A93A3;font-style:normal;margin:0 4px;}
.ltabs{display:flex;gap:10px;padding:6px 12px;font-size:10px;color:#6b7280;font-weight:600;background:#fff;border-bottom:1px solid #E6E8EC;overflow:hidden;white-space:nowrap;} .ltabs .on{color:#111;border-bottom:2px solid #C0392B;}
.lstats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:8px 10px;} .lstats div{background:#fff;border:1px solid #ECEEF2;border-radius:6px;padding:6px;} .lstats b{display:block;font-size:13px;} .lstats small{font-size:8px;color:#566072;line-height:1.2;display:block;}
.ltable{width:calc(100% - 20px);margin:0 10px 10px;border-collapse:collapse;background:#fff;border-radius:6px;overflow:hidden;font-size:9.5px;}
.ltable th{font-size:8.5px;text-transform:uppercase;letter-spacing:.04em;text-decoration:underline;padding:6px;text-align:center;} .ltable td{padding:7px 6px;border-top:1px solid #EEF0F2;text-align:center;}
.ltable span{font-size:8.5px;font-weight:700;padding:2px 6px;border-radius:999px;white-space:nowrap;} .ok{background:#E5F5EC;color:#17804A;} .ai{background:#EAF2FB;color:#2F6FB3;} .wait{background:#FDF1E6;color:#B35A00;}
/* a system's own page */
.phero{padding:76px 0 88px;} .phero h1{font-size:clamp(34px,5vw,58px);} .phero .phone{transform:rotate(2.5deg);}
.phero.f h1 em{background:linear-gradient(90deg,#6FD3A6,#1F9D62);-webkit-background-clip:text;background-clip:text;color:transparent;}
.phero.f .kicker{color:#9FE3C2;} .phero.f .btn-primary{background:#1F9D62;box-shadow:0 8px 20px -8px rgba(31,157,98,.7);} .phero.f .btn-primary:hover{background:#17804A;}
.phero .laptop{max-width:540px;transform:perspective(1200px) rotateY(-8deg);filter:drop-shadow(0 40px 60px rgba(0,0,0,.6));}
.fgroup{margin-top:46px;} .fgroup:first-of-type{margin-top:0;}
.fghead{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;border-bottom:1.5px dashed #9AB7DA;padding-bottom:10px;margin-bottom:18px;}
.fghead h3{font-size:22px;letter-spacing:-.01em;} .fghead p{color:#566072;font-size:15px;}
.featgrid2{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
.fcard{background:#fff;border:1.5px solid #D4DCE7;border-radius:6px;padding:22px;position:relative;}
.fcard .ic{width:40px;height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;margin-bottom:12px;}
.fcard.p .ic{background:#EEF4FC;color:#2F6FB3;} .fcard.f .ic{background:#EAF6EF;color:#17804A;}
.fcard h4{margin:0;font-size:16.5px;letter-spacing:-.01em;} .fcard p{color:#566072;font-size:14.2px;margin-top:6px;line-height:1.5;}
.aibadge{position:absolute;top:16px;right:16px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:#2F6FB3;border:1px solid #2F6FB3;border-radius:3px;padding:1px 5px;}
.together{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;background:#fff;border:1.5px solid;border-radius:6px;padding:40px;}
.together.p{border-color:#1F9D62;box-shadow:8px 8px 0 #1F9D62;} .together.f{border-color:#2F6FB3;box-shadow:8px 8px 0 #2F6FB3;}
.together h2{font-size:clamp(26px,3.4vw,36px);margin:14px 0 12px;} .together p{color:#566072;font-size:16px;}
.together ul{list-style:none;margin:0;padding:0;display:grid;gap:12px;}
.together li{display:flex;gap:12px;align-items:flex-start;font-weight:600;font-size:15.5px;}
.together li svg{flex:0 0 26px;width:26px;height:26px;padding:5px;border-radius:6px;}
.together.p li svg{background:#EAF6EF;color:#17804A;} .together.f li svg{background:#EEF4FC;color:#2F6FB3;}
@media (max-width:900px){
  .choose{grid-template-columns:minmax(0,1fr);} .cpanel,.together{grid-template-columns:minmax(0,1fr);padding:26px 22px;} .cpanel h3{font-size:28px;}
  .cpanel>*,.together>*{min-width:0;} .cart{overflow:hidden;padding:6px 0 14px;} .lscreen{font-size:10px;} .ltable{font-size:8.5px;} .ltable td,.ltable th{padding:5px 3px;} .ltable span{padding:2px 4px;} .lbase{margin:0 -10px;}
  .flow{grid-template-columns:1fr;} .step:not(:last-child):after{right:50%;top:auto;bottom:-9px;transform:translateX(50%) rotate(45deg);}
  .aigrid,.simplegrid,.featgrid2{grid-template-columns:1fr;}
  .phero .laptop{transform:none;} .cart .phone{transform:none;}
}
@media (min-width:601px) and (max-width:900px){ .featgrid2,.aigrid{grid-template-columns:1fr 1fr;} }
`;

fs.writeFileSync(path.join(ROOT, "index.html"), home());
fs.writeFileSync(path.join(ROOT, "projects.html"), projectsPage());
fs.writeFileSync(path.join(ROOT, "finance.html"), financePage());
console.log('built index.html, projects.html, finance.html');
