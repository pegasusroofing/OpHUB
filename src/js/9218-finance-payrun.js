/* ============================================================
   OpHUB Finance — weekly pay run (subcontract labour, a week in hand).
   #/finance/labour/payrun
   Pay day (Finance › Settings: weekday + weeks in hand, default Friday,
   one week in hand) pays for the week worked before it: e.g. Friday
   23 Oct pays Mon 12 – Sun 18 Oct. Everyone with sign-ins or timesheets
   that week is listed with gross, CIS and the amount to transfer.
   1. Approve payments  2. Bank file (CSV for a bulk bank transfer)
   3. Mark paid (paid on the pay day — feeds CIS, statements and Xero).
   PAYE staff are listed for information only — they're paid by payroll.
   ============================================================ */
let finRunDay = null;
const FIN_WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function finPayCfg(){ const s = finSettings(); return {wd: s.pay_weekday!=null ? Number(s.pay_weekday) : 5, wih: s.pay_weeks_in_hand!=null ? Number(s.pay_weeks_in_hand) : 1}; }
function finNextPayDay(){ const {wd} = finPayCfg(); const d = new Date(finToday()+'T12:00:00'); while(d.getDay()!==wd) d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }
function finRunWeek(payDay){ return finAddDays(finMonday(payDay), -7*finPayCfg().wih); }
function finSortCode(s){ const d = String(s||'').replace(/\D/g,''); return d.length===6 ? d.slice(0,2)+'-'+d.slice(2,4)+'-'+d.slice(4) : String(s||''); }
function finBankOk(r){ return !!(r && String(r.bank_sort_code||'').replace(/\D/g,'').length===6 && /^\d{8}$/.test(String(r.bank_account_no||'').replace(/\D/g,''))); }

// Lines for one person's week (sign-in days at their rate + timesheet lines), as on a payment.
async function finPayLinesFor(key, from, to, rates){
  const isW = String(key).startsWith('w:'), userId = isW ? null : key, wid = isW ? key.slice(2) : null;
  const [cks, man] = await Promise.all([
    userId ? dbSelect('checkins', 'user_id=eq.'+userId+'&type=eq.in&ts=gte.'+from+'T00:00:00&ts=lte.'+to+'T23:59:59&select=user_id,site_id,ts,type') : Promise.resolve([]),
    dbSelect('fin_labour_manual', (userId ? 'user_id=eq.'+userId : 'worker_id=eq.'+wid)+'&work_date=gte.'+from+'&work_date=lte.'+to),
  ]);
  const r = rates[key] || {};
  const signDays = man.length ? [] : finLabourDaysFrom(cks); // a timesheet replaces sign-ins for that week
  const bySite = {}; signDays.forEach(d=>{ bySite[d.site_id] = (bySite[d.site_id]||0)+1; });
  const lines = Object.keys(bySite).map(s=>({site_id:s, days:bySite[s], rate:Number(r.day_rate||0), amount:finRound(bySite[s]*Number(r.day_rate||0))}));
  man.forEach(m=>{ const d = Number(m.days||0) || 1; lines.push({site_id:m.site_id, days:Number(m.days||0)||1, rate:finRound(Number(m.amount||0)/d), amount:finRound(m.amount), description:m.description||null}); });
  return {lines, r};
}

