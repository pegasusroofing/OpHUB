/* ============================================================
   OpHUB Finance — Budgets as a proper feature (25 Oct 2026, Andy: "make the budgets a bit
   more of a feature"). One project's Budget & forecast page now has:
   - a headline card: forecast profit (after company overheads), margin %, and one bar showing
     spent + ordered against the budget, with "on budget" / "£x over";
   - "Set budgets from a target margin": type the margin you want, it works out the money
     available for costs and splits it across the headings (you can change the split);
   - each heading row gets a used-of-budget bar, coloured amber near the limit and red over;
   - the Value card shows the company overheads (OHP) taken off.
   Same table, same Save — the headings still save to fin_job_budgets.
   ============================================================ */
const FIN_BUD_SPLIT_LS = 'ophub.finBudSplit';
const FIN_BUD_SPLIT_DEF = {materials:45, labour:30, plant:5, subcontract:10, overheads:7, other:3};
function finBudBarHtml(id){ return `<div class="fbb" id="${id}"><i class="s"></i><i class="c"></i></div>`; }
function finBudSetBar(id, spent, committed, budget){
  const el = document.getElementById(id); if(!el) return;
  const s = el.querySelector('.s'), c = el.querySelector('.c');
  if(!budget){ el.classList.add('none'); s.style.width = '0'; c.style.width = '0'; el.title = 'No budget'; return; }
  el.classList.remove('none');
  const ps = Math.min(100, spent/budget*100), pc = Math.min(100 - ps, committed/budget*100), used = (spent+committed)/budget*100;
  s.style.width = ps+'%'; c.style.width = pc+'%';
  el.classList.toggle('warn', used>=85 && used<=100); el.classList.toggle('over', used>100);
  el.title = Math.round(used)+'% of budget used (spent + ordered)';
}
async function renderFinBudget(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId); if(!site){ go('#/finance'); return; }
  const b = await finLoadBook(siteId);
  if(__gen !== RENDER_GEN) return;
  const fc = finJobForecast(b, siteId);
  finBud = {siteId, fc};
  const cell = (k, f)=>`<input type="text" inputmode="decimal" data-money data-k="${f}" data-c="${k}" value="${f==='budget' ? (fc.budget[k]!=null?fc.budget[k]:'') : (fc.tcSet[k]?fc.toComplete[k]:'')}" placeholder="${f==='to_complete' ? finMoneyIn(fc.toComplete[k]||0) : '£0.00'}" oninput="finBudPaint()">`;
  const split = Object.assign({}, FIN_BUD_SPLIT_DEF, finLsGet(FIN_BUD_SPLIT_LS, {}));
  const ohpLine = fc.ohpPct ? `<div class="finkv"><span>Company overheads (OHP) ${fc.ohpPct}% of the final account</span><b>−${finMoney(fc.ohpForecast)}</b></div>` : '';
  document.getElementById('app').innerHTML = shell(`
    <div class="card fbh">
      <div class="fbh-top">
        <div><span class="fbh-l">Forecast profit${fc.ohpPct ? ' (after '+fc.ohpPct+'% overheads)' : ''}</span><b class="fbh-big" id="finBudFm">${finMoney(fc.forecastMargin, 0)}</b></div>
        <span class="fbh-pill" id="finBudFp">${finPctTxt(fc.forecastMarginPct)}</span>
      </div>
      <div class="fbh-3">
        <div><span>Final account</span><b>${finMoney(fc.ffa, 0)}</b></div>
        <div><span>Forecast final cost</span><b id="finBudFc">${finMoney(fc.forecastCost, 0)}</b></div>
        <div><span>Budget</span><b id="finBudHB">—</b></div>
      </div>
      ${finBudBarHtml('finBudHBar')}
      <div class="fbh-leg"><span><i class="s"></i>Spent ${finMoney(fc.costToDate, 0)}</span><span><i class="c"></i>Ordered ${finMoney(fc.committedTotal, 0)}</span><span id="finBudHLeft"></span></div>
      <div class="fbh-st" id="finBudHSt"></div>
    </div>
    ${fc.budgetSource==='schedule' ? `<div class="finnote ok">The budget is coming from the cost prices on the Bill of Quantities: <b style="display:inline;">${finMoney(fc.schedCost)}</b>${fc.varCost?' + '+finMoney(fc.varCost)+' variation costs':''}. Type budgets by heading below only if you want to split it up instead.</div>` : ''}
    <details class="card fbt" ${fc.budgetTotal==null ? 'open' : ''}>
      <summary><b>Set budgets from a target margin</b><span>Type the margin you want; it works out what you can spend and splits it across the headings.</span></summary>
      <div class="fbt-b">
        <div class="fbt-row"><label class="formfield"><span class="field-label">Target margin %</span><input type="number" id="finBudTgt" min="0" max="90" step="0.5" value="${finLsGet(FIN_BUD_SPLIT_LS, {}).tgt!=null ? finLsGet(FIN_BUD_SPLIT_LS, {}).tgt : 20}" oninput="finBudTgtPaint()"></label>
          <div class="fbt-avail"><span>Available for costs</span><b id="finBudAvail">—</b><em id="finBudAvailN"></em></div></div>
        <p class="field-label" style="margin:6px 0 4px;">Split (% of the cost budget)</p>
        <div class="fbt-split">${fc.cats.map(k=>`<label><span>${escapeHtml(FIN_COST_CATS[k])}</span><input type="number" min="0" max="100" step="1" data-sp="${k}" value="${split[k]!=null?split[k]:0}" oninput="finBudTgtPaint()"><em id="finBudSp-${k}"></em></label>`).join('')}</div>
        <div class="fbt-foot"><span id="finBudSpTot"></span><button type="button" class="darkbtn" onclick="finBudFillFromTarget()">Fill the budgets below</button></div>
        <p class="stub" style="margin:6px 0 0;font-style:normal;">Nothing is saved until you press “Save budget &amp; forecast”.</p>
      </div>
    </details>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Cost by heading</p>
      <p class="stub" style="margin:-6px 0 12px;">Set a budget for each heading. Cost to complete is what you expect still to spend — leave it blank and it’s worked out as budget less spent and ordered.</p>
      <div class="finbudtbl-wrap"><table class="fincosttbl finbudtbl">
        <thead><tr><th>Heading</th><th class="num">Budget £</th><th class="num">Spent</th><th class="num">Ordered</th><th class="num">To complete £</th><th class="num">Forecast final</th><th class="num">Over / under</th><th>Used</th></tr></thead>
        <tbody>${fc.cats.map(k=>`<tr data-cat="${k}">
          <td data-l="Heading" class="d">${FIN_COST_CATS[k]}</td>
          <td data-l="Budget £" class="num">${cell(k,'budget')}</td>
          <td data-l="Spent" class="num"><a href="javascript:void(0)" onclick="finCosts=null;go('#/site/${siteId}/finance/costs')">${finMoney(fc.actual[k])}</a></td>
          <td data-l="Ordered" class="num">${finMoney(fc.committed[k])}</td>
          <td data-l="To complete £" class="num">${cell(k,'to_complete')}</td>
          <td data-l="Forecast final" class="num" id="finBudF-${k}">${finMoney(fc.forecast[k])}</td>
          <td data-l="Over / under" class="num" id="finBudV-${k}">—</td>
          <td data-l="Used" class="fbu">${finBudBarHtml('finBudB-'+k)}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num" id="finBudTB">—</td><td class="num">${finMoney(fc.costToDate)}</td><td class="num">${finMoney(fc.committedTotal)}</td><td class="num" id="finBudTT">—</td><td class="num" id="finBudTF">—</td><td class="num" id="finBudTV">—</td><td></td></tr></tfoot>
      </table></div>
      <button class="darkbtn" style="width:100%;margin-top:14px;" onclick="saveFinBudget('${siteId}')">Save budget &amp; forecast</button>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Value</p>
      <div class="finkv"><span>Contract value</span><b>${finMoney(fc.contract)}</b></div>
      <div class="finkv"><span>Variations agreed</span><b>${finMoney(fc.vAgreed)}</b></div>
      <div class="finkv"><span>Variations priced or submitted (not agreed)</span><b>${finMoney(fc.vPending)}</b></div>
      ${fc.vInstructed ? `<div class="finkv"><span>Instructed, not priced yet (estimate, not included)</span><b>${finMoney(fc.vInstructed)}</b></div>` : ''}
      <div class="finkv big"><span>Forecast final account</span><b>${finMoney(fc.ffa)}</b></div>
      ${ohpLine}
      <div class="finkv"><span>Valuation to date (last application)</span><b>${finMoney(fc.valuation)}</b></div>
      <div class="finkv"><span>Invoiced</span><b>${finMoney(fc.invoiced)}</b></div>
      ${fc.ohpPct ? '' : `<p class="stub" style="margin:8px 0 0;font-style:normal;">No company overheads are being taken off this project’s profit. ${ME.role==='admin' ? 'Set them in Finance › Settings › Company overheads (OHP).' : 'A company admin can set them in Finance › Settings.'}</p>`}
    </div>
  `, {title:'Budget & forecast', subtitle:(site.job_number?site.job_number+' · ':'')+site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
  finBudPaint();
  finBudTgtPaint();
}
// Paint: the base works out the table; then the bars, headline and the overheads.
(function(){
  const base = window.finBudPaint;
  window.finBudPaint = function(){
    base.apply(this, arguments);
    if(!finBud) return;
    const fc = finBud.fc, r = finBudRead();
    let tb = 0, anyB = false, tf = 0;
    fc.cats.forEach(k=>{ const x = r[k]; tf += x.forecast; if(x.budget!=null){ tb += x.budget; anyB = true; } finBudSetBar('finBudB-'+k, fc.actual[k], fc.committed[k], x.budget); });
    if(!anyB && fc.budgetSource==='schedule'){ tb = fc.budgetTotal; tf = Math.max(tf, finRound(fc.budgetTotal)); }
    const budget = anyB || fc.budgetSource==='schedule' ? finRound(tb) : null;
    // forecast profit after overheads (the base leaves OHP out)
    const fEl = document.getElementById('finBudFc'), fcost = fEl ? finNum(fEl.textContent) : tf;
    const m = finRound(fc.ffa - (fcost!=null && !isNaN(fcost) ? fcost : tf) - (fc.ohpForecast||0));
    const mEl = document.getElementById('finBudFm'); if(mEl){ mEl.textContent = finMoney(m, 0); mEl.style.color = m<0 ? 'var(--red)' : ''; }
    const pEl = document.getElementById('finBudFp'); if(pEl){ pEl.textContent = fc.ffa ? finPctTxt(m/fc.ffa*100) : '—'; pEl.classList.toggle('neg', m<0); }
    const hb = document.getElementById('finBudHB'); if(hb) hb.textContent = budget!=null ? finMoney(budget, 0) : 'Not set';
    finBudSetBar('finBudHBar', fc.costToDate, fc.committedTotal, budget);
    const left = document.getElementById('finBudHLeft'); if(left) left.textContent = budget!=null ? 'Left '+finMoney(Math.max(0, finRound(budget - fc.costToDate - fc.committedTotal)), 0) : '';
    const st = document.getElementById('finBudHSt');
    if(st){
      if(budget==null){ st.className = 'fbh-st none'; st.textContent = 'No budget yet — set one below (or from a target margin) to see if the job is on track.'; }
      else { const over = finRound(tf - budget); st.className = 'fbh-st '+(over>0.5 ? 'over' : 'ok'); st.textContent = over>0.5 ? 'Forecast to go '+finMoney(over, 0)+' over budget' : 'Forecast to finish '+finMoney(Math.abs(over), 0)+' under budget'; }
    }
  };
})();
window.finBudTgtPaint = function(){
  if(!finBud) return;
  const fc = finBud.fc;
  const t = finNum((document.getElementById('finBudTgt')||{}).value);
  const avail = t==null || isNaN(t) ? null : finRound(fc.ffa*(1 - t/100) - (fc.ohpForecast||0));
  const a = document.getElementById('finBudAvail'); if(a) a.textContent = avail==null ? '—' : finMoney(avail, 0);
  const n = document.getElementById('finBudAvailN'); if(n) n.textContent = fc.ohpPct ? `${finMoney(fc.ffa, 0)} less ${t||0}% margin less ${finMoney(fc.ohpForecast, 0)} overheads` : `${finMoney(fc.ffa, 0)} less ${t||0}% margin`;
  let tot = 0; const sp = {};
  document.querySelectorAll('[data-sp]').forEach(i=>{ const v = Number(i.value)||0; sp[i.dataset.sp] = v; tot += v; });
  Object.keys(sp).forEach(k=>{ const e = document.getElementById('finBudSp-'+k); if(e) e.textContent = avail!=null && tot ? finMoney(finRound(avail*sp[k]/tot), 0) : ''; });
  const st = document.getElementById('finBudSpTot'); if(st){ st.textContent = 'Split adds up to '+tot+'%'+(Math.abs(tot-100)>0.01 ? ' — it’ll be scaled to 100%' : ''); st.classList.toggle('warn', Math.abs(tot-100)>0.01); }
};
window.finBudFillFromTarget = function(){
  if(!finBud) return;
  const fc = finBud.fc;
  const t = finNum((document.getElementById('finBudTgt')||{}).value);
  if(t==null || isNaN(t) || t<0 || t>=100){ toast('Type a target margin between 0 and 99%.'); return; }
  if(!fc.ffa){ toast('Set the contract value (or the Bill of Quantities) first.'); return; }
  const avail = finRound(fc.ffa*(1 - t/100) - (fc.ohpForecast||0));
  if(avail<=0){ toast('That margin leaves nothing to spend.'); return; }
  const sp = {}; let tot = 0;
  document.querySelectorAll('[data-sp]').forEach(i=>{ const v = Math.max(0, Number(i.value)||0); sp[i.dataset.sp] = v; tot += v; });
  if(!tot){ toast('Give the split some percentages first.'); return; }
  let used = 0; const keys = Object.keys(sp).filter(k=>sp[k]>0);
  keys.forEach((k, i)=>{ const v = i===keys.length-1 ? finRound(avail - used) : finRound(avail*sp[k]/tot); used = finRound(used + v);
    const el = document.querySelector(`.finbudtbl input[data-c="${k}"][data-k="budget"]`); if(el) el.value = String(v); });
  Object.keys(sp).filter(k=>!sp[k]).forEach(k=>{ const el = document.querySelector(`.finbudtbl input[data-c="${k}"][data-k="budget"]`); if(el) el.value = ''; });
  finLsSet(FIN_BUD_SPLIT_LS, Object.assign({}, sp, {tgt:t}));
  finBudPaint();
  toast('Budgets filled in — check them, then Save budget & forecast');
  const tb = document.querySelector('.finbudtbl'); if(tb) tb.scrollIntoView({behavior:'smooth', block:'start'});
};
(function(){
  const st = document.createElement('style');
  st.textContent = `.fbh{padding:16px 18px !important;}
.fbh-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
.fbh-l{display:block;font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--slate);}
.fbh-big{display:block;font-size:30px;font-weight:800;letter-spacing:-.5px;line-height:1.15;font-variant-numeric:tabular-nums;}
.fbh-pill{font-size:13px;font-weight:800;border-radius:10px;padding:5px 11px;background:#E7F6EC;color:#1E7A43;white-space:nowrap;} .fbh-pill.neg{background:#FDECEC;color:#B91C1C;}
.fbh-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0 10px;}
.fbh-3 span{display:block;font-size:11.5px;font-weight:700;color:var(--slate);} .fbh-3 b{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;}
.fbb{height:10px;border-radius:6px;background:#EEF0F3;overflow:hidden;display:flex;}
.fbb i{display:block;height:100%;} .fbb .s{background:#16181D;} .fbb .c{background:#9CA3AF;}
.fbb.warn .s{background:#B45309;} .fbb.over .s{background:#C81E1E;} .fbb.none{opacity:.45;}
.fbh-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--slate);margin-top:6px;}
.fbh-leg i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px;vertical-align:-1px;} .fbh-leg i.s{background:#16181D;} .fbh-leg i.c{background:#9CA3AF;}
.fbh-leg span:last-child{margin-left:auto;font-weight:700;color:var(--ink);}
.fbh-st{margin-top:10px;font-size:13px;font-weight:800;border-radius:10px;padding:7px 10px;} .fbh-st.ok{background:#EAF7EF;color:#1E7A43;} .fbh-st.over{background:#FDEEEE;color:#C81E1E;} .fbh-st.none{background:#F6F7F9;color:#4B5563;font-weight:600;}
.fbt{padding:0 !important;} .fbt > summary{list-style:none;cursor:pointer;padding:14px 18px;display:flex;flex-direction:column;gap:2px;} .fbt > summary::-webkit-details-marker{display:none;}
.fbt > summary b{font-size:15px;} .fbt > summary b::after{content:' ▾';color:var(--slate);font-size:12px;} .fbt[open] > summary b::after{content:' ▴';}
.fbt > summary span{font-size:12.5px;color:var(--slate);}
.fbt-b{padding:0 18px 16px;}
.fbt-row{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;} .fbt-row .formfield{margin:0;max-width:160px;}
.fbt-avail span{display:block;font-size:11.5px;font-weight:700;color:var(--slate);} .fbt-avail b{font-size:20px;font-weight:800;} .fbt-avail em{display:block;font-style:normal;font-size:11.5px;color:var(--slate);}
.fbt-split{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
.fbt-split label{display:flex;flex-direction:column;gap:2px;font-size:12px;font-weight:700;color:var(--slate);}
.fbt-split input{height:34px !important;min-height:34px !important;margin:0 !important;padding:0 8px !important;font-size:14px !important;}
.fbt-split em{font-style:normal;font-size:11.5px;color:var(--ink);font-weight:700;min-height:14px;}
.fbt-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap;} .fbt-foot span{font-size:12.5px;color:var(--slate);} .fbt-foot span.warn{color:#B45309;font-weight:700;}
.fbt-foot .darkbtn{width:auto !important;margin:0 !important;padding:9px 14px !important;}
.finbudtbl td.fbu{min-width:90px;vertical-align:middle;} .finbudtbl td.fbu .fbb{height:8px;}
@media (max-width:700px){ .fbt-split{grid-template-columns:repeat(2,minmax(0,1fr));} .fbh-3 b{font-size:15px;} .fbh-big{font-size:26px;} }`;
  document.head.appendChild(st);
})();
