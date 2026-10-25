/* ============================================================
   OpHUB Finance — a lighter look for the computer Finance pages (25 Oct 2026, Andy:
   "i love the layout so dont change it, but it still looks a little html-ish").
   Computers only (html.desk). Nothing moves: every box keeps its size and place; only how the
   controls are drawn changes. Phones are untouched.
   - Text boxes (Ref, section / item names) read as editable text: no box at rest, a faint
     outline when the mouse is over them, a soft blue ring while typing. Ref is a small grey tag.
   - Tick boxes: small, rounded, brand-coloured with a white tick when ticked.
   - Quantity / rate / price boxes: a soft tint, no inset shadow; worked-out totals are plain text.
   - Section rows: a very soft brand tint instead of the flat grey bar.
   - Drop-downs ("+ New", "Priced schedule of works"): no browser chrome, our own chevron.
   - Export: Excel · PDF and the ticked-lines actions: no underline (only when hovered).
   - Buttons: 10px corners, hairline borders, a quiet hover, a soft shadow on the red one.
   - Purchases table: soft header tint, row hover, tinted filter boxes with no border.
   - Cards: hairline border and a very soft shadow.
   ============================================================ */
(function(){
  const st = document.createElement('style'); st.id = 'finDeskPolishCss';
  const D = 'html.desk';
  const L = 'html.desk .bqd-lines';
  const BRAND = 'var(--brand1, #C8102E)';
  // The brand colour at a few % over white (for tints) — color-mix where the browser has it,
  // a plain light grey where it doesn't.
  const tint = (pct, fb)=>`${fb};background:color-mix(in srgb, ${BRAND} ${pct}%, #fff)`;
  const TICK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 6.2l2.4 2.4 4.6-4.9' fill='none' stroke='%23fff' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";
  const DASH = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 6h6' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E\")";
  const CHEV_W = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%23fff' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";
  const CHEV_D = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%235B6472' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";
  const RING = '0 0 0 3px rgba(79,143,209,.22)';
  const HAIR = 'rgba(16,24,40,.08)';
  st.textContent = `
/* ---------- type ---------- */
${D} .finboqpane, ${D} .finptab, ${D} .finprojbar, ${D} .finboqsub, ${D} .finptabs{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
${L} .fincpill input, ${L} .fincrow-foot b, ${L} .bqd-sum b, ${L} .fincpill-mg b, ${L} .fincpill-mg em, ${D} .finpp-tiles b{font-variant-numeric:tabular-nums;}
${L} .fincpill > span:first-child{font-size:11.5px;color:var(--slate);font-weight:600;letter-spacing:.005em;}
${L} .bqd-sum em{font-size:11.5px;}

/* ---------- cards ---------- */
${D} .finboqpane .card, ${D} .finptab .card, ${D} .finprojbar, ${D} .finboqpane .finbanner, ${D} .finptab .finbanner{border:1px solid ${HAIR} !important;box-shadow:0 1px 2px rgba(16,24,40,.04) !important;}
${D} .finptab .fintodate > div{border:1px solid ${HAIR};box-shadow:0 1px 2px rgba(16,24,40,.04);}
${D} .finptab .finpp-tiles > div.click:hover{border-color:${BRAND};}

/* ---------- buttons ---------- */
${L} .finboqadd .ghostbtn, ${L} .bqd-acts .ghostbtn, ${L} .bqd-sow .bqd-sowbtn, ${D} .finboqsub .bqd-up button.bqd-upbtn, ${D} .finptab .finpp-h .ghostbtn, ${D} .finprojbar .finprojbar-home{
  background:#fff !important;border:1px solid var(--line, #E1E5EA) !important;border-radius:10px !important;color:var(--ink);box-shadow:0 1px 1px rgba(16,24,40,.03);
  transition:background .15s ease, border-color .15s ease, box-shadow .15s ease;}
${L} .finboqadd .ghostbtn:hover, ${L} .bqd-acts .ghostbtn:hover, ${L} .bqd-sow .bqd-sowbtn:hover, ${D} .finboqsub .bqd-up button.bqd-upbtn:hover, ${D} .finptab .finpp-h .ghostbtn:hover, ${D} .finprojbar .finprojbar-home:hover{
  ${tint(5, 'background:#F6F7F9')} !important;border-color:rgba(16,24,40,.16) !important;}
${L} .bqd-budbtn.on{${tint(7, 'background:#F2F4F7')} !important;border-color:rgba(16,24,40,.18) !important;}
${L} .bqd-acts .darkbtn, ${D} .finptab .finpp-h .darkbtn{border-radius:10px !important;box-shadow:0 1px 2px rgba(16,24,40,.10), 0 3px 8px -2px rgba(16,24,40,.18);transition:box-shadow .15s ease, transform .1s ease;}
${L} .bqd-acts .darkbtn:hover, ${D} .finptab .finpp-h .darkbtn:hover{box-shadow:inset 0 0 0 100px rgba(0,0,0,.08), 0 2px 4px rgba(16,24,40,.12), 0 5px 12px -3px rgba(16,24,40,.22);}
${L} .fincrow-menu{border-radius:8px;transition:background .12s ease;}
${L} .bqd-budpanel, ${L} .bqd-addmenu{border-color:${HAIR};}

/* ---------- drop-downs drawn by us ---------- */
${D} .finprojbar select{-webkit-appearance:none !important;appearance:none !important;border-radius:10px !important;border:1px solid var(--line, #E1E5EA);background-image:${CHEV_D};background-repeat:no-repeat;background-position:right 10px center;background-size:12px 12px;padding-right:30px !important;cursor:pointer;font-weight:600;}
${D} .finprojbar select.finprojbar-n{background-image:${CHEV_W} !important;background-repeat:no-repeat !important;background-position:right 10px center !important;background-size:12px 12px !important;border:0 !important;box-shadow:0 1px 2px rgba(16,24,40,.10), 0 3px 8px -2px rgba(16,24,40,.18);transition:box-shadow .15s ease;}
${D} .finprojbar select.finprojbar-n:hover{box-shadow:inset 0 0 0 100px rgba(0,0,0,.08), 0 2px 4px rgba(16,24,40,.12), 0 5px 12px -3px rgba(16,24,40,.22);}
${D} .finprojbar select:focus-visible{outline:none;box-shadow:${RING};}
${L} #finCtBulk select{-webkit-appearance:none;appearance:none;border:1px solid transparent;border-radius:8px;background:rgba(16,24,40,.05) ${CHEV_D} no-repeat right 6px center / 11px 11px;padding-right:22px !important;}
${L} #finCtBulk select:hover{border-color:rgba(16,24,40,.14);}

/* ---------- Ref / name boxes: editable text, not boxes ---------- */
${L} .fincrow-head input[type=text], ${L} .fincrow-head textarea{background:transparent !important;border-color:transparent !important;box-shadow:none !important;transition:background .12s ease, border-color .12s ease, box-shadow .12s ease;}
${L} .fincrow-head input[type=text]:hover, ${L} .fincrow-head textarea:hover{border-color:rgba(16,24,40,.12) !important;background:rgba(16,24,40,.025) !important;}
${L} .fincrow-head input[type=text]:focus, ${L} .fincrow-head textarea:focus{outline:none !important;background:#fff !important;border-color:rgba(79,143,209,.7) !important;box-shadow:${RING} !important;}
${L} .fincrow-head textarea{font-weight:600;color:var(--ink);resize:none;}
${L} .fincrow-head textarea:focus{resize:vertical;}
${L} .fincrow-head input::placeholder, ${L} .fincrow-head textarea::placeholder{color:#9AA3AF;font-weight:500;}
${L} .fincrow.section .fincrow-title{font-weight:600 !important;font-size:15px !important;}
${L} .fincrow.subsection .fincrow-title{font-weight:600 !important;}
/* Ref: a small grey tag */
${L} .fincrow-head input.fincline-ref{background:rgba(16,24,40,.045) !important;color:var(--slate);font-size:12px !important;font-weight:600;text-align:center;letter-spacing:.01em;border-radius:7px !important;padding:5px 6px !important;}
${L} .fincrow-head input.fincline-ref:hover{background:rgba(16,24,40,.07) !important;border-color:transparent !important;}
${L} .fincrow-head input.fincline-ref:focus{background:#fff !important;color:var(--ink);}
${L} .fincrow-head input.fincline-ref::placeholder{color:#A4ABB5;}

/* ---------- tick boxes ---------- */
${L} input.fincsel[type=checkbox], ${L} #finCtBulk input[type=checkbox]{-webkit-appearance:none !important;appearance:none !important;box-sizing:border-box;width:14px !important;height:14px !important;border:1.5px solid #B9C0CA;border-radius:4px;background:#fff center / 11px 11px no-repeat;cursor:pointer;transition:background .12s ease, border-color .12s ease, box-shadow .12s ease;}
${L} input.fincsel[type=checkbox]:hover, ${L} #finCtBulk input[type=checkbox]:hover{border-color:#8E97A3;}
${L} input.fincsel[type=checkbox]:checked, ${L} #finCtBulk input[type=checkbox]:checked{background-color:${BRAND};border-color:${BRAND};background-image:${TICK};}
${L} input.fincsel[type=checkbox]:indeterminate, ${L} #finCtBulk input[type=checkbox]:indeterminate{background-color:${BRAND};border-color:${BRAND};background-image:${DASH};}
${L} input.fincsel[type=checkbox]:focus-visible, ${L} #finCtBulk input[type=checkbox]:focus-visible{outline:none;box-shadow:${RING};}

/* ---------- quantity / rate / price boxes ---------- */
${L} .fincpill{border-color:${HAIR};}
${L} .fincpill.cost{border-color:rgba(201,122,31,.16);} ${L} .fincpill.sell{border-color:rgba(79,143,209,.18);}
${L} .fincpill input{background:rgba(16,24,40,.045);box-shadow:none;transition:background .12s ease, box-shadow .12s ease;}
${L} .fincpill input:hover{box-shadow:inset 0 0 0 1px rgba(16,24,40,.16);}
${L} .fincpill input:focus{background:#fff;box-shadow:inset 0 0 0 1px rgba(79,143,209,.7), ${RING};}
${L} .fincpill input:disabled, ${L} .fincpill input:disabled:hover{background:transparent;box-shadow:none;}
${L} .fincpill input::placeholder{color:#A9B0BA;}

/* ---------- section rows ---------- */
${L} .fincrow.section{${tint(5, 'background:#F5F6F8')} !important;box-shadow:inset 0 0 0 1px rgba(16,24,40,.06);box-shadow:inset 0 0 0 1px color-mix(in srgb, ${BRAND} 11%, #fff);}
${L} .fincrow.subsection{background:rgba(16,24,40,.025) !important;box-shadow:inset 0 0 0 1px rgba(16,24,40,.05);}
${L} .fincrow.section .fincrow-foot b, ${L} .fincrow.subsection .fincrow-foot b{font-weight:800;}
${L} .fincrow.item{border-top-color:rgba(16,24,40,.06);}

/* ---------- ticked-lines bar ---------- */
${L} #finCtBulk.bqd-bulk{${tint(6, 'background:#F4F6FA')};box-shadow:inset 0 0 0 1px ${HAIR};}
${L} #finCtBulk.bqd-bulk .linkbtn{text-decoration:none !important;font-weight:600 !important;color:var(--ink) !important;padding:2px 7px !important;margin:-1px -3px !important;border-radius:7px;border:1px solid transparent;background:transparent;transition:background .12s ease, border-color .12s ease;}
${L} #finCtBulk.bqd-bulk .linkbtn:hover{background:#fff;border-color:rgba(16,24,40,.14);text-decoration:none !important;}
${L} #finCtBulk.bqd-bulk .linkbtn[style*="--red"]{color:var(--red) !important;}
${L} #finCtBulk.bqd-bulk > b{font-weight:800;}

/* ---------- links ---------- */
${L} .finexp{border-top-color:rgba(16,24,40,.06);}
${L} .finexp button.linkbtn{text-decoration:none !important;color:var(--slate) !important;font-weight:600 !important;padding:0 2px !important;border-radius:5px;}
${L} .finexp button.linkbtn:hover{color:var(--ink) !important;text-decoration:underline !important;text-underline-offset:3px;}
${D} .finboqsub .bqd-up button.bqd-lastup{text-decoration:none;}
${D} .finboqsub .bqd-up button.bqd-lastup:hover{color:var(--ink);text-decoration:underline;text-underline-offset:3px;}

/* ---------- summary tiles ---------- */
${L} .bqd-sum > span{box-shadow:inset 0 0 0 1px rgba(16,24,40,.04);}

/* ---------- Purchases table ---------- */
${D} .finptab .finreptbl-wrap table.fincosttbl{border:1px solid ${HAIR};border-radius:12px;}
${D} .finptab .finreptbl-wrap table.fincosttbl thead tr:first-child th{${tint(4, 'background:#F7F8FA')};letter-spacing:.04em;font-size:11px;font-weight:700;color:var(--slate);border-bottom:1px solid rgba(16,24,40,.06);border-right:0;}
${D} .finptab .finreptbl-wrap table.fincosttbl th, ${D} .finptab .finreptbl-wrap table.fincosttbl td{border-left:0;border-right:0;}
${D} .finptab .finreptbl-wrap table.fincosttbl td{border-bottom:1px solid rgba(16,24,40,.06);}
${D} .finptab .finreptbl-wrap table.fincosttbl tbody tr:last-child td{border-bottom:0;}
${D} .finptab .finreptbl-wrap table.fincosttbl tr.click td{transition:background .1s ease;}
${D} .finptab .finreptbl-wrap table.fincosttbl tr.click:hover td{${tint(4, 'background:#F7F8FA')};}
${D} .finptab .finreptbl-wrap table.fincosttbl tr.fcf-row th{background:#fff;border-bottom:1px solid rgba(16,24,40,.06);}
${D} .finptab .finreptbl-wrap table.fincosttbl .fcf-in{background:rgba(16,24,40,.045) !important;border-color:transparent !important;border-radius:8px !important;color:var(--ink);transition:background .12s ease, border-color .12s ease, box-shadow .12s ease;}
${D} .finptab .finreptbl-wrap table.fincosttbl .fcf-in:hover{border-color:rgba(16,24,40,.14) !important;}
${D} .finptab .finreptbl-wrap table.fincosttbl .fcf-in:focus{outline:none !important;background:#fff !important;border-color:rgba(79,143,209,.7) !important;box-shadow:${RING} !important;}
${D} .finptab .finreptbl-wrap table.fincosttbl .fcf-in::placeholder{color:#9AA3AF;font-weight:500;}
${D} .finptab .finreptbl-wrap table.fincosttbl .finpill{display:inline-flex;align-items:center;gap:5px;font-weight:700;letter-spacing:.01em;}
${D} .finptab .finsfoot{box-shadow:0 1px 2px rgba(16,24,40,.06);}
${D} .finptab .finpurtabs button em{background:rgba(16,24,40,.06);}
`;
  document.head.appendChild(st);
})();
