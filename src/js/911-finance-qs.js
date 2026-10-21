/* ============================================================
   OpHUB Finance — QS tools
   • The "book": every finance record for one job (or the whole company),
     loaded once and used by the job page, the costs ledger and reports.
   • Cost lines by type (shared with the costs ledger, 910).
   • Forecast: budget by heading, cost to complete, forecast final cost,
     forecast final account (contract + variations), forecast margin.
   • Budget & forecast page   #/site/<id>/finance/budget
   • Variations register       #/site/<id>/finance/variations
   ============================================================ */
const FIN_VAR_STATUS = {instructed:'Instructed', priced:'Priced', submitted:'Submitted', agreed:'Agreed', rejected:'Rejected'};
const FIN_VAR_PILL = {instructed:'grey', priced:'blue', submitted:'warn', agreed:'ok', rejected:'bad'};

async function finLoadBook(siteId){
  const f = siteId ? 'site_id=eq.'+siteId : 'org_id=eq.'+ME.org_id;
  // Rows that can be split across projects are also fetched when another project's row has a share here.
  const fs = siteId ? 'or=(site_id.eq.'+siteId+',split_sites.cs.{'+siteId+'})' : f;
  const [jf, invs, apps, pinvs, pos, cks, manual, hires, extra, budgets, vars, scs, sapps, rates, cpos, items, ops] = await Promise.all([
    dbSelect('job_finance', f),
    dbSelect('fin_invoices', f+'&status=neq.draft&limit=5000'),
    dbSelect('fin_applications', f+'&order=number.asc&limit=5000'),
    dbSelect('purchase_invoices', fs+'&status=neq.rejected&limit=10000'),
    dbSelect('purchase_orders', fs+'&limit=10000'),
    dbSelect('checkins', (siteId ? 'site_id=eq.'+siteId+'&' : '')+'type=eq.in&select=user_id,site_id,sub_site_id,ts,type&order=ts.desc&limit=50000'),
    dbSelect('fin_labour_manual', f+'&limit=20000'),
    dbSelect('fin_plant_hires', fs),
    dbSelect('fin_job_costs', fs+'&limit=10000'),
    dbSelect('fin_job_budgets', f),
    dbSelect('fin_variations', f+'&order=seq.asc'),
    dbSelect('fin_subcontracts', f+'&order=seq.asc'),
    dbSelect('fin_sub_apps', f+'&order=number.asc'),
    finLoadRates(),
    dbSelect('client_pos', f+'&order=is_primary.desc,created_at.asc'),
    dbSelect('fin_contract_items', f+'&select=id,site_id,kind,value,cost,sub_job_id,position&order=position.asc&limit=20000'),
    dbSelect('fin_sub_payments', 'org_id=eq.'+ME.org_id+'&sub_app_id=is.null&status=in.(approved,paid)&limit=10000'),
  ]);
  await loadAllProfiles();
  return {siteId, jf, invs, apps, pinvs, pos, cks, manual, hires, extra, budgets, vars, scs, sapps, rates, cpos, items, ops};
}
function finBy(arr, siteId){ return (arr||[]).filter(x=>x.site_id===siteId); }

