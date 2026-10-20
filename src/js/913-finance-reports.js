/* ============================================================
   OpHUB Finance — Reports   #/finance/reports  ·  #/finance/reports/<id>
   Each report is {id, group, title, desc, filters, run(f) → {cols, rows, note}}.
   cols: {k, l, money?, num?, pct?, date?, w (PDF width)}. One table renderer
   (table on a computer, cards on a phone) and one Excel / PDF exporter.
   ============================================================ */
const FIN_REPORT_GROUPS = {qs:'Commercial / QS', money:'Money in & out', tax:'Labour, CIS & VAT'};
let finRep = null; // {id, f:{job, from, to, status, opening}, data}
let finRepBook = null, finRepBookAt = 0;

async function finRepBookLoad(){
  if(finRepBook && Date.now() - finRepBookAt < 15000 && finRepBook.__route===location.hash) return finRepBook;
  finRepBook = await finLoadBook(null); finRepBookAt = Date.now(); finRepBook.__route = location.hash;
  return finRepBook;
}
function finRepSites(f){
  return SITES.filter(s=>(!f.job || s.id===f.job) && (f.status==='all' || !f.status || finSiteStatus(s)===f.status))
    .sort((a,b)=>String(a.job_number||'').localeCompare(String(b.job_number||''), undefined, {numeric:true}));
}
function finRepJob(s){ return (s.job_number ? s.job_number+' · ' : '')+(s.name||''); }
function finInRange(d, f){ return d && (!f.from || d >= f.from) && (!f.to || d <= f.to); }
function finDaysBetween(a, b){ return Math.round((new Date(b+'T12:00:00') - new Date(a+'T12:00:00'))/864e5); }

