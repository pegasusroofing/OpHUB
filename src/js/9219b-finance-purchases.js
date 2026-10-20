/* ============================================================
   OpHUB Finance — Purchases as row tables, and the supplier invoice inbox
   working like Coreloops:
     email in → read → if we can tell the job (our PO number, the job
     number, the site postcode or address) it's filed to the job by itself
     → otherwise it sits in "Needs a job" (a query). From there you either
     allocate it to a job yourself, or send it to a PM who books it to one
     of their jobs (or replies with a comment). Everything is in one
     "Supplier invoices" list with filters.
   ============================================================ */
const FIN_PC_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi;
function finPcNorm(s){ return String(s||'').toUpperCase().replace(/\s+/g,''); }
// Work out the job from what was read. Returns {site_id, po_id, how} or {}.
function finInboxMatchJob(text, ex, ctx){
  const flat = String(text||'').replace(/\s+/g,' ');
  const low = flat.toLowerCase();
  if(ex.po_id && ex.site_id) return {site_id:ex.site_id, po_id:ex.po_id, how:'our PO number '+ex.po_number};
  const sites = (ctx.sites||[]).filter(s=>finSiteStatus(s)!=='closed');
  // job number
  const byNo = sites.filter(s=>s.job_number && String(s.job_number).length>=3 && new RegExp('\\b'+String(s.job_number).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(flat));
  if(byNo.length===1) return {site_id:byNo[0].id, how:'job number '+byNo[0].job_number};
  // postcode (delivery / site address)
  const pcs = new Set(); let m; FIN_PC_RE.lastIndex = 0; while((m = FIN_PC_RE.exec(flat))) pcs.add(finPcNorm(m[1]+m[2]));
  const byPc = sites.filter(s=>s.postcode && pcs.has(finPcNorm(s.postcode)));
  if(byPc.length===1) return {site_id:byPc[0].id, how:'site postcode '+byPc[0].postcode};
  // first line of the site address, or the job name
  const line1 = s=>String(s.address||'').split(/,|\n/)[0].trim().toLowerCase();
  const byAddr = sites.filter(s=>(line1(s).length>6 && low.includes(line1(s))) || (s.name && s.name.length>6 && low.includes(s.name.toLowerCase())));
  if(byAddr.length===1) return {site_id:byAddr[0].id, how:'site address'};
  const many = Array.from(new Set(byNo.concat(byPc, byAddr))); if(many.length>1) return {why:'Could be '+many.slice(0,3).map(s=>(s.job_number?s.job_number+' ':'')+s.name).join(' or ')+' — choose which'};
  return {why:'Couldn’t find a PO, job number or site address on it'};
}
// Read new inbox items and file the ones we can place. Runs quietly whenever Finance opens.
let finInboxBusy = false;
async function finInboxAutoProcess(){
  if(finInboxBusy) return false;
  finInboxBusy = true;
  let changed = false;
  try{
    const items = await dbSelect('fin_inbox', 'org_id=eq.'+ME.org_id+'&status=eq.new&extracted=is.null&order=received_at.asc&limit=25');
    if(!items.length) return false;
    const [pos, suppliers] = await Promise.all([
      dbSelect('purchase_orders', 'org_id=eq.'+ME.org_id+'&status=neq.cancelled&select=id,number,site_id,supplier_name,supplier_id,value,material_ids'),
      dbSelect('suppliers', 'select=id,name'),
    ]);
    const ctx = {pos, suppliers, sites:SITES};
    for(const it of items){
      let ex = {}, text = '';
      if(/pdf/i.test(it.content_type||'') || /\.pdf$/i.test(it.file_name||'')){
        try{ const url = await resolveStorageUrl(publicUrl('finance-docs', it.file_path)); text = await finPdfText(url); ex = finReadInvoiceText(text, ctx); ex.read = !!text.trim(); }catch(e){ ex = {read:false}; }
      } else ex = {read:false, photo:true};
      const job = ex.read ? finInboxMatchJob(text, ex, ctx) : {why:ex.photo ? 'It’s a photo — type the figures in' : 'Couldn’t read this PDF — type the figures in'};
      if(job.site_id){ ex.site_id = job.site_id; ex.match = job.how; if(job.po_id) ex.po_id = job.po_id; }
      const figs = ex.net!=null || ex.total!=null;
      const patch = {extracted:ex, site_id:ex.site_id||null, po_id:ex.po_id||null};
      if(job.site_id && figs && ex.supplier){
        await dbUpdate('fin_inbox', it.id, patch);
        const r = await finInboxFileCore(Object.assign({}, it, patch), {site_id:ex.site_id, po_id:ex.po_id||'', supplier:ex.supplier, invoice_no:ex.invoice_no||'', date:ex.date||'', net:ex.net, vat:ex.vat, total:ex.total}, true);
        if(r) await dbUpdate('fin_inbox', it.id, {auto_filed:true, stage:'auto', comments:[{name:'OpHUB', at:new Date().toISOString(), text:'Read and filed to the job automatically ('+job.how+').'}]});
      } else {
        patch.stage = 'query';
        patch.query_reason = job.site_id ? (!figs ? 'Couldn’t read the amounts' : 'Couldn’t tell the supplier') : job.why;
        await dbUpdate('fin_inbox', it.id, patch);
      }
      changed = true;
    }
  }catch(e){ console.error('inbox', e); }
  finally{ finInboxBusy = false; }
  return changed;
}
// File an inbox item as a supplier invoice on a job. f = {site_id, po_id, supplier, invoice_no, date, net, vat, total}. Returns the new purchase invoice or null.
async function finInboxFileCore(it, f, quiet){
  let net = f.net==null || f.net==='' ? null : Number(f.net), vat = f.vat==null || f.vat==='' ? null : Number(f.vat), total = f.total==null || f.total==='' ? null : Number(f.total);
  if((net===null || isNaN(net)) && total!==null && !isNaN(total)){ net = finRound(total/1.2); vat = finRound(total-net); }
  if(net===null || isNaN(net)){ if(!quiet) toast('Enter the net amount (or the total).'); return null; }
  if(vat===null || isNaN(vat)) vat = 0;
  if(total===null || isNaN(total)) total = finRound(net+vat);
  const flags = [];
  if(f.invoice_no){
    const dup = await dbSelect('purchase_invoices', 'invoice_no=eq.'+encodeURIComponent(f.invoice_no)+'&select=id,supplier_name');
    if(dup.some(d=>String(d.supplier_name||'').trim().toLowerCase()===String(f.supplier||'').toLowerCase())) flags.push('possible duplicate of an invoice already entered');
  }
  let po = null;
  if(f.po_id){
    po = (await dbSelect('purchase_orders', 'id=eq.'+f.po_id))[0];
    if(po){
      const others = await dbSelect('purchase_invoices', 'po_id=eq.'+f.po_id+'&status=neq.rejected&select=net');
      const sofar = others.reduce((t,i)=>t+Number(i.net||0), 0) + net;
      if(po.value!=null && sofar > Number(po.value)+0.005) flags.push(finMoney(sofar-Number(po.value))+' over the PO value of '+finMoney(po.value));
    }
  }
  const pi = await dbInsert('purchase_invoices', {org_id:ME.org_id, site_id:f.site_id, po_id:f.po_id||null, no_po:!f.po_id, kind:'invoice', supplier_id:po?po.supplier_id:null, supplier_name:f.supplier||'Supplier',
    invoice_no:f.invoice_no||null, invoice_date:f.date||finToday(), net:finRound(net), vat:finRound(vat), total:finRound(total), status: flags.length ? 'query' : 'to_approve', query_note: flags.length ? flags.join('; ') : null,
    file_path:it.file_path, file_name:it.file_name, created_by:ME.id});
  if(!pi || !pi[0]) return null;
  await dbUpdate('fin_inbox', it.id, {status:'filed', site_id:f.site_id, po_id:f.po_id||null, purchase_invoice_id:pi[0].id});
  if(typeof finCheckInvoiceLines==='function') finCheckInvoiceLines(pi[0].id).catch(()=>null);
  return pi[0];
}

/* ---------- Purchases section ---------- */
let finPiF = 'approve', finPoF = 'open', finPiPicked = false;
async function renderFinPurchases(sub){
  if(!finGuard()) return;
  if(sub==='pricebook' && typeof renderFinPriceBook==='function') return renderFinPriceBook();
  if(sub==='inbox'){ finPiF = 'job'; sub = 'invoices'; }
  sub = ['orders','invoices','plant','suppliers'].includes(sub) ? sub : 'orders';
  const __gen = RENDER_GEN;
  finInboxAutoProcess().then(ch=>{ if(ch && __gen===RENDER_GEN) render(); });
  const [pinvs, pos, inbox, hires, suppliers] = await Promise.all([
    dbSelect('purchase_invoices', 'org_id=eq.'+ME.org_id+'&order=invoice_date.desc&limit=5000'),
    dbSelect('purchase_orders', 'org_id=eq.'+ME.org_id+'&order=created_at.desc&limit=5000'),
    dbSelect('fin_inbox', 'org_id=eq.'+ME.org_id+'&status=eq.new&order=received_at.desc&limit=300'),
    dbSelect('fin_plant_hires', 'org_id=eq.'+ME.org_id+'&order=on_hire.desc&limit=2000'),
    sub==='suppliers' ? dbSelect('suppliers', 'select=id,name,email&order=name.asc') : Promise.resolve([]),
  ]);
  if(__gen !== RENDER_GEN) return;
  await loadAllProfiles();
  const live = pinvs.filter(i=>i.status!=='rejected');
  const needJob = inbox.filter(i=>i.extracted && i.stage!=='with_pm'), withPm = inbox.filter(i=>i.stage==='with_pm'), reading = inbox.filter(i=>!i.extracted);
  const toApprove = pinvs.filter(i=>['to_approve','query'].includes(i.status));
  const unpaid = pinvs.filter(i=>i.status==='approved' && !i.paid_on);
  const openPos = pos.filter(p=>p.status==='open');
  const committed = finRound(openPos.filter(p=>p.value!=null).reduce((t,p)=>t+Math.max(0, Number(p.value)-finPoInvoiced(p, live)),0));
  const onHire = hires.filter(h=>!h.off_hire);
  const supKey = n=>String(n||'').trim().toLowerCase();
  const supNames = {}; [].concat(pos, pinvs, hires).forEach(x=>{ const n = String(x.supplier_name||'').trim(); if(n && !/^Emailed to /.test(n)) supNames[supKey(n)] = supNames[supKey(n)] || n; });
  const jobIds = Array.from(new Set([].concat(pos, pinvs, hires).map(x=>x.site_id).filter(Boolean)));
  const fOK = x=>(!finPurSup || supKey(x.supplier_name)===finPurSup) && (!finPurJob || x.site_id===finPurJob);
  const filtBar = ()=>`<div class="finjobfilt">
    <label>Supplier<select onchange="finPurSup=this.value;render()"><option value="">All suppliers</option>${Object.keys(supNames).sort().map(k=>`<option value="${escapeHtml(k)}" ${finPurSup===k?'selected':''}>${escapeHtml(supNames[k])}</option>`).join('')}</select></label>
    <label>Project<select onchange="finPurJob=this.value;render()"><option value="">All projects</option>${jobIds.map(id=>[id, finJobTag(id)]).sort((a,b)=>a[1].localeCompare(b[1], undefined, {numeric:true})).map(([id,t])=>`<option value="${id}" ${finPurJob===id?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select></label>
    <label>Sort<select onchange="finPurSort=this.value;render()">${[['new','Newest first'],['old','Oldest first'],['big','Biggest first'],['sup','Supplier A–Z']].map(([k,l])=>`<option value="${k}" ${finPurSort===k?'selected':''}>${l}</option>`).join('')}</select></label>
    ${finPurSup||finPurJob ? `<button type="button" class="linkbtn" onclick="finPurSup='';finPurJob='';render()">Clear</button>` : ''}
  </div>`;
  const sortBy = (list, dateK, valK)=>{ const c = {new:(a,b)=>String(b[dateK]||'').localeCompare(String(a[dateK]||'')), old:(a,b)=>String(a[dateK]||'').localeCompare(String(b[dateK]||'')), big:(a,b)=>Number(b[valK]||0)-Number(a[valK]||0), sup:(a,b)=>String(a.supplier_name||'').localeCompare(String(b.supplier_name||''))}[finPurSort]; return c ? list.slice().sort(c) : list; };
  let body = '';
  if(sub==='orders'){
    const F = {open:p=>p.status==='open', invoiced:p=>p.status==='invoiced', cancelled:p=>p.status==='cancelled', all:()=>true};
    if(!F[finPoF]) finPoF = 'open';
    const list = sortBy(pos.filter(F[finPoF]).filter(fOK), 'created_at', 'value');
    body = finSecHead('Purchase orders', '+ New PO', "finPickJob('New purchase order','openFinNewPo')")
      + `<div class="pmchips">${[['open','Open'],['invoiced','Invoiced'],['cancelled','Cancelled'],['all','All']].map(([k,l])=>finChip(finPoF===k, l, pos.filter(F[k]).filter(fOK).length, `finPoF='${k}';render()`)).join('')}</div>`
      + filtBar() + finSearchHtml('Search PO, supplier or project', 'finPurList')
      + `<div id="finPurList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
        <thead><tr><th>PO</th><th>Supplier</th><th>Project</th><th>Date</th><th class="num">Value</th><th class="num">Invoiced</th><th class="num">Left to invoice</th><th>Status</th></tr></thead>
        <tbody>${list.map(p=>{ const inv = finPoInvoiced(p, live); const left = p.value!=null ? Math.max(0, finRound(Number(p.value)-inv)) : null; return `<tr class="click" data-lf="${lfText([p.number, p.supplier_name, finJobTag(p.site_id)].join(' '))}" onclick="go('#/site/${p.site_id}/finance/po/${p.id}')">
          <td data-l="PO" class="d"><b>${escapeHtml(p.number)}</b></td><td data-l="Supplier">${escapeHtml(p.supplier_name||'—')}</td><td data-l="Project">${escapeHtml(finJobTag(p.site_id))}</td>
          <td data-l="Date">${finDate(String(p.issue_date||p.created_at||'').slice(0,10))}</td>
          <td data-l="Value" class="num">${p.value!=null?finMoney(p.value):'<span class="stub" style="margin:0;">No value</span>'}</td><td data-l="Invoiced" class="num">${finMoney(inv)}</td>
          <td data-l="Left to invoice" class="num">${left!=null && p.status==='open'?finMoney(left):'—'}</td><td data-l="Status">${finPoPill(p)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No purchase orders here.</div>'}</div>`
      + `<p class="stub" style="margin:8px 0 0;font-style:normal;">${openPos.length} open · ${finMoney(committed, 0)} ordered but not invoiced yet. Orders sent from a project’s Materials tile appear here by themselves.</p>`;
  } else if(sub==='invoices'){
    const F = {job:null, pm:null, approve:i=>['to_approve','query'].includes(i.status), unpaid:i=>i.status==='approved' && !i.paid_on, paid:i=>!!i.paid_on, all:()=>true};
    if(!(finPiF in F)) finPiF = 'approve';
    if(!finPiPicked){ const cnt = {job:needJob.length, pm:withPm.length, approve:toApprove.length, unpaid:unpaid.length}; if(!cnt[finPiF]) finPiF = ['job','approve','pm','unpaid'].find(k=>cnt[k]) || 'all'; }
    const chips = [['job','Needs a job', needJob.length],['pm','With a PM', withPm.length],['approve','To approve', toApprove.length],['unpaid','Approved, not paid', unpaid.length],['paid','Paid', pinvs.filter(F.paid).length],['all','All filed', pinvs.length]];
    body = finSecHead('Supplier invoices', '+ Add invoices', "document.getElementById('finInboxUpload').click()")
      + `<input type="file" id="finInboxUpload" multiple accept="application/pdf,image/*" style="display:none;" onchange="finInboxUpload(this.files)">`
      + `<p class="stub" style="margin:-4px 0 10px;">Supplier invoices emailed to your invoice address (or added here) are read for you. If we can tell the job — from our PO number, the job number, or the site postcode or address — they’re filed to it. If not, they wait in <b>Needs a job</b>: allocate it yourself or send it to a PM.${reading.length?` <b>Reading ${reading.length} now…</b>`:''}</p>`
      + `<div class="pmchips">${chips.map(([k,l,n])=>finChip(finPiF===k, l, n, `finPiF='${k}';finPiPicked=true;render()`)).join('')}</div>`;
    if(finPiF==='job' || finPiF==='pm'){
      const list = finPiF==='job' ? needJob : withPm;
      body += finSearchHtml('Search supplier, email or invoice no.', 'finPurList')
        + `<div id="finPurList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
          <thead><tr><th>Supplier</th><th>Invoice no.</th><th>Received</th><th class="num">Total</th><th>${finPiF==='job'?'Why it needs a job':'Sent to'}</th><th></th></tr></thead>
          <tbody>${list.map(it=>{ const ex = it.extracted||{}; const last = (it.comments||[]).slice(-1)[0]; return `<tr class="click" data-lf="${lfText([ex.supplier, it.from_email, ex.invoice_no, it.subject].join(' '))}" onclick="openFinInboxItem('${it.id}')">
            <td data-l="Supplier" class="d"><b>${escapeHtml(ex.supplier||it.from_email||'Supplier invoice')}</b></td>
            <td data-l="Invoice no.">${escapeHtml(ex.invoice_no||'—')}</td>
            <td data-l="Received">${finDate(String(it.received_at).slice(0,10))}</td>
            <td data-l="Total" class="num">${ex.total!=null?finMoney(ex.total):'—'}</td>
            <td data-l="${finPiF==='job'?'Why':'Sent to'}">${finPiF==='job' ? `${it.stage==='pm_replied'?'<span class="finpill blue">PM replied</span> ':''}<span class="fininv-addr" style="font-size:12.5px;">${escapeHtml(it.stage==='pm_replied' && last ? last.name+': '+last.text : (it.query_reason||'Check it'))}</span>` : `${escapeHtml(((PROFILES[it.assigned_pm]||{}).name)||'PM')}<div class="fininv-addr">${it.assigned_at?finDate(String(it.assigned_at).slice(0,10)):''}</div>`}</td>
            <td data-l=""><button class="ghostbtn finsmall" onclick="event.stopPropagation();openFinInboxItem('${it.id}')">${finPiF==='job'?'Allocate':'Open'}</button></td></tr>`; }).join('')}</tbody></table></div>` : `<div class="empty">${finPiF==='job' ? 'Nothing waiting — everything that came in was filed to a job.' : 'Nothing with a PM.'}</div>`}</div>`;
    } else {
      const list = sortBy(pinvs.filter(F[finPiF]).filter(fOK), 'invoice_date', 'total');
      body += filtBar() + finSearchHtml('Search supplier, invoice no. or project', 'finPurList')
        + `<div id="finPurList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
          <thead><tr><th>Supplier</th><th>Invoice no.</th><th>Project</th><th>Date</th><th class="num">Net</th><th class="num">VAT</th><th class="num">Gross</th><th>PO</th><th>Status</th></tr></thead>
          <tbody>${list.map(i=>{ const po = pos.find(p=>p.id===i.po_id); return `<tr class="click" data-lf="${lfText([i.supplier_name, i.invoice_no, finJobTag(i.site_id), po?po.number:''].join(' '))}" onclick="openPurchaseInvoiceView('${i.site_id}','${i.id}')">
            <td data-l="Supplier" class="d"><b>${escapeHtml(i.supplier_name||'Supplier')}</b>${i.query_note?`<div class="fininv-addr finbad">${escapeHtml(i.query_note.slice(0,70))}</div>`:''}</td>
            <td data-l="Invoice no.">${escapeHtml(i.invoice_no||'—')}</td><td data-l="Project">${escapeHtml(finJobTag(i.site_id))}</td><td data-l="Date">${finDate(i.invoice_date)}</td>
            <td data-l="Net" class="num">${finMoney(i.net)}</td><td data-l="VAT" class="num">${finMoney(i.vat)}</td><td data-l="Gross" class="num"><b>${finMoney(i.total)}</b></td>
            <td data-l="PO">${po?escapeHtml(po.number):'<span class="stub" style="margin:0;">No PO</span>'}</td>
            <td data-l="Status">${i.paid_on?'<span class="finpill ok">Paid</span>':finPiPill(i)} ${typeof finInvXeroTag==='function' && i.status==='approved' ? finInvXeroTag(Object.assign({}, i, {status:'issued'})) : ''}</td></tr>`; }).join('')}</tbody>
          ${list.length>1?`<tfoot><tr><td class="d" colspan="4">Total (${list.length})</td><td class="num">${finMoney(list.reduce((t,i)=>t+Number(i.net||0),0))}</td><td class="num">${finMoney(list.reduce((t,i)=>t+Number(i.vat||0),0))}</td><td class="num">${finMoney(list.reduce((t,i)=>t+Number(i.total||0),0))}</td><td colspan="2"></td></tr></tfoot>`:''}</table></div>` : '<div class="empty">No supplier invoices here.</div>'}</div>`
        + `<p class="stub" style="margin:8px 0 0;"><button class="linkbtn" onclick="finPickJob('Add a supplier invoice by hand','openPurchaseInvoiceForm')">Type one in by hand instead</button></p>`;
    }
  } else if(sub==='plant'){
    const list = sortBy(hires.filter(fOK), 'on_hire', 'rate');
    body = finSecHead('Plant hire', '+ Plant hire', "finPickJob('Add plant hire','openFinPlantForm')") + filtBar()
      + `<div id="finPurList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr><th>Item</th><th>Supplier</th><th>Project</th><th>On hire</th><th>Off hire</th><th class="num">Cost so far</th><th>Status</th></tr></thead>
        <tbody>${list.map(h=>{ const c = finPlantCost(h); const long = !h.off_hire && c.days>28; return `<tr class="click" onclick="openFinPlantForm('${h.site_id}','${h.id}')"><td data-l="Item" class="d"><b>${escapeHtml(h.item)}</b></td><td data-l="Supplier">${escapeHtml(h.supplier_name||'—')}</td><td data-l="Project">${escapeHtml(finJobTag(h.site_id))}</td><td data-l="On hire">${finDate(h.on_hire)}</td><td data-l="Off hire">${h.off_hire?finDate(h.off_hire):'—'}</td><td data-l="Cost so far" class="num">${finMoney(c.cost)}</td><td data-l="Status">${h.off_hire?'<span class="finpill grey">Off hire</span>':`<span class="finpill ${long?'bad':'ok'}">On hire ${c.weeks} wk</span>`}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No plant hire.</div>'}</div>`
      + `<p class="stub" style="margin:8px 0 0;font-style:normal;">${onHire.length} on hire · ${finMoney(onHire.reduce((t,h)=>t+finPlantCost(h).cost,0), 0)} so far. Tap one to off-hire it.</p>`;
  } else {
    const by = {}; suppliers.forEach(s=>{ by[s.name] = {name:s.name, email:s.email||'', spend:0, owed:0, n:0}; });
    live.forEach(i=>{ const k = i.supplier_name||'Unknown'; const r = by[k] = by[k] || {name:k, email:'', spend:0, owed:0, n:0}; r.n++; if(i.status==='approved') r.spend += Number(i.net||0); if(i.status==='approved' && !i.paid_on) r.owed += Number(i.total||0); });
    const list = Object.values(by).sort((a,b)=>b.spend-a.spend || a.name.localeCompare(b.name));
    body = finSecHead('Suppliers', isFullManager(ME) ? 'Edit suppliers' : '', "go('#/suppliers')") + finSearchHtml('Search suppliers', 'finPurList')
      + `<div id="finPurList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr><th>Supplier</th><th>Email</th><th class="num">Invoices</th><th class="num">Spent (net)</th><th class="num">To pay</th></tr></thead>
        <tbody>${list.map(r=>`<tr data-lf="${lfText([r.name, r.email].join(' '))}"><td data-l="Supplier" class="d"><b>${escapeHtml(r.name)}</b></td><td data-l="Email">${escapeHtml(r.email||'—')}</td><td data-l="Invoices" class="num">${r.n}</td><td data-l="Spent" class="num">${finMoney(r.spend)}</td><td data-l="To pay" class="num">${r.owed?finMoney(r.owed):'—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No suppliers yet.</div>'}</div>`;
  }
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('purchases')}
    <div class="pmstats finstats">
      <div class="pmstat" onclick="finPiF='job';go('#/finance/purchases/invoices')"><b>${needJob.length}</b><span>Invoices that need a job</span></div>
      <div class="pmstat" onclick="finPiF='unpaid';go('#/finance/purchases/invoices')"><b>${finMoney(unpaid.reduce((t,i)=>t+Number(i.total||0),0), 0)}</b><span>To pay suppliers (incl. VAT)</span></div>
      <div class="pmstat" onclick="finPiF='approve';go('#/finance/purchases/invoices')"><b>${toApprove.length}</b><span>To approve</span></div>
      <div class="pmstat" onclick="finPoF='open';go('#/finance/purchases/orders')"><b>${finMoney(committed, 0)}</b><span>Ordered, not invoiced</span></div>
    </div>
    ${finSubTabs('purchases', sub, {invoices:needJob.length+toApprove.length})}
    ${body}
  `, {title:'Purchases', subtitle:'OpHUB Finance · money out', back:finSecBack(), tabs:false});
}
let finPurSort = 'new';

/* ---------- one inbox item: allocate, send to a PM, or ignore ---------- */
window.openFinInboxItem = async function(id){
  const it = (await dbSelect('fin_inbox', 'id=eq.'+id))[0]; if(!it) return;
  const pos = await dbSelect('purchase_orders', 'org_id=eq.'+ME.org_id+'&status=eq.open&select=id,number,site_id,supplier_name');
  await loadAllProfiles();
  const ex = it.extracted || {};
  const v = x=>x==null ? '' : escapeHtml(String(x));
  const sites = SITES.filter(s=>finSiteStatus(s)!=='closed').sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
  const pms = Object.values(PROFILES).filter(p=>isFullManager(p) && p.org_id===ME.org_id).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  window.__finInbPos = pos;
  let ov = document.getElementById('finInbOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finInbOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card fininbmodal" id="finInb-${it.id}">
    <h3>${escapeHtml(ex.supplier || it.from_email || 'Supplier invoice')}</h3>
    <p class="stub" style="margin:0 0 8px;font-style:normal;">${it.source==='email' ? 'Emailed'+(it.from_email?' by '+escapeHtml(it.from_email):'') : 'Added'} ${finDate(String(it.received_at).slice(0,10))}${it.subject?' · '+escapeHtml(it.subject):''}</p>
    <button class="ghostbtn" style="width:100%;margin-bottom:10px;" onclick="openFinDoc('${jsAttr(it.file_path)}','${jsAttr(it.file_name||'')}')">View the invoice</button>
    ${it.query_reason && it.status==='new' ? `<p class="finrun-warn" style="margin:0 0 10px;">${escapeHtml(it.query_reason)}</p>` : ''}
    ${(it.comments||[]).length ? `<div class="fincomments">${it.comments.map(c=>`<div><b>${escapeHtml(c.name||'')}</b> <span>${c.at?finDate(String(c.at).slice(0,10)):''}</span><p>${escapeHtml(c.text||'')}</p></div>`).join('')}</div>` : ''}
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Supplier</label><input type="text" data-k="supplier" value="${v(ex.supplier)}"></div>
      <div class="formfield"><label class="field-label">Invoice no.</label><input type="text" data-k="invoice_no" value="${v(ex.invoice_no)}"></div>
      <div class="formfield"><label class="field-label">Invoice date</label><input type="date" data-k="date" value="${v(ex.date)}"></div>
      <div class="formfield"><label class="field-label">Total £ (incl. VAT)</label><input type="text" inputmode="decimal" data-money data-k="total" value="${v(ex.total)}"></div>
      <div class="formfield"><label class="field-label">Net £</label><input type="text" inputmode="decimal" data-money data-k="net" value="${v(ex.net)}"></div>
      <div class="formfield"><label class="field-label">VAT £</label><input type="text" inputmode="decimal" data-money data-k="vat" value="${v(ex.vat)}"></div>
    </div>
    <div class="fininb-split">
      <div class="fininb-opt">
        <p class="sectiontitle" style="margin:0 0 6px;">Allocate it yourself</p>
        <div class="formfield"><label class="field-label">Job</label><select data-k="site_id" onchange="finInbPosFor(this.value)"><option value="">Choose the job…</option>${sites.map(s=>`<option value="${s.id}" ${it.site_id===s.id?'selected':''}>${escapeHtml((s.job_number?s.job_number+' · ':'')+s.name)}</option>`).join('')}</select></div>
        <div class="formfield"><label class="field-label">Our PO (if there is one)</label><select data-k="po_id" id="finInbPo">${finInbPoOpts(it.site_id, it.po_id)}</select></div>
        <button class="darkbtn" style="width:100%;" onclick="finInboxFileFromModal('${it.id}')">File to job</button>
      </div>
      <div class="fininb-opt">
        <p class="sectiontitle" style="margin:0 0 6px;">Or send it to a PM</p>
        <div class="formfield"><label class="field-label">PM</label><select id="finInbPm"><option value="">Choose…</option>${pms.map(p=>`<option value="${p.id}" ${it.assigned_pm===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}</select></div>
        <div class="formfield"><label class="field-label">Note to them (optional)</label><input type="text" id="finInbNote" placeholder="e.g. Is this Elm Court?"></div>
        <button class="ghostbtn" style="width:100%;" onclick="finInboxSendPm('${it.id}')">Send to PM to book</button>
      </div>
    </div>
    <button class="linkbtn" style="margin-top:12px;color:var(--slate);" onclick="finInboxIgnore('${it.id}')">Not an invoice — ignore it</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finInbOverlay').style.display='none'">Close</button>
  </div>`;
  ov.style.display = 'flex';
};
function finInbPoOpts(siteId, cur){ const pos = (window.__finInbPos||[]).filter(p=>p.site_id===siteId); return `<option value="">No PO</option>${pos.map(p=>`<option value="${p.id}" ${cur===p.id?'selected':''}>${escapeHtml(p.number)} · ${escapeHtml(p.supplier_name||'')}</option>`).join('')}`; }
window.finInbPosFor = function(siteId){ const el = document.getElementById('finInbPo'); if(el) el.innerHTML = finInbPoOpts(siteId, ''); };
function finInbFields(id){
  const card = document.getElementById('finInb-'+id); if(!card) return null;
  const g = k=>{ const el = card.querySelector(`[data-k="${k}"]`); return el ? el.value.trim() : ''; };
  const n = k=>{ const x = finNum(g(k)); return x===null || isNaN(x) ? null : x; };
  return {site_id:g('site_id'), po_id:g('po_id'), supplier:g('supplier'), invoice_no:g('invoice_no'), date:g('date'), net:n('net'), vat:n('vat'), total:n('total')};
}
window.finInboxFileFromModal = async function(id){
  const f = finInbFields(id); if(!f) return;
  if(!f.site_id){ toast('Choose the job.'); return; }
  if(!f.supplier){ toast('Enter the supplier.'); return; }
  const it = (await dbSelect('fin_inbox', 'id=eq.'+id))[0]; if(!it || it.status!=='new'){ toast('Already filed.'); return; }
  const pi = await finInboxFileCore(it, f);
  if(!pi) return;
  document.getElementById('finInbOverlay').style.display = 'none';
  toast('Filed to '+finJobTag(f.site_id)+' — waiting for approval'); render();
};
window.finInboxSendPm = async function(id){
  const f = finInbFields(id); if(!f) return;
  const pm = finVal('finInbPm'); if(!pm){ toast('Choose the PM.'); return; }
  const it = (await dbSelect('fin_inbox', 'id=eq.'+id))[0]; if(!it) return;
  const ex = Object.assign({}, it.extracted||{}, {supplier:f.supplier, invoice_no:f.invoice_no, date:f.date, net:f.net, vat:f.vat, total:f.total});
  const note = finVal('finInbNote');
  const comments = (it.comments||[]).concat([{by:ME.id, name:ME.name, at:new Date().toISOString(), text:'Sent to '+((PROFILES[pm]||{}).name||'PM')+' to book'+(note?': '+note:'')}]);
  if(!(await dbUpdate('fin_inbox', id, {extracted:ex, stage:'with_pm', assigned_pm:pm, assigned_at:new Date().toISOString(), comments}))) return;
  document.getElementById('finInbOverlay').style.display = 'none';
  toast('Sent to '+((PROFILES[pm]||{}).name||'the PM')+' — it’s on their home screen'); render();
};
window.finInboxIgnore = async function(id){
  if(!(await dbUpdate('fin_inbox', id, {status:'ignored', stage:'ignored'}))) return;
  document.getElementById('finInbOverlay').style.display = 'none'; toast('Ignored'); render();
};
window.finInboxUpload = async function(files){
  files = Array.from(files||[]); if(!files.length) return;
  let n = 0;
  for(const f of files){
    if(f.size > 20*1024*1024){ toast(f.name+' is over 20 MB — skipped.'); continue; }
    const safe = f.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80);
    const stored = await uploadToStorage('finance-docs', ME.org_id+'/inbox/'+uid()+'-'+safe, f, f.type||'application/octet-stream');
    if(!stored) continue;
    const r = await dbInsert('fin_inbox', {org_id:ME.org_id, source:'upload', status:'new', received_at:new Date().toISOString(), file_path:stored, file_name:f.name, content_type:f.type||null, created_by:ME.id});
    if(r) n++;
  }
  toast(n+' invoice'+(n===1?'':'s')+' added — reading them now');
  finPiF = 'job'; render();
};
// Old inbox route lands on the new list.
function renderFinInbox(){ finPiF = 'job'; return renderFinPurchases('invoices'); }

/* ---------- PM side: "To book" — supplier invoices sent to me, and wages waiting on my jobs ---------- */
async function pmToBookCounts(){
  if(!isFullManager(ME)) return {inv:0, wages:0};
  try{
    const [inv, wp] = await Promise.all([
      dbSelect('fin_inbox', 'assigned_pm=eq.'+ME.id+'&status=eq.new&select=id'),
      dbSelect('wage_pushes', 'status=eq.pending&select=id,site_id'),
    ]);
    const mine = new Set(SITES.filter(s=>s.responsible_pm_id===ME.id || ME.role==='admin').map(s=>s.id));
    return {inv:inv.length, wages:wp.filter(w=>mine.has(w.site_id)).length};
  }catch(e){ return {inv:0, wages:0}; }
}
async function renderPmToBook(){
  const __gen = RENDER_GEN;
  const [inv, wp] = await Promise.all([
    dbSelect('fin_inbox', 'assigned_pm=eq.'+ME.id+'&status=eq.new&order=assigned_at.asc'),
    dbSelect('wage_pushes', 'status=eq.pending&order=week_start.asc'),
  ]);
  if(__gen !== RENDER_GEN) return;
  const mySites = SITES.filter(s=>siteStatusKey(s)!=='closed').sort((a,b)=>(a.responsible_pm_id===ME.id?0:1)-(b.responsible_pm_id===ME.id?0:1) || String(a.name).localeCompare(String(b.name)));
  const wBy = {}; wp.forEach(w=>{ (wBy[w.site_id] = wBy[w.site_id]||[]).push(w); });
  document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 12px;">Things the office has sent you to put against a job.</p>
    <p class="sectiontitle">Supplier invoices to book ${inv.length?`<span class="finpill warn">${inv.length}</span>`:''}</p>
    ${inv.length ? inv.map(it=>{ const ex = it.extracted||{}; const last = (it.comments||[]).slice(-1)[0]; return `<div class="card pmbook" id="pmb-${it.id}">
      <div class="pmbook-top"><div><b>${escapeHtml(ex.supplier||it.from_email||'Supplier invoice')}</b><div class="stub" style="margin:2px 0 0;font-style:normal;">${ex.invoice_no?'Invoice '+escapeHtml(ex.invoice_no)+' · ':''}${ex.date?finDate(ex.date):''}</div></div><b>${ex.total!=null?finMoney(ex.total):''}</b></div>
      ${last ? `<p class="pmbook-note"><b>${escapeHtml(last.name||'Office')}:</b> ${escapeHtml(last.text||'')}</p>` : ''}
      <button class="ghostbtn" style="width:100%;margin:6px 0;" onclick="openFinDoc('${jsAttr(it.file_path)}','${jsAttr(it.file_name||'')}')">View the invoice</button>
      <div class="formfield"><label class="field-label">Which job is it for?</label><select class="pmbook-site"><option value="">Choose the job…</option>${mySites.map(s=>`<option value="${s.id}">${escapeHtml((s.job_number?s.job_number+' · ':'')+s.name)}</option>`).join('')}</select></div>
      <div class="formfield"><label class="field-label">Note or reply to the office (optional)</label><input type="text" class="pmbook-note-in" placeholder="e.g. Flat roof materials — or “Not mine, try Mike”"></div>
      <div class="row-gap"><button class="darkbtn" style="flex:2;" onclick="pmBookInvoice('${it.id}')">Book to this job</button><button class="ghostbtn" style="flex:1;" onclick="pmReplyInvoice('${it.id}')">Send back to office</button></div>
    </div>`; }).join('') : '<div class="empty">Nothing waiting.</div>'}
    <p class="sectiontitle" style="margin-top:22px;">Wages to book against your prices ${wp.length?`<span class="finpill warn">${wp.length}</span>`:''}</p>
    ${Object.keys(wBy).length ? Object.keys(wBy).map(sid=>{ const s = SITES.find(x=>x.id===sid)||{}; const tot = wBy[sid].reduce((t,w)=>t+Number(w.amount||0),0); return `<button type="button" class="pmrow pmrow-card" onclick="go('#/site/${sid}/price')"><span class="pmrow-txt"><span class="pmrow-t">${escapeHtml((s.job_number?s.job_number+' · ':'')+(s.name||'Job'))}</span><span class="pmrow-s">${wBy[sid].length} to book · ${finMoney(tot)}</span></span>${ophIcon('chevron', 18, 2.2)}</button>`; }).join('') : '<div class="empty">Nothing waiting.</div>'}
  `, {title:'To book', subtitle:'From the office', back:'#/home', tabs:false});
}
window.pmBookInvoice = async function(id){
  const card = document.getElementById('pmb-'+id); if(!card) return;
  const site = card.querySelector('.pmbook-site').value, note = card.querySelector('.pmbook-note-in').value.trim();
  if(!site){ toast('Choose the job.'); return; }
  const res = await sbFetch('/rest/v1/rpc/fin_inbox_pm_book', {method:'POST', body:JSON.stringify({p_id:id, p_site:site, p_note:note||null})});
  if(!res.ok){ toast('Not booked — '+(await safeErr(res))); return; }
  toast('Booked to '+((SITES.find(s=>s.id===site)||{}).name||'the job')+' — the office will approve it'); render();
};
window.pmReplyInvoice = async function(id){
  const card = document.getElementById('pmb-'+id); if(!card) return;
  const typed = card.querySelector('.pmbook-note-in').value.trim();
  const text = String(await customPrompt('Send it back to the office with a note (e.g. “Not one of mine — try Mike”)', typed) || '').trim();
  if(!text) return;
  const res = await sbFetch('/rest/v1/rpc/fin_inbox_pm_reply', {method:'POST', body:JSON.stringify({p_id:id, p_text:text})});
  if(!res.ok){ toast('Not sent — '+(await safeErr(res))); return; }
  toast('Sent back to the office: “'+text.slice(0,60)+'”'); render();
};

// A PO whose value has been fully invoiced (approved) is closed as "Invoiced"; reopened if an invoice is rejected.
async function finPoMaybeClose(poId){
  try{
    const po = (await dbSelect('purchase_orders', 'id=eq.'+poId+'&select=id,status,value'))[0];
    if(!po || po.value==null || po.status==='cancelled') return;
    const inv = await dbSelect('purchase_invoices', 'po_id=eq.'+poId+'&status=eq.approved&select=net');
    const done = inv.reduce((t,i)=>t+Number(i.net||0),0) >= Number(po.value) - 0.005;
    if(done && po.status==='open') await dbUpdate('purchase_orders', poId, {status:'invoiced'});
    else if(!done && po.status==='invoiced') await dbUpdate('purchase_orders', poId, {status:'open'});
  }catch(e){}
}
