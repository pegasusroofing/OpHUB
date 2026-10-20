/* ============================================================
   OpHUB Finance — bring workers and rates in from Xero.
   Finance › Subcontractors › Rates & workers › "Bring in from Xero".
   Subcontractors come from a Xero contact group called "Subcontractors"
   (or similar), otherwise suppliers with CIS switched on — with their CIS
   rate. PAYE staff come from Xero Payroll with a day rate worked out from
   their salary or hourly rate.
   Each person is matched to someone already in OpHUB (same Xero record,
   then same name / email, including app users); otherwise a new worker
   is added. Nothing is removed.
   ============================================================ */
let finXw = null;
function finXwNorm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
// Who in OpHUB this Xero person matches: {key, row, how} or null.
function finXwMatch(p, rates){
  const all = Object.keys(rates).map(k=>({key:k, row:rates[k]}));
  const idHit = all.find(x=>(p.xero_contact_id && x.row.xero_contact_id===p.xero_contact_id) || (p.xero_employee_id && x.row.xero_employee_id===p.xero_employee_id));
  if(idHit) return Object.assign(idHit, {how:'linked'});
  const nm = finXwNorm(p.name), em = String(p.email||'').toLowerCase();
  const wHit = all.find(x=>x.key.startsWith('w:') && ((nm && (finXwNorm(x.row.name)===nm || finXwNorm(x.row.trading_name)===nm)) || (em && String(x.row.email||'').toLowerCase()===em)));
  if(wHit) return Object.assign(wHit, {how:'name'});
  const prof = Object.values(PROFILES||{}).find(u=>(nm && finXwNorm(u.name)===nm) || (em && String(u.email||'').toLowerCase()===em));
  if(prof) return {key:prof.id, row:rates[prof.id]||{}, how:'user'};
  return null;
}
window.openFinXeroWorkers = async function(){
  let ov = document.getElementById('finXwOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finXwOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card finxw"><h3>Bring in from Xero</h3><div class="empty">Reading your subcontractors and staff from Xero…</div></div>`;
  ov.style.display = 'flex';
  const [j, rates] = await Promise.all([finXeroCall('workers', {}, 60000), finLoadRates(), loadAllProfiles()]);
  if(ov.style.display==='none') return;
  if(j.error){ ov.querySelector('.geo-modal-card').innerHTML = `<h3>Bring in from Xero</h3><div class="empty">${escapeHtml(j.error)}</div><button class="geo-modal-cancel" onclick="document.getElementById('finXwOverlay').style.display='none'">Close</button>`; return; }
  const people = (j.people||[]).map((p,i)=>{ const m = finXwMatch(p, rates); return Object.assign({}, p, {i, match:m, tick:!m || m.how!=='linked'}); });
  finXw = {people, rates, notes:j.notes||[]};
  finXwPaint();
};
window.finXwPaint = function(){
  const ov = document.getElementById('finXwOverlay'); if(!ov || !finXw) return;
  const X = finXw, n = X.people.filter(p=>p.tick).length;
  const group = (kind, title)=>{
    const ps = X.people.filter(p=>p.kind===kind); if(!ps.length) return '';
    return `<p class="sectiontitle" style="margin:12px 0 4px;">${title} <span class="stub" style="font-style:normal;">(${ps.length})</span></p>` + ps.map(p=>{
      const m = p.match;
      const where = !m ? '<span class="finxw-new">New</span>' : m.how==='linked' ? '<span class="finxw-ok">Already linked</span>' : `<span class="finxw-ok">Matches ${escapeHtml(m.key.startsWith('w:') ? (m.row.name||'worker') : finPersonName(m.key))}</span>`;
      const bits = [];
      if(kind==='sub') bits.push(p.cis_rate!=null ? 'CIS '+p.cis_rate+'%' : 'CIS not set');
      if(p.day_rate!=null) bits.push(finMoney(p.day_rate)+'/day'+(p.rate_note?' · '+escapeHtml(p.rate_note):''));
      else if(kind==='paye') bits.push('No pay rate in Xero');
      if(p.vat_registered) bits.push('VAT registered');
      if(p.email) bits.push(escapeHtml(p.email));
      return `<label class="finxw-row"><input type="checkbox" ${p.tick?'checked':''} onchange="finXw.people[${p.i}].tick=this.checked;finXwPaint()">
        <span class="finxw-main"><b>${escapeHtml(p.name||'(no name)')}</b> ${where}<br><span class="stub" style="font-style:normal;">${bits.join(' · ')}</span></span></label>`;
    }).join('');
  };
  ov.innerHTML = `<div class="geo-modal-card finxw">
    <h3>Bring in from Xero</h3>
    ${X.notes.map(t=>`<p class="stub" style="margin:0 0 6px;font-style:normal;">${escapeHtml(t)}</p>`).join('')}
    ${X.people.length ? `<div class="row-gap" style="margin:4px 0 0;"><button class="ghostbtn" onclick="finXw.people.forEach(p=>p.tick=true);finXwPaint()">Tick all</button><button class="ghostbtn" onclick="finXw.people.forEach(p=>p.tick=false);finXwPaint()">Untick all</button></div>
      <div class="finxw-list">${group('sub','Subcontractors')}${group('paye','PAYE staff')}</div>
      <p class="stub" style="margin:8px 0;font-style:normal;">Ticked people are added as workers, or their pay type, CIS rate and day rate are updated if they’re already in OpHUB. Rates you’ve typed in are only replaced when Xero has one.</p>
      <button class="darkbtn" style="width:100%;" id="finXwGo" ${n?'':'disabled'} onclick="saveFinXeroWorkers()">Import ${n} ${n===1?'person':'people'}</button>`
      : '<div class="empty">No subcontractors or staff found in Xero.</div>'}
    <button class="geo-modal-cancel" onclick="document.getElementById('finXwOverlay').style.display='none'">Cancel</button>
  </div>`;
};
window.saveFinXeroWorkers = async function(){
  const X = finXw; if(!X) return;
  const pick = X.people.filter(p=>p.tick); if(!pick.length) return;
  const btn = document.getElementById('finXwGo'); if(btn){ btn.disabled = true; btn.textContent = 'Importing…'; }
  const now = new Date().toISOString();
  let added = 0, updated = 0, failed = 0;
  for(const p of pick){
    const row = {pay_type: p.kind==='paye' ? 'paye' : 'subcontractor', updated_at: now};
    if(p.kind==='sub'){ if([0,20,30].includes(Number(p.cis_rate))) row.cis_rate = Number(p.cis_rate); row.vat_registered = !!p.vat_registered; row.xero_contact_id = p.xero_contact_id; }
    else { row.cis_rate = 0; row.xero_employee_id = p.xero_employee_id; }
    if(p.day_rate!=null && !isNaN(Number(p.day_rate))){ row.day_rate = finRound(Number(p.day_rate)); row.rate_note = p.rate_note ? 'Xero: '+p.rate_note : 'From Xero'; }
    const m = p.match;
    let ok = false;
    if(m && m.key.startsWith('w:')){
      if(!m.row.email && p.email) row.email = p.email;
      ok = !!(await dbUpdate('fin_labour_rates', m.key.slice(2), row));
      if(ok) updated++;
    } else if(m){
      const res = await sbFetch('/rest/v1/fin_labour_rates?on_conflict=org_id,user_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(Object.assign({org_id:ME.org_id, user_id:m.key}, row))});
      ok = res.ok; if(ok) updated++;
    } else {
      const ins = Object.assign({org_id:ME.org_id, user_id:null, name:String(p.name||'Worker').slice(0,200), email:p.email||null, cis_rate: row.cis_rate!=null ? row.cis_rate : 20, vat_registered: !!p.vat_registered}, row);
      ok = !!(await dbInsert('fin_labour_rates', ins));
      if(ok) added++;
    }
    if(!ok) failed++;
  }
  const ov = document.getElementById('finXwOverlay'); if(ov) ov.style.display = 'none';
  finXw = null;
  toast([added ? added+' added' : '', updated ? updated+' updated' : '', failed ? failed+' failed' : ''].filter(Boolean).join(', ') || 'Nothing changed');
  render();
};
