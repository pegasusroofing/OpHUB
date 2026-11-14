// Website refresh, step 1 (Andy, 14 Nov 2026): three design styles for the new site, each opening on the current hero
// (which Andy likes) and then Projects and Finance as two systems that talk to each other, the AI, and how Finance
// talks to Projects. Makes style-a.html, style-b.html, style-c.html beside this file. node docs/website/make-styles.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
// The current site's styles and hero, as they are.
const baseCss = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
const hero = src.slice(src.indexOf('<section class="hero">'), src.indexOf('</section>', src.indexOf('<section class="hero">')) + 10);

const I = {
  site: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>',
  pound: '<path d="M17 20H7c2-2 2-4 2-7V8a3 3 0 0 1 6-1"/><path d="M6 13h8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  inv: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  flask: '<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  scale: '<path d="M12 3v18M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  quote: '<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const svg = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;

const projects = ['Schedule of Works', 'RAMS & COSHH', 'GPS Check-in', 'Snagging & Variations', 'Materials & Deliveries', 'Drawings', 'Reports & Surveys', 'O&M Handover', 'Repairs', 'HR & Holidays'];
const finance = ['Forecasts & OHP', 'BoQ & Applications', 'Sales Invoices & Retention', 'Purchase Orders', 'Purchase Invoices', 'Subcontractors & CIS', 'Yard Stock & Plant', 'Price Lists', 'Reports & Budgets', 'Xero'];
const flows = [
  ['Material request on site', 'PO priced from your price lists', 'Delivery booked and signed for', 'Supplier invoice read and matched', 'Cost on the job, live'],
  ['Variation raised on site', 'Priced and approved', 'Onto the next application', 'Certified and invoiced', 'Retention tracked to release'],
  ['Operatives check in by GPS', 'Hours and rates on the job', 'Subcontractor applications', 'CIS worked out', 'Labour cost on the job, live'],
];
const ai = [
  ['inv', 'Invoice Reader', 'Supplier invoices land in your inbox. OpHUB reads them, finds the PO and the job, and puts them in front of the right person to approve.'],
  ['shield', 'RAMS Builder', 'A site-specific RAMS from the job, the task and your own library, ready to sign on the phone.'],
  ['flask', 'COSHH From Data Sheets', 'Upload a safety data sheet and the COSHH assessment is written for you.'],
  ['list', 'Price List Reader', 'Supplier price lists in Excel or PDF become your price book, so every PO is priced before the invoice arrives.'],
  ['scale', 'Statement Matching', 'Supplier statements matched to the invoices you have, with anything missing flagged.'],
  ['quote', 'Quote Reader', 'Quotes read into line items you can order from, line by line.'],
];
const simple = [
  ['check', 'Enter it once', 'An order on site is the PO, the delivery, the invoice match and the job cost. Nobody types it twice.'],
  ['pin', 'Everything finds its job', 'Photos, check-ins, invoices and variations land on the right project by themselves.'],
  ['truck', 'Built for the phone', 'Operatives and drivers get one simple app. The office gets the full picture on the laptop.'],
];

const page = (k, name, css, opts = {}) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpHUB Website: Style ${k.toUpperCase()} (${name})</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>${baseCss}
/* ---- shared new sections ---- */
.two{display:grid;grid-template-columns:1fr 120px 1fr;gap:0;align-items:stretch;}
.sys{border-radius:24px;padding:34px;}
.sys .tag{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px;border-radius:999px;}
.sys h3{font-size:30px;margin-top:16px;letter-spacing:-.02em;}
.sys .for{font-size:16px;margin-top:8px;}
.sys ul{list-style:none;padding:0;margin:22px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:9px 14px;}
.sys li{display:flex;gap:9px;align-items:center;font-size:14.5px;font-weight:600;}
.sys li:before{content:"";width:7px;height:7px;border-radius:50%;flex:0 0 7px;}
.bridge{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;}
.bridge .knot{width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;}
.bridge small{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;line-height:1.3;}
.bridge .line{flex:1;width:2px;}
.flows{display:grid;gap:14px;}
.flow{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;align-items:stretch;}
.step{position:relative;border-radius:14px;padding:14px 14px 14px 16px;font-size:14px;font-weight:700;line-height:1.3;display:flex;align-items:center;}
.step:not(:last-child):after{content:"";position:absolute;right:-9px;top:50%;width:8px;height:8px;transform:translateY(-50%) rotate(45deg);z-index:2;}
.step.p{} .step.f{}
.flowlabel{display:flex;gap:18px;justify-content:center;margin-bottom:18px;font-size:13px;font-weight:700;}
.flowlabel span{display:inline-flex;align-items:center;gap:7px;}
.flowlabel i{width:12px;height:12px;border-radius:4px;display:inline-block;}
.aigrid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
.aicard{border-radius:20px;padding:26px;}
.aicard .ic{width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
.aicard h3{font-size:18px;letter-spacing:-.01em;}
.aicard p{font-size:14.5px;margin-top:8px;line-height:1.55;}
.simplegrid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}
.simple{border-radius:20px;padding:28px;}
.simple .ic{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:14px;}
.simple h3{font-size:18px;} .simple p{font-size:14.5px;margin-top:8px;}
.navlinks a.cur{color:#fff;}
@media (max-width:900px){
  .two{grid-template-columns:1fr;gap:0;} .bridge{flex-direction:row;padding:14px 0;} .bridge .line{height:2px;width:auto;flex:1;}
  .flow{grid-template-columns:1fr;} .step:not(:last-child):after{right:50%;top:auto;bottom:-9px;transform:translateX(50%) rotate(45deg);}
  .aigrid,.simplegrid{grid-template-columns:1fr;} .sys ul{grid-template-columns:1fr;}
}
/* ---- Style ${k.toUpperCase()}: ${name} ---- */
${css}
</style></head><body class="style-${k}">
<div class="nav"><div class="navrow">
  <a href="/" class="navlogo"><img src="../../assets/ophub-logo.png?v=2" alt="OpHUB">OpHUB</a>
  <div class="navlinks"><a href="#systems">Projects</a><a href="#systems">Finance</a><a href="#ai">AI</a><a href="#pricing">Pricing</a></div>
  <div class="navcta"><a href="/app.html" class="btn btn-glass btn-sm">Sign In</a><a href="#demo" class="btn btn-primary btn-sm">Book a Demo</a></div>
</div></div>
${hero}
<section id="systems" class="s-systems"><div class="wrap">
  <div class="sectionhead"><span class="kicker">Two systems · one connection</span><h2>Run the site. Run the money. <em>They talk to each other.</em></h2>
  <p>OpHUB Projects is for the people on site. OpHUB Finance is complete cost management for the office. Use one, or both together, and everything done on site lands in the numbers by itself.</p></div>
  <div class="two">
    <div class="sys sys-p"><span class="tag">${svg('site', 15)} OpHUB Projects</span><h3>For site teams</h3><p class="for">One branded app your PMs, supervisors, operatives and drivers will actually use.</p>
      <ul>${projects.map((x) => `<li>${x.replace('&', '&amp;')}</li>`).join('')}</ul></div>
    <div class="bridge"><div class="line"></div><div class="knot">${svg('link', 24)}</div><small>Live<br>link</small><div class="line"></div></div>
    <div class="sys sys-f"><span class="tag">${svg('pound', 15)} OpHUB Finance</span><h3>For complete cost management</h3><p class="for">Forecasts, valuations, invoices, purchases and CIS in one place, with Xero.</p>
      <ul>${finance.map((x) => `<li>${x.replace('&', '&amp;')}</li>`).join('')}</ul></div>
  </div>
</div></section>
<section id="flow" class="s-flow"><div class="wrap">
  <div class="sectionhead"><span class="kicker">How Finance talks to Projects</span><h2>From the site to the numbers, <em>without retyping a thing</em></h2>
  <p>Every step on site is a step in the accounts. Three examples of how it flows.</p></div>
  <div class="flowlabel"><span><i class="kp"></i>Happens in Projects</span><span><i class="kf"></i>Happens in Finance</span></div>
  <div class="flows">${flows.map((f) => `<div class="flow">${f.map((s, i) => `<div class="step ${i < 2 ? 'p' : 'f'}">${s}</div>`).join('')}</div>`).join('')}</div>
</div></section>
<section id="ai" class="s-ai"><div class="wrap">
  <div class="sectionhead"><span class="kicker">${svg('spark', 14)} AI that does the admin</span><h2>The paperwork reads itself</h2>
  <p>OpHUB's AI reads the invoices, writes the RAMS and keeps the price book up to date, so your team checks rather than types.</p></div>
  <div class="aigrid">${ai.map(([ic, h, p]) => `<div class="aicard"><div class="ic">${svg(ic, 22)}</div><h3>${h}</h3><p>${p}</p></div>`).join('')}</div>
</div></section>
<section class="s-simple"><div class="wrap">
  <div class="sectionhead"><span class="kicker">Simple by design</span><h2>Less admin. <em>More proof.</em></h2></div>
  <div class="simplegrid">${simple.map(([ic, h, p]) => `<div class="simple"><div class="ic">${svg(ic, 20)}</div><h3>${h}</h3><p>${p}</p></div>`).join('')}</div>
</div></section>
<footer><div class="wrap"><div class="footrow"><div class="footlogo"><img src="../../assets/ophub-logo.png?v=2" alt="">OpHUB</div><div class="footlinks"><a>Projects</a><a>Finance</a><a>AI</a><a>Pricing</a><a>Book a Demo</a></div></div><div class="footmeta">Style ${k.toUpperCase()} · ${name} · a draft to choose from, not the live site</div></div></footer>
</body></html>`;

// ---- A: Night Shift, the whole page dark like the hero ----
const A = `
body{background:#0B0E14;color:#fff;}
section{position:relative;}
.s-systems,.s-flow,.s-ai,.s-simple{background:#0B0E14;}
.s-flow,.s-simple{background:#0E121B;}
.s-systems:before{content:"";position:absolute;inset:0;background:radial-gradient(600px 300px at 50% 0%,rgba(78,143,209,.18),transparent 70%);pointer-events:none;}
.sectionhead h2 em{font-style:normal;background:linear-gradient(90deg,#7FB6EC,#4E8FD1);-webkit-background-clip:text;background-clip:text;color:transparent;}
.sectionhead p{color:rgba(255,255,255,.66);}
.kicker{background:rgba(255,255,255,.07);color:#B7D6F5;border:1px solid rgba(255,255,255,.12);}
.sys{background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 60px -30px rgba(0,0,0,.8);}
.sys-p{box-shadow:0 0 0 1px rgba(78,143,209,.25),0 40px 80px -40px rgba(78,143,209,.55);}
.sys-f{box-shadow:0 0 0 1px rgba(45,190,140,.25),0 40px 80px -40px rgba(45,190,140,.45);}
.sys-p .tag{background:rgba(78,143,209,.18);color:#9CC8F2;} .sys-f .tag{background:rgba(45,190,140,.16);color:#7FE0BC;}
.sys .for{color:rgba(255,255,255,.66);} .sys li{color:rgba(255,255,255,.88);}
.sys-p li:before{background:#4E8FD1;box-shadow:0 0 10px #4E8FD1;} .sys-f li:before{background:#2DBE8C;box-shadow:0 0 10px #2DBE8C;}
.bridge .knot{background:#0B0E14;border:1px solid rgba(255,255,255,.2);color:#fff;box-shadow:0 0 30px rgba(78,143,209,.6);}
.bridge .line{background:linear-gradient(180deg,transparent,rgba(127,182,236,.7),transparent);} .bridge small{color:rgba(255,255,255,.6);}
.step{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;}
.step.p{border-left:3px solid #4E8FD1;} .step.f{border-left:3px solid #2DBE8C;}
.step:after{background:#0E121B;border-top:1px solid rgba(255,255,255,.25);border-right:1px solid rgba(255,255,255,.25);}
.flowlabel{color:rgba(255,255,255,.7);} .flowlabel i.kp{background:#4E8FD1;} .flowlabel i.kf{background:#2DBE8C;}
.aicard{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);}
.aicard .ic{background:linear-gradient(135deg,rgba(127,182,236,.3),rgba(78,143,209,.12));color:#B7D6F5;box-shadow:0 0 24px -6px rgba(78,143,209,.8);}
.aicard p{color:rgba(255,255,255,.64);}
.simple{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);} .simple .ic{background:#4E8FD1;color:#fff;} .simple p{color:rgba(255,255,255,.64);}
footer{background:#07090D;}
`;
// ---- B: Clean Daylight, dark hero then crisp white with a colour for each system ----
const B = `
.s-systems{background:#fff;} .s-flow{background:#F4F6F9;} .s-ai{background:#fff;} .s-simple{background:#F4F6F9;}
.sectionhead h2 em{font-style:normal;color:#2F6FB3;}
.sys{background:#fff;border:1px solid #E3E7EE;box-shadow:0 1px 2px rgba(11,14,20,.04),0 24px 48px -24px rgba(11,14,20,.18);}
.sys-p{border-top:5px solid #4E8FD1;} .sys-f{border-top:5px solid #1F9D62;}
.sys-p .tag{background:#EAF2FB;color:#2F6FB3;} .sys-f .tag{background:#E5F5EC;color:#17804A;}
.sys .for{color:#566072;} .sys-p li:before{background:#4E8FD1;} .sys-f li:before{background:#1F9D62;}
.bridge .knot{background:#0B0E14;color:#fff;box-shadow:0 10px 24px -10px rgba(11,14,20,.6);} .bridge .line{background:repeating-linear-gradient(180deg,#C9D3E0 0 6px,transparent 6px 12px);} .bridge small{color:#566072;}
.step{background:#fff;border:1px solid #E3E7EE;box-shadow:0 8px 20px -14px rgba(11,14,20,.25);}
.step.p{background:#EEF4FC;border-color:#CFE0F4;color:#1F4E86;} .step.f{background:#EAF6EF;border-color:#C9E8D6;color:#14653B;}
.step:after{background:#fff;border-top:1.5px solid #9AA5B5;border-right:1.5px solid #9AA5B5;}
.flowlabel{color:#566072;} .flowlabel i.kp{background:#4E8FD1;} .flowlabel i.kf{background:#1F9D62;}
.aicard{background:#F7F9FC;border:1px solid #E3E7EE;} .aicard .ic{background:linear-gradient(135deg,#4E8FD1,#7FB6EC);color:#fff;} .aicard p{color:#566072;}
.simple{background:#fff;border:1px solid #E3E7EE;} .simple .ic{background:#EAF2FB;color:#2F6FB3;} .simple p{color:#566072;}
`;
// ---- C: Blueprint, dark hero then drawing paper with a fine grid and line drawings ----
const C = `
.s-systems,.s-flow,.s-ai,.s-simple{background:#F3F6FA;background-image:linear-gradient(rgba(47,111,179,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(47,111,179,.07) 1px,transparent 1px);background-size:28px 28px;}
.s-flow,.s-simple{background-color:#EEF2F8;}
.kicker{font-family:'JetBrains Mono',monospace;font-weight:600;letter-spacing:.04em;background:#0B0E14;color:#9CC8F2;border-radius:6px;}
.sectionhead h2 em{font-style:normal;color:#2F6FB3;text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:8px;text-decoration-color:rgba(78,143,209,.4);}
.sys{background:#fff;border:1.5px solid #0B0E14;border-radius:6px;box-shadow:8px 8px 0 #0B0E14;}
.sys-f{box-shadow:8px 8px 0 #1F9D62;border-color:#1F9D62;} .sys-p{box-shadow:8px 8px 0 #2F6FB3;border-color:#2F6FB3;}
.sys .tag{font-family:'JetBrains Mono',monospace;border-radius:4px;} .sys-p .tag{background:#2F6FB3;color:#fff;} .sys-f .tag{background:#1F9D62;color:#fff;}
.sys .for{color:#566072;} .sys li:before{border-radius:1px;} .sys-p li:before{background:#2F6FB3;} .sys-f li:before{background:#1F9D62;}
.bridge .knot{border-radius:6px;background:#fff;border:1.5px dashed #0B0E14;color:#0B0E14;} .bridge .line{background:repeating-linear-gradient(180deg,#0B0E14 0 4px,transparent 4px 9px);} .bridge small{font-family:'JetBrains Mono',monospace;color:#0B0E14;}
.flows{counter-reset:f;} .flow{counter-increment:f;position:relative;padding-left:44px;}
.flow:before{content:counter(f,decimal-leading-zero);position:absolute;left:0;top:50%;transform:translateY(-50%);font-family:'JetBrains Mono',monospace;font-weight:600;color:#2F6FB3;font-size:18px;}
.step{background:#fff;border:1.5px solid #0B0E14;border-radius:4px;}
.step.p{border-color:#2F6FB3;} .step.f{border-color:#1F9D62;}
.step:after{background:#EEF2F8;border-top:1.5px solid #0B0E14;border-right:1.5px solid #0B0E14;}
.flowlabel{font-family:'JetBrains Mono',monospace;} .flowlabel i{border-radius:1px;} .flowlabel i.kp{background:#2F6FB3;} .flowlabel i.kf{background:#1F9D62;}
.aicard{background:#fff;border:1.5px solid #D4DCE7;border-radius:6px;position:relative;}
.aicard:after{content:"AI";position:absolute;top:18px;right:18px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:#2F6FB3;border:1px solid #2F6FB3;border-radius:3px;padding:1px 5px;}
.aicard .ic{border-radius:6px;background:#0B0E14;color:#9CC8F2;} .aicard p{color:#566072;}
.simple{background:#fff;border:1.5px solid #D4DCE7;border-radius:6px;} .simple .ic{border-radius:6px;background:#2F6FB3;color:#fff;} .simple p{color:#566072;}
@media (max-width:900px){ .flow{padding-left:0;padding-top:30px;} .flow:before{top:0;transform:none;} }
`;
const out = [['a', 'Night Shift', A], ['b', 'Clean Daylight', B], ['c', 'Blueprint', C]];
for (const [k, n, css] of out) fs.writeFileSync(path.join(__dirname, `style-${k}.html`), page(k, n, css));
console.log('made', out.map(([k]) => `style-${k}.html`).join(', '));