async function renderFinPayRun(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  if(!FIN_SETTINGS) await finLoadSettings();
  if(!finRunDay) finRunDay = finNextPayDay();
  const from = finRunWeek(finRunDay), to = finAddDays(from, 6);
  await loadAllProfiles();
  const [cks, rates, pays, manual] = await Promise.all([
    dbSelect('checkins', 'type=eq.in&ts=gte.'+from+'T00:00:00&ts=lte.'+to+'T23:59:59&select=user_id,site_id,ts,type&limit=20000'),
    finLoadRates(),
    dbSelect('fin_sub_payments', 'org_id=eq.'+ME.org_id+'&period_start=eq.'+from+'&status=neq.void'),
    dbSelect('fin_labour_manual', 'org_id=eq.'+ME.org_id+'&work_date=gte.'+from+'&work_date=lte.'+to),
  ]);
  if(__gen !== RENDER_GEN) return;
  const people = {};
  const tsKeys = new Set(manual.map(finPersonKey));
  finLabourDaysFrom(cks).forEach(d=>{ if(tsKeys.has(d.user_id)) return; const p = people[d.user_id] = people[d.user_id] || {key:d.user_id, days:0, amount:0}; p.days++; p.amount += Number((rates[d.user_id]||{}).day_rate||0); p.noRate = (rates[d.user_id]||{}).day_rate==null; });
  manual.forEach(m=>{ const k = finPersonKey(m); const p = people[k] = people[k] || {key:k, name:m.name, days:0, amount:0}; p.days += Number(m.days||0); p.amount += Number(m.amount||0); });
  const payBy = {}; pays.forEach(p=>{ payBy[finPersonKey(p)] = p; });
  const nameOf = p=>p.key.startsWith('n:') ? (p.name||'Someone') : finPersonName(p.key);
  const all = Object.values(people).map(p=>{ const r = rates[p.key] || {}; const cis = r.cis_rate!=null ? Number(r.cis_rate) : 20; const gross = finRound(p.amount); const pay = payBy[p.key];
    return Object.assign(p, {r, name:nameOf(p), paye:r.pay_type==='paye', cis, gross:pay ? Number(pay.gross) : gross, ded:pay ? Number(pay.cis_deduction) : finRound(gross*cis/100), net:pay ? Number(pay.net_pay) : finRound(gross - finRound(gross*cis/100)), pay}); })
    .sort((a,b)=>a.name.localeCompare(b.name));
  // Payments made for that week that are no longer on a timesheet still show.
  pays.forEach(p=>{ const k = finPersonKey(p); if(!people[k]) all.push({key:k, name:p.name, days:0, r:rates[k]||{}, paye:false, gross:Number(p.gross), ded:Number(p.cis_deduction), net:Number(p.net_pay), pay:p}); });
  const subs = all.filter(p=>!p.paye && !p.key.startsWith('n:')), paye = all.filter(p=>p.paye), loose = all.filter(p=>!p.paye && p.key.startsWith('n:'));
  const tot = k=>finRound(subs.reduce((t,p)=>t+Number(p[k]||0),0));
  const toApprove = subs.filter(p=>(!p.pay || p.pay.status==='draft') && p.gross>0 && !p.noRate).length;
  const toPay = subs.filter(p=>p.pay && p.pay.status==='approved').length;
  const noBank = subs.filter(p=>p.pay && p.pay.status!=='paid' && !finBankOk(p.r)).length;
  const fmtD = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'});
  const {wd, wih} = finPayCfg();
  const st = p=>!p.pay ? '<span class="finpill grey">Not started</span>' : `<span class="finpill ${p.pay.status==='paid'?'ok':p.pay.status==='approved'?'blue':'grey'}">${p.pay.status==='paid'?'Paid '+finDate(p.pay.paid_on):p.pay.status==='approved'?'Approved':'Draft'}</span>`;
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('subs')}${finSubTabs('subs','payrun')}
    <div class="card finrun-head">
      <div class="finrun-day">
        <button class="ghostbtn" onclick="finRunDay=finAddDays(finRunDay,-7);render()" aria-label="Previous pay day">‹</button>
        <div><div class="finhead-l">Pay day</div><div class="finhead-v">${fmtD(finRunDay)}</div><div class="finrun-sub">For work ${fmtD(from)} – ${fmtD(to)}</div></div>
        <button class="ghostbtn" onclick="finRunDay=finAddDays(finRunDay,7);render()" aria-label="Next pay day">›</button>
      </div>
      <div class="finrun-cfg">Paid <select onchange="finPayCfgSave('pay_weekday', this.value)">${FIN_WEEKDAYS.map((n,i)=>`<option value="${i}" ${i===wd?'selected':''}>${n}s</option>`).join('')}</select>
        <select onchange="finPayCfgSave('pay_weeks_in_hand', this.value)">${[0,1,2].map(n=>`<option value="${n}" ${n===wih?'selected':''}>${n===0?'same week':n===1?'a week in hand':'two weeks in hand'}</option>`).join('')}</select> by bank transfer</div>
    </div>
    <div class="fintiles finrun-tiles">
      <div><span>Gross</span><b>${finMoney(tot('gross'))}</b></div>
      <div><span>CIS to HMRC</span><b>${finMoney(tot('ded'))}</b></div>
      <div class="hl"><span>To transfer</span><b>${finMoney(tot('net'))}</b></div>
    </div>
    <div class="finrun-steps">
      <button class="darkbtn" ${toApprove?'':'disabled'} onclick="finRunApprove()">1 · Approve ${toApprove||''} payment${toApprove===1?'':'s'}</button>
      <button class="ghostbtn" ${toPay?'':'disabled'} onclick="finRunBankFile()">2 · Bank file (CSV)</button>
      <button class="ghostbtn" ${toPay?'':'disabled'} onclick="finRunMarkPaid()">3 · Mark ${toPay||''} paid</button>
    </div>
    ${noBank ? `<p class="finrun-warn">${noBank} ${noBank===1?'person has':'people have'} no bank details — add them in <a href="#/finance/labour/rates">Rates &amp; workers</a> or they’re left out of the bank file.</p>` : ''}
    <div class="card" style="padding:0;overflow:hidden;">
      <table class="fincosttbl finrun-tbl">
        <thead><tr><th>Subcontractor</th><th class="num">Days</th><th class="num">Gross</th><th class="num">CIS</th><th class="num">Pay</th><th>Bank</th><th>Status</th></tr></thead>
        <tbody>${subs.length ? subs.map(p=>`<tr class="click" onclick="${p.pay ? `go('#/finance/labour/payment/${p.pay.id}')` : `openFinTimesheet('${jsAttr(p.key)}','${from}')`}">
          <td data-l="Subcontractor" class="d"><b>${escapeHtml(p.name)}</b><div class="stub" style="margin:0;font-style:normal;">CIS ${p.cis}%${p.noRate?' · <span style="color:var(--warn);">no day rate</span>':''}</div></td>
          <td data-l="Days" class="num">${p.days?finRound(p.days):'—'}</td>
          <td data-l="Gross" class="num">${finMoney(p.gross)}</td>
          <td data-l="CIS" class="num">−${finMoney(p.ded)}</td>
          <td data-l="Pay" class="num"><b>${finMoney(p.net)}</b></td>
          <td data-l="Bank">${finBankOk(p.r) ? `<span class="finrun-bank">${escapeHtml(finSortCode(p.r.bank_sort_code))} · ••${escapeHtml(String(p.r.bank_account_no).replace(/\D/g,'').slice(-4))}</span>` : '<span class="finpill warn">Missing</span>'}</td>
          <td data-l="Status">${st(p)}</td></tr>`).join('') : `<tr><td colspan="7" class="d" style="padding:16px;">No subcontract labour for that week.</td></tr>`}</tbody>
      </table>
    </div>
    ${loose.length ? `<p class="stub" style="font-style:normal;">Also on timesheets but not set up as workers (add them in Rates &amp; workers to pay them here): ${loose.map(p=>escapeHtml(p.name)+' '+finMoney(p.gross)).join(', ')}.</p>` : ''}
    ${paye.length ? `<div class="card"><p class="sectiontitle" style="margin-top:0;">PAYE — paid through payroll</p>${paye.map(p=>`<div class="finkv"><span>${escapeHtml(p.name)} · ${finRound(p.days)} day${p.days===1?'':'s'}</span><b>${finMoney(p.gross)}</b></div>`).join('')}<p class="stub" style="margin:6px 0 0;font-style:normal;">Gross cost to the jobs. Their pay, tax and NI are done in your payroll (Xero).</p></div>` : ''}
  `, {title:'Pay run', subtitle:'Subcontractors & labour', back:finSecBack(), tabs:false});
  window.__finRun = {from, to, subs};
}
window.finPayCfgSave = async function(k, v){
  const res = await sbFetch('/rest/v1/fin_settings?on_conflict=org_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=representation'}, body:JSON.stringify({org_id:ME.org_id, [k]:Number(v)})});
  if(!res.ok){ toast('Not saved — '+(await safeErr(res))); return; }
  await finLoadSettings(); finRunDay = finNextPayDay(); render();
};
window.finRunApprove = async function(){
  const R = window.__finRun; if(!R) return;
  const rates = await finLoadRates();
  let n = 0;
  for(const p of R.subs){
    if(p.noRate || !(p.gross>0)) continue;
    if(p.pay && p.pay.status!=='draft') continue;
    const {lines, r} = await finPayLinesFor(p.key, R.from, R.to, rates);
    if(!lines.length) continue;
    const labour = finRound(lines.reduce((t,l)=>t+l.amount,0)), cis = r.cis_rate!=null ? Number(r.cis_rate) : 20, mat = p.pay ? Number(p.pay.materials||0) : 0;
    const ded = finRound(labour*cis/100);
    const row = {lines, labour, materials:mat, gross:finRound(labour+mat), cis_rate:cis, cis_deduction:ded, net_pay:finRound(labour+mat-ded), status:'approved', pay_date:finRunDay};
    const ok = p.pay ? await dbUpdate('fin_sub_payments', p.pay.id, row)
      : await dbInsert('fin_sub_payments', Object.assign({org_id:ME.org_id, user_id:p.key.startsWith('w:') ? null : p.key, worker_id:p.key.startsWith('w:') ? p.key.slice(2) : null, name:r.trading_name || finPersonName(p.key), utr:r.utr||null, period_start:R.from, period_end:R.to, created_by:ME.id}, row));
    if(ok) n++;
  }
  toast(n ? n+' payment'+(n===1?'':'s')+' approved' : 'Nothing to approve');
  render();
};
window.finRunBankFile = async function(){
  const R = window.__finRun; if(!R) return;
  const rows = R.subs.filter(p=>p.pay && p.pay.status==='approved');
  const ok = rows.filter(p=>finBankOk(p.r)), skip = rows.filter(p=>!finBankOk(p.r));
  if(!ok.length){ toast('No one with bank details to pay yet.'); return; }
  const co = String(finSettings().company_name || (ORG && ORG.name) || 'Pay').replace(/[^A-Za-z0-9 ]/g,'').trim().split(/\s+/)[0].slice(0,6);
  const ref = (co+' WC '+new Date(R.from+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit', month:'short'})).toUpperCase().slice(0,18);
  const q = v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const lines = [['Name','Sort code','Account number','Amount','Reference'].map(q).join(',')]
    .concat(ok.map(p=>[ (p.r.bank_account_name || p.r.trading_name || p.name).slice(0,18), finSortCode(p.r.bank_sort_code), String(p.r.bank_account_no).replace(/\D/g,''), Number(p.net).toFixed(2), ref ].map(q).join(',')));
  const blob = new Blob([lines.join('\r\n')+'\r\n'], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Pay run '+finRunDay+'.csv'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(ok.length+' payment'+(ok.length===1?'':'s')+' · '+finMoney(ok.reduce((t,p)=>t+Number(p.net),0))+(skip.length ? ' — '+skip.length+' left out (no bank details)' : ''));
};
window.finRunMarkPaid = async function(){
  const R = window.__finRun; if(!R) return;
  const rows = R.subs.filter(p=>p.pay && p.pay.status==='approved');
  if(!rows.length) return;
  if(!await customConfirm(`Mark ${rows.length} payment${rows.length===1?'':'s'} (${finMoney(rows.reduce((t,p)=>t+Number(p.net),0))}) as paid on ${finDate(finRunDay)}?`)) return;
  let n = 0;
  for(const p of rows){ if(await dbUpdate('fin_sub_payments', p.pay.id, {status:'paid', paid_on:finRunDay, pay_date:finRunDay})) n++; }
  toast(n+' marked paid');
  render();
};