const FIN_REPORTS = [
  {id:'overview', group:'qs', title:'Company overview', desc:'Every project: contract, final account, invoiced, owed, costs, forecast margin.', filters:['status','job'], run:async f=>{
    const b = await finRepBookLoad();
    const rows = finRepSites(f).map(s=>{ const fc = finJobForecast(b, s.id); return {job:finRepJob(s), client:s.client_name||'', contract:fc.contract, vars:fc.vAgreed, ffa:fc.ffa, invoiced:fc.invoiced, owed:fc.owed, cost:fc.costToDate, committed:fc.committedTotal, fcost:fc.budgetTotal==null?null:fc.forecastCost, margin:fc.budgetTotal==null?null:fc.forecastMargin, pct:fc.budgetTotal==null?null:fc.forecastMarginPct, ret:fc.retHeld, _go:`#/site/${s.id}/finance`}; });
    return {cols:[{k:'job',l:'Project',w:150},{k:'client',l:'Client',w:90},{k:'contract',l:'Contract',money:1},{k:'vars',l:'Variations agreed',money:1},{k:'ffa',l:'Forecast final account',money:1},{k:'invoiced',l:'Invoiced',money:1},{k:'owed',l:'Owed',money:1},{k:'cost',l:'Costs to date',money:1},{k:'committed',l:'Ordered, not invoiced',money:1},{k:'fcost',l:'Expected final cost (needs a budget)',money:1},{k:'margin',l:'Expected profit',money:1},{k:'pct',l:'Profit %',pct:1},{k:'ret',l:'Retention held',money:1}], rows, totals:true};
  }},
  {id:'cvr', group:'qs', title:'Cost value reconciliation (CVR)', desc:'Value to date against cost to date, and the forecast at completion, project by project.', filters:['status','job'], run:async f=>{
    const b = await finRepBookLoad();
    const rows = finRepSites(f).map(s=>{ const fc = finJobForecast(b, s.id); return {job:finRepJob(s), value:fc.sales, cost:fc.costToDate, margin:fc.salesMargin, mpct:fc.salesMarginPct, committed:fc.committedTotal, ffa:fc.ffa, fcost:fc.forecastCost, fmargin:fc.forecastMargin, fpct:fc.forecastMarginPct, _go:`#/site/${s.id}/finance/budget`}; });
    return {cols:[{k:'job',l:'Project',w:160},{k:'value',l:'Value to date',money:1},{k:'cost',l:'Cost to date',money:1},{k:'margin',l:'Margin to date',money:1},{k:'mpct',l:'%',pct:1},{k:'committed',l:'Committed',money:1},{k:'ffa',l:'Forecast final account',money:1},{k:'fcost',l:'Forecast final cost',money:1},{k:'fmargin',l:'Forecast margin',money:1},{k:'fpct',l:'%',pct:1}], rows, totals:true, note:'Value to date is the latest certified (or applied) gross valuation. Cost to date excludes committed orders.'};
  }},
  {id:'ffa', group:'qs', title:'Forecast final account', desc:'Contract sum plus variations agreed, submitted and instructed, by project.', filters:['status','job'], run:async f=>{
    const b = await finRepBookLoad();
    const rows = finRepSites(f).map(s=>{ const fc = finJobForecast(b, s.id); return {job:finRepJob(s), contract:fc.contract, agreed:fc.vAgreed, pending:fc.vPending, ffa:fc.ffa, instructed:fc.vInstructed, certified:fc.certified, _go:`#/site/${s.id}/finance/variations`}; });
    return {cols:[{k:'job',l:'Project',w:170},{k:'contract',l:'Contract sum',money:1},{k:'agreed',l:'Variations agreed',money:1},{k:'pending',l:'Submitted, not agreed',money:1},{k:'ffa',l:'Forecast final account',money:1},{k:'instructed',l:'Instructed, not priced (est.)',money:1},{k:'certified',l:'Certified to date',money:1}], rows, totals:true};
  }},
  {id:'budget', group:'qs', title:'Budget vs actual', desc:'Budget, spent, committed and forecast by heading, for one project or all.', filters:['status','job'], run:async f=>{
    const b = await finRepBookLoad(); const rows = [];
    finRepSites(f).forEach(s=>{ const fc = finJobForecast(b, s.id); fc.cats.forEach(k=>{ if(!fc.actual[k] && !fc.committed[k] && fc.budget[k]==null) return; rows.push({job:finRepJob(s), head:FIN_COST_CATS[k], budget:fc.budget[k], spent:fc.actual[k], committed:fc.committed[k], tc:fc.toComplete[k], forecast:fc.forecast[k], variance:fc.budget[k]!=null ? finRound(fc.budget[k]-fc.forecast[k]) : null, _go:`#/site/${s.id}/finance/budget`}); }); });
    return {cols:[{k:'job',l:'Project',w:150},{k:'head',l:'Heading',w:90},{k:'budget',l:'Budget',money:1},{k:'spent',l:'Spent',money:1},{k:'committed',l:'Committed',money:1},{k:'tc',l:'To complete',money:1},{k:'forecast',l:'Forecast final',money:1},{k:'variance',l:'Under (+) / over (−)',money:1}], rows, totals:true};
  }},
  {id:'costs', group:'qs', title:'Costs by project and type', desc:'Materials, labour, plant, subcontract, prelims and other costs per project.', filters:['status','job','dates'], run:async f=>{
    const b = await finRepBookLoad(); const keys = Object.keys(FIN_COST_CATS);
    const rows = finRepSites(f).map(s=>{ const r = {job:finRepJob(s), _go:`#/site/${s.id}/finance/costs`}; keys.forEach(k=>r[k]=0); finCostLinesFromBook(b, s.id).forEach(l=>{ if(l.cat!=='committed' && (!f.from && !f.to || finInRange(l.date, f))) r[l.cat] += l.net; }); keys.forEach(k=>r[k]=finRound(r[k])); r.total = finRound(keys.reduce((t,k)=>t+r[k],0)); return r; }).filter(r=>r.total);
    return {cols:[{k:'job',l:'Project',w:170}, ...keys.map(k=>({k, l:FIN_COST_CATS[k], money:1})), {k:'total',l:'Total',money:1}], rows, totals:true};
  }},
  {id:'variations', group:'qs', title:'Variations register', desc:'Every variation on every project with its status and values.', filters:['status','job','varstatus'], run:async f=>{
    const b = await finRepBookLoad(); const ids = new Set(finRepSites(f).map(s=>s.id));
    const rows = (b.vars||[]).filter(v=>ids.has(v.site_id) && (!f.varstatus || v.status===f.varstatus)).map(v=>{ const s = SITES.find(x=>x.id===v.site_id)||{}; return {job:finRepJob(s), no:v.number, title:v.title, on:v.instructed_on, status:FIN_VAR_STATUS[v.status]||v.status, cost:v.cost_estimate!=null?Number(v.cost_estimate):null, quoted:v.quoted!=null?Number(v.quoted):null, agreed:v.agreed_value!=null?Number(v.agreed_value):null, _go:`#/site/${v.site_id}/finance/variations`}; });
    return {cols:[{k:'job',l:'Project',w:120},{k:'no',l:'No.',w:40},{k:'title',l:'Variation',w:200},{k:'on',l:'Instructed',date:1},{k:'status',l:'Status',w:60},{k:'cost',l:'Our cost',money:1},{k:'quoted',l:'Quoted',money:1},{k:'agreed',l:'Agreed',money:1}], rows, totals:true};
  }},
  {id:'apps', group:'qs', title:'Applications & certificates', desc:'Applied, certified, shortfall and invoice for every application.', filters:['status','job','dates'], run:async f=>{
    const b = await finRepBookLoad(); const ids = new Set(finRepSites(f).map(s=>s.id));
    const invBy = {}; (b.invs||[]).forEach(i=>invBy[i.id]=i);
    const rows = (b.apps||[]).filter(a=>ids.has(a.site_id) && a.status!=='void' && (!f.from && !f.to || finInRange(a.valuation_date, f))).sort((x,y)=>String(y.valuation_date).localeCompare(String(x.valuation_date))).map(a=>{ const s = SITES.find(x=>x.id===a.site_id)||{}; const inv = invBy[a.invoice_id]; return {job:finRepJob(s), no:a.number, date:a.valuation_date, status:a.status, applied:Number(a.net_due||0), certified:a.cert_net!=null?Number(a.cert_net):null, short:a.cert_net!=null?finRound(Number(a.net_due||0)-Number(a.cert_net)):null, invoice:inv?inv.number:'', paid:inv?(finInvOutstanding(inv)>0?'Owed '+finMoney(finInvOutstanding(inv)):'Paid'):'', _go:`#/site/${a.site_id}/finance/application/${a.id}`}; });
    return {cols:[{k:'job',l:'Project',w:140},{k:'no',l:'App',num:1,w:36},{k:'date',l:'Valuation',date:1},{k:'status',l:'Status',w:60},{k:'applied',l:'Applied (net)',money:1},{k:'certified',l:'Certified (net)',money:1},{k:'short',l:'Shortfall',money:1},{k:'invoice',l:'Invoice',w:70},{k:'paid',l:'Payment',w:90}], rows, totals:true};
  }},
  {id:'retention', group:'qs', title:'Retention ledger', desc:'Retention held by your clients, release dates, and retention you hold on subcontractors.', filters:['status','job'], run:async f=>{
    const b = await finRepBookLoad(); const st = await finLoadSettings(); const rows = [];
    finRepSites(f).forEach(s=>{
      const apps = finBy(b.apps, s.id).filter(a=>a.status!=='void'); const held = finRetentionHeld(apps); const jf = finBy(b.jf, s.id)[0] || {};
      if(held){ const d = finRetentionDates(jf, st) || {}; rows.push({job:finRepJob(s), who:s.client_name||'Client', type:'Held by client (owed to us)', held, first:d.first||null, second:d.second||null, _go:`#/site/${s.id}/finance`}); }
      finBy(b.scs, s.id).forEach(sc=>{ const last = (b.sapps||[]).filter(a=>a.subcontract_id===sc.id && a.certified_gross!=null).sort((x,y)=>x.number-y.number).pop(); if(last && Number(last.retention)) rows.push({job:finRepJob(s), who:sc.name, type:'We hold (owed to subcontractor)', held:-Number(last.retention), first:null, second:null, _go:`#/site/${s.id}/finance/sub/${sc.id}`}); });
    });
    return {cols:[{k:'job',l:'Project',w:150},{k:'who',l:'Client / subcontractor',w:120},{k:'type',l:'Type',w:150},{k:'held',l:'Amount',money:1},{k:'first',l:'1st half due',date:1},{k:'second',l:'2nd half due',date:1}], rows, totals:true, note:'Negative amounts are retention you hold on subcontractors and will have to pay out.'};
  }},
  {id:'debtors', group:'money', title:'Aged debtors', desc:'Who owes you money and how overdue it is.', filters:['job'], run:async f=>{
    const b = await finRepBookLoad(); const today = finToday(); const ids = new Set(finRepSites(Object.assign({}, f, {status:'all'})).map(s=>s.id));
    const rows = (b.invs||[]).filter(i=>ids.has(i.site_id) && finInvOutstanding(i)>0).map(i=>{ const s = SITES.find(x=>x.id===i.site_id)||{}; const o = finInvOutstanding(i); const late = i.due_date ? finDaysBetween(i.due_date, today) : 0; const r = {client:i.bill_name||s.client_name||'', job:finRepJob(s), inv:i.number, date:i.issue_date, due:i.due_date, cur:0, d30:0, d60:0, d90:0, d90p:0, total:o, _go:`#/site/${i.site_id}/finance/invoice/${i.id}`}; if(late<=0) r.cur=o; else if(late<=30) r.d30=o; else if(late<=60) r.d60=o; else if(late<=90) r.d90=o; else r.d90p=o; return r; }).sort((x,y)=>String(x.client).localeCompare(String(y.client)));
    return {cols:[{k:'client',l:'Client',w:110},{k:'job',l:'Project',w:120},{k:'inv',l:'Invoice',w:60},{k:'due',l:'Due',date:1},{k:'cur',l:'Not due',money:1},{k:'d30',l:'1–30 days',money:1},{k:'d60',l:'31–60',money:1},{k:'d90',l:'61–90',money:1},{k:'d90p',l:'90+',money:1},{k:'total',l:'Total owed',money:1}], rows, totals:true, note:'Including VAT. Days overdue are counted from the invoice due date.'};
  }},
  {id:'creditors', group:'money', title:'Aged creditors', desc:'Supplier invoices and subcontractor payments you still have to pay.', filters:['job'], run:async f=>{
    const b = await finRepBookLoad(); const today = finToday(); const ids = new Set(finRepSites(Object.assign({}, f, {status:'all'})).map(s=>s.id)); const rows = [];
    const bucket = (r, amt, due)=>{ const late = finDaysBetween(due, today); r.cur=r.d30=r.d60=r.d90=r.d90p=0; if(late<=0) r.cur=amt; else if(late<=30) r.d30=amt; else if(late<=60) r.d60=amt; else if(late<=90) r.d90=amt; else r.d90p=amt; r.total=amt; return r; };
    (b.pinvs||[]).filter(i=>ids.has(i.site_id) && i.status==='approved' && !i.paid_on).forEach(i=>{ const s = SITES.find(x=>x.id===i.site_id)||{}; const due = i.due_date || finAddDays(i.invoice_date, 30); rows.push(bucket({who:i.supplier_name||'', job:finRepJob(s), ref:i.invoice_no||'', due, _go:`#/site/${i.site_id}/finance`}, Number(i.total||0), due)); });
    (b.sapps||[]).filter(a=>ids.has(a.site_id) && a.status==='certified').forEach(a=>{ const s = SITES.find(x=>x.id===a.site_id)||{}; const sc = (b.scs||[]).find(x=>x.id===a.subcontract_id)||{}; const due = a.final_date || finAddDays(a.app_date, 30); rows.push(bucket({who:sc.name||'Subcontractor', job:finRepJob(s), ref:(sc.number||'')+' app '+a.number, due, _go:`#/site/${a.site_id}/finance/sub/${a.subcontract_id}`}, Number(a.pay_amount||0), due)); });
    rows.sort((x,y)=>String(x.who).localeCompare(String(y.who)));
    return {cols:[{k:'who',l:'Supplier / subcontractor',w:120},{k:'job',l:'Project',w:120},{k:'ref',l:'Ref',w:70},{k:'due',l:'Due',date:1},{k:'cur',l:'Not due',money:1},{k:'d30',l:'1–30 days',money:1},{k:'d60',l:'31–60',money:1},{k:'d90',l:'61–90',money:1},{k:'d90p',l:'90+',money:1},{k:'total',l:'Total',money:1}], rows, totals:true, note:'Approved supplier invoices not marked paid (incl. VAT; due 30 days after the invoice date unless a due date was entered) and certified subcontractor payments not yet paid (after CIS).'};
  }},
  {id:'cashflow', group:'money', title:'Cash flow forecast', desc:'Money due in and out over the next 12 weeks, week by week.', filters:['opening'], run:async f=>{
    const b = await finRepBookLoad(); const mon = finMonday(finToday()); const weeks = [];
    for(let i=0;i<12;i++) weeks.push({wk:finAddDays(mon, i*7), inv:0, apps:0, sup:0, subs:0});
    const put = (date, k, amt)=>{ let i = date ? Math.floor(finDaysBetween(mon, date)/7) : 0; if(i<0) i = 0; if(i>11) return; weeks[i][k] += amt; };
    (b.invs||[]).filter(i=>finInvOutstanding(i)>0).forEach(i=>put(i.due_date, 'inv', finInvOutstanding(i)));
    (b.apps||[]).filter(a=>!a.invoice_id && ['submitted','certified'].includes(a.status)).forEach(a=>{ const jf = finBy(b.jf, a.site_id)[0] || {}; const vt = jf.vat_treatment || 'standard'; put(a.final_date||a.due_date, 'apps', Number(a.cert_net!=null?a.cert_net:a.net_due||0)*(vt==='standard'?1.2:1)); });
    (b.pinvs||[]).filter(i=>(!b.siteId || i.site_id===b.siteId) && i.status==='approved' && !i.paid_on).forEach(i=>put(i.due_date||finAddDays(i.invoice_date,30), 'sup', Number(i.total||0)));
    (b.sapps||[]).filter(a=>a.status==='certified').forEach(a=>put(a.final_date||finAddDays(a.app_date,30), 'subs', Number(a.pay_amount||0)));
    let bal = Number(f.opening||0);
    const rows = weeks.map(w=>{ const net = finRound(w.inv+w.apps-w.sup-w.subs); bal = finRound(bal+net); return {wk:w.wk, inv:finRound(w.inv), apps:finRound(w.apps), sup:finRound(-w.sup), subs:finRound(-w.subs), net, bal}; });
    return {cols:[{k:'wk',l:'Week of',date:1},{k:'inv',l:'In: invoices',money:1},{k:'apps',l:'In: applications not invoiced',money:1},{k:'sup',l:'Out: suppliers',money:1},{k:'subs',l:'Out: subcontractors',money:1},{k:'net',l:'Net',money:1},{k:'bal',l:'Running balance',money:1}], rows, totals:['inv','apps','sup','subs','net'], note:'Anything overdue is in the first week. Applications not yet invoiced are estimated at the certified (or applied) amount plus VAT. Add your bank balance as the opening balance.'};
  }},
  {id:'pos', group:'money', title:'Purchase order register', desc:'Every PO with its value, what’s been invoiced and what’s left.', filters:['status','job','dates','postatus'], run:async f=>{
    const b = await finRepBookLoad(); const ids = new Set(finRepSites(f).map(s=>s.id));
    const rows = (b.pos||[]).filter(p=>ids.has(p.site_id) && (!f.postatus || p.status===f.postatus) && (!f.from && !f.to || finInRange(String(p.created_at||'').slice(0,10), f))).sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at))).map(p=>{ const s = SITES.find(x=>x.id===p.site_id)||{}; const inv = finPoInvoiced(p, finBy(b.pinvs, p.site_id)); return {job:finRepJob(s), no:p.number, date:String(p.created_at||'').slice(0,10), supplier:p.supplier_name||'', status:FIN_PO_STATUS[p.status]||p.status, value:p.value!=null?Number(p.value):null, invoiced:inv, left:p.value!=null && p.status==='open' ? Math.max(0, finRound(Number(p.value)-inv)) : 0, _go:`#/site/${p.site_id}/finance/po/${p.id}`}; });
    return {cols:[{k:'job',l:'Project',w:130},{k:'no',l:'PO',w:80},{k:'date',l:'Date',date:1},{k:'supplier',l:'Supplier',w:110},{k:'status',l:'Status',w:55},{k:'value',l:'Value',money:1},{k:'invoiced',l:'Invoiced',money:1},{k:'left',l:'Still to come',money:1}], rows, totals:true};
  }},
  {id:'labour', group:'tax', title:'Labour by person', desc:'Days and cost per person per project.', filters:['job','dates'], run:async f=>{
    const b = await finRepBookLoad(); const by = {};
    finRepSites(Object.assign({}, f, {status:'all'})).forEach(s=>finCostLinesFromBook(b, s.id).filter(l=>l.cat==='labour' && (!f.from && !f.to || finInRange(l.date, f))).forEach(l=>{ const k = (l.person||l.who)+'|'+s.id; const r = by[k] = by[k] || {who:l.who, job:finRepJob(s), days:0, cost:0}; r.days += l.days || (l.key.startsWith('ck:') ? 1 : 0); r.cost += l.net; }));
    const rows = Object.values(by).map(r=>Object.assign(r, {cost:finRound(r.cost)})).sort((x,y)=>String(x.who).localeCompare(String(y.who)));
    return {cols:[{k:'who',l:'Person',w:140},{k:'job',l:'Project',w:170},{k:'days',l:'Days',num:1},{k:'cost',l:'Cost',money:1}], rows, totals:true};
  }},
  {id:'cis', group:'tax', title:'CIS payments', desc:'Subcontractor payments, materials and CIS deducted, for your return.', filters:['dates'], run:async f=>{
    const pays = await dbSelect('fin_sub_payments', 'org_id=eq.'+ME.org_id+'&status=eq.paid&order=paid_on.asc'+(f.from?'&paid_on=gte.'+f.from:'')+(f.to?'&paid_on=lte.'+f.to:''));
    const rates = await finLoadRates(); const by = {};
    pays.forEach(p=>{ const k = finPersonKey(p); const r = by[k] = by[k] || {who:p.name, utr:(rates[k]||{}).utr||p.utr||'', n:0, gross:0, mat:0, cis:0, net:0}; r.n++; r.gross += Number(p.gross); r.mat += Number(p.materials); r.cis += Number(p.cis_deduction); r.net += Number(p.net_pay); });
    const rows = Object.values(by).map(r=>Object.assign(r, {gross:finRound(r.gross), mat:finRound(r.mat), cis:finRound(r.cis), net:finRound(r.net)}));
    return {cols:[{k:'who',l:'Subcontractor',w:150},{k:'utr',l:'UTR',w:80},{k:'n',l:'Payments',num:1},{k:'gross',l:'Gross',money:1},{k:'mat',l:'Materials',money:1},{k:'cis',l:'CIS deducted',money:1},{k:'net',l:'Paid',money:1}], rows, totals:['gross','mat','cis','net'], note:'Payments marked paid in the date range. Pick the 6th of one month to the 5th of the next for a CIS return.'};
  }},
  {id:'vat', group:'tax', title:'VAT listing', desc:'Sales and purchase invoices in a period with net and VAT, incl. reverse charge.', filters:['dates'], run:async f=>{
    const b = await finRepBookLoad(); const rows = [];
    (b.invs||[]).filter(i=>i.status!=='void' && (!f.from && !f.to || finInRange(i.issue_date, f))).forEach(i=>{ const s = SITES.find(x=>x.id===i.site_id)||{}; rows.push({type:'Sales', date:i.issue_date, ref:i.number, who:i.bill_name||'', job:finRepJob(s), vatt:i.vat_treatment==='reverse_charge'?'Reverse charge':i.vat_treatment==='zero'?'Zero rated':'Standard', net:Number(i.net||0), vat:Number(i.vat||0), _go:`#/site/${i.site_id}/finance/invoice/${i.id}`}); });
    (b.pinvs||[]).filter(i=>i.status==='approved' && (!f.from && !f.to || finInRange(i.invoice_date, f))).forEach(i=>{ const s = SITES.find(x=>x.id===i.site_id)||{}; rows.push({type:'Purchase', date:i.invoice_date, ref:i.invoice_no||'', who:i.supplier_name||'', job:finRepJob(s), vatt:Number(i.vat)?'Standard':'No VAT', net:Number(i.net||0), vat:Number(i.vat||0)}); });
    rows.sort((x,y)=>x.type.localeCompare(y.type) || String(x.date).localeCompare(String(y.date)));
    const sv = finRound(rows.filter(r=>r.type==='Sales').reduce((t,r)=>t+r.vat,0)), pv = finRound(rows.filter(r=>r.type==='Purchase').reduce((t,r)=>t+r.vat,0));
    return {cols:[{k:'type',l:'Type',w:55},{k:'date',l:'Date',date:1},{k:'ref',l:'Ref',w:70},{k:'who',l:'Client / supplier',w:120},{k:'job',l:'Project',w:120},{k:'vatt',l:'VAT',w:70},{k:'net',l:'Net',money:1},{k:'vat',l:'VAT £',money:1}], rows, totals:false, note:`Output VAT ${finMoney(sv)} · input VAT ${finMoney(pv)} · difference ${finMoney(sv-pv)}. Reverse-charge sales carry no VAT here; your customer accounts for it. Check against Xero before filing.`};
  }},
];

