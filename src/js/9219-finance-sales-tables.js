/* ============================================================
   OpHUB Finance — Sales lists as simple tables (used on the Sales section
   and on each project's Sales tab, so they look and work the same).
   Applications: one list from draft → submitted → certified → invoiced
   (a certificate is a certified application).
   Invoices: one row each — number, client and address, dates, net, VAT,
   gross, status, Xero.
   ============================================================ */
function finInvAddr1(i){ return String(i.bill_address||'').split(/\n|,/).map(x=>x.trim()).filter(Boolean).slice(0,2).join(', '); }
function finInvXeroTag(i){
  if(i.status==='draft' || i.status==='void') return '';
  if(i.xero_id) return '<span class="finxtag ok" title="Posted to Xero">Xero ✓</span>';
  if(i.xero_post===false) return '<span class="finxtag off" title="Set not to post to Xero">Not for Xero</span>';
  return typeof finXeroConnected==='function' && finXeroConnected() ? '<span class="finxtag" title="Ready to post to Xero">To post</span>' : '';
}
function finInvTableHtml(invs, opts){
  opts = opts || {};
  if(!invs.length) return `<div class="empty" style="margin:8px 0 0;">${opts.empty||'No invoices yet.'}</div>`;
  const job = !!opts.showJob;
  const tot = k=>finRound(invs.filter(i=>i.status!=='void').reduce((t,i)=>t+Number(i[k]||0),0));
  return `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
    <thead><tr><th>Invoice</th><th>Client</th>${job?'<th>Project</th>':''}<th>Date</th><th>Due</th><th class="num">Net</th><th class="num">VAT</th><th class="num">Gross</th><th>Status</th></tr></thead>
    <tbody>${invs.map(i=>{ const out = finInvOutstanding(i); return `<tr class="click ${i.status==='void'?'void':''}" data-lf="${lfText([i.number, i.bill_name, i.bill_address, finJobTag(i.site_id)].join(' '))}" onclick="go('#/site/${i.site_id}/finance/invoice/${i.id}')">
      <td data-l="Invoice" class="d"><b>${escapeHtml(i.number||'Draft')}</b></td>
      <td data-l="Client"><div class="fininv-cli">${escapeHtml(i.bill_name||(SITES.find(x=>x.id===i.site_id)||{}).client_name||'—')}</div>${finInvAddr1(i)?`<div class="fininv-addr">${escapeHtml(finInvAddr1(i))}</div>`:''}</td>
      ${job?`<td data-l="Project">${escapeHtml(finJobTag(i.site_id))}</td>`:''}
      <td data-l="Date">${i.status==='draft'?'<span class="stub" style="margin:0;">Not issued</span>':finDate(i.issue_date)}</td>
      <td data-l="Due" class="${finInvOverdue(i)?'finbad':''}">${i.status==='draft'?'—':finDate(i.due_date)}</td>
      <td data-l="Net" class="num">${finMoney(i.net)}</td>
      <td data-l="VAT" class="num">${finMoney(i.vat)}${Number(i.rc_vat||0)?`<div class="fininv-rc" title="Reverse charge: the client pays this VAT to HMRC">RC ${finMoney(i.rc_vat)}</div>`:''}</td>
      <td data-l="Gross" class="num"><b>${finMoney(i.total)}</b>${out>0 && out<Number(i.total)?`<div class="fininv-rc">${finMoney(out)} owed</div>`:''}</td>
      <td data-l="Status">${finInvPill(i)} ${finInvXeroTag(i)}</td></tr>`; }).join('')}</tbody>
    ${invs.length>1 ? `<tfoot><tr><td class="d" colspan="${job?5:4}">Total (${invs.filter(i=>i.status!=='void').length})</td><td class="num">${finMoney(tot('net'))}</td><td class="num">${finMoney(tot('vat'))}</td><td class="num">${finMoney(tot('total'))}</td><td></td></tr></tfoot>` : ''}
  </table></div>`;
}
function finAppStage(a){
  if(a.status==='void') return {k:'void', l:'Void', c:'grey'};
  if(a.invoice_id) return {k:'invoiced', l:'Invoiced', c:'ok'};
  if(a.cert_net!=null) return a.cert_is_payless ? {k:'certified', l:'Pay less notice', c:'bad'} : {k:'certified', l:'Certified', c:'warn'};
  if(a.status==='submitted') return {k:'submitted', l:'Waiting for certificate', c:'blue'};
  return {k:'draft', l:'Draft', c:'grey'};
}
function finAppTableHtml(apps, invBy, opts){
  opts = opts || {};
  if(!apps.length) return `<div class="empty" style="margin:8px 0 0;">${opts.empty||'No applications yet.'}</div>`;
  const job = !!opts.showJob;
  return `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
    <thead><tr>${job?'<th>Project</th>':''}<th>Application</th><th>Date</th><th class="num">Applied (net)</th><th class="num">Certified (net)</th><th>Stage</th><th>Invoice</th></tr></thead>
    <tbody>${apps.map(a=>{ const s = finAppStage(a); const inv = invBy[a.invoice_id]; const short = a.cert_net!=null ? finRound(Number(a.cert_net)-Number(a.net_due||0)) : 0; return `<tr class="click" data-lf="${lfText(finJobTag(a.site_id)+' application certificate '+a.number)}" onclick="go('#/site/${a.site_id}/finance/application/${a.id}')">
      ${job?`<td data-l="Project" class="d"><b>${escapeHtml(finJobTag(a.site_id))}</b></td>`:''}
      <td data-l="Application" ${job?'':'class="d"'}>${job?'':'<b>'}${a.cert_net!=null || a.invoice_id ? 'Certificate' : 'Application'} ${a.number}${job?'':'</b>'}</td>
      <td data-l="Date">${finDate(a.valuation_date)}</td>
      <td data-l="Applied" class="num">${finMoney(a.net_due)}</td>
      <td data-l="Certified" class="num">${a.cert_net!=null ? finMoney(a.cert_net)+(short<-0.009?`<div class="fininv-rc finbad">${finMoney(-short)} short</div>`:'') : '—'}</td>
      <td data-l="Stage"><span class="finpill ${s.c}">${s.l}</span></td>
      <td data-l="Invoice">${inv ? `<button class="linkbtn" onclick="event.stopPropagation();go('#/site/${a.site_id}/finance/invoice/${inv.id}')">${escapeHtml(inv.number||'Draft')}</button>` : s.k==='certified' ? `<button class="ghostbtn finsmall" onclick="event.stopPropagation();finRaiseCertInvoice('${a.site_id}','${a.id}', ${Number(a.cert_net||0)})">Raise invoice</button>` : '<span class="stub" style="margin:0;">—</span>'}</td></tr>`; }).join('')}</tbody>
  </table></div>`;
}
// Project page cards (replace the older list cards).
function finInvoicesCardHtml(siteId, invs){
  const live = invs.filter(i=>i.status!=='void');
  const invoiced = live.filter(i=>i.status!=='draft').reduce((t,i)=>t+Number(i.net||0), 0);
  const owed = live.reduce((t,i)=>t+finInvOutstandingNet(i), 0);
  return `<div class="card">
    <div class="fincard-head"><p class="sectiontitle" style="margin:0;">Invoices</p><button class="ghostbtn finsmall" onclick="newFinInvoice('${siteId}')">+ New invoice</button></div>
    ${invs.length ? `<p class="stub" style="margin:4px 0 8px;font-style:normal;">Invoiced <b>${finMoney(invoiced)}</b> excl. VAT · Owed <b style="${owed?'color:var(--warn);':''}">${finMoney(owed)}</b></p>` : ''}
    ${finInvTableHtml(invs)}
  </div>`;
}
function finApplicationsCardHtml(siteId, apps, due, invs){
  const invBy = {}; (invs||[]).forEach(i=>invBy[i.id]=i);
  return `<div class="card">
    <div class="fincard-head"><p class="sectiontitle" style="margin:0;">Applications &amp; certificates</p><button class="ghostbtn finsmall" onclick="newFinApplication('${siteId}')">+ New application</button></div>
    ${due ? `<div class="finchecks" style="margin:8px 0 0;"><span>This month’s application is due</span></div>` : ''}
    <p class="stub" style="margin:4px 0 8px;font-style:normal;">Apply → the client certifies (enter their figures on the application) → the invoice is raised for you.</p>
    ${finAppTableHtml(apps.slice().sort((x,y)=>y.number-x.number), invBy)}
  </div>`;
}
// Drafts opened by "New invoice" and left empty are tidied away.
// Only your own drafts that have sat empty for over a day (anyone's after a week), so a draft
// someone is still typing on another phone or computer isn't deleted under them (audit FA-12).
function finCleanEmptyDrafts(invs){
  const empty = i=>i.status==='draft' && !i.number && (i.lines||[]).every(l=>!String(l.description||'').trim() && (l.amount==null || l.amount===''));
  const age = i=>{ const t = Date.parse(i.updated_at || i.created_at || ''); return isNaN(t) ? 0 : Date.now() - t; };
  const old = i=>(i.created_by===ME.id && age(i) > 24*3600*1000) || age(i) > 7*24*3600*1000;
  const keep = [], gone = [];
  invs.forEach(i=>{ if(empty(i) && !(typeof finInvDraft!=='undefined' && finInvDraft && finInvDraft.id===i.id)) { if(old(i)) gone.push(i); } else keep.push(i); });
  gone.forEach(i=>{ sbFetch('/rest/v1/fin_invoices?id=eq.'+i.id+'&status=eq.draft&number=is.null', {method:'DELETE'}).catch(()=>null); });
  return keep;
}