// Every cost line on one job. cat = a FIN_COST_CATS key, or 'committed' (ccat says which type).
// Each line also carries sub = the plot / address / repair job it's booked to (null = whole project),
// and share < 1 when the cost is split (917 finAllocs).
function finCostLinesFromBook(b, siteId){
  const poAll = {}; (b.pos||[]).forEach(p=>{ poAll[p.id] = p; });
  const ctx = {poBy:poAll};
  const lines = [];
  const each = (rows, fn)=>(rows||[]).forEach(r=>finAllocs(r, ctx).forEach(a=>{ if(a.site_id===siteId) fn(r, a); }));
  const tag = a=>a.share < 0.9999 ? ' ('+finRound(a.share*100)+'% share)' : '';
  each(b.pinvs, (i,a)=>{
    // A coded line (9219g) carries its own cost type; otherwise the invoice's.
    const cat = a.cat && FIN_COST_CATS[a.cat] ? a.cat : FIN_COST_CATS[i.cost_code] ? i.cost_code : 'materials';
    lines.push({key:'pi:'+i.id+':'+(a.sub||'')+(a.cat?':'+a.cat:''), date:i.invoice_date, cat, desc:(i.description || (i.kind==='receipt' ? 'Receipt' : 'Purchase invoice'))+tag(a), who:i.supplier_name||'', ref:[i.invoice_no, poAll[i.po_id] && poAll[i.po_id].number].filter(Boolean).join(' · '), status:FIN_PI_STATUS[i.status]||i.status, waiting:i.status!=='approved', net:finRound(Number(i.net||0)*a.share), sub:a.sub, share:a.share, src:{t:'purchase_invoices', id:i.id}, open:`openPurchaseInvoiceView('${i.site_id}','${i.id}')`});
  });
  each((b.pos||[]).filter(p=>p.status==='open' && p.value!=null), (p,a)=>{
    const left = finRound(Number(p.value) - finPoInvoiced(p, b.pinvs||[]));
    if(left <= 0) return;
    // Split what's left across the lines' cost codes (plant, subcontract…), by value.
    const byCode = {}; let codedTot = 0;
    (p.items||[]).forEach(it=>{ const c = FIN_COST_CATS[it.cost_code] ? it.cost_code : 'materials'; const amt = Number(it.amount||0); if(amt>0){ byCode[c] = (byCode[c]||0) + amt; codedTot += amt; } });
    const codes = codedTot ? Object.keys(byCode) : ['materials'];
    codes.forEach(c=>{
      const part = codedTot ? byCode[c]/codedTot : 1;
      lines.push({key:'po:'+p.id+':'+(a.sub||'')+':'+c, date:String(p.created_at||'').slice(0,10), cat:'committed', ccat:c, desc:'Ordered, not invoiced yet'+tag(a)+(codes.length>1?' — '+FIN_COST_CATS[c]:''), who:p.supplier_name||'', ref:p.number, status:'Committed', net:finRound(left*a.share*part), sub:a.sub, share:a.share, src:{t:'purchase_orders', id:p.id}, open:`go('#/site/${p.site_id}/finance/po/${p.id}')`});
    });
  });
  // Sign-in days: a day split evenly over the plots / addresses signed into that day.
  const dayCks = finBy(b.cks, siteId), daySubs = {};
  dayCks.forEach(c=>{ if(c.type && c.type!=='in') return; const k = c.user_id+'|'+finIsoDay(c.ts); (daySubs[k] = daySubs[k] || new Set()).add(c.sub_site_id||''); });
  // Operatives invoice us: their invoice lines are the labour. Sign-in days only cost PAYE staff (day rate).
  (b.ops||[]).forEach(p=>(p.lines||[]).forEach((l,li)=>{ if(l.site_id!==siteId) return;
    lines.push({key:'op:'+p.id+':'+li, date:p.period_start, cat:'labour', desc:(l.description || 'Operative invoice')+(p.invoice_no?' · inv '+p.invoice_no:''), who:p.name||'', ref:'w/c '+finDate(p.period_start), status:p.status==='paid'?'Paid':'To pay', net:finRound(Number(l.amount||0)), person:p.worker_id?'w:'+p.worker_id:p.user_id, sub:l.sub_job_id||null, share:1, open:`go('#/finance/labour/payment/${p.id}')`});
  }));
  finLabourDaysFrom(dayCks).forEach(d=>{
    const r = b.rates[d.user_id];
    if(!r || r.pay_type!=='paye') return;
    const subs = Array.from(daySubs[d.user_id+'|'+d.date] || ['']);
    subs.forEach(sb=>{
      const share = 1/subs.length;
      lines.push({key:'ck:'+d.user_id+d.date+sb, date:d.date, cat:'labour', desc:'Day on site (sign-in)'+(subs.length>1?' ('+finRound(share*100)+'% share)':''), who:finPersonName(d.user_id), ref:'', status:r && r.day_rate!=null ? '' : 'No day rate', waiting:!(r && r.day_rate!=null), net:r && r.day_rate!=null ? finRound(Number(r.day_rate)*share) : 0, days:share, person:d.user_id, sub:sb||null, share});
    });
  });
  finBy(b.manual, siteId).forEach(m=>{
    lines.push({key:'ml:'+m.id, date:m.work_date, cat:'labour', desc:m.description || 'Timesheet', who:m.name || finPersonName(finPersonKey(m)), ref:m.days ? m.days+' day'+(Number(m.days)===1?'':'s') : '', status:'', net:Number(m.amount||0), days:Number(m.days||0), person:finPersonKey(m), sub:m.sub_job_id||null, share:1});
  });
  each((b.hires||[]).filter(h=>h.cost_from!=='invoices'), (h,a)=>{
    const c = finPlantCost(h);
    lines.push({key:'ph:'+h.id+':'+(a.sub||''), date:h.on_hire, cat:'plant', desc:h.item+' ('+(h.off_hire ? finDate(h.on_hire)+' – '+finDate(h.off_hire) : 'on hire '+c.weeks+' wk')+')'+tag(a), who:h.supplier_name||'', ref:h.hire_ref||'', status:h.off_hire ? 'Off hire' : 'On hire', net:finRound(c.cost*a.share), sub:a.sub, share:a.share, src:{t:'fin_plant_hires', id:h.id}, open:`openFinPlantForm('${h.site_id}','${h.id}')`});
  });
  each(b.extra, (x,a)=>{
    lines.push({key:'jc:'+x.id+':'+(a.sub||''), date:x.cost_date, cat:FIN_COST_CATS[x.category] ? x.category : 'other', desc:x.description+tag(a), who:x.supplier||'', ref:x.ref||'', status:'', net:finRound(Number(x.net||0)*a.share), sub:a.sub, share:a.share, src:{t:'fin_job_costs', id:x.id}, open:`openFinJobCost('${x.site_id}','${x.id}')`});
  });
  // Subcontractors: each certified application adds (certified gross − last certified gross − new contra charges).
  finBy(b.scs, siteId).forEach(sc=>{
    let prevG = 0, prevC = 0, certG = 0;
    (b.sapps||[]).filter(a=>a.subcontract_id===sc.id && a.certified_gross!=null).sort((x,y)=>x.number-y.number).forEach(a=>{
      const g = Number(a.certified_gross||0), c = Number(a.contra||0);
      lines.push({key:'sa:'+a.id, date:a.app_date, cat:'subcontract', desc:sc.number+' application '+a.number, who:sc.name, ref:sc.description||'', status:a.status==='paid' ? 'Paid' : 'Certified', net:finRound((g-prevG)-(c-prevC)), sub:sc.sub_job_id||null, share:1, open:`go('#/site/${siteId}/finance/sub/${sc.id}')`});
      prevG = g; prevC = c; certG = g;
    });
    if(sc.order_value!=null && sc.status!=='complete'){
      const left = finRound(Number(sc.order_value) - certG);
      if(left > 0) lines.push({key:'sc:'+sc.id, date:String(sc.created_at||'').slice(0,10), cat:'committed', ccat:'subcontract', desc:'Subcontractor PO not yet certified', who:sc.name, ref:sc.number, status:'Committed', net:left, sub:sc.sub_job_id||null, share:1, open:`go('#/site/${siteId}/finance/sub/${sc.id}')`});
    }
  });
  return lines;
}

