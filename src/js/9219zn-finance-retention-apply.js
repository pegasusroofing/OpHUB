/* ============================================================
   OpHUB Finance — retention release by application (25 Oct 2026, Andy: "it might not just be
   invoiced for retention release, we might need to go through the normal apply process").
   - Each half on a project's Retention card now offers "Apply" as well as "Raise invoice".
   - Apply starts the next application (or uses the draft you already have) with the retention
     cut: half the rate for the 1st release (practical completion), 0% for the final release.
     The client certifies it like any other application and the release comes through in
     the "net due" — then it's invoiced from the certificate as normal.
   - The card shows "In Application N" once a half has been applied for.
   - Voided invoices sit in a closed "Voided" drop-down under every invoice list.
   - Date boxes in the retention tables sit in the middle of the row on iPhone.
   ============================================================ */
function finRetAppFor(jf, n, apps){
  const id = jf && (n===1 ? jf.ret1_app_id : jf.ret2_app_id); if(!id) return null;
  const a = (apps||[]).find(x=>x.id===id);
  return a && a.status!=='void' ? a : null;
}
(function(){
  const base = finRetentionAlerts;
  finRetentionAlerts = function(jf, st, held){
    const out = base.apply(this, arguments);
    return out.filter(x=>!(jf && (x.half===1 ? jf.ret1_app_id : jf.ret2_app_id)));
  };
})();
function finRetentionCardHtml(siteId, jf, st, apps){
  const held = finRetentionHeld(apps);
  const d = finRetentionDates(jf, st);
  const alerts = finRetentionAlerts(jf, st, held);
  const invs = finRetInvsFor && finRetInvsFor.siteId===siteId ? finRetInvsFor.invs : [];
  const released = finRetentionReleased(jf, invs, apps) + finRetentionPeakDrop(apps), still = finRetentionStillHeld(apps, jf, invs);   // FX-P5: no double deduction
  const half = n=>finRetHalfAmt(held, n, jf, invs, apps);
  const act = (n, date, invId)=>{
    if(invId) return `<button class="linkbtn" onclick="go('#/site/${siteId}/finance/invoice/${invId}')">View invoice</button>`;
    const a = finRetAppFor(jf, n, apps);
    if(a) return `<button class="linkbtn" onclick="go('#/site/${siteId}/finance/application/${a.id}')">In Application ${a.number}</button>`;
    if(!held) return '<span class="stub" style="margin:0;">—</span>';
    return `<span class="finret-acts"><button class="linkbtn" title="Start an application with the retention cut, for the client to certify" onclick="finApplyRetention('${siteId}',${n})">Apply</button>${date ? `<button class="linkbtn" onclick="raiseRetentionInvoice('${siteId}',${n})">Raise invoice</button>` : ''}</span>`;
  };
  const due = (n, date)=>date ? finDate(date) : '<span class="stub" style="margin:0;font-style:normal;">Set PC date</span>';
  return `<div class="card finret">
    <div class="finret-h"><p class="sectiontitle" style="margin:0;">Retention</p><span>Held to date <b>${finMoney(held + finRetentionPeakDrop(apps))}</b>${released ? ` · Released <b>${finMoney(released)}</b> · Still held <b>${finMoney(still)}</b>` : ''}</span></div>
    ${alerts.length ? `<div class="finchecks" style="margin:6px 0 0;">${alerts.map(x=>`<span>${x.half===1?'First':'Second'} half due ${finDate(x.date)}</span>`).join('')}</div>` : ''}
    <table class="finret-t"><thead><tr><th>Release</th><th>Due</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      <tr><td>1st half · practical completion</td><td>${due(1, d.first)}</td><td class="num">${finMoney(half(1))}</td><td class="r">${act(1, d.first, jf.ret1_invoice_id)}</td></tr>
      <tr><td>2nd half · end of defects</td><td>${due(2, d.second)}</td><td class="num">${finMoney(half(2))}</td><td class="r">${act(2, d.second, jf.ret2_invoice_id)}</td></tr>
    </tbody></table>
    <p class="stub finret-how">Release it either way: <b>Apply</b> puts it through your next application (the client certifies it), or <b>Raise invoice</b> bills it straight away.</p>
    <div class="finret-f">
      <label>Practical completion<input type="date" id="finPcDate" value="${jf.pc_date||''}"></label>
      <label>Defects (months)<input type="number" min="0" step="1" id="finDefects" value="${jf.defects_months!=null?jf.defects_months:(st.default_defects_months!=null?st.default_defects_months:12)}"></label>
      <button class="ghostbtn" onclick="saveFinRetentionDates('${siteId}')">Save dates</button>
    </div>
  </div>`;
}
window.finApplyRetention = async function(siteId, n){
  const [jfR, appsR] = await Promise.all([
    dbSelectChecked('job_finance', 'site_id=eq.'+siteId),
    dbSelectChecked('fin_applications', 'site_id=eq.'+siteId+'&order=number.desc&select=id,number,status,retention_pct,cert_retention,retention_release')]);
  if(!jfR.ok || !appsR.ok){ toast('Couldn’t load the project — check your connection.'); return; }
  const jf = jfR.data[0] || {}, apps = appsR.data || [];
  const st = finSettings();
  const basePct = jf.retention_pct!=null ? Number(jf.retention_pct) : Number(st.default_retention_pct||0);
  if(!basePct && !apps.some(a=>Number(a.cert_retention||0))){ toast('No retention is being held on this project.'); return; }
  const pct = n===1 ? finRound(basePct/2) : 0;
  const draft = apps.find(a=>a.status==='draft');
  const msg = (n===1 ? `Apply for the first half of the retention?` : `Apply for the final retention release?`)
    + `\n\n${draft ? 'Your draft Application '+draft.number+' will' : 'A new application will'} have retention at ${pct}% instead of ${basePct}%, so the client releases ${n===1 ? 'half of it' : 'the rest'} when they certify it. Everything else works as normal.`;
  if(!await customConfirm(msg, {confirmLabel: draft ? 'Use Application '+draft.number : 'Start the application'})) return;
  let app = draft;
  if(!app){
    const before = new Set(apps.map(a=>a.id));
    const keepGo = window.go; let target = null;
    window.go = h=>{ target = h; };        // let newFinApplication make it, then go there ourselves
    try{ await newFinApplication(siteId); } finally { window.go = keepGo; }
    const r = await dbSelectChecked('fin_applications', 'site_id=eq.'+siteId+'&status=eq.draft&order=number.desc&limit=1&select=id,number,status');
    app = r.ok && r.data[0] && !before.has(r.data[0].id) ? r.data[0] : null;
    if(!app){ if(target) go(target); return; }   // it stopped with its own message (e.g. no Bill of Quantities)
  }
  const up = await dbUpdate('fin_applications', app.id, {retention_pct:pct, retention_release:n, updated_at:new Date().toISOString()});
  if(!up){ go(`#/site/${siteId}/finance/application/${app.id}`); return; }
  await sbFetch('/rest/v1/job_finance?on_conflict=site_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(Object.assign({site_id:siteId, org_id:ME.org_id, updated_at:new Date().toISOString(), updated_by:ME.id}, n===1 ? {ret1_app_id:app.id} : {ret2_app_id:app.id}))});
  toast(`Application ${app.number}: retention ${pct}% — ${n===1?'first half':'final'} release applied for`);
  go(`#/site/${siteId}/finance/application/${app.id}`);
};
// The application itself says what it's doing.
(function(){
  const base = renderFinApplication;
  renderFinApplication = async function(siteId, appId){
    const r = await base.apply(this, arguments);
    try{
      if(finApp && finApp.id===appId && finApp.retention_release && !document.getElementById('finRetRelNote')){
        const host = document.querySelector('.scrollarea'); const first = host && (host.querySelector('.finprojbar') ? host.querySelector('.finprojbar').nextElementSibling : host.firstElementChild);
        const n = document.createElement('div'); n.id = 'finRetRelNote'; n.className = 'finnote ok';
        n.innerHTML = `<b style="display:inline;">Retention release — ${finApp.retention_release===1 ? 'first half (practical completion)' : 'final release'}.</b> Retention on this application is ${finPct(finApp.retention_pct)}%, so the client pays back ${finApp.retention_release===1 ? 'half of what they hold' : 'what they still hold'} when they certify it.`;
        if(first) first.insertAdjacentElement('beforebegin', n);
      }
    }catch(e){}
    return r;
  };
})();
// If the release application is voided, the card offers Apply / Raise invoice again.
(function(){
  const base = window.voidFinApplication;
  if(typeof base==='function') window.voidFinApplication = async function(siteId, appId){
    const r = await base.apply(this, arguments);
    try{ const jf = (await dbSelect('job_finance', 'site_id=eq.'+siteId+'&select=ret1_app_id,ret2_app_id'))[0] || {}; const p = {}; if(jf.ret1_app_id===appId) p.ret1_app_id = null; if(jf.ret2_app_id===appId) p.ret2_app_id = null; if(Object.keys(p).length) await sbFetch('/rest/v1/job_finance?on_conflict=site_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(Object.assign({site_id:siteId, org_id:ME.org_id}, p))}); }catch(e){}
    return r;
  };
})();

/* ---------- voided invoices in a closed drop-down ---------- */
(function(){
  const base = finInvTableHtml;
  finInvTableHtml = function(invs, opts){
    const all = invs || [], v = all.filter(i=>i.status==='void');
    if(!v.length) return base.apply(this, arguments);
    const live = all.filter(i=>i.status!=='void');
    return (live.length ? base(live, opts) : `<div class="empty" style="margin:8px 0 0;">${(opts&&opts.empty)||'No invoices yet.'}</div>`)
      + `<details class="finvoidfold"><summary>Voided invoices <span>${v.length}</span></summary>${base(v, opts)}</details>`;
  };
})();

(function(){
  const st = document.createElement('style');
  st.textContent = `.finret-acts{display:inline-flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;}
.finret-how{margin:6px 0 0 !important;font-size:12px !important;font-style:normal !important;}
.finvoidfold{margin:10px 0 0;border:1px solid var(--line,#ECEEF2);border-radius:10px;background:#FAFAFB;}
.finvoidfold > summary{cursor:pointer;list-style:none;padding:9px 12px;font-size:13px;font-weight:700;color:var(--slate);display:flex;align-items:center;gap:8px;}
.finvoidfold > summary::-webkit-details-marker{display:none;}
.finvoidfold > summary::before{content:'▸';font-size:11px;} .finvoidfold[open] > summary::before{content:'▾';}
.finvoidfold > summary span{background:#ECEEF2;border-radius:8px;padding:0 7px;font-size:11.5px;}
.finvoidfold > .finreptbl-wrap{margin:0 8px 8px;}
/* iPhone draws the date inside a date box at the top — keep it in the middle */
.finretd, .finret-f input[type=date], #finPcDate{-webkit-appearance:none;appearance:none;display:inline-flex;align-items:center;line-height:normal !important;vertical-align:middle;}
.finretd::-webkit-date-and-time-value, .finret-f input[type=date]::-webkit-date-and-time-value, #finPcDate::-webkit-date-and-time-value{text-align:left;margin:0;padding:0;line-height:normal;}
td:has(> .finretd){vertical-align:middle !important;}`;
  document.head.appendChild(st);
})();