/* ---------- Sales section: Applications · Invoices · Retention ---------- */
let finSalesAppF = 'open', finSalesPicked = false;
async function renderFinSales(sub){
  if(!finGuard()) return;
  if(sub==='certs'){ finSalesAppF = 'certified'; sub = 'apps'; }
  if(sub==='receipts') sub = 'invoices';
  sub = ['apps','invoices','retention'].includes(sub) ? sub : null;
  const __gen = RENDER_GEN;
  const [invs0, apps, pays, jf, st] = await Promise.all([
    dbSelect('fin_invoices', 'org_id=eq.'+ME.org_id+'&order=created_at.desc&limit=3000'),
    dbSelect('fin_applications', 'org_id=eq.'+ME.org_id+'&order=valuation_date.desc&limit=3000&select=id,site_id,number,status,valuation_date,due_date,final_date,gross,net_due,cert_date,cert_gross,cert_net,cert_retention,cert_is_payless,invoice_id'),
    dbSelect('fin_payments', 'org_id=eq.'+ME.org_id+'&select=amount,paid_on&limit=10000'),
    dbSelect('job_finance', 'org_id=eq.'+ME.org_id),
    finLoadSettings(),
  ]);
  if(__gen !== RENDER_GEN) return;
  const invs = finCleanEmptyDrafts(invs0);
  if(!sub) sub = apps.some(a=>['draft','submitted','certified'].includes(finAppStage(a).k)) ? 'apps' : 'invoices';
  const live = invs.filter(i=>i.status!=='void');
  const owed = live.reduce((t,i)=>t+finInvOutstandingNet(i),0), overdue = live.filter(finInvOverdue).reduce((t,i)=>t+finInvOutstandingNet(i),0);
  const received = finRound(pays.reduce((t,p)=>t+Number(p.amount||0),0));
  const invBy = {}; invs.forEach(i=>invBy[i.id]=i);
  const stage = a=>finAppStage(a).k;
  const toInvoice = apps.filter(a=>stage(a)==='certified');
  let body = '';
  if(sub==='apps'){
    const F = {open:a=>['draft','submitted'].includes(stage(a)), certified:a=>stage(a)==='certified', invoiced:a=>stage(a)==='invoiced', all:a=>stage(a)!=='void'};
    if(!F[finSalesAppF]) finSalesAppF = 'open';
    if(!finSalesPicked && !apps.filter(F[finSalesAppF]).length) finSalesAppF = ['certified','open','invoiced'].find(k=>apps.filter(F[k]).length) || 'all';
    const list = apps.filter(F[finSalesAppF]);
    body = finSecHead('Applications & Certificates', '+ New application', "finPickJob('New application','newFinApplication')")
      + `<p class="stub" style="margin:-4px 0 10px;">Apply → the client certifies it (enter their figures on the application) → the invoice is raised for you. A certificate is just a certified application.</p>`
      + `<div class="pmchips">${[['open','In progress'],['certified','Certified — to invoice'],['invoiced','Invoiced'],['all','All']].map(([k,l])=>finChip(finSalesAppF===k, l, apps.filter(F[k]).length, `finSalesAppF='${k}';finSalesPicked=true;render()`)).join('')}</div>`
      + finSearchHtml('Search application no., project or client', 'finSalesList')
      + `<div id="finSalesList">${finAppTableHtml(list, invBy, {showJob:true, empty:'Nothing here.'})}</div>`;
  } else if(sub==='invoices'){
    const F = {outstanding:i=>finInvOutstanding(i)>0, overdue:finInvOverdue, draft:i=>i.status==='draft', paid:i=>i.status==='paid', all:()=>true};
    if(!F[finInvFilter]) finInvFilter = 'outstanding';
    const list = (finInvFilter==='all' ? invs : live).filter(F[finInvFilter]);
    body = finSecHead('Invoices', '+ New invoice', "finPickJob('New invoice','newFinInvoice')")
      + `<div class="pmchips">${[['outstanding','Owed'],['overdue','Overdue'],['draft','Drafts'],['paid','Paid'],['all','All']].map(([k,l])=>finChip(finInvFilter===k, l, (k==='all'?invs:live).filter(F[k]).length, `finInvFilter='${k}';render()`)).join('')}</div>`
      + finSearchHtml('Search invoice no., client, address or project', 'finSalesList')
      + `<div id="finSalesList">${finInvTableHtml(list, {showJob:true, empty:'No invoices here.'})}</div>`
      + `<p class="stub" style="margin:8px 0 0;font-style:normal;">Record money received on the invoice itself (payments made in Xero come across on their own).</p>`;
  } else {
    const jfBy = {}; jf.forEach(r=>jfBy[r.site_id]=r);
    const appsBy = {}; apps.forEach(a=>{ (appsBy[a.site_id] = appsBy[a.site_id]||[]).push(a); });
    // "Still held" = held less the retention release invoices already raised (audit FA-08).
    const rows = SITES.map(s=>({s, held:finRetentionStillHeld(appsBy[s.id]||[], jfBy[s.id]||{}, invs), jf:jfBy[s.id]||{}})).filter(x=>x.held);
    const total = rows.reduce((t,x)=>t+x.held,0);
    body = finSecHead('Retention') + `<p class="stub" style="margin:-4px 0 12px;">Money your clients are holding back until the work is signed off: ${finMoney(total)} across ${rows.length} job${rows.length===1?'':'s'}. Half usually comes back at practical completion and half at the end of the defects period — set the dates here (they save to the project) to get reminders.</p>`
      + finSearchHtml('Search project, client', 'finSalesList')
      + `<div id="finSalesList">${rows.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
        <thead><tr><th>Project</th><th>Client</th><th>1st Retention Release</th><th>Final Retention Release</th><th class="num">Still Held</th></tr></thead>
        <tbody>${rows.map(x=>{ const d = finRetentionDates(x.jf, st); const when = (dt, inv, n)=>inv ? finDate(dt)+' <span class="finpill ok">Claimed</span>' : `<input type="date" class="finretd" value="${dt||''}" title="${n===1?'Practical completion — first half of the retention is due':'End of the defects period — the rest of the retention is due'}" onclick="event.stopPropagation()" onchange="finRetSetDate('${x.s.id}',${n},this.value)">`;
          return `<tr class="click" data-lf="${lfText([finRepJobOr(x.s), x.s.client_name].join(' '))}" onclick="go('#/site/${x.s.id}/finance')"><td data-l="Project"><b>${escapeHtml(finRepJobOr(x.s))}</b></td><td data-l="Client">${escapeHtml(x.s.client_name||'—')}</td><td data-l="1st Retention Release">${when(d.first, x.jf.ret1_invoice_id, 1)}</td><td data-l="Final Retention Release">${when(d.second, x.jf.ret2_invoice_id, 2)}</td><td data-l="Still Held" class="num"><b>${finMoney(x.held)}</b></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="4"><b>${rows.length} job${rows.length===1?'':'s'}</b></td><td class="num"><b>${finMoney(total)}</b></td></tr></tfoot></table></div>` : '<div class="empty">No retention held.</div>'}</div>`;
  }
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('sales')}
    <div class="pmstats finstats">
      ${(()=>{ const pA = finStatPeriod('s_appv','month'), pI = finStatPeriod('s_invv','month'), pD = finStatPeriod('s_over','all'), pN = finStatPeriod('s_anc','all');
        // 23 Oct (Andy): Applied Value · Invoiced Value · Overdue · Applied, not certified or invoiced
        const aDate = a=>a.valuation_date || String(a.submitted_at||a.created_at||'').slice(0,10);   // no valuation date → when it was made (24 Oct)
        const applied = apps.filter(a=>!['draft','void'].includes(a.status) && finInPeriod(aDate(a), pA));
        const waiting = apps.filter(a=>stage(a)==='submitted' && finInPeriod(aDate(a), pN));
        return finStatCardHtml({key:'s_appv', def:'month', label:'Applied Value', onclick:"finSalesAppF='all';finSalesPicked=true;go('#/finance/sales/apps')", value:finMoney(applied.reduce((t,a)=>t+Number(a.net_due||0),0), 0)})
          + finStatCardHtml({key:'s_invv', def:'month', label:'Invoiced Value', onclick:"finInvFilter='all';go('#/finance/sales/invoices')", value:finMoney(live.filter(i=>i.status!=='draft' && finInPeriod(i.issue_date, pI)).reduce((t,i)=>t+Number(i.net||0),0), 0)})
          + finStatCardHtml({key:'s_over', def:'all', label:'Overdue', onclick:"finInvFilter='overdue';go('#/finance/sales/invoices')", value:finMoney(live.filter(finInvOverdue).filter(i=>finInPeriod(i.due_date, pD)).reduce((t,i)=>t+finInvOutstandingNet(i),0), 0)})
          + finStatCardHtml({key:'s_anc', def:'all', label:'Applied, Not Certified Or Invoiced', onclick:"finSalesAppF='open';finSalesPicked=true;go('#/finance/sales/apps')", value:finMoney(waiting.reduce((t,a)=>t+Number(a.net_due||0),0), 0)}); })()}
    </div>
    ${finSubTabs('sales', sub, {apps:toInvoice.length})}
    ${body}
  `, {title:'Sales', subtitle:'OpHUB Finance · money in', back:finSecBack(), tabs:false});
}

window.finRaiseCertInvoice = async function(siteId, appId, net){
  if(!await customConfirm(`Raise and issue the invoice for this certificate (${finMoney(net)} net)?\n\nIt gets the next invoice number and is saved as a PDF ready to email.`, {confirmLabel:'Raise and issue'})) return;
  return raiseInvoiceFromCert(siteId, appId, true);
};
// "To date" strip for a job's Sales tab (24 Oct, Andy): Applied, Invoiced, Paid — all excl. VAT.
function finSalesToDateHtml(apps, invs){
  const live = (apps||[]).filter(a=>a.status!=='void').sort((x,y)=>y.number-x.number);
  const last = live.find(a=>a.status!=='draft') || null;
  const li = (invs||[]).filter(i=>!['void','draft'].includes(i.status));
  const invoiced = finRound(li.reduce((t,i)=>t+Number(i.net||0),0));
  const paid = finRound(li.reduce((t,i)=>{ const tt = Number(i.total||0); return t + (tt ? Math.min(Number(i.paid||0), tt)*Number(i.net||0)/tt : 0); },0));
  const cell = (l, v, s)=>`<div><span>${l}</span><b>${v}</b>${s?`<em>${s}</em>`:''}</div>`;
  return `<div class="fintodate fintodate3">${cell('Applied', last ? finMoney(last.gross, 0) : '—', last ? 'excl. VAT · to date (App '+last.number+')' : 'no applications yet')}${cell('Invoiced', finMoney(invoiced, 0), 'excl. VAT · '+li.length+' invoice'+(li.length===1?'':'s'))}${cell('Paid', finMoney(paid, 0), 'excl. VAT')}</div>`;
}
(function(){ const st = document.createElement('style'); st.textContent = `.fintodate.fintodate3{grid-template-columns:repeat(3,minmax(0,1fr)) !important;} .fintodate3 em{white-space:normal;}`; document.head.appendChild(st); })();