/* ---------- reports home ---------- */
function renderFinReports(){
  if(!finGuard()) return;
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('reports')}
    <p class="stub" style="margin:0 0 16px;">Pick a report, set the project and dates, then download it as Excel or PDF.</p>
    ${Object.keys(FIN_REPORT_GROUPS).map(g=>`<p class="sectiontitle">${FIN_REPORT_GROUPS[g]}</p>
      <div class="finrepgrid">${FIN_REPORTS.filter(r=>r.group===g).map(r=>`<button type="button" class="finrepcard" onclick="finRep=null;go('#/finance/reports/${r.id}')"><b>${escapeHtml(r.title)}</b><span>${escapeHtml(r.desc)}</span></button>`).join('')}</div>`).join('')}
  `, {title:'Reports', subtitle:'OpHUB Finance', back:finSecBack(), tabs:false});
}

/* ---------- one report ---------- */
async function renderFinReport(id){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const rep = FIN_REPORTS.find(r=>r.id===id); if(!rep){ go('#/finance/reports'); return; }
  if(!finRep || finRep.id!==id) finRep = {id, f:{job:'', from:'', to:'', status:'live', opening:'', varstatus:'', postatus:''}, sort:null, dir:1};
  const f = finRep.f;
  const jobs = SITES.slice().sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
  const has = k=>rep.filters.includes(k);
  document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 12px;">${escapeHtml(rep.desc)}</p>
    <div class="fincosttools">
      ${has('status') ? `<label>Projects<select onchange="finRep.f.status=this.value;finRepRun()"><option value="live" ${f.status==='live'?'selected':''}>Live</option><option value="upcoming" ${f.status==='upcoming'?'selected':''}>Upcoming</option><option value="closed" ${f.status==='closed'?'selected':''}>Closed</option><option value="all" ${f.status==='all'?'selected':''}>All</option></select></label>` : ''}
      ${has('job') ? `<label>Project<select onchange="finRep.f.job=this.value;finRepRun()"><option value="">All projects</option>${jobs.map(s=>`<option value="${s.id}" ${f.job===s.id?'selected':''}>${escapeHtml(finRepJob(s))}</option>`).join('')}</select></label>` : ''}
      ${has('dates') ? `<label>From<input type="date" value="${f.from}" onchange="finRep.f.from=this.value;finRepRun()"></label><label>To<input type="date" value="${f.to}" onchange="finRep.f.to=this.value;finRepRun()"></label>` : ''}
      ${has('varstatus') ? `<label>Status<select onchange="finRep.f.varstatus=this.value;finRepRun()"><option value="">Any</option>${Object.keys(FIN_VAR_STATUS).map(k=>`<option value="${k}" ${f.varstatus===k?'selected':''}>${FIN_VAR_STATUS[k]}</option>`).join('')}</select></label>` : ''}
      ${has('postatus') ? `<label>PO status<select onchange="finRep.f.postatus=this.value;finRepRun()"><option value="">Any</option>${Object.keys(FIN_PO_STATUS).map(k=>`<option value="${k}" ${f.postatus===k?'selected':''}>${FIN_PO_STATUS[k]}</option>`).join('')}</select></label>` : ''}
      ${has('opening') ? `<label>Opening bank balance £<input type="text" inputmode="decimal" data-money value="${escapeHtml(String(f.opening||''))}" onchange="finRep.f.opening=finNum(this.value)||0;finRepRun()"></label>` : ''}
      <div class="fincosttools-b">
        <button class="ghostbtn" onclick="finRepExport('xlsx')">Excel</button>
        <button class="ghostbtn" onclick="finRepExport('pdf')">PDF</button>
      </div>
    </div>
    <div id="finRepOut"><div class="empty">Working it out…</div></div>
  `, {title:rep.title, subtitle:'OpHUB Finance · reports', back:'#/finance/reports', tabs:false});
  if(__gen !== RENDER_GEN) return;
  finRepRun();
}
window.finRepRun = async function(){
  const rep = FIN_REPORTS.find(r=>r.id===finRep.id); if(!rep) return;
  const out = document.getElementById('finRepOut'); if(!out) return;
  try{ finRep.data = await rep.run(finRep.f); }catch(e){ console.error(e); out.innerHTML = `<div class="empty">Couldn’t build this report — ${escapeHtml(String(e.message||e))}</div>`; return; }
  finRepPaint();
};
function finRepCell(c, v){
  if(v==null || v==='') return '';
  if(c.money) return finMoney(v);
  if(c.pct) return finPctTxt(v);
  if(c.date) return finDate(v);
  return escapeHtml(String(v));
}
function finRepTotals(d){
  if(!d.totals) return null;
  const keys = Array.isArray(d.totals) ? d.totals : d.cols.filter(c=>c.money).map(c=>c.k);
  const t = {}; keys.forEach(k=>t[k] = finRound(d.rows.reduce((s,r)=>s+(Number(r[k])||0),0)));
  return t;
}
function finRepSorted(){
  const d = finRep.data; if(!finRep.sort) return d.rows;
  const k = finRep.sort, dir = finRep.dir, c = d.cols.find(x=>x.k===k) || {};
  return d.rows.slice().sort((a,b)=>{ const x = a[k], y = b[k]; if(x==y) return 0; if(x==null) return 1; if(y==null) return -1; return ((c.money||c.num||c.pct) ? (Number(x)-Number(y)) : String(x).localeCompare(String(y), undefined, {numeric:true}))*dir; });
}
window.finRepSort = function(k){ if(finRep.sort===k) finRep.dir = -finRep.dir; else { finRep.sort = k; finRep.dir = 1; } finRepPaint(); };
function finRepPaint(){
  const out = document.getElementById('finRepOut'); const d = finRep.data; if(!out || !d) return;
  const rows = finRepSorted(); const t = finRepTotals(d);
  const isN = c=>c.money||c.num||c.pct;
  out.innerHTML = rows.length ? `<div class="finreptbl-wrap"><table class="fincosttbl finreptbl">
    <thead><tr>${d.cols.map(c=>`<th class="${isN(c)?'num':''}" onclick="finRepSort('${c.k}')">${escapeHtml(c.l)}${finRep.sort===c.k?(finRep.dir>0?' ▲':' ▼'):''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr ${r._go?`class="click" onclick="go('${r._go}')"`:''}>${d.cols.map((c,i)=>`<td data-l="${escapeHtml(c.l)}" class="${isN(c)?'num':''}${i===0?' d':''}" ${c.money && Number(r[c.k])<0?'style="color:var(--red);"':''}>${finRepCell(c, r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody>
    ${t ? `<tfoot><tr>${d.cols.map((c,i)=>`<td class="${isN(c)?'num':''}">${i===0 ? 'Total · '+rows.length+' row'+(rows.length===1?'':'s') : (c.k in t ? finMoney(t[c.k]) : '')}</td>`).join('')}</tr></tfoot>` : ''}
  </table></div>${d.note?`<p class="stub" style="margin-top:12px;">${escapeHtml(d.note)}</p>`:''}` : `<div class="empty">Nothing to show for these filters.</div>${d.note?`<p class="stub" style="margin-top:12px;">${escapeHtml(d.note)}</p>`:''}`;
}
window.finRepExport = async function(kind){
  const rep = FIN_REPORTS.find(r=>r.id===finRep.id); const d = finRep.data; if(!rep || !d) return;
  const f = finRep.f; const job = f.job ? SITES.find(s=>s.id===f.job) : null;
  const sub = [job ? finRepJob(job) : (rep.filters.includes('status') ? ({live:'Live projects', upcoming:'Upcoming projects', closed:'Closed projects', all:'All projects'}[f.status]) : ''), (f.from||f.to) ? (f.from?finDate(f.from):'start')+' to '+(f.to?finDate(f.to):'today') : ''].filter(Boolean).join(' · ');
  const t = finRepTotals(d);
  return finExportTable(kind, {title:rep.title, subtitle:sub, cols:d.cols, rows:finRepSorted(), totals:t ? Object.fromEntries(Object.keys(t).map(k=>[k,true])) : null, note:d.note, name:rep.title});
};

/* ---------- generic Excel / PDF export (reports, variations) ---------- */
async function finExportTable(kind, o){
  const fname = (o.name+' - '+finToday()).replace(/[\\/:*?"<>|]+/g,'');
  const head = (ORG&&ORG.name||'')+(o.subtitle?' · '+o.subtitle:'')+' · '+finDate(finToday())+' · excl. VAT unless stated';
  const val = (c, v)=>v==null||v==='' ? '' : (c.money ? finMoney(v) : c.pct ? finPctTxt(v) : c.date ? finDate(v) : String(v));
  const totKeys = o.totals ? Object.keys(o.totals) : [];
  if(kind==='xlsx'){
    if(!(await loadLib('ExcelJS'))){ toast('Could not load the Excel tool — check your connection.'); return; }
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Report', {views:[{state:'frozen', ySplit:4}]});
    ws.getCell('A1').value = o.title; ws.getCell('A1').font = {bold:true, size:14};
    ws.getCell('A2').value = head;
    ws.getRow(4).values = o.cols.map(c=>c.l); ws.getRow(4).font = {bold:true}; ws.getRow(4).fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFEEF1F4'}};
    o.rows.forEach((r,i)=>{ const row = ws.getRow(5+i); row.values = o.cols.map(c=>{ const v = r[c.k]; if(v==null || v==='') return null; if(c.date) return new Date(v+'T12:00:00'); if(c.money||c.num) return Number(v); if(c.pct) return Number(v)/100; return String(v); }); o.cols.forEach((c,j)=>{ const cell = row.getCell(j+1); if(c.money) cell.numFmt = '£#,##0.00;[Red]-£#,##0.00'; if(c.pct) cell.numFmt = '0.0%'; if(c.date) cell.numFmt = 'dd/mm/yyyy'; }); });
    if(totKeys.length && o.rows.length){ const tr = ws.getRow(5+o.rows.length); tr.getCell(1).value = 'Total'; o.cols.forEach((c,j)=>{ if(totKeys.includes(c.k)){ const col = ws.getColumn(j+1).letter; tr.getCell(j+1).value = {formula:`SUM(${col}5:${col}${4+o.rows.length})`}; tr.getCell(j+1).numFmt = '£#,##0.00;[Red]-£#,##0.00'; } }); tr.font = {bold:true}; }
    if(o.note) ws.getCell('A'+(7+o.rows.length)).value = o.note;
    o.cols.forEach((c,j)=>ws.getColumn(j+1).width = c.money ? 15 : Math.max(10, Math.round((c.w||80)/6)));
    ws.autoFilter = {from:{row:4, column:1}, to:{row:4, column:o.cols.length}};
    return deliverExcelBuffer(await wb.xlsx.writeBuffer(), fname+'.xlsx');
  }
  if(!(await loadLib('PDFLib'))){ toast('Could not load the PDF tool — check your connection.'); return; }
  const pdf = await PDFLib.PDFDocument.create();
  const reg = await pdf.embedFont(PDFLib.StandardFonts.Helvetica), bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, M = 28; const INK = PDFLib.rgb(0.07,0.08,0.09), SLATE = PDFLib.rgb(0.36,0.39,0.45), LINE = PDFLib.rgb(0.86,0.88,0.9);
  const raw = o.cols.map(c=>c.w || (c.money ? 70 : c.date ? 62 : c.pct ? 40 : c.num ? 40 : 80));
  const scale = Math.min(1, (W-2*M)/raw.reduce((a,b)=>a+b,0)); const widths = raw.map(w=>w*scale);
  const sz = scale < 0.8 ? 7 : 8;
  const fit = (t, f, s, w)=>{ t = String(t||''); while(t && f.widthOfTextAtSize(t, s) > w-5) t = t.slice(0,-2); return t; };
  let page, y;
  const newPage = ()=>{
    page = pdf.addPage([W, H]); y = H-M;
    page.drawText(o.title, {x:M, y:y-12, size:14, font:bold, color:INK});
    page.drawText(fit(head, reg, 9, W-2*M), {x:M, y:y-27, size:9, font:reg, color:SLATE});
    y -= 46; let x = M;
    o.cols.forEach((c,i)=>{ const t = fit(c.l, bold, sz, widths[i]); const tw = bold.widthOfTextAtSize(t, sz); page.drawText(t, {x:(c.money||c.num||c.pct) ? x+widths[i]-tw-2 : x+2, y, size:sz, font:bold, color:SLATE}); x += widths[i]; });
    y -= 6; page.drawLine({start:{x:M, y}, end:{x:W-M, y}, thickness:0.8, color:INK}); y -= 12;
  };
  const drawRow = (r, f)=>{ if(y < M+24) newPage(); let x = M; o.cols.forEach((c,i)=>{ const t = fit(val(c, r[c.k]), f, sz, widths[i]); const tw = f.widthOfTextAtSize(t, sz); page.drawText(t, {x:(c.money||c.num||c.pct) ? x+widths[i]-tw-2 : x+2, y, size:sz, font:f, color:INK}); x += widths[i]; }); page.drawLine({start:{x:M, y:y-4}, end:{x:W-M, y:y-4}, thickness:0.4, color:LINE}); y -= 14; };
  newPage();
  o.rows.forEach(r=>drawRow(r, reg));
  if(totKeys.length && o.rows.length){ const tr = {}; o.cols.forEach((c,i)=>{ if(totKeys.includes(c.k)) tr[c.k] = finRound(o.rows.reduce((s,r)=>s+(Number(r[c.k])||0),0)); }); tr[o.cols[0].k] = 'Total'; drawRow(tr, bold); }
  if(o.note){ y -= 6; finWrap(o.note, reg, 8.5, W-2*M).forEach(l=>{ if(y < M+12) newPage(); page.drawText(l, {x:M, y, size:8.5, font:reg, color:SLATE}); y -= 11; }); }
  const pages = pdf.getPages(); pages.forEach((p,i)=>p.drawText((i+1)+' of '+pages.length, {x:W-M-30, y:14, size:8, font:reg, color:SLATE}));
  viewPdfInApp(await pdf.save(), fname+'.pdf');
}
