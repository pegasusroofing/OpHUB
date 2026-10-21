/* ============================================================
   OpHUB Finance › Purchases › Statements (21 Oct 2026, Andy).
   Supplier statement reconciliation:
     upload a statement (PDF, Excel or CSV) → its lines are read
     (date, reference, invoice / credit / payment, amount) → each line is
     matched to a purchase invoice by invoice number, else by amount + date
     → you can change any match by hand, add or ignore lines, and mark the
     statement reconciled.
   Also shows invoices you hold for that supplier that aren't on the
   statement. Unallocated invoices (still in the inbox) count as received.
   Table fin_statements (lines jsonb). Nothing leaves OpHUB.
   ============================================================ */
(function(){
  const i = FIN_SUBS.purchases.findIndex(t=>t[0]==='invoices');
  FIN_SUBS.purchases.splice(i+1, 0, ['statements','Statements','#/finance/purchases/statements']);
  const base = renderFinPurchases;
  renderFinPurchases = function(sub){ if(sub==='statements') return renderFinStatements(); return base.apply(this, arguments); };
})();

const FIN_STMT_TYPES = {invoice:'Invoice', credit:'Credit note', payment:'Payment', other:'Other'};
let finStmt = null; // the statement open on screen {rec, cands, file}
const finRefKey = s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^(INV|INVOICE|CN|CR|SI|NO)+/,'').replace(/^0+/,'');
const finSupK = s=>String(s||'').trim().toLowerCase().replace(/\b(ltd|limited|plc|llp|uk|the)\b/g,'').replace(/[^a-z0-9]/g,'');

