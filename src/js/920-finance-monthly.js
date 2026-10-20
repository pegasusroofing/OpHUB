/* ============================================================
   OpHUB Finance — monthly project report (Coreloops-style cost report).
   #/site/<id>/finance/monthly
   One column per month: applied, certified, invoiced and actual costs in
   the month, then a total column with the forecast value, budget and
   final cost. Grouped: Total, then each plot / repair job, then
   "Not allocated". Excel / PDF export.
   ============================================================ */
let finMon = null;
function finMonthKey(d){ return d ? String(d).slice(0,7) : ''; }
function finMonthLabel(k){ const [y,m] = k.split('-').map(Number); return new Date(y, m-1, 1).toLocaleDateString('en-GB', {month:'short', year:'numeric'}); }
async function renderFinMonthly(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId); if(!site){ go('#/finance'); return; }
  const [b, subs] = await Promise.all([finLoadBook(siteId), finSubJobsLoad(siteId)]);
  const jf = finBy(b.jf, siteId)[0] || {};
  const bt = finBillingType(jf, finBy(b.items, siteId).length, finBy(b.apps, siteId).length);
  const sv = subs.length ? await finSubValues(siteId, bt) : {values:{}};
  if(__gen !== RENDER_GEN) return;
  const fc = finJobForecast(b, siteId);
  const lines = fc.lines;
  const apps = finBy(b.apps, siteId).filter(a=>a.status!=='void' && a.status!=='draft').sort((x,y)=>x.number-y.number);
  const invs = finBy(b.invs, siteId).filter(i=>!['void','draft'].includes(i.status));
  const items = finBy(b.items, siteId);
  const plots = finItemPlots(items);
  // Groups: '' = total, sub ids, 'none' = not allocated.
  const groups = [{id:'all', name:'Total'}].concat(subs.length ? subs.map(a=>({id:a.id, name:a.label})).concat([{id:'none', name:'Not allocated'}]) : []);
  const blank = ()=>({applied:{}, certified:{}, invoiced:{}, cost:{}});
  const data = {}; groups.forEach(g=>data[g.id] = blank());
  const add = (g, row, m, v)=>{ if(!data[g] || !m || !v) return; data[g][row][m] = finRound((data[g][row][m]||0) + v); };
  const months = new Set();
  // Applied / certified in the period = this application's cumulative less the last one.
  let prevG = 0, prevC = 0; const prevPlot = {};
  apps.forEach(a=>{
    const m = finMonthKey(a.valuation_date); months.add(m);
    const g = Number(a.gross||0); add('all', 'applied', m, finRound(g - prevG)); prevG = g;
    if(a.cert_gross!=null){ const cm = finMonthKey(a.cert_date || a.valuation_date); months.add(cm); add('all', 'certified', cm, finRound(Number(a.cert_gross) - prevC)); prevC = Number(a.cert_gross); }
    if(subs.length){
      const byPlot = {};
      (a.lines||[]).forEach(l=>{ if(!finIsItem(l)) return; const k = plots[l.item_id] || 'none'; byPlot[k] = (byPlot[k]||0) + Number(l.value||0)*finPct(l.pct)/100; });
      Object.keys(Object.assign({}, byPlot, prevPlot)).forEach(k=>{ const now = finRound(byPlot[k]||0); add(data[k] ? k : 'none', 'applied', m, finRound(now - (prevPlot[k]||0))); prevPlot[k] = now; });
    }
  });
  invs.forEach(i=>{ const m = finMonthKey(i.issue_date || i.created_at); months.add(m); add('all', 'invoiced', m, Number(i.net||0)); });
  lines.filter(l=>l.cat!=='committed').forEach(l=>{ const m = finMonthKey(l.date); if(!m) return; months.add(m); add('all', 'cost', m, l.net); if(subs.length) add(l.sub && data[l.sub] ? l.sub : 'none', 'cost', m, l.net); });
  months.add(finMonthKey(finToday()));
  const ms = Array.from(months).filter(Boolean).sort();
  // fill gaps between first and last month
  const all = []; if(ms.length){ let [y,mo] = ms[0].split('-').map(Number); const [ly,lm] = ms[ms.length-1].split('-').map(Number); while(y<ly || (y===ly && mo<=lm)){ all.push(y+'-'+String(mo).padStart(2,'0')); mo++; if(mo>12){ mo=1; y++; } } }
  // Per-group forecast figures (total column).
  const schedCostBy = {}; items.filter(finIsItem).forEach(i=>{ if(i.cost==null) return; const k = plots[i.id] || 'none'; schedCostBy[k] = finRound((schedCostBy[k]||0) + Number(i.cost)); });
  const committedBy = {}; lines.filter(l=>l.cat==='committed').forEach(l=>{ const k = l.sub && data[l.sub] ? l.sub : 'none'; committedBy[k] = finRound((committedBy[k]||0) + l.net); });
  const fcast = {all:{value:fc.ffa, budget:fc.budgetTotal, final:fc.forecastCost}};
  groups.slice(1).forEach(g=>{
    const k = g.id, value = k==='none' ? (sv.values['']!=null ? sv.values[''] : null) : (sv.values[k]!=null ? sv.values[k] : null);
    const spent = finRound(Object.values(data[k].cost).reduce((t,v)=>t+v,0)), com = committedBy[k]||0, budget = schedCostBy[k]!=null ? schedCostBy[k] : null;
    fcast[k] = {value, budget, final: finRound(Math.max(budget||0, spent + com))};
  });
  finMon = {siteId, site, groups, data, months:all, fcast, open:finMon && finMon.siteId===siteId ? finMon.open : {all:true}, view:finMon && finMon.siteId===siteId ? finMon.view : 'month'};
  document.getElementById('app').innerHTML = shell(`
    <div class="fincosttools">
      <div class="finseg" style="margin:0;"><button type="button" class="${finMon.view==='month'?'on':''}" onclick="finMon.view='month';finMonPaint()">In the month</button><button type="button" class="${finMon.view==='cum'?'on':''}" onclick="finMon.view='cum';finMonPaint()">Running total</button></div>
      <div class="fincosttools-b">
        <button class="ghostbtn" onclick="finMonExport('xlsx')">Excel</button>
        <button class="ghostbtn" onclick="finMonExport('pdf')">PDF</button>
      </div>
    </div>
    <div id="finMonTbl"></div>
    <p class="stub" style="margin:10px 0 0;font-style:normal;">Excl. VAT. Applied and certified = the change from the last application. Actual costs are by invoice / work date. Forecast value, budget and final cost are in the total column.${groups.length>1?' Plot figures use the plot on each schedule line and each cost.':''}</p>
  `, {title:'Monthly report', subtitle:(site.job_number?site.job_number+' · ':'')+site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false, wide:true});
  finMonPaint();
}
const FIN_MON_ROWS = [{k:'applied', l:'Applied'}, {k:'certified', l:'Certified', totalOnly:true}, {k:'invoiced', l:'Invoiced'}, {k:'cost', l:'Actual costs'}];
function finMonRows(){
  const M = finMon, out = [];
  M.groups.forEach(g=>{
    const d = M.data[g.id], f = M.fcast[g.id] || {};
    const rows = FIN_MON_ROWS.filter(r=>g.id==='all' || !['certified','invoiced'].includes(r.k)).map(r=>{
      let run = 0; const vals = M.months.map(m=>{ const v = d[r.k][m]||0; run = finRound(run+v); return M.view==='cum' ? run : v; });
      return {g, label:r.l, vals, total:finRound(Object.values(d[r.k]).reduce((t,v)=>t+v,0))};
    });
    rows.push({g, label:'Forecast value', vals:null, total:f.value});
    rows.push({g, label:'Forecast budget', vals:null, total:f.budget});
    rows.push({g, label:'Forecast final cost', vals:null, total:f.final});
    out.push({g, rows});
  });
  return out;
}
window.finMonPaint = function(){
  const box = document.getElementById('finMonTbl'); if(!box || !finMon) return;
  const M = finMon, cur = finMonthKey(finToday());
  const cell = v=>v==null ? '' : (v ? finMoney(v) : '<span class="stub">£0.00</span>');
  box.innerHTML = `<div class="finreptbl-wrap finmon-wrap"><table class="fincosttbl finmon">
    <thead><tr><th>Cost report</th>${M.months.map(m=>`<th class="num ${m===cur?'cur':''}">${finMonthLabel(m)}</th>`).join('')}<th class="num">Total</th></tr></thead>
    <tbody>${finMonRows().map(({g, rows})=>`
      <tr class="finmon-g" onclick="finMon.open['${g.id}']=!finMon.open['${g.id}'];finMonPaint()"><td colspan="${M.months.length+2}"><span class="finarrow">${M.open[g.id]?'▼':'▶'}</span> ${escapeHtml(g.name)}</td></tr>
      ${M.open[g.id] ? rows.map(r=>`<tr><td class="d">${escapeHtml(r.label)}</td>${M.months.map((m,i)=>`<td class="num ${m===cur?'cur':''}">${r.vals ? cell(r.vals[i]) : ''}</td>`).join('')}<td class="num"><b>${r.total==null ? '—' : finMoney(r.total)}</b></td></tr>`).join('') : ''}`).join('')}
    </tbody></table></div>`;
};
window.finMonExport = function(kind){
  const M = finMon; if(!M) return;
  const cols = [{k:'g', l:'Group'}, {k:'label', l:'Row'}].concat(M.months.map((m,i)=>({k:'m'+i, l:finMonthLabel(m), money:true}))).concat([{k:'total', l:'Total', money:true}]);
  const rows = [];
  finMonRows().forEach(({g, rows:rs})=>rs.forEach(r=>{ const o = {g:g.name, label:r.label, total:r.total}; if(r.vals) r.vals.forEach((v,i)=>o['m'+i] = v); rows.push(o); }));
  const s = M.site;
  return finExportTable(kind, {title:'Monthly report — '+(s.job_number?s.job_number+' ':'')+s.name, subtitle:M.view==='cum'?'Running totals':'In the month', cols, rows, name:'Monthly report - '+(s.job_number||s.name)});
};