// Value and cost forecast for one job.
function finJobForecast(b, siteId){
  const lines = finCostLinesFromBook(b, siteId);
  const cats = Object.keys(FIN_COST_CATS);
  const actual = {}, committed = {}, budget = {}, toComplete = {}, tcSet = {}, forecast = {};
  cats.forEach(k=>{ actual[k] = 0; committed[k] = 0; budget[k] = null; toComplete[k] = 0; tcSet[k] = false; });
  lines.forEach(l=>{ if(l.cat==='committed') committed[l.ccat||'materials'] += l.net; else actual[l.cat] += l.net; });
  finBy(b.budgets, siteId).forEach(r=>{ if(r.category in budget){ budget[r.category] = r.budget!=null ? Number(r.budget) : null; if(r.to_complete!=null){ toComplete[r.category] = Number(r.to_complete); tcSet[r.category] = true; } } });
  cats.forEach(k=>{
    actual[k] = finRound(actual[k]); committed[k] = finRound(committed[k]);
    if(!tcSet[k]) toComplete[k] = budget[k]!=null ? Math.max(0, finRound(budget[k] - actual[k] - committed[k])) : 0;
    forecast[k] = finRound(actual[k] + committed[k] + toComplete[k]);
  });
  const sum = o=>finRound(cats.reduce((t,k)=>t+(Number(o[k])||0), 0));
  const jf = finBy(b.jf, siteId)[0] || {};
  const vars = finBy(b.vars, siteId);
  const vAgreed = finRound(vars.filter(v=>v.status==='agreed').reduce((t,v)=>t+Number(v.agreed_value!=null?v.agreed_value:v.quoted||0),0));
  const vPending = finRound(vars.filter(v=>['priced','submitted'].includes(v.status)).reduce((t,v)=>t+Number(v.quoted||0),0));
  const vInstructed = finRound(vars.filter(v=>v.status==='instructed').reduce((t,v)=>t+Number(v.quoted!=null?v.quoted:(v.cost_estimate||0)),0));
  const contract = Number(jf.contract_value||0);
  const ffa = finRound(contract + vAgreed + vPending);
  const apps = finBy(b.apps, siteId).filter(a=>a.status!=='void');
  const lastApp = apps.filter(a=>a.status!=='draft').sort((x,y)=>y.number-x.number)[0];
  const valuation = lastApp ? Number(lastApp.cert_gross!=null ? lastApp.cert_gross : lastApp.gross||0) : 0;
  const certified = lastApp && lastApp.cert_gross!=null ? Number(lastApp.cert_gross) : 0;
  const invs = finBy(b.invs, siteId).filter(i=>i.status!=='void');
  const invoiced = finRound(invs.reduce((t,i)=>t+Number(i.net||0),0));
  const owed = finRound(invs.reduce((t,i)=>t+finInvOutstanding(i),0));
  const costToDate = sum(actual), committedTotal = sum(committed);
  let forecastCost = sum(forecast);
  // Budget: the category budgets if any are set, otherwise the priced schedule's cost prices
  // (plus the cost estimate of variations agreed / submitted).
  const schedItems = finBy(b.items, siteId).filter(i=>!i.kind || i.kind==='item');
  const schedCosted = schedItems.filter(i=>i.cost!=null);
  const schedCost = finRound(schedCosted.reduce((t,i)=>t+Number(i.cost||0),0));
  const varCost = finRound(vars.filter(v=>['agreed','priced','submitted'].includes(v.status)).reduce((t,v)=>t+Number(v.cost_estimate||0),0));
  const catBudget = cats.some(k=>budget[k]!=null);
  let budgetTotal = catBudget ? sum(budget) : null, budgetSource = catBudget ? 'categories' : null, toCompleteSched = 0;
  if(!catBudget && schedCosted.length){
    budgetTotal = finRound(schedCost + varCost); budgetSource = 'schedule';
    const typedTc = finRound(cats.reduce((t,k)=>t+(tcSet[k] ? Number(toComplete[k]||0) : 0), 0));
    toCompleteSched = Math.max(0, finRound(budgetTotal - costToDate - committedTotal - typedTc));
    forecastCost = finRound(forecastCost + toCompleteSched);
  }
  const sales = finBillingType(jf, schedItems.length, apps.length)==='invoice' ? invoiced : valuation;
  const ov = jf.original_value!=null ? Number(jf.original_value) : null, oc = jf.original_cost!=null ? Number(jf.original_cost) : null;
  const retHeld = typeof finRetentionHeld==='function' ? finRetentionHeld(apps) : 0;
  return {lines, cats, actual, committed, budget, toComplete, tcSet, forecast, jf, contract, vAgreed, vPending, vInstructed, ffa,
    valuation, certified, invoiced, owed, retHeld, applied: lastApp ? Number(lastApp.gross||0) : 0, costToDate, committedTotal, forecastCost,
    budgetTotal, budgetSource, schedCost, schedCostedN:schedCosted.length, schedItemsN:schedItems.length, varCost, toCompleteSched, sales,
    salesMargin: finRound(sales - costToDate), salesMarginPct: sales ? finRound((sales-costToDate)/sales*100) : null,
    origValue:ov, origCost:oc, origMargin: ov!=null && oc!=null ? finRound(ov-oc) : null, origMarginPct: ov && oc!=null ? finRound((ov-oc)/ov*100) : null,
    forecastBudget: budgetTotal,
    marginToDate: finRound(valuation - costToDate), marginToDatePct: valuation ? finRound((valuation-costToDate)/valuation*100) : null,
    forecastMargin: finRound(ffa - forecastCost), forecastMarginPct: ffa ? finRound((ffa-forecastCost)/ffa*100) : null};
}
function finPctTxt(p){ return p==null ? '—' : (Math.round(p*10)/10)+'%'; }

