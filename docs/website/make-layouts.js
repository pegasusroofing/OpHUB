// Website refresh, step 2 (Andy, 14 Nov 2026: "I want c please but the 3rd page to be like b"): three layouts in style C
// (Blueprint), with the How Finance Talks To Projects steps in style B's tinted boxes. Each opens on the current hero.
// Makes layout-1.html, layout-2.html, layout-3.html beside this file. node docs/website/make-layouts.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'old-index.html'), 'utf8');
const baseCss = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
const hero = src.slice(src.indexOf('<section class="hero">'), src.indexOf('</section>', src.indexOf('<section class="hero">')) + 10);
// The hero's phone, whole: from <div class="phone"> to its own closing </div>.
const phone = (() => {
  const a = hero.indexOf('<div class="phone">'); let depth = 0, i = a;
  const re = /<\/?div\b[^>]*>/g; re.lastIndex = a;
  for (let m; (m = re.exec(hero));) { depth += m[0].startsWith('</') ? -1 : 1; if (depth === 0) { i = re.lastIndex; break; } }
  return hero.slice(a, i);
})();

const I = {
  site: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>', pound: '<path d="M17 20H7c2-2 2-4 2-7V8a3 3 0 0 1 6-1"/><path d="M6 13h8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', inv: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>', flask: '<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>', scale: '<path d="M12 3v18M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  quote: '<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>', truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>', pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const svg = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;
const esc = (s) => s.replace(/&/g, '&amp;');
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

// A laptop with a Finance screen, for the Finance side.
const laptop = `<div class="laptop"><div class="lscreen"><div class="lbar"><b><span style="color:#2F6FB3">Op</span>HUB</b> <i>×</i> RTB Roofing Ltd</div>
<div class="ltabs"><span>Overview</span><span>Projects</span><span>Sales</span><span class="on">Purchases</span><span>Subcontractors</span><span>Reports</span></div>
<div class="lstats"><div><b style="color:#2457C5">2</b><small>Received, no job yet</small></div><div><b style="color:#17804A">£18,420</b><small>To pay suppliers</small></div><div><b style="color:#C0392B">1</b><small>Needs checking</small></div><div><b style="color:#B35A00">£82,000</b><small>Ordered, not invoiced</small></div></div>
<table class="ltable"><tr><th>Supplier</th><th>Invoice</th><th>Project</th><th>Status</th><th>Gross</th></tr>
<tr><td><b>SIG Roofing</b></td><td>SIG-88231</td><td>J101 · Studley Rd</td><td><span class="ok">Matched to PO</span></td><td><b>£2,160.00</b></td></tr>
<tr><td><b>Travis Perkins</b></td><td>TP-4410</td><td>J102 · Cleveland</td><td><span class="ai">Read by AI</span></td><td><b>£240.00</b></td></tr>
<tr><td><b>Jewson</b></td><td>JW-12</td><td>J101 · Studley Rd</td><td><span class="wait">With a PM</span></td><td><b>£600.00</b></td></tr>
<tr><td><b>Bauder</b></td><td>BD-2291</td><td>J103 · Senlis</td><td><span class="ok">Approved</span></td><td><b>£4,812.50</b></td></tr></table></div><div class="lbase"></div></div>`;

const kick = (t) => `<span class="kicker">${t}</span>`;
const twoSystems = (id = 'systems') => `<section id="${id}" class="s-paper"><div class="wrap">
  <div class="sectionhead">${kick('Two systems · one connection')}<h2>Run the site. Run the money. <em>They talk to each other.</em></h2>
  <p>OpHUB Projects is for the people on site. OpHUB Finance is complete cost management for the office. Use one, or both together, and everything done on site lands in the numbers by itself.</p></div>
  <div class="two">
    <div class="sys sys-p"><span class="tag">${svg('site', 15)} OpHUB Projects</span><h3>For site teams</h3><p class="for">One branded app your PMs, supervisors, operatives and drivers will actually use.</p><ul>${projects.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div class="bridge"><div class="line"></div><div class="knot">${svg('link', 24)}</div><small>Live<br>link</small><div class="line"></div></div>
    <div class="sys sys-f"><span class="tag">${svg('pound', 15)} OpHUB Finance</span><h3>For complete cost management</h3><p class="for">Forecasts, valuations, invoices, purchases and CIS in one place, with Xero.</p><ul>${finance.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
  </div></div></section>`;
const flowSection = (cls = 's-paper alt') => `<section id="flow" class="${cls} s-flowb"><div class="wrap">
  <div class="sectionhead">${kick('How Finance talks to Projects')}<h2>From the site to the numbers, <em>without retyping a thing</em></h2><p>Every step on site is a step in the accounts. Three examples of how it flows.</p></div>
  <div class="flowlabel"><span><i class="kp"></i>Happens in Projects</span><span><i class="kf"></i>Happens in Finance</span></div>
  <div class="flows">${flows.map((f) => `<div class="flow">${f.map((s, i) => `<div class="step ${i < 2 ? 'p' : 'f'}">${s}</div>`).join('')}</div>`).join('')}</div>
</div></section>`;
const aiSection = (strip = false) => `<section id="ai" class="s-paper"><div class="wrap">
  <div class="sectionhead">${kick(`${svg('spark', 14)} AI that does the admin`)}<h2>The paperwork reads itself</h2><p>OpHUB's AI reads the invoices, writes the RAMS and keeps the price book up to date, so your team checks rather than types.</p></div>
  <div class="${strip ? 'aistrip' : 'aigrid'}">${ai.map(([ic, h, p]) => `<div class="aicard"><div class="ic">${svg(ic, 22)}</div><h3>${h}</h3><p>${p}</p></div>`).join('')}</div>
</div></section>`;
const simpleSection = () => `<section class="s-paper alt"><div class="wrap"><div class="sectionhead">${kick('Simple by design')}<h2>Less admin. <em>More proof.</em></h2></div>
  <div class="simplegrid">${simple.map(([ic, h, p]) => `<div class="simple"><div class="ic">${svg(ic, 20)}</div><h3>${h}</h3><p>${p}</p></div>`).join('')}</div></div></section>`;
const pricing = () => `<section id="pricing" class="s-paper"><div class="wrap"><div class="sectionhead">${kick('Pricing')}<h2>Pick one system, <em>or both</em></h2><p>No per-user fees. Every price is tailored to the size of your team.</p></div>
  <div class="pgrid">
    <div class="pcard p"><span class="tag">${svg('site', 15)} OpHUB Projects</span><h3>For site teams</h3><p>Everything on site, on every phone.</p><a class="btn btn-primary">Get A Price</a></div>
    <div class="pcard both"><span class="tag">Best value</span><h3>Projects + Finance</h3><p>The two systems, talking to each other. Site to the numbers with no retyping.</p><a class="btn btn-primary">Get A Price</a></div>
    <div class="pcard f"><span class="tag">${svg('pound', 15)} OpHUB Finance</span><h3>For cost management</h3><p>Forecasts, valuations, purchases, CIS and Xero.</p><a class="btn btn-primary">Get A Price</a></div>
  </div></div></section>`;
const cta = () => `<section class="s-paper"><div class="wrap"><div class="finalcta"><h2>Ready to run every site, and every pound, from one place?</h2><p>See OpHUB with your own jobs in mind.</p><div class="herobtns"><a class="btn btn-primary">Book a Demo</a></div></div></div></section>`;

// ---- Layout 2: pick your system (two big panels, each to its own page) ----
const chooser = `<section id="systems" class="s-paper"><div class="wrap">
  <div class="sectionhead">${kick('Two systems · one connection')}<h2>Which part of the business <em>are you running?</em></h2><p>Each works on its own. Together, everything done on site lands in the numbers by itself.</p></div>
  <div class="choose">
    <div class="cpanel p"><div class="ctext"><span class="tag">${svg('site', 15)} OpHUB Projects</span><h3>For site teams</h3><p>Schedule of Works, RAMS, check-in, snagging, materials, deliveries and handover, in one app your operatives will actually use.</p><a class="btn btn-primary">Explore Projects ${svg('arrow', 16)}</a></div><div class="cart">${phone}</div></div>
    <div class="cpanel f"><div class="ctext"><span class="tag">${svg('pound', 15)} OpHUB Finance</span><h3>For complete cost management</h3><p>Forecasts, valuations, invoices, purchases, subcontractors and CIS, with Xero and AI that reads the paperwork.</p><a class="btn btn-primary">Explore Finance ${svg('arrow', 16)}</a></div><div class="cart">${laptop}</div></div>
  </div></div></section>`;

// ---- Layout 3: a guided tour, numbered like a drawing ----
const tourRow = (n, side, kickT, h, p, list, art, k) => `<div class="tour ${side} ${k}"><div class="ttext"><div class="tnum">${n}</div>${kick(kickT)}<h3>${h}</h3><p>${p}</p><ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="tart">${art}</div></div>`;
const tour = `<section id="tour" class="s-paper"><div class="wrap">
  <div class="sectionhead">${kick('A tour of OpHUB')}<h2>From the first RAMS <em>to the final retention</em></h2><p>Two systems, one connection. Here's how a job runs through them.</p></div>
  ${tourRow('01', 'l', 'OpHUB Projects · on site', 'Everything a job needs, on every phone', 'Your PMs, supervisors, operatives and drivers work from one branded app.', projects.slice(0, 6), phone, 'p')}
  ${tourRow('02', 'r', 'OpHUB Finance · in the office', 'Every pound on every job, as it happens', 'Valuations, invoices, purchases and CIS, with the numbers from site already in.', finance.slice(0, 6), laptop, 'f')}
</div></section>`;

const css = `
/* ---- Style C, Blueprint ---- */
.s-paper{background:#F3F6FA;background-image:linear-gradient(rgba(47,111,179,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(47,111,179,.07) 1px,transparent 1px);background-size:28px 28px;}
.s-paper.alt{background-color:#EEF2F8;}
.s-paper .kicker{font-family:'JetBrains Mono',monospace;font-weight:600;letter-spacing:.04em;background:#0B0E14;color:#9CC8F2;border-radius:6px;}
.sectionhead h2 em{font-style:normal;color:#2F6FB3;text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:8px;text-decoration-color:rgba(78,143,209,.4);}
.tag{display:inline-flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;padding:6px 11px;border-radius:4px;}
.two{display:grid;grid-template-columns:1fr 120px 1fr;}
.sys{background:#fff;border:1.5px solid #0B0E14;border-radius:6px;padding:34px;}
.sys-p{box-shadow:8px 8px 0 #2F6FB3;border-color:#2F6FB3;} .sys-f{box-shadow:8px 8px 0 #1F9D62;border-color:#1F9D62;}
.p .tag,.sys-p .tag{background:#2F6FB3;color:#fff;} .f .tag,.sys-f .tag{background:#1F9D62;color:#fff;}
.sys h3{font-size:30px;margin-top:16px;letter-spacing:-.02em;} .sys .for{font-size:16px;margin-top:8px;color:#566072;}
.sys ul,.tour ul{list-style:none;padding:0;margin:22px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:9px 14px;}
.sys li,.tour li{display:flex;gap:9px;align-items:center;font-size:14.5px;font-weight:600;}
.sys li:before,.tour li:before{content:"";width:7px;height:7px;flex:0 0 7px;border-radius:1px;}
.sys-p li:before,.tour.p li:before{background:#2F6FB3;} .sys-f li:before,.tour.f li:before{background:#1F9D62;}
.bridge{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;}
.bridge .knot{width:58px;height:58px;border-radius:6px;background:#fff;border:1.5px dashed #0B0E14;display:flex;align-items:center;justify-content:center;}
.bridge .line{flex:1;width:2px;background:repeating-linear-gradient(180deg,#0B0E14 0 4px,transparent 4px 9px);} .bridge small{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;text-transform:uppercase;}
/* the flow in style B's tinted boxes */
.s-flowb .flowlabel{display:flex;gap:18px;justify-content:center;margin-bottom:18px;font-size:13px;font-weight:700;color:#566072;}
.flowlabel span{display:inline-flex;align-items:center;gap:7px;} .flowlabel i{width:12px;height:12px;border-radius:4px;display:inline-block;}
.flowlabel i.kp{background:#4E8FD1;} .flowlabel i.kf{background:#1F9D62;}
.flows{display:grid;gap:14px;} .flow{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;}
.step{position:relative;border-radius:14px;padding:14px 14px 14px 16px;font-size:14px;font-weight:700;line-height:1.3;display:flex;align-items:center;border:1px solid #E3E7EE;box-shadow:0 8px 20px -14px rgba(11,14,20,.25);}
.step.p{background:#EEF4FC;border-color:#CFE0F4;color:#1F4E86;} .step.f{background:#EAF6EF;border-color:#C9E8D6;color:#14653B;}
.step:not(:last-child):after{content:"";position:absolute;right:-9px;top:50%;width:8px;height:8px;transform:translateY(-50%) rotate(45deg);z-index:2;background:#fff;border-top:1.5px solid #9AA5B5;border-right:1.5px solid #9AA5B5;}
.aigrid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
.aistrip{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;} .aistrip .aicard{padding:18px;} .aistrip .aicard p{display:none;} .aistrip .aicard h3{font-size:15px;}
.aicard{background:#fff;border:1.5px solid #D4DCE7;border-radius:6px;position:relative;padding:26px;}
.aicard:after{content:"AI";position:absolute;top:16px;right:16px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:#2F6FB3;border:1px solid #2F6FB3;border-radius:3px;padding:1px 5px;}
.aicard .ic{width:46px;height:46px;border-radius:6px;background:#0B0E14;color:#9CC8F2;display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
.aicard h3{font-size:18px;} .aicard p{font-size:14.5px;margin-top:8px;color:#566072;line-height:1.55;}
.simplegrid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}
.simple{background:#fff;border:1.5px solid #D4DCE7;border-radius:6px;padding:28px;} .simple .ic{width:42px;height:42px;border-radius:6px;background:#2F6FB3;color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:14px;}
.simple h3{font-size:18px;} .simple p{font-size:14.5px;margin-top:8px;color:#566072;}
.pgrid{display:grid;grid-template-columns:1fr 1.1fr 1fr;gap:22px;align-items:stretch;}
.pcard{background:#fff;border:1.5px solid #D4DCE7;border-radius:6px;padding:30px;display:flex;flex-direction:column;gap:12px;}
.pcard.p{box-shadow:8px 8px 0 #2F6FB3;border-color:#2F6FB3;} .pcard.f{box-shadow:8px 8px 0 #1F9D62;border-color:#1F9D62;}
.pcard.both{background:#0B0E14;color:#fff;border-color:#0B0E14;box-shadow:8px 8px 0 #4E8FD1;} .pcard.both .tag{background:#4E8FD1;color:#fff;align-self:flex-start;}
.pcard .tag{align-self:flex-start;} .pcard h3{font-size:22px;} .pcard p{color:#566072;flex:1;} .pcard.both p{color:rgba(255,255,255,.7);}
.finalcta{background:#0B0E14;border-radius:8px;box-shadow:10px 10px 0 #2F6FB3;}
.finalcta .btn-primary{background:#4E8FD1;color:#fff;}
/* laptop mock */
.laptop{width:100%;max-width:520px;margin:0 auto;}
.lscreen{background:#F4F5F7;border:10px solid #0B0E14;border-bottom-width:14px;border-radius:14px 14px 4px 4px;overflow:hidden;font-size:11px;}
.lbase{height:12px;background:linear-gradient(#cfd5de,#9aa3b0);border-radius:0 0 14px 14px;margin:0 -28px;}
.lbar{background:#fff;padding:9px 12px;text-align:center;font-weight:700;color:#C0392B;border-bottom:1px solid #E6E8EC;} .lbar b{color:#111318;} .lbar i{color:#8A93A3;font-style:normal;margin:0 4px;}
.ltabs{display:flex;gap:10px;padding:6px 12px;font-size:10px;color:#6b7280;font-weight:600;background:#fff;border-bottom:1px solid #E6E8EC;} .ltabs .on{color:#111;border-bottom:2px solid #C0392B;}
.lstats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:8px 10px;} .lstats div{background:#fff;border:1px solid #ECEEF2;border-radius:6px;padding:6px;} .lstats b{display:block;font-size:13px;} .lstats small{font-size:8px;color:#566072;}
.ltable{width:calc(100% - 20px);margin:0 10px 10px;border-collapse:collapse;background:#fff;border-radius:6px;overflow:hidden;font-size:9.5px;}
.ltable th{font-size:8.5px;text-transform:uppercase;letter-spacing:.04em;text-decoration:underline;padding:6px;text-align:center;} .ltable td{padding:7px 6px;border-top:1px solid #EEF0F2;text-align:center;}
.ltable span{font-size:8.5px;font-weight:700;padding:2px 6px;border-radius:999px;} .ok{background:#E5F5EC;color:#17804A;} .ai{background:#EAF2FB;color:#2F6FB3;} .wait{background:#FDF1E6;color:#B35A00;}
/* layout 2 chooser */
.choose{display:grid;gap:26px;}
.cpanel{display:grid;grid-template-columns:1fr 1fr;gap:30px;align-items:center;background:#fff;border:1.5px solid;border-radius:6px;padding:36px;}
.cpanel.p{border-color:#2F6FB3;box-shadow:8px 8px 0 #2F6FB3;} .cpanel.f{border-color:#1F9D62;box-shadow:8px 8px 0 #1F9D62;grid-template-columns:1fr 1fr;}
.cpanel h3{font-size:32px;margin:16px 0 10px;letter-spacing:-.02em;} .cpanel p{color:#566072;font-size:16px;margin-bottom:22px;}
.cpanel.f .btn-primary{background:#1F9D62;box-shadow:0 8px 20px -8px rgba(31,157,98,.6);}
.cart{display:flex;justify-content:center;} .cart .phone{transform:rotate(2deg) scale(.92);}
/* layout 3 tour */
.tour{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;margin:0 0 70px;position:relative;}
.tour.r .ttext{order:2;} .tnum{font-family:'JetBrains Mono',monospace;font-size:64px;font-weight:600;line-height:1;color:transparent;-webkit-text-stroke:1.5px #2F6FB3;margin-bottom:14px;}
.tour.f .tnum{-webkit-text-stroke-color:#1F9D62;} .tour h3{font-size:32px;margin:14px 0 10px;letter-spacing:-.02em;} .tour p{color:#566072;font-size:16px;}
.tour .kicker{margin:0;} .tart{display:flex;justify-content:center;}
.tour.p .tart{border-left:1.5px dashed #9AB7DA;padding-left:40px;} .tour.f .tart{border-right:1.5px dashed #9CD3B7;padding-right:40px;}
.label{font-family:'JetBrains Mono',monospace;font-size:12px;color:#566072;}
@media (max-width:900px){
  .two{grid-template-columns:1fr;} .bridge{flex-direction:row;padding:14px 0;} .bridge .line{height:2px;width:auto;flex:1;background:repeating-linear-gradient(90deg,#0B0E14 0 4px,transparent 4px 9px);}
  .flow{grid-template-columns:1fr;} .step:not(:last-child):after{right:50%;top:auto;bottom:-9px;transform:translateX(50%) rotate(45deg);}
  .aigrid,.simplegrid,.pgrid,.cpanel,.tour{grid-template-columns:1fr;} .aistrip{grid-template-columns:1fr 1fr;} .sys ul,.tour ul{grid-template-columns:1fr;}
  .tour.r .ttext{order:0;} .tour .tart{border:0!important;padding:0!important;}
}`;

const page = (n, name, desc, body) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpHUB Website: Layout ${n} (${name})</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>${baseCss}${css}</style></head><body>
<div class="nav"><div class="navrow"><a href="/" class="navlogo"><img src="../../assets/ophub-logo.png?v=2" alt="OpHUB">OpHUB</a>
<div class="navlinks"><a>Projects</a><a>Finance</a><a>AI</a><a>Pricing</a></div><div class="navcta"><a class="btn btn-glass btn-sm">Sign In</a><a class="btn btn-primary btn-sm">Book a Demo</a></div></div></div>
${hero}
${body}
<footer><div class="wrap"><div class="footrow"><div class="footlogo"><img src="../../assets/ophub-logo.png?v=2" alt="">OpHUB</div><div class="footlinks"><a>Projects</a><a>Finance</a><a>AI</a><a>Pricing</a><a>Book a Demo</a></div></div><div class="footmeta">Layout ${n} · ${name} · ${desc} · a draft, not the live site</div></div></footer>
</body></html>`;

const L = [
  [1, 'One Page Story', 'everything on one page, in order', [twoSystems(), flowSection(), aiSection(), simpleSection(), pricing(), cta()].join('\n')],
  [2, 'Pick Your System', 'two big panels, each opening its own page', [chooser, flowSection(), aiSection(true), pricing(), cta()].join('\n')],
  [3, 'Guided Tour', 'a numbered walk through a job', [tour, flowSection().replace('How Finance talks to Projects', '03 · How Finance talks to Projects'), aiSection().replace('AI that does the admin', '04 · AI that does the admin'), pricing(), cta()].join('\n')],
];
for (const [n, name, desc, body] of L) fs.writeFileSync(path.join(__dirname, `layout-${n}.html`), page(n, name, desc, body));
console.log('made layout-1.html, layout-2.html, layout-3.html');