/* ---------- reading a statement ---------- */
const FIN_MON = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
function finStmtDate(s){
  s = String(s||'').trim(); let m;
  if((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0];
  if((m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))){ let y = Number(m[3]); if(y<100) y += 2000; const mo = Number(m[2]), d = Number(m[1]); if(mo>=1&&mo<=12&&d>=1&&d<=31) return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
  if((m = s.match(/(\d{1,2})[\s\-]([A-Za-z]{3,4})[a-z]*[\s\-,]+(\d{2,4})/))){ const mo = FIN_MON[m[2].toLowerCase()]; let y = Number(m[3]); if(y<100) y += 2000; if(mo) return y+'-'+String(mo).padStart(2,'0')+'-'+String(Number(m[1])).padStart(2,'0'); }
  if(typeof s==='number' || /^\d{5}$/.test(s)){ const n = Number(s); if(n>30000 && n<60000){ const d = new Date(Date.UTC(1899,11,30) + n*86400000); return d.toISOString().slice(0,10); } }
  return null;
}
const FIN_DATE_RX = /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\s\-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s\-,]+\d{2,4})\b/i;
const FIN_AMT_RX = /-?£?\s?\(?-?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:\s?(?:CR|DR))?/gi;
function finAmt(s){ let t = String(s||'').trim(); const neg = /^\(.*\)$/.test(t.replace(/\s?(CR|DR)$/i,'')) || /^-/.test(t) || /CR$/i.test(t); t = t.replace(/[^0-9.]/g,''); const n = Number(t); return isNaN(n) ? null : (neg ? -n : n); }
function finLineType(txt, amt){
  const l = String(txt||'').toLowerCase();
  if(/\b(payment|paid|receipt|bacs|chq|cheque|remittance|faster pay|direct debit|dd)\b/.test(l)) return 'payment';
  if(/\b(credit note|credit|crn|cn)\b/.test(l) || (amt!=null && amt<0)) return 'credit';
  if(/\b(balance b\/?f|brought forward|opening balance|carried forward|total|balance due|amount due)\b/.test(l)) return 'other';
  return 'invoice';
}
// One line of text → {date, ref, type, amount} or null.
function finStmtParseText(line){
  const dm = line.match(FIN_DATE_RX); if(!dm) return null;
  const amts = line.match(FIN_AMT_RX); if(!amts) return null;
  // the line amount is the first money value after the date (the last is usually a running balance)
  const rest = line.slice(line.indexOf(dm[0]) + dm[0].length);
  const after = rest.match(FIN_AMT_RX) || amts;
  let amount = finAmt(after.length > 1 ? after[0] : after[after.length-1]);
  if(amount==null) return null;
  const noMoney = rest.replace(FIN_AMT_RX, ' ');
  const refM = noMoney.match(/\b([A-Z]{0,4}[\-\/]?\d{4,}[A-Z0-9\-\/]*)\b/i);
  const type = finLineType(line, amount);
  if(type==='other') return null;
  if(type==='credit' || type==='payment') amount = -Math.abs(amount);
  return {date:finStmtDate(dm[0]), ref:refM ? refM[1] : '', type, amount:finRound(amount), text:line.trim().slice(0,160)};
}
async function finStmtReadPdf(file){
  if(!(await loadLib('pdfjsLib'))) return {lines:[], text:''};
  const pdf = await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const rows = [];
  for(let p=1; p<=Math.min(pdf.numPages, 20); p++){
    const pg = await pdf.getPage(p); const tc = await pg.getTextContent();
    const by = {}; tc.items.forEach(it=>{ const y = Math.round(it.transform[5]/3); (by[y] = by[y] || []).push(it); });
    Object.keys(by).map(Number).sort((a,b)=>b-a).forEach(y=>{ rows.push(by[y].sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim()); });
  }
  return {lines:rows.map(finStmtParseText).filter(Boolean), text:rows.join('\n')};
}
function finCsvRows(text){
  const rows = []; let row = [], cur = '', q = false;
  for(let i=0;i<text.length;i++){ const ch = text[i];
    if(q){ if(ch==='"' && text[i+1]==='"'){ cur += '"'; i++; } else if(ch==='"') q = false; else cur += ch; }
    else if(ch==='"') q = true; else if(ch===','){ row.push(cur); cur = ''; } else if(ch==='\n' || ch==='\r'){ if(ch==='\r' && text[i+1]==='\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
  if(cur || row.length){ row.push(cur); rows.push(row); }
  return rows;
}
async function finStmtReadSheet(file){
  let rows;
  if(/\.csv$/i.test(file.name) || /csv/.test(file.type||'')) rows = finCsvRows(await file.text());
  else {
    if(!(await loadLib('XLSX'))){ toast('Could not load the Excel reader — check your connection.'); return {lines:[], text:''}; }
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array'});
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, raw:true, defval:''});
  }
  const hi = rows.findIndex(r=>r.some(c=>/date/i.test(String(c))) && r.some(c=>/(amount|value|debit|credit|total|gross)/i.test(String(c))));
  const text = rows.map(r=>r.join(' ')).join('\n');
  if(hi<0) return {lines:rows.map(r=>finStmtParseText(r.join(' '))).filter(Boolean), text};
  const h = rows[hi].map(c=>String(c).toLowerCase());
  const col = rx=>h.findIndex(c=>rx.test(c));
  const cDate = col(/date/), cRef = col(/(ref|invoice|document|doc|number|no\.?$|transaction)/), cType = col(/(type|description|details|narrative)/),
        cDr = col(/(debit|invoice amount|charges?)/), cCr = col(/(credit|payment|receipts?)/), cAmt = col(/(amount|value|total|gross)/);
  const out = [];
  rows.slice(hi+1).forEach(r=>{
    const date = finStmtDate(r[cDate]); if(!date) return;
    let amount = null;
    if(cDr>=0 || cCr>=0){ const dr = finAmt(r[cDr]), cr = finAmt(r[cCr]); if(dr) amount = Math.abs(dr); else if(cr) amount = -Math.abs(cr); }
    if(amount==null && cAmt>=0) amount = finAmt(r[cAmt]);
    if(amount==null || amount===0) return;
    const txt = r.join(' ');
    let type = finLineType(cType>=0 ? r[cType] : txt, amount); if(type==='other') return;
    if(type==='credit' || type==='payment') amount = -Math.abs(amount);
    out.push({date, ref:cRef>=0 ? String(r[cRef]).trim() : '', type, amount:finRound(amount), text:txt.slice(0,160)});
  });
  return {lines:out, text};
}

/* ---------- matching ---------- */
// Candidates: this supplier's purchase invoices (filed) + unallocated ones still in the inbox.
async function finStmtCands(supplierName){
  const k = finSupK(supplierName);
  const [pis, inbox] = await Promise.all([
    dbSelect('purchase_invoices', 'org_id=eq.'+ME.org_id+'&status=neq.rejected&select=id,site_id,supplier_name,invoice_no,invoice_date,total,status,paid_on&limit=5000'),
    dbSelect('fin_inbox', 'org_id=eq.'+ME.org_id+'&status=eq.new&select=id,extracted,received_at,stage&limit=500').catch(()=>[]),
  ]);
  const a = pis.filter(p=>finSupK(p.supplier_name)===k || (k.length>3 && finSupK(p.supplier_name).includes(k)) || (finSupK(p.supplier_name).length>3 && k.includes(finSupK(p.supplier_name))))
    .map(p=>({id:p.id, kind:'pi', site_id:p.site_id, invoice_no:p.invoice_no||'', date:p.invoice_date, total:Number(p.total||0), status:p.paid_on?'paid':p.status}));
  const b = inbox.filter(i=>i.extracted && finSupK(i.extracted.supplier) && (finSupK(i.extracted.supplier)===k || (k.length>3 && finSupK(i.extracted.supplier).includes(k))))
    .map(i=>({id:'in:'+i.id, kind:'inbox', invoice_no:i.extracted.invoice_no||'', date:i.extracted.invoice_date||String(i.received_at||'').slice(0,10), total:Number(i.extracted.total||0), status:'unallocated'}));
  return a.concat(b);
}
function finStmtAutoMatch(lines, cands){
  const used = new Set(lines.filter(l=>l.how==='manual' && l.match).map(l=>l.match));
  const days = (a,b)=>Math.abs((new Date(a) - new Date(b))/86400000);
  lines.forEach(l=>{
    if(l.how==='manual' || l.ignore || l.type==='payment') return;
    l.match = null; l.how = null;
    const rk = finRefKey(l.ref);
    let c = rk.length>=3 ? cands.find(c=>!used.has(c.id) && finRefKey(c.invoice_no) && (finRefKey(c.invoice_no)===rk || (rk.length>=5 && (finRefKey(c.invoice_no).endsWith(rk) || rk.endsWith(finRefKey(c.invoice_no)))))) : null;
    if(!c){ const same = cands.filter(c=>!used.has(c.id) && Math.abs(Math.abs(c.total)-Math.abs(l.amount))<0.01 && (!l.date || !c.date || days(l.date, c.date)<=10)); if(same.length===1) c = same[0]; }
    if(c){ l.match = c.id; l.how = 'auto'; used.add(c.id); }
  });
  return lines;
}
function finStmtLineState(l, cands){
  if(l.ignore) return {k:'ignored', pill:'<span class="finpill">Ignored</span>'};
  if(l.type==='payment') return {k:'payment', pill:'<span class="finpill blue">Payment</span>'};
  const c = l.match && cands.find(x=>x.id===l.match);
  if(!c) return {k:'missing', pill:'<span class="finpill bad">Not in OpHUB</span>'};
  const diff = finRound(Math.abs(l.amount) - Math.abs(c.total));
  if(Math.abs(diff) >= 0.01) return {k:'diff', pill:`<span class="finpill warn">£ differs ${finMoney(diff)}</span>`, diff};
  return {k:'ok', pill:`<span class="finpill ok">Matched${l.how==='manual'?' (by hand)':''}</span>`};
}

/* ---------- list ---------- */
async function renderFinStatements(){
  if(!finGuard()) return;
  const id = String(location.hash||'').split('/')[4];
  if(id) return renderFinStatement(id);
  const __gen = RENDER_GEN;
  const list = await dbSelect('fin_statements', 'org_id=eq.'+ME.org_id+'&order=statement_date.desc.nullslast,created_at.desc&limit=500').catch(()=>[]);
  if(__gen !== RENDER_GEN) return;
  const sum = s=>{ const ls = (s.lines||[]).filter(l=>!l.ignore && l.type!=='payment'); return {n:ls.length, ok:ls.filter(l=>l.match).length, miss:ls.filter(l=>!l.match).length}; };
  document.getElementById('app').innerHTML = shell(`${finSectionNav('purchases')}${finSubTabs('purchases','statements')}
    ${finSecHead('Statements', '+ Upload statement', "document.getElementById('finStmtFile').click()")}
    <input type="file" id="finStmtFile" accept=".pdf,.csv,.xlsx,.xls,application/pdf" style="display:none;" onchange="finStmtUpload(this)">
    <p class="stub" style="margin:-4px 0 10px;">Upload a supplier statement (PDF, Excel or CSV). Each line is matched to the purchase invoices you hold — by invoice number, or amount and date — and you can change any match by hand.</p>
    ${finSearchHtml('Search supplier', 'finStmtList')}
    <div id="finStmtList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
      <thead><tr><th>Supplier</th><th>Statement date</th><th class="num">Lines</th><th class="num">Matched</th><th class="num">Not in OpHUB</th><th class="num">Balance</th><th>Status</th></tr></thead>
      <tbody>${list.map(s=>{ const m = sum(s); return `<tr class="click" data-lf="${lfText(s.supplier_name)}" onclick="go('#/finance/purchases/statements/${s.id}')">
        <td data-l="Supplier" class="d"><b>${escapeHtml(s.supplier_name)}</b>${s.file_name?`<div class="fininv-addr">${escapeHtml(s.file_name)}</div>`:''}</td>
        <td data-l="Statement date">${s.statement_date?finDate(s.statement_date):'—'}</td><td data-l="Lines" class="num">${m.n}</td><td data-l="Matched" class="num">${m.ok}</td>
        <td data-l="Not in OpHUB" class="num">${m.miss?`<b class="finbad">${m.miss}</b>`:'0'}</td><td data-l="Balance" class="num">${s.closing_balance!=null?finMoney(s.closing_balance):'—'}</td>
        <td data-l="Status">${s.status==='reconciled'?'<span class="finpill ok">Reconciled</span>':'<span class="finpill warn">To check</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No statements yet — upload one to start.</div>'}</div>`,
    {title:'Purchases', subtitle:'OpHUB Finance · money out', back:finSecBack(), tabs:false});
}

/* ---------- upload ---------- */
window.finStmtUpload = async function(inp){
  const file = inp.files && inp.files[0]; inp.value = ''; if(!file) return;
  if(file.size > 20*1024*1024){ toast('That file is over 20 MB.'); return; }
  toast('Reading the statement…');
  let read = {lines:[], text:''};
  try{ read = /\.pdf$/i.test(file.name) || file.type==='application/pdf' ? await finStmtReadPdf(file) : await finStmtReadSheet(file); }catch(e){ console.warn(e); }
  // guess the supplier: a known supplier name that appears in the text
  const [fin, mat, pis] = await Promise.all([
    dbSelect('fin_suppliers', 'org_id=eq.'+ME.org_id+'&select=name,supplier_id&limit=5000').catch(()=>[]),
    dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name').catch(()=>[]),
    dbSelect('purchase_invoices', 'org_id=eq.'+ME.org_id+'&select=supplier_name&limit=5000').catch(()=>[]),
  ]);
  const names = Array.from(new Set([].concat(fin.map(f=>f.name), mat.map(m=>m.name), pis.map(p=>p.supplier_name)).filter(Boolean).map(s=>String(s).trim()))).sort((a,b)=>a.localeCompare(b));
  const low = read.text.toLowerCase();
  const guess = names.filter(n=>n.length>2 && low.includes(n.toLowerCase())).sort((a,b)=>b.length-a.length)[0] || '';
  const dates = read.lines.map(l=>l.date).filter(Boolean).sort();
  const balM = read.text.match(/(?:balance\s*(?:due|outstanding)?|amount\s*due|total\s*due)[^\d£\-]{0,20}(-?£?\s?\d{1,3}(?:,\d{3})*\.\d{2})/i);
  finStmtNew = {file, lines:read.lines, names, mat};
  let ov = document.getElementById('finStmtOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finStmtOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>New statement</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">${escapeHtml(file.name)} · ${read.lines.length ? `<b>${read.lines.length} line${read.lines.length===1?'':'s'} read</b>` : 'no lines could be read — you can add them by hand on the next page'}.</p>
    <div class="formfield"><label class="field-label">Supplier *</label><input type="text" id="finStmtSup" list="finStmtSupList" value="${escapeHtml(guess)}" placeholder="Start typing…"><datalist id="finStmtSupList">${names.map(n=>`<option value="${escapeHtml(n)}">`).join('')}</datalist></div>
    <div class="fingrid2"><div class="formfield"><label class="field-label">Statement date</label><input type="date" id="finStmtDate" value="${dates.length?dates[dates.length-1]:finToday()}"></div>
    <div class="formfield"><label class="field-label">Balance on statement £</label><input type="text" inputmode="decimal" data-money id="finStmtBal" value="${balM?Math.abs(finAmt(balM[1])):''}"></div></div>
    <button class="darkbtn" id="finStmtGo" onclick="finStmtCreate()">Match the invoices</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finStmtOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
let finStmtNew = null;
window.finStmtCreate = async function(){
  const N = finStmtNew; if(!N) return;
  const sup = finVal('finStmtSup'); if(!sup){ toast('Enter the supplier.'); return; }
  const btn = document.getElementById('finStmtGo'); if(btn){ btn.disabled = true; btn.textContent = 'Matching…'; }
  const safe = N.file.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80);
  const stored = await uploadToStorage('finance-docs', ME.org_id+'/statements/'+uid()+'-'+safe, N.file, N.file.type||'application/octet-stream');
  const cands = await finStmtCands(sup);
  const lines = finStmtAutoMatch(N.lines.map(l=>Object.assign({id:uid()}, l)), cands);
  const m = N.mat.find(x=>finSupK(x.name)===finSupK(sup));
  const bal = finNum(finVal('finStmtBal'));
  const ins = await dbInsert('fin_statements', {org_id:ME.org_id, created_by:ME.id, supplier_name:sup, supplier_id:m?m.id:null, statement_date:finVal('finStmtDate')||null,
    closing_balance:(bal===null||isNaN(bal))?null:bal, lines, file_path:stored||null, file_name:N.file.name});
  const rec = ins && ins[0];
  if(!rec){ if(btn){ btn.disabled = false; btn.textContent = 'Match the invoices'; } return; }
  document.getElementById('finStmtOverlay').style.display = 'none'; finStmtNew = null;
  const ok = lines.filter(l=>l.match).length;
  toast(`${ok} of ${lines.filter(l=>l.type!=='payment').length} lines matched`);
  go('#/finance/purchases/statements/'+rec.id);
};

/* ---------- one statement ---------- */
async function renderFinStatement(id){
  const __gen = RENDER_GEN;
  const rec = (await dbSelect('fin_statements', 'id=eq.'+id))[0];
  if(!rec){ go('#/finance/purchases/statements'); return; }
  const cands = await finStmtCands(rec.supplier_name);
  let fileUrl = '';
  if(rec.file_path && /\.pdf$/i.test(rec.file_name||'')){ try{ fileUrl = await resolveStorageUrl(publicUrl('finance-docs', rec.file_path)); }catch(e){} }
  if(__gen !== RENDER_GEN) return;
  finStmt = {rec, cands};
  const lines = rec.lines || [];
  const st = lines.map(l=>({l, s:finStmtLineState(l, cands)}));
  const cnt = k=>st.filter(x=>x.s.k===k).length;
  const used = new Set(lines.filter(l=>l.match && !l.ignore).map(l=>l.match));
  const upTo = rec.statement_date || '9999-12-31';
  const notOn = cands.filter(c=>!used.has(c.id) && c.status!=='paid' && (!c.date || c.date<=upTo));
  const stmtTot = finRound(lines.filter(l=>!l.ignore).reduce((t,l)=>t+Number(l.amount||0),0));
  const optLbl = c=>`${c.invoice_no||'No number'} · ${c.date?finDate(c.date):''} · ${finMoney(c.total)}${c.kind==='inbox'?' · unallocated':''}`;
  const sel = l=>`<select class="finstmt-sel" onclick="event.stopPropagation()" onchange="finStmtSetMatch('${l.id}',this.value)"><option value="">— not matched —</option>${cands.filter(c=>c.id===l.match || !used.has(c.id)).map(c=>`<option value="${c.id}" ${c.id===l.match?'selected':''}>${escapeHtml(optLbl(c))}</option>`).join('')}</select>`;
  const desk = typeof isDeskMode==='function' && isDeskMode();
  document.getElementById('app').innerHTML = shell(`${finSectionNav('purchases')}${finSubTabs('purchases','statements')}
    <div class="finstmt-top"><button class="linkbtn" onclick="go('#/finance/purchases/statements')">‹ All statements</button>
      <div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="finStmtRematch()">⟳ Match again</button>
      <button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="finStmtAddLine()">+ Add a line</button>
      ${rec.file_path?`<button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="finStmtOpenFile()">Open statement</button>`:''}
      <button class="darkbtn finsmall" style="width:auto;margin:0;" onclick="finStmtReconciled(${rec.status!=='reconciled'})">${rec.status==='reconciled'?'Reopen':'Mark reconciled'}</button></div></div>
    <h3 style="margin:8px 0 2px;">${escapeHtml(rec.supplier_name)} ${rec.status==='reconciled'?'<span class="finpill ok">Reconciled</span>':''}</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">Statement ${rec.statement_date?finDate(rec.statement_date):''}${rec.closing_balance!=null?' · balance '+finMoney(rec.closing_balance):''} · lines add up to ${finMoney(stmtTot)}${rec.closing_balance!=null && Math.abs(stmtTot-rec.closing_balance)>=0.01?` <span class="finbad">(${finMoney(finRound(rec.closing_balance-stmtTot))} different — a line may be missing)</span>`:''}</p>
    <div class="pmchips">${[['ok','Matched'],['diff','£ differs'],['missing','Not in OpHUB'],['payment','Payments']].map(([k,l])=>`<span class="pmchip ${k==='missing'&&cnt(k)?'on':''}" style="cursor:default;">${l} (${cnt(k)})</span>`).join('')}</div>
    <div class="${desk && fileUrl ? 'finstmt-split' : ''}">
      <div>
      <div class="finreptbl-wrap"><table class="fincosttbl fininvtbl finstmt-tbl">
        <thead><tr><th>Date</th><th>Reference</th><th>Type</th><th class="num">Amount</th><th>Matched to</th><th>Check</th><th></th></tr></thead>
        <tbody>${st.length ? st.map(({l,s})=>`<tr class="${l.ignore?'findir-off':''}">
          <td data-l="Date">${l.date?finDate(l.date):'—'}</td>
          <td data-l="Reference" class="d"><b>${escapeHtml(l.ref||'—')}</b>${l.text?`<div class="fininv-addr" title="${escapeHtml(l.text)}">${escapeHtml(l.text.slice(0,60))}</div>`:''}</td>
          <td data-l="Type"><select class="finstmt-sel" onchange="finStmtSet('${l.id}','type',this.value)">${Object.keys(FIN_STMT_TYPES).map(k=>`<option value="${k}" ${l.type===k?'selected':''}>${FIN_STMT_TYPES[k]}</option>`).join('')}</select></td>
          <td data-l="Amount" class="num">${finMoney(l.amount)}</td>
          <td data-l="Matched to">${l.type==='payment'||l.ignore ? '—' : sel(l)}</td>
          <td data-l="Check">${s.pill}</td>
          <td data-l=""><button class="linkbtn" onclick="finStmtSet('${l.id}','ignore',${!l.ignore})">${l.ignore?'Use':'Ignore'}</button></td></tr>`).join('') : '<tr><td colspan="7"><div class="empty">No lines yet — use “+ Add a line”.</div></td></tr>'}</tbody></table></div>
      <p class="sectiontitle" style="margin:16px 0 6px;">Invoices we hold that aren’t on this statement (${notOn.length})</p>
      ${notOn.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr><th>Invoice no.</th><th>Date</th><th class="num">Total</th><th>Status</th><th>Match to a line</th></tr></thead>
        <tbody>${notOn.map(c=>`<tr><td data-l="Invoice no." class="d"><b>${escapeHtml(c.invoice_no||'—')}</b></td><td data-l="Date">${c.date?finDate(c.date):'—'}</td><td data-l="Total" class="num">${finMoney(c.total)}</td>
          <td data-l="Status">${c.kind==='inbox'?'<span class="finpill blue">Unallocated</span>':escapeHtml(c.status==='approved'?'Approved, not paid':c.status==='to_approve'?'To approve':c.status||'')}</td>
          <td data-l="Match to a line"><select class="finstmt-sel" onchange="finStmtSetMatch(this.value,'${c.id}')"><option value="">Choose a line…</option>${lines.filter(l=>!l.match && !l.ignore && l.type!=='payment').map(l=>`<option value="${l.id}">${escapeHtml((l.ref||'No ref')+' · '+(l.date?finDate(l.date):'')+' · '+finMoney(l.amount))}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="stub" style="margin:0;">None — every unpaid invoice up to the statement date is on it.</p>'}
      </div>
      ${desk && fileUrl ? `<div class="finstmt-pdf"><iframe src="${escapeHtml(fileUrl)}" title="Statement"></iframe></div>` : ''}
    </div>`,
    {title:'Statement', subtitle:'Purchases · reconciliation', back:'#/finance/purchases/statements', tabs:false});
}
async function finStmtSave(patch){
  const r = finStmt.rec;
  const row = await dbUpdate('fin_statements', r.id, Object.assign({lines:r.lines, updated_at:new Date().toISOString()}, patch||{}));
  if(row){ finStmt.rec = row; render(); }
}
window.finStmtSetMatch = function(lineId, candId){
  const L = finStmt.rec.lines.find(l=>l.id===lineId); if(!L) return;
  finStmt.rec.lines.forEach(l=>{ if(candId && l.match===candId && l.id!==lineId){ l.match = null; l.how = null; } });
  L.match = candId || null; L.how = 'manual';
  finStmtSave();
};
window.finStmtSet = function(lineId, k, v){
  const L = finStmt.rec.lines.find(l=>l.id===lineId); if(!L) return;
  L[k] = v;
  if(k==='type' && (v==='credit' || v==='payment')) L.amount = -Math.abs(Number(L.amount||0));
  if(k==='type' && v==='invoice') L.amount = Math.abs(Number(L.amount||0));
  if(k==='type' && v==='payment'){ L.match = null; L.how = null; }
  finStmtSave();
};
window.finStmtRematch = function(){
  finStmtAutoMatch(finStmt.rec.lines, finStmt.cands);
  toast('Matched again — your own matches were kept'); finStmtSave();
};
window.finStmtAddLine = async function(){
  const ref = await customPrompt('Reference / invoice number on the statement:', ''); if(ref===null) return;
  const amt = await customPrompt('Amount £ (use a minus for a credit or payment):', ''); if(amt===null) return;
  const n = finAmt(amt); if(n===null){ toast('Enter the amount as a number.'); return; }
  const dt = await customPrompt('Date (dd/mm/yyyy):', finDate(finStmt.rec.statement_date||finToday()));
  const line = {id:uid(), ref:String(ref).trim(), amount:finRound(n), date:finStmtDate(dt)||null, type:n<0?'credit':'invoice', text:'Added by hand'};
  finStmt.rec.lines = (finStmt.rec.lines||[]).concat([line]);
  finStmtAutoMatch(finStmt.rec.lines, finStmt.cands); finStmtSave();
};
window.finStmtOpenFile = async function(){
  const r = finStmt.rec; if(!r.file_path) return;
  const url = await resolveStorageUrl(publicUrl('finance-docs', r.file_path));
  if(url) window.open(url, '_blank', 'noopener');
};
window.finStmtReconciled = async function(on){
  if(on){
    const miss = finStmt.rec.lines.filter(l=>!l.ignore && l.type!=='payment' && !l.match).length;
    if(miss && !(await customConfirm(miss+' line'+(miss===1?' isn’t':'s aren’t')+' matched to an invoice. Mark the statement reconciled anyway?'))) return;
  }
  finStmtSave(on ? {status:'reconciled', reconciled_at:new Date().toISOString(), reconciled_by:ME.id} : {status:'open', reconciled_at:null, reconciled_by:null});
  toast(on ? 'Statement reconciled' : 'Reopened');
};

(function(){
  const css = `.finstmt-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 4px;}
  .finstmt-sel{font-size:12.5px;padding:5px 8px;border-radius:7px;border:1px solid var(--line);background:#fff;max-width:260px;width:100%;}
  .finstmt-tbl td{vertical-align:middle;}
  .finstmt-split{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px;align-items:start;}
  .finstmt-pdf{position:sticky;top:10px;height:calc(100vh - 140px);border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;}
  .finstmt-pdf iframe{width:100%;height:100%;border:0;}
  .finpill.bad{background:#fdecec;color:#b42318;}
  @media (max-width:1100px){ .finstmt-split{display:block;} .finstmt-pdf{display:none;} }`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
})();