/* ---------- job page cards ---------- */
// Job cost to date, by heading — same figures as the costs ledger and reports.
function finJobCostCardFromForecast(siteId, fc){
  const box = (l, v, em)=>`<div><span>${l}</span><b>${finMoney(v, 0)}</b>${em?`<em>${em}</em>`:''}</div>`;
  const waiting = finRound(fc.lines.filter(l=>l.waiting && l.cat!=='labour').reduce((t,l)=>t+l.net,0));
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
      <p class="sectiontitle" style="margin:0;">Project cost to date <span class="stub" style="font-style:normal;text-transform:none;letter-spacing:0;">excl. VAT</span></p>
      <span style="display:flex;gap:6px;flex:none;">${finSubKind(siteId) ? `<button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;margin:0;" onclick="go('#/site/${siteId}/finance/parts')">By ${finSubKind(siteId)==='repair'?'repair job':'plot'} ›</button>` : ''}<button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;margin:0;" onclick="finCosts=null;go('#/site/${siteId}/finance/costs')">All costs ›</button></span>
    </div>
    <div class="fincost">
      ${box('Contract value', fc.contract)}${box('Invoiced to client', fc.invoiced)}
      ${fc.cats.filter(k=>fc.actual[k] || k==='materials' || k==='labour').map(k=>box(FIN_COST_CATS[k], fc.actual[k], k==='materials' && waiting ? '+ '+finMoney(waiting, 0)+' waiting approval' : '')).join('')}
      ${box('Committed', fc.committedTotal, 'ordered, not invoiced')}
    </div>
    <div class="finkv big" style="margin-top:8px;"><span>Costs to date</span><b>${finMoney(fc.costToDate, 0)}</b></div>
    ${fc.invoiced ? `<div class="finkv"><span>Invoiced less costs</span><b style="color:${fc.invoiced-fc.costToDate<0?'var(--red)':'var(--ok)'};">${finMoney(fc.invoiced - fc.costToDate, 0)}</b></div>` : ''}
  </div>`;
}
function finForecastCardHtml(siteId, fc){
  window.__finFcLast = {siteId, fc};
  const pctCol = p=>p==null || Math.abs(p)<0.005 ? '' : (p<0 ? 'color:var(--red);' : 'color:var(--ok);');
  const diff = (now, orig)=>orig==null || now==null ? '' : (Math.abs(now-orig) < 0.5 ? '' : ` <i class="${now>orig?'up':'down'}">${now>orig?'+':'−'}${finMoney(Math.abs(now-orig), 0)}</i>`);
  const bar = (p, warn, tone)=>{ const v = p==null ? 0 : Math.max(0, Math.min(100, p)); return `<div class="finbar ${warn?'warn':''} ${tone||''}"><span style="width:${v}%;"></span></div>`; };
  // #(fin-cards-3a) 21 Oct (Andy): Coreloops-style cards — big figure, then a
  // footer of "label … value" (Original £x / Progress 72%).
  const ff = (l, r)=>`<span class="fintile-ff"><span>${l}</span><b>${r}</b></span>`;
  const tile = (label, val, foot, extra, style)=>`<div class="fintile"><span class="fintile-l">${label}</span><b style="${style||''}">${val}</b>${extra||''}<span class="fintile-f">${foot}</span></div>`;
  const salesP = fc.ffa ? finRound(fc.sales/fc.ffa*100) : null;
  const costP = fc.budgetTotal ? finRound(fc.costToDate/fc.budgetTotal*100) : null;
  const noOrig = fc.origValue==null && fc.origCost==null;
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
      <p class="sectiontitle" style="margin:0;">Project summary</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;margin:0;" onclick="go('#/site/${siteId}/finance/monthly')">Monthly report</button>
        <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;margin:0;" onclick="go('#/site/${siteId}/finance/variations')">Variations</button>
        <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;margin:0;" onclick="go('#/site/${siteId}/finance/budget')">Budget ›</button>
      </div>
    </div>
    <div class="fintiles">
      ${tile('Expected final value', finMoney(fc.ffa, 0), (fc.origValue!=null?ff('Original', finMoney(fc.origValue, 0)):'Contract plus agreed variations'), diff(fc.ffa, fc.origValue))}
      ${tile('Budget (expected cost)', fc.budgetTotal!=null ? finMoney(fc.budgetTotal, 0) : '—', fc.budgetTotal==null ? `<a href="#/site/${siteId}/finance/budget">Set a budget</a>` : (fc.origCost!=null?ff('Original', finMoney(fc.origCost, 0)):(fc.budgetSource==='schedule'?'From the schedule':'&nbsp;')), diff(fc.budgetTotal, fc.origCost))}
      ${fc.budgetTotal==null ? tile('Expected profit', '—', 'Needs a budget') + tile('Expected profit %', '—', 'Needs a budget')
        : tile('Expected profit', finMoney(fc.forecastMargin, 0), fc.origMargin!=null?ff('Original', finMoney(fc.origMargin, 0)):'&nbsp;', diff(fc.forecastMargin, fc.origMargin), pctCol(fc.forecastMargin))
          + tile('Expected profit %', finPctTxt(fc.forecastMarginPct), fc.origMarginPct!=null?ff('Original', finPctTxt(fc.origMarginPct)):'&nbsp;', '', pctCol(fc.forecastMarginPct))}
      ${tile(fc.sales===fc.invoiced && fc.sales!==fc.valuation ? 'Invoiced so far' : 'Work valued so far', finMoney(fc.sales, 0), ff('Progress', finPctTxt(salesP))+bar(salesP, false, 'blue'))}
      ${tile('Cost so far', finMoney(fc.costToDate, 0), (fc.budgetTotal ? ff('Of budget', finPctTxt(costP)) : ff('Budget', 'not set'))+bar(costP, costP!=null && salesP!=null && costP > salesP + 5, 'tan'), fc.committedTotal ? `<span class="fintile-x">+ ${finMoney(fc.committedTotal, 0)} ordered, not invoiced</span>` : '')}
      ${(()=>{ const on = typeof finMarginOn==='function' ? finMarginOn(fc) : {value:fc.sales, label:'value'}; const mg = finRound(on.value - fc.costToDate), mp = on.value ? finRound(mg/on.value*100) : null;
        const expP = fc.budgetTotal!=null && fc.forecastMargin ? finRound(mg/fc.forecastMargin*100) : null;
        return tile('Profit so far'+(typeof finMarginMenuHtml==='function' ? ' '+finMarginMenuHtml() : ''), finMoney(mg, 0), (expP!=null ? ff('Of expected', finPctTxt(expP)) : ff('On '+on.label, finMoney(on.value, 0)))+bar(expP, mg<0, 'green'), '', pctCol(mg))
          + tile('Profit so far %', finPctTxt(mp), ff('On', on.label), '', pctCol(mp)); })()}
    </div>
    <div class="finkv" style="margin-top:10px;"><span>Contract ${finMoney(fc.contract, 0)} · agreed variations ${finMoney(fc.vAgreed, 0)}${fc.vPending?' · waiting for agreement '+finMoney(fc.vPending, 0):''}</span><b>Expected final cost ${finMoney(fc.forecastCost, 0)}</b></div>
    ${noOrig ? `<div class="finkv"><span>Save today’s value and budget as the starting point, so you can see how the job moves.</span><b><button class="linkbtn" onclick="finSetOriginal('${siteId}')">Save starting point</button></b></div>`
      : `<div class="finkv"><span class="stub" style="margin:0;font-style:normal;">Starting point saved ${fc.jf.original_at ? finDate(String(fc.jf.original_at).slice(0,10)) : ''}</span><b><button class="linkbtn" onclick="finSetOriginal('${siteId}')">Update to today’s figures</button></b></div>`}
    ${fc.budgetSource==='schedule' && fc.schedCostedN < fc.schedItemsN ? `<div class="finnote warn">${fc.schedItemsN - fc.schedCostedN} schedule line${fc.schedItemsN - fc.schedCostedN===1?' has':'s have'} no cost price yet, so the budget is low. <a href="#/site/${siteId}/finance/contract">Add costs</a></div>` : ''}
  </div>`;
}
window.finSetOriginal = async function(siteId){
  const b = await finLoadBook(siteId); const fc = finJobForecast(b, siteId);
  if(!(await customConfirm(`Set the original to today’s figures?\n\nValue ${finMoney(fc.ffa)} · budget ${fc.budgetTotal!=null?finMoney(fc.budgetTotal):'none'}`))) return;
  const res = await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({site_id:siteId, org_id:ME.org_id, original_value:fc.ffa, original_cost:fc.budgetTotal, original_at:new Date().toISOString(), updated_at:new Date().toISOString(), updated_by:ME.id})});
  if(!res.ok){ toast('Could not save — '+(await safeErr(res))); return; }
  toast('Original set'); render();
};

/* ---------- Budget & forecast page ---------- */
let finBud = null;
async function renderFinBudget(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId); if(!site){ go('#/finance'); return; }
  const b = await finLoadBook(siteId);
  if(__gen !== RENDER_GEN) return;
  const fc = finJobForecast(b, siteId);
  finBud = {siteId, fc};
  const cell = (k, f)=>`<input type="text" inputmode="decimal" data-money data-k="${f}" data-c="${k}" value="${f==='budget' ? (fc.budget[k]!=null?fc.budget[k]:'') : (fc.tcSet[k]?fc.toComplete[k]:'')}" placeholder="${f==='to_complete' ? finMoneyIn(fc.toComplete[k]||0) : '£0.00'}" oninput="finBudPaint()">`;
  document.getElementById('app').innerHTML = shell(`
    <div class="pmstats finstats">
      <div class="pmstat"><b>${finMoney(fc.ffa, 0)}</b><span>Forecast final account</span></div>
      <div class="pmstat"><b id="finBudFc">${finMoney(fc.forecastCost, 0)}</b><span>Forecast final cost</span></div>
      <div class="pmstat"><b id="finBudFm">${finMoney(fc.forecastMargin, 0)}</b><span>Forecast margin</span></div>
      <div class="pmstat"><b id="finBudFp">${finPctTxt(fc.forecastMarginPct)}</b><span>Forecast margin %</span></div>
    </div>
    ${fc.budgetSource==='schedule' ? `<div class="finnote ok">The budget is coming from the cost prices on the priced schedule of works: <b style="display:inline;">${finMoney(fc.schedCost)}</b>${fc.varCost?' + '+finMoney(fc.varCost)+' variation costs':''}. Type budgets by cost type below only if you want to split it up instead.</div>` : ''}
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Value</p>
      <div class="finkv"><span>Contract value</span><b>${finMoney(fc.contract)}</b></div>
      <div class="finkv"><span>Variations agreed</span><b>${finMoney(fc.vAgreed)}</b></div>
      <div class="finkv"><span>Variations priced or submitted (not agreed)</span><b>${finMoney(fc.vPending)}</b></div>
      ${fc.vInstructed ? `<div class="finkv"><span>Instructed, not priced yet (estimate, not included)</span><b>${finMoney(fc.vInstructed)}</b></div>` : ''}
      <div class="finkv big"><span>Forecast final account</span><b>${finMoney(fc.ffa)}</b></div>
      <div class="finkv"><span>Valuation to date (last application)</span><b>${finMoney(fc.valuation)}</b></div>
      <div class="finkv"><span>Invoiced</span><b>${finMoney(fc.invoiced)}</b></div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Cost by heading</p>
      <p class="stub" style="margin:-6px 0 12px;">Set a budget for each heading. Cost to complete is what you expect still to spend — leave it blank and it’s worked out as budget less spent and committed.</p>
      <div class="finbudtbl-wrap"><table class="fincosttbl finbudtbl">
        <thead><tr><th>Heading</th><th class="num">Budget £</th><th class="num">Spent</th><th class="num">Committed</th><th class="num">To complete £</th><th class="num">Forecast final</th><th class="num">Over / under</th></tr></thead>
        <tbody>${fc.cats.map(k=>`<tr data-cat="${k}">
          <td data-l="Heading" class="d">${FIN_COST_CATS[k]}</td>
          <td data-l="Budget £" class="num">${cell(k,'budget')}</td>
          <td data-l="Spent" class="num"><a href="javascript:void(0)" onclick="finCosts=null;go('#/site/${siteId}/finance/costs')">${finMoney(fc.actual[k])}</a></td>
          <td data-l="Committed" class="num">${finMoney(fc.committed[k])}</td>
          <td data-l="To complete £" class="num">${cell(k,'to_complete')}</td>
          <td data-l="Forecast final" class="num" id="finBudF-${k}">${finMoney(fc.forecast[k])}</td>
          <td data-l="Over / under" class="num" id="finBudV-${k}">—</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num" id="finBudTB">—</td><td class="num">${finMoney(fc.costToDate)}</td><td class="num">${finMoney(fc.committedTotal)}</td><td class="num" id="finBudTT">—</td><td class="num" id="finBudTF">—</td><td class="num" id="finBudTV">—</td></tr></tfoot>
      </table></div>
      <button class="darkbtn" style="width:100%;margin-top:14px;" onclick="saveFinBudget('${siteId}')">Save budget &amp; forecast</button>
    </div>
  `, {title:'Budget & forecast', subtitle:(site.job_number?site.job_number+' · ':'')+site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
  finBudPaint();
}
function finBudRead(){
  const fc = finBud.fc, out = {};
  fc.cats.forEach(k=>{
    const v = f=>{ const el = document.querySelector(`.finbudtbl input[data-c="${k}"][data-k="${f}"]`); const n = el ? finNum(el.value) : null; return (n===null || isNaN(n)) ? null : n; };
    const bud = v('budget'), tc = v('to_complete');
    const tcEff = tc!=null ? tc : (bud!=null ? Math.max(0, finRound(bud - fc.actual[k] - fc.committed[k])) : 0);
    out[k] = {budget:bud, to_complete:tc, tcEff, forecast:finRound(fc.actual[k] + fc.committed[k] + tcEff)};
  });
  return out;
}
window.finBudPaint = function(){
  if(!finBud) return;
  const fc = finBud.fc, r = finBudRead();
  let tb = 0, tt = 0, tf = 0, anyB = false;
  fc.cats.forEach(k=>{
    const x = r[k]; tf += x.forecast; tt += x.tcEff; if(x.budget!=null){ tb += x.budget; anyB = true; }
    const f = document.getElementById('finBudF-'+k); if(f) f.textContent = finMoney(x.forecast);
    const v = document.getElementById('finBudV-'+k); if(v){ if(x.budget==null){ v.textContent = '—'; v.style.color = ''; } else { const d = finRound(x.budget - x.forecast); v.textContent = (d<0?'over ':'under ')+finMoney(Math.abs(d)); v.style.color = d<0 ? 'var(--red)' : 'var(--ok)'; } }
    const tcIn = document.querySelector(`.finbudtbl input[data-c="${k}"][data-k="to_complete"]`);
    if(tcIn && x.to_complete==null) tcIn.placeholder = finMoneyIn(x.tcEff);
  });
  const set = (id, t, c)=>{ const el = document.getElementById(id); if(el){ el.textContent = t; if(c!==undefined) el.style.color = c; } };
  if(!anyB && fc.budgetSource==='schedule'){ const extra = Math.max(0, finRound(fc.budgetTotal - fc.costToDate - fc.committedTotal - tt)); tf = finRound(tf + extra); tt = finRound(tt + extra); }
  set('finBudTB', anyB ? finMoney(tb) : (fc.budgetSource==='schedule' ? finMoney(fc.budgetTotal) : '—')); set('finBudTT', finMoney(tt)); set('finBudTF', finMoney(tf));
  set('finBudTV', anyB ? ((tb-tf<0?'over ':'under ')+finMoney(Math.abs(finRound(tb-tf)))) : '—', anyB ? (tb-tf<0?'var(--red)':'var(--ok)') : '');
  const m = finRound(fc.ffa - tf);
  set('finBudFc', finMoney(tf, 0)); set('finBudFm', finMoney(m, 0), m<0?'var(--red)':''); set('finBudFp', fc.ffa ? finPctTxt(m/fc.ffa*100) : '—');
};
window.saveFinBudget = async function(siteId){
  const r = finBudRead();
  const rows = Object.keys(r).map(k=>({org_id:ME.org_id, site_id:siteId, category:k, budget:r[k].budget, to_complete:r[k].to_complete, updated_at:new Date().toISOString(), updated_by:ME.id}));
  const res = await sbFetch('/rest/v1/fin_job_budgets?on_conflict=site_id,category', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(rows)});
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return; }
  // First budget on an invoice project becomes the original budget.
  const jfNow = (await dbSelect('job_finance', 'site_id=eq.'+siteId))[0] || {};
  const tot = finRound(Object.values(r).reduce((t,x)=>t+(Number(x.budget)||0),0));
  if(jfNow.original_cost==null && tot) await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({site_id:siteId, org_id:ME.org_id, original_cost:tot, original_value:jfNow.original_value!=null?jfNow.original_value:(jfNow.contract_value!=null?Number(jfNow.contract_value):null), original_at:jfNow.original_at||new Date().toISOString()})});
  toast('Budget & forecast saved'); render();
};

/* ---------- Variations register ---------- */
let finVarTab = 'all';
async function renderFinVariations(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId); if(!site){ go('#/finance'); return; }
  const [vars, siteVars] = await Promise.all([
    dbSelect('fin_variations', 'site_id=eq.'+siteId+'&order=seq.asc'),
    (typeof isFinanceOnly==='function' && isFinanceOnly()) ? Promise.resolve([]) : dbSelect('variations', 'site_id=eq.'+siteId+'&order=created_at.asc'),
  ]);
  if(__gen !== RENDER_GEN) return;
  const linked = new Set(vars.map(v=>v.variation_id).filter(Boolean));
  const fromSite = siteVars.filter(v=>!linked.has(v.id) && v.approval_status!=='declined');
  const tot = k=>finRound(vars.filter(v=>v.status===k).reduce((t,v)=>t+Number(k==='agreed' ? (v.agreed_value!=null?v.agreed_value:v.quoted||0) : (v.quoted!=null?v.quoted:(v.cost_estimate||0))),0));
  const shown = vars.filter(v=>finVarTab==='all' || v.status===finVarTab);
  const chip = (k,l)=>`<button type="button" class="pmchip ${finVarTab===k?'on':''}" onclick="finVarTab='${k}';render()">${l} (${k==='all'?vars.length:vars.filter(v=>v.status===k).length})</button>`;
  document.getElementById('app').innerHTML = shell(`
    <div class="pmstats finstats">
      <div class="pmstat"><b>${finMoney(tot('agreed'), 0)}</b><span>Agreed</span></div>
      <div class="pmstat"><b>${finMoney(tot('submitted')+tot('priced'), 0)}</b><span>Priced / submitted</span></div>
      <div class="pmstat"><b>${finMoney(tot('instructed'), 0)}</b><span>Instructed, not priced (est.)</span></div>
      <div class="pmstat"><b>${finMoney(tot('rejected'), 0)}</b><span>Rejected</span></div>
    </div>
    <div class="row-gap" style="flex-wrap:wrap;margin-bottom:14px;">
      <button class="darkbtn" style="flex:1;min-width:160px;" onclick="openFinVariation('${siteId}')">+ New variation</button>
      <button class="ghostbtn" style="flex:1;min-width:120px;" onclick="finVarExport('${siteId}','xlsx')">Excel</button>
      <button class="ghostbtn" style="flex:1;min-width:120px;" onclick="finVarExport('${siteId}','pdf')">PDF</button>
    </div>
    ${fromSite.length ? `<div class="card" style="border-color:var(--blue);background:var(--blue-bg);">
      <b style="color:var(--blue);">Raised on site — not in the register yet</b>
      ${fromSite.map(v=>`<div class="finkv"><span>${escapeHtml(v.description||'Variation')}${v.cost_impact?' · '+escapeHtml(v.cost_impact):''} · ${escapeHtml(v.approval_status||'pending')}</span><b><button class="linkbtn" onclick="finVarFromSite('${siteId}','${v.id}')">Add to register</button></b></div>`).join('')}
    </div>` : ''}
    <div class="pmchips">${chip('all','All')}${Object.keys(FIN_VAR_STATUS).map(k=>chip(k, FIN_VAR_STATUS[k])).join('')}</div>
    ${shown.length ? `<table class="fincosttbl">
      <thead><tr><th>No.</th><th>Variation</th><th>Instructed</th><th>Status</th><th class="num">Quoted</th><th class="num">Agreed</th></tr></thead>
      <tbody>${shown.map(v=>`<tr class="click" onclick="openFinVariation('${siteId}','${v.id}')">
        <td data-l="No.">${escapeHtml(v.number)}</td>
        <td data-l="Variation" class="d">${escapeHtml(v.title)}${v.instruction_ref?` <span class="stub" style="font-size:12.5px;">· ${escapeHtml(v.instruction_ref)}</span>`:''}</td>
        <td data-l="Instructed">${v.instructed_on?finDate(v.instructed_on):''}${v.instructed_by?' · '+escapeHtml(v.instructed_by):''}</td>
        <td data-l="Status"><span class="finpill ${FIN_VAR_PILL[v.status]||'grey'}">${FIN_VAR_STATUS[v.status]||v.status}</span></td>
        <td data-l="Quoted" class="num">${v.quoted!=null?finMoney(v.quoted):'—'}</td>
        <td data-l="Agreed" class="num">${v.agreed_value!=null?finMoney(v.agreed_value):'—'}</td>
      </tr>`).join('')}</tbody></table>` : `<div class="empty">No variations${finVarTab==='all'?' yet':' here'}.</div>`}
    <p class="stub" style="margin-top:12px;">Agreed variations go into the next application at their agreed value; priced and submitted ones go in at the quoted value until agreed.</p>
  `, {title:'Variations', subtitle:(site.job_number?site.job_number+' · ':'')+site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
}
window.finVarFromSite = async function(siteId, varId){
  const v = (await dbSelect('variations', 'id=eq.'+varId))[0]; if(!v) return;
  const amt = finNum(v.cost_impact);
  await finVarInsert(siteId, {title:String(v.description||'Variation').slice(0,200), description:v.description||null, variation_id:v.id, instructed_on:String(v.created_at||'').slice(0,10)||null, status: v.approval_status==='approved' ? 'agreed' : 'instructed', quoted:(amt===null||isNaN(amt))?null:amt, agreed_value: v.approval_status==='approved' && amt!==null && !isNaN(amt) ? amt : null});
  toast('Added to the register'); render();
};
async function finVarInsert(siteId, row){
  const ex = await dbSelect('fin_variations', 'site_id=eq.'+siteId+'&select=seq&order=seq.desc&limit=1');
  const seq = (ex[0] ? ex[0].seq : 0) + 1;
  return dbInsert('fin_variations', Object.assign({org_id:ME.org_id, site_id:siteId, seq, number:'V'+String(seq).padStart(3,'0'), created_by:ME.id}, row));
}
window.openFinVariation = async function(siteId, id){
  const v = id ? (await dbSelect('fin_variations', 'id=eq.'+id))[0] : null;
  let ov = document.getElementById('finVarOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finVarOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const val = k=>v && v[k]!=null ? escapeHtml(String(v[k])) : '';
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:560px;">
    <h3>${v ? escapeHtml(v.number)+' · variation' : 'New variation'}</h3>
    <div class="formfield"><label class="field-label">Title</label><input type="text" id="finVaTitle" value="${val('title')}" placeholder="e.g. Replace rotten rafters to rear slope"></div>
    <div class="formfield"><label class="field-label">Description</label><textarea id="finVaDesc" rows="3">${val('description')}</textarea></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Instructed by</label><input type="text" id="finVaBy" value="${val('instructed_by')}" placeholder="Name / client"></div>
      <div class="formfield"><label class="field-label">Instruction ref (AI / CVI no.)</label><input type="text" id="finVaRef" value="${val('instruction_ref')}"></div>
      <div class="formfield"><label class="field-label">Instructed on</label><input type="date" id="finVaOn" value="${v&&v.instructed_on||finToday()}"></div>
      <div class="formfield"><label class="field-label">Status</label><select id="finVaStatus">${Object.keys(FIN_VAR_STATUS).map(k=>`<option value="${k}" ${(v?v.status:'instructed')===k?'selected':''}>${FIN_VAR_STATUS[k]}</option>`).join('')}</select></div>
      <div class="formfield"><label class="field-label">Our cost estimate £</label><input type="text" inputmode="decimal" data-money id="finVaCost" value="${val('cost_estimate')}"></div>
      <div class="formfield"><label class="field-label">Quoted to client £</label><input type="text" inputmode="decimal" data-money id="finVaQuote" value="${val('quoted')}"></div>
      <div class="formfield"><label class="field-label">Submitted on</label><input type="date" id="finVaSub" value="${v&&v.submitted_on||''}"></div>
      <div class="formfield"><label class="field-label">Agreed value £</label><input type="text" inputmode="decimal" data-money id="finVaAgreed" value="${val('agreed_value')}"></div>
      <div class="formfield"><label class="field-label">Agreed on</label><input type="date" id="finVaAgOn" value="${v&&v.agreed_on||''}"></div>
    </div>
    <div class="formfield"><label class="field-label">Notes</label><textarea id="finVaNotes" rows="2">${val('notes')}</textarea></div>
    <div class="formfield"><label class="field-label">Instruction / quote document</label>${v&&v.file_path?`<button class="ghostbtn" style="width:auto;margin-bottom:6px;" onclick="openFinDoc('${jsAttr(v.file_path)}','${jsAttr(v.file_name||'')}')">View ${escapeHtml(v.file_name||'file')}</button>`:''}<input type="file" id="finVaFile" accept=".pdf,image/*,.doc,.docx,.xlsx,.xls"></div>
    <button class="darkbtn" style="width:100%;" id="finVaSave" onclick="saveFinVariation('${siteId}','${v?v.id:''}')">Save</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finVarOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.saveFinVariation = async function(siteId, id){
  const title = finVal('finVaTitle'); if(!title){ toast('Give it a title.'); return; }
  const num = k=>{ const n = finNum(finVal(k)); return (n===null || isNaN(n)) ? null : finRound(n); };
  let status = finVal('finVaStatus')||'instructed';
  const agreed = num('finVaAgreed');
  if(agreed!=null && status!=='rejected') status = 'agreed';
  const row = {title, description:finVal('finVaDesc')||null, instructed_by:finVal('finVaBy')||null, instruction_ref:finVal('finVaRef')||null, instructed_on:finVal('finVaOn')||null, status,
    cost_estimate:num('finVaCost'), quoted:num('finVaQuote'), submitted_on:finVal('finVaSub')||null, agreed_value:agreed, agreed_on:finVal('finVaAgOn')||(status==='agreed'?finToday():null), notes:finVal('finVaNotes')||null, updated_at:new Date().toISOString()};
  if(row.status==='instructed' && row.quoted!=null) row.status = 'priced';
  const btn = document.getElementById('finVaSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const fileEl = document.getElementById('finVaFile'); const file = fileEl && fileEl.files && fileEl.files[0];
  if(file){
    const stored = await uploadToStorage('finance-docs', ME.org_id+'/'+siteId+'/variations/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80), file, file.type||'application/octet-stream');
    if(stored){ row.file_path = stored; row.file_name = file.name; }
  }
  const r = id ? await dbUpdate('fin_variations', id, row) : await finVarInsert(siteId, row);
  if(btn){ btn.disabled = false; btn.textContent = 'Save'; }
  if(!r) return;
  document.getElementById('finVarOverlay').style.display = 'none'; toast('Variation saved'); render();
};
window.finVarExport = async function(siteId, kind){
  const site = SITES.find(s=>s.id===siteId) || {};
  const vars = await dbSelect('fin_variations', 'site_id=eq.'+siteId+'&order=seq.asc');
  const cols = [{k:'number', l:'No.', w:50}, {k:'title', l:'Variation', w:230}, {k:'ref', l:'Instruction', w:110}, {k:'on', l:'Instructed', w:70, date:true}, {k:'status', l:'Status', w:70}, {k:'cost', l:'Our cost £', w:70, money:true}, {k:'quoted', l:'Quoted £', w:70, money:true}, {k:'agreed', l:'Agreed £', w:70, money:true}];
  const rows = vars.map(v=>({number:v.number, title:v.title, ref:[v.instruction_ref, v.instructed_by].filter(Boolean).join(' · '), on:v.instructed_on, status:FIN_VAR_STATUS[v.status]||v.status, cost:v.cost_estimate!=null?Number(v.cost_estimate):null, quoted:v.quoted!=null?Number(v.quoted):null, agreed:v.agreed_value!=null?Number(v.agreed_value):null}));
  return finExportTable(kind, {title:'Variations register — '+(site.job_number?site.job_number+' · ':'')+(site.name||''), cols, rows, totals:{cost:true, quoted:true, agreed:true}, name:'Variations - '+(site.job_number||'')+' '+(site.name||'')});
};
