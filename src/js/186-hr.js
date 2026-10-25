/* ================= #(hr) HR — holiday calendar, company policies, handbook =================
   For PMs, admins and site managers (is_pm() in the database).
   - Holiday calendar: each person books annual leave / training / sick days
     (full or half day). Everyone can see everyone's time off. The admin sets
     each person's allowance and colour, the 2-letter code for each type, how
     many people can be off at once and whether bookings need approval; the
     admin can go over the limit. "Link with project calendars" shows a PM's
     approved time off on the calendars of the projects they run, so the
     operatives on those jobs can see it.
   - Company policies: the admin uploads PDFs / Word docs; everyone signs them
     all with one tap. The admin sees who has signed and can export / email
     the signed record.
   - Company handbook: uploaded the same way, but signed on its own (read it,
     then sign) and never included in "Sign all". */

const HR_TYPES = {annual:'Annual leave', training:'Training course', sick:'Sick'};
const HR_DEFAULT_CODES = {annual:'AL', sick:'SK', training:'TC', bank:'BH'};
const HR_DEFAULT_ALLOWANCE = 28; // 2026-10-12: 28 days a year INCLUDING bank holidays
// #(hr-more-colours) 2026-10-17: 24 colours (was 10) so a bigger team still gets one each.
const HR_COLOURS = ['#D32F2F','#2457C5','#17804A','#B35A00','#7B3FB5','#0E7F7C','#C2185B','#5D4037','#455A64','#E0B400',
  '#F4511E','#0288D1','#43A047','#8E24AA','#00897B','#6D4C41','#3949AB','#C0CA33','#EC407A','#26A69A','#FB8C00','#5C6BC0','#7CB342','#212121'];
// England & Wales bank holidays (gov.uk). Auto-booked for PMs / site managers
// (not admins) and taken out of their 28-day allowance.
// Fix round 2 (CORE-L5): the list used to stop at 2028. These known years
// are kept as published; any other year is worked out from the standard
// rules (New Year, Good Friday, Easter Monday, early May, spring and summer
// Mondays, Christmas and Boxing Day, moved to the Monday/Tuesday when they
// fall at a weekend). One-off extra days (e.g. a coronation) still need
// adding here by hand.
const HR_BANK_HOLS_KNOWN = [
  '2026-01-01','2026-04-03','2026-04-06','2026-05-04','2026-05-25','2026-08-31','2026-12-25','2026-12-28',
  '2027-01-01','2027-03-26','2027-03-29','2027-05-03','2027-05-31','2027-08-30','2027-12-27','2027-12-28',
  '2028-01-03','2028-04-14','2028-04-17','2028-05-01','2028-05-29','2028-08-28','2028-12-25','2028-12-26',
];
function hrBankHolsForYear(y){
  const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const D = (m, day) => new Date(y, m, day);
  const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
  // Easter Sunday (Anonymous Gregorian algorithm)
  const a = y%19, b = Math.floor(y/100), c = y%100, d = Math.floor(b/4), e = b%4, f = Math.floor((b+8)/25), g = Math.floor((b-f+1)/3);
  const h = (19*a+b-d-g+15)%30, i = Math.floor(c/4), k = c%4, l = (32+2*e+2*i-h-k)%7, m = Math.floor((a+11*h+22*l)/451);
  const em = Math.floor((h+l-7*m+114)/31)-1, ed = ((h+l-7*m+114)%31)+1;
  const easter = D(em, ed);
  const firstMon = mo => { let x = D(mo, 1); while(x.getDay()!==1) x = add(x, 1); return x; };
  const lastMon = mo => { let x = D(mo+1, 0); while(x.getDay()!==1) x = add(x, -1); return x; };
  let ny = D(0, 1); if(ny.getDay()===6) ny = D(0, 3); else if(ny.getDay()===0) ny = D(0, 2);
  const xd = D(11, 25).getDay();
  let xmas, boxing;
  if(xd===5){ xmas = D(11, 25); boxing = D(11, 28); }        // Fri: Boxing Day (Sat) moves to Mon
  else if(xd===6){ xmas = D(11, 27); boxing = D(11, 28); }   // Sat: Mon + Tue
  else if(xd===0){ xmas = D(11, 27); boxing = D(11, 26); }   // Sun: Boxing Day Mon, Christmas Tue
  else { xmas = D(11, 25); boxing = D(11, 26); }
  return [ny, add(easter, -2), add(easter, 1), firstMon(4), lastMon(4), lastMon(7), xmas, boxing].map(iso);
}
const HR_BANK_HOLS = (function(){
  const set = new Set(HR_BANK_HOLS_KNOWN), done = new Set(['2026','2027','2028']);
  const ensure = y => { y = String(y||'').slice(0,4); if(!/^\d{4}$/.test(y) || done.has(y)) return; done.add(y); try{ hrBankHolsForYear(Number(y)).forEach(d=>set.add(d)); }catch(e){} };
  return {
    has(dStr){ ensure(dStr); return set.has(dStr); },
    forEach(fn){ set.forEach(fn); },
    ensureYear: ensure,
  };
})();
function hrIsWorkingDay(dStr){ const d = new Date(dStr+'T00:00:00'); const wd = d.getDay(); return wd!==0 && wd!==6 && !HR_BANK_HOLS.has(dStr); }
function hrEachDay(a, b, fn){ const d = new Date(a+'T00:00:00'), e = new Date(b+'T00:00:00'); while(d <= e){ fn(localISODate(d)); d.setDate(d.getDate()+1); } }
// #(hr-part-days) 2026-10-17: a booking over several days can start in the
// afternoon (start_part 'pm') and/or finish at lunchtime (end_part 'am') —
// e.g. Thursday afternoon + Friday = 1.5 days.
function hrDayFraction(l, ds){
  if(l.half) return 0.5;
  let f = 1;
  if(ds===l.start_date && l.start_part==='pm') f -= 0.5;
  if(ds===l.end_date && l.end_part==='am') f -= 0.5;
  return Math.max(f, 0.5);
}
function hrLeaveDays(l, yearOnly){
  if(l.half) return hrDaysBetween(l.start_date, l.end_date, l.half, yearOnly);
  let n = 0; hrEachDay(l.start_date, l.end_date, d=>{ if(hrIsWorkingDay(d) && (!yearOnly || d.slice(0,4)===String(yearOnly))) n += hrDayFraction(l, d); }); return n;
}
function hrDaysBetween(a, b, half, yearOnly){
  if(half) return (hrIsWorkingDay(a) && (!yearOnly || a.slice(0,4)===String(yearOnly))) ? 0.5 : 0;
  let n = 0; hrEachDay(a, b, d=>{ if(hrIsWorkingDay(d) && (!yearOnly || d.slice(0,4)===String(yearOnly))) n++; }); return n;
}
function hrCanUse(u){ return !!u && isManager(u); }
function hrIsAdmin(){ return ME && ME.role==='admin'; }

let HR_BH_ENSURED = false;
let HR = null; // {settings, people:[profile], hp:{userId:row}, leave:[], at}
async function hrLoad(force){
  if(!force && HR && HR.uid===ME.id && Date.now()-HR.at < 20000) return HR;
  const profP = loadAllProfiles();
  const y = new Date().getFullYear();
  // #(hr-bank-hol-rows) Bank holidays are real bookings on each PM / site
  // manager (not admins), created automatically once per session.
  if(!HR_BH_ENSURED){ HR_BH_ENSURED = true; try{ await sbFetch('/rest/v1/rpc/hr_ensure_bank_holidays', {method:'POST', body:'{}'}); }catch(e){ HR_BH_ENSURED = false; } }
  await profP;
  const [settingsRows, hpRows, leave] = await Promise.all([
    dbSelect('hr_settings', 'org_id=eq.'+ME.org_id+'&limit=1'),
    dbSelect('hr_people', 'org_id=eq.'+ME.org_id),
    dbSelectAll('hr_leave', 'org_id=eq.'+ME.org_id+'&end_date=gte.'+(y-1)+'-01-01&start_date=lte.'+(y+1)+'-12-31&order=start_date.asc,id.asc'), // paged: never cut off at 1000 rows (CORE-M5)
  ]);
  const settings = Object.assign({max_off_at_once:2, approval_required:true, type_codes:Object.assign({}, HR_DEFAULT_CODES)}, settingsRows[0]||{});
  settings.type_codes = Object.assign({}, HR_DEFAULT_CODES, settings.type_codes||{});
  const people = Object.values(PROFILES).filter(p=>p && ['pm','admin','site_manager'].includes(p.role)).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const hp = {}; (hpRows||[]).forEach(r=>{ hp[r.user_id] = r; });
  HR = {uid:ME.id, at:Date.now(), settings, people, hp, leave:(leave||[]).filter(l=>l.status!=='cancelled' && l.status!=='rejected'), allLeave:leave||[]};
  return HR;
}
function hrColour(uid){
  const r = HR && HR.hp[uid]; if(r && r.colour) return r.colour;
  const i = HR ? HR.people.findIndex(p=>p.id===uid) : 0;
  return HR_COLOURS[(i<0?0:i) % HR_COLOURS.length];
}
function hrAllowance(uid){ const r = HR && HR.hp[uid]; return r && r.allowance_days!=null ? Number(r.allowance_days) : HR_DEFAULT_ALLOWANCE; }
// #(hr-bank-hols) Bank holidays are booked automatically for everyone on the
// holiday calendar except admins.
function hrGetsBankHols(uid){ const p = PROFILES && PROFILES[uid]; return !!p && p.role!=='admin'; }
function hrBankHolCount(year){ HR_BANK_HOLS.ensureYear(year); let n = 0; HR_BANK_HOLS.forEach(d=>{ if(d.slice(0,4)===String(year)) n++; }); return n; }
function hrCode(type){ return ((HR && HR.settings.type_codes[type]) || HR_DEFAULT_CODES[type] || '??').toUpperCase().slice(0,2); }
function hrInitials(uid){ return (nameOf(uid)||'?').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
function hrUsed(uid, year, statuses){
  return (HR ? HR.leave : []).filter(l=>l.user_id===uid && l.type==='annual' && statuses.includes(l.status))
    .reduce((t,l)=>t + (l.bank_holiday ? (l.start_date.slice(0,4)===String(year) ? 1 : 0) : hrLeaveDays(l, year)), 0);
}
function hrOffOn(dStr){
  const real = (HR ? HR.leave : []).filter(l=>l.start_date<=dStr && l.end_date>=dStr && (l.status==='approved' || l.status==='pending'));
  return real;
}

// ---------- HR hub ----------
async function renderHrHub(){
  const __gen = RENDER_GEN;
  const [, pols, mine] = await Promise.all([
    hrLoad(true),
    dbSelect('company_policies', 'org_id=eq.'+ME.org_id+'&archived=eq.false&select=id,kind'),
    dbSelect('company_policy_signatures', 'user_id=eq.'+ME.id+'&select=policy_id'),
  ]);
  const signed = new Set(mine.map(s=>s.policy_id));
  const toSign = pols.filter(p=>!signed.has(p.id)).length;
  const y = new Date().getFullYear();
  const left = hrAllowance(ME.id) - hrUsed(ME.id, y, ['approved','pending']);
  const pending = HR.allLeave.filter(l=>l.status==='pending').length;
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    <div class="admgroup">
      ${admRow('#/hr/holidays', 'calendar', 'green', 'Holiday calendar', `${left} day${left===1?'':'s'} left this year${hrIsAdmin() && pending ? ' · '+pending+' to approve' : ''}`)}
      ${admRow('#/hr/policies', 'book', 'blue', 'Company policies & handbook', toSign ? toSign+' to read and sign' : 'All signed')}
    </div>
  `, {title:'HR', subtitle:'Holidays, policies & handbook', back:'#/home', tabs:false});
}

// ---------- Holiday calendar ----------
let hrMonth = null, hrSel = null, hrBookOpen = false, hrDraft = null, hrView = 'cal';
window.hrMonthShift = function(n){ const m = hrMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1); hrMonth = new Date(m.getFullYear(), m.getMonth()+n, 1); render(); };
window.hrSelect = function(d){ hrSel = d; render(); };
// #(hr-view-url) Requests / Settings are their own addresses now, so the back
// arrow from them goes to the calendar instead of right out of HR.
window.hrSetView = function(v){ go(v==='cal' ? '#/hr/holidays' : '#/hr/holidays/'+v); };
window.hrOpenBook = function(dStr){
  const d = dStr || hrSel || localISODate(new Date());
  hrDraft = {user_id: ME.id, type:'annual', start:d, end:d, part:'full', startPart:'full', endPart:'full', link:true, note:''};
  hrBookOpen = true; render();
  requestAnimationFrame(()=>{ const el = document.getElementById('hrBookCard'); if(el) el.scrollIntoView({behavior:'smooth', block:'start'}); });
};
window.hrSaveBooking = async function(){
  const d = hrDraft; if(!d) return;
  if(!d.start || !d.end){ toast('Pick the dates.'); return; }
  if(d.end < d.start){ toast('The end date is before the start date.'); return; }
  const half = (d.start===d.end && d.part!=='full') ? d.part : null;
  const start_part = (d.start!==d.end && d.startPart==='pm') ? 'pm' : null;
  const end_part = (d.start!==d.end && d.endPart==='am') ? 'am' : null;
  const days = hrLeaveDays({start_date:d.start, end_date:d.end, half, start_part, end_part});
  if(!days){ toast('Those dates are all weekends or bank holidays.'); return; }
  const isAdmin = hrIsAdmin();
  const uid = isAdmin ? (d.user_id || ME.id) : ME.id;
  // Allowance (annual leave only)
  if(d.type==='annual'){
    // Checked per year, so a booking over New Year counts each part against
    // the right year's allowance.
    for(const y of [...new Set([Number(d.start.slice(0,4)), Number(d.end.slice(0,4))])]){
      const need = hrLeaveDays({start_date:d.start, end_date:d.end, half, start_part, end_part}, y);
      const left = hrAllowance(uid) - hrUsed(uid, y, ['approved','pending']);
      if(need > left && !(isAdmin && await customConfirm(`This takes ${need} day${need===1?'':'s'} in ${y} but only ${left} are left for ${nameOf(uid)}. Book it anyway?`))){
        if(!isAdmin) toast(`Only ${left} day${left===1?'':'s'} of annual leave left for ${y}.`);
        return;
      }
    }
  }
  // How many people off at once
  let override = false;
  const max = Number(HR.settings.max_off_at_once)||0;
  if(max>0 && d.type!=='sick'){
    let clash = null;
    hrEachDay(d.start, d.end, day=>{
      if(clash || !hrIsWorkingDay(day)) return;
      const others = new Set(hrOffOn(day).filter(l=>l.user_id!==uid).map(l=>l.user_id));
      if(others.size >= max) clash = {day, n:others.size};
    });
    if(clash){
      const when = new Date(clash.day+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short'});
      if(!isAdmin){ customAlert(`${clash.n} people are already off on ${when} — the limit is ${max} at a time. Pick other dates or ask the admin.`); return; }
      if(!(await customConfirm(`${clash.n} people are already off on ${when} (limit ${max}). Override the limit for this booking?`))) return;
      override = true;
    }
  }
  // #(hr-pm-approval) 2026-10-17: anyone who isn't an admin (PMs, site
  // managers) always goes to an admin for approval — sick days excepted.
  const status = (isAdmin || d.type==='sick') ? 'approved' : 'pending';
  const row = await dbInsert('hr_leave', {org_id:ME.org_id, user_id:uid, type:d.type, start_date:d.start, end_date:d.end, half, start_part, end_part, days, status, link_projects:!!d.link, note:(d.note||'').trim()||null, override_limit:override, created_by:ME.id, ...(status==='approved'&&isAdmin?{decided_by:ME.id, decided_at:new Date().toISOString()}:{})});
  if(!row){ toast('Could not save — try again.'); return; }
  hrBookOpen = false; hrDraft = null; HR = null;
  if(status==='pending'){
    const fmtD = x => new Date(x+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric', month:'short'});
    Object.values(PROFILES).filter(p=>p && p.role==='admin' && p.id!==ME.id).forEach(a=>{
      try{ postSystemMessageToUser(a.id, null, 'message', `${ME.name} has asked for time off (${HR_TYPES[d.type]||d.type}, ${days} day${days===1?'':'s'}: ${fmtD(d.start)}${d.end!==d.start?' – '+fmtD(d.end):''}) — approve it in HR › Holiday calendar › Requests.`, null); }catch(e){}
    });
  }
  toast(status==='pending' ? 'Request sent to the admin for approval' : 'Booked');
  render();
};
window.hrDecide = async function(id, ok){
  const l = HR.allLeave.find(x=>x.id===id); if(!l) return;
  let hrOverrode = false;
  if(ok){
    const max = Number(HR.settings.max_off_at_once)||0;
    let clash = null;
    if(max>0 && l.type!=='sick') hrEachDay(l.start_date, l.end_date, day=>{ if(clash || !hrIsWorkingDay(day)) return; const others = new Set(hrOffOn(day).filter(x=>x.user_id!==l.user_id && x.status==='approved').map(x=>x.user_id)); if(others.size >= max) clash = {day, n:others.size}; });
    if(clash) hrOverrode = true;
    if(clash && !(await customConfirm(`${clash.n} people are already off on ${new Date(clash.day+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})} (limit ${max}). Approve anyway?`))) return;
  }
  const row = await dbUpdate('hr_leave', id, {status: ok?'approved':'rejected', decided_by:ME.id, decided_at:new Date().toISOString(), ...(ok && hrOverrode?{override_limit:true}:{})});
  if(row){ HR = null; toast(ok?'Approved':'Declined'); render(); }
};
window.hrCancel = async function(id){
  if(!(await customConfirm('Cancel this time off?'))) return;
  const row = await dbUpdate('hr_leave', id, {status:'cancelled'});
  if(row){ HR = null; toast('Cancelled'); render(); }
};
window.hrSaveSettings = async function(){
  const g = id => document.getElementById(id);
  const codes = {};
  Object.keys(HR_TYPES).forEach(k=>{ const v = (g('hrCode_'+k).value||'').trim().toUpperCase().slice(0,2); codes[k] = v || HR_DEFAULT_CODES[k]; });
  const payload = {org_id:ME.org_id, max_off_at_once: Math.max(0, parseInt(g('hrMax').value,10)||0), approval_required: !!g('hrApproval').checked, type_codes: codes, updated_at:new Date().toISOString()};
  const res = await sbFetch('/rest/v1/hr_settings?on_conflict=org_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify(payload)});
  const people = HR.people.map(p=>({org_id:ME.org_id, user_id:p.id, allowance_days: Number(g('hrAllow_'+p.id).value)||0, colour: (g('hrCol_'+p.id)||{}).value || hrColour(p.id), updated_at:new Date().toISOString()}));
  const res2 = await sbFetch('/rest/v1/hr_people?on_conflict=org_id,user_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify(people)});
  if(res && res.ok && res2 && res2.ok){ HR = null; toast('HR settings saved'); render(); } else toast('Could not save — try again.');
};
function hrChip(l, small, ds){
  const col = hrColour(l.user_id);
  const pend = l.status==='pending';
  const halfHere = l.half || (ds && hrDayFraction(l, ds) < 1);
  return `<span class="hrchip ${small?'sm':''}" style="background:${pend?'#fff':col};color:${pend?col:'#fff'};border-color:${col};">${small ? hrInitials(l.user_id) : escapeHtml(nameOf(l.user_id)||'')}<b>${l.bank_holiday?'BH':hrCode(l.type)}${halfHere?'½':''}</b></span>`;
}
window.hrPickColour = function(uid, c){
  const inp = document.getElementById('hrCol_'+uid); if(inp) inp.value = c;
  document.querySelectorAll('[data-hrsw="'+uid+'"]').forEach(b=>b.classList.toggle('on', b.getAttribute('data-c')===c));
};
function hrTypeLabel(l){ return l.bank_holiday ? 'Bank holiday' : (HR_TYPES[l.type]||l.type); }
function hrBhCount(uid, year){ return (HR ? HR.leave : []).filter(l=>l.user_id===uid && l.bank_holiday && l.status==='approved' && l.start_date.slice(0,4)===String(year)).length; }
async function renderHrHolidays(){
  const __gen = RENDER_GEN;
  await hrLoad();
  const isAdmin = hrIsAdmin();
  const today = localISODate(new Date());
  if(!hrSel) hrSel = today;
  const m = hrMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const first = new Date(m.getFullYear(), m.getMonth(), 1), last = new Date(m.getFullYear(), m.getMonth()+1, 0);
  const lead = (first.getDay()+6)%7;
  const gridStart = new Date(first); gridStart.setDate(first.getDate()-lead);
  const cells = Math.ceil((lead+last.getDate())/7)*7;
  let grid = '';
  for(let i=0;i<cells;i++){
    const d = new Date(gridStart); d.setDate(gridStart.getDate()+i);
    const ds = localISODate(d);
    const offs = hrOffOn(ds).filter(l=>!l.bank_holiday);
    const bh = HR_BANK_HOLS.has(ds), we = d.getDay()===0 || d.getDay()===6;
    grid += `<button type="button" class="hrday ${d.getMonth()!==first.getMonth()?'out':''} ${ds===today?'today':''} ${ds===hrSel?'sel':''} ${bh||we?'off':''}" onclick="hrSelect('${ds}')">
      <span class="hrday-n">${d.getDate()}</span>${bh?'<span class="hrbh">BH</span>':''}
      ${offs.slice(0,3).map(l=>hrChip(l, true, ds)).join('')}${offs.length>3?`<span class="hrmore">+${offs.length-3}</span>`:''}
    </button>`;
  }
  const y = new Date().getFullYear();
  const myUsed = hrUsed(ME.id, y, ['approved']), myPend = hrUsed(ME.id, y, ['pending']), myAllow = hrAllowance(ME.id);
  const selOffs = hrOffOn(hrSel).filter(l=>!l.bank_holiday);
  const pending = HR.allLeave.filter(l=>l.status==='pending').sort((a,b)=>a.start_date.localeCompare(b.start_date));
  const myUpcoming = HR.allLeave.filter(l=>l.user_id===ME.id && !l.bank_holiday && l.end_date>=today && (l.status==='approved'||l.status==='pending'));
  const fmt = s => new Date(s+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short'});
  const range = l => l.start_date===l.end_date ? fmt(l.start_date)+(l.half?(l.half==='am'?' (morning)':' (afternoon)'):'') : fmt(l.start_date)+(l.start_part==='pm'?' (afternoon)':'')+' – '+fmt(l.end_date)+(l.end_part==='am'?' (morning)':'');
  const d = hrDraft;
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    <div class="pmstats" style="grid-template-columns:repeat(3,minmax(0,1fr));">
      <div class="pmstat" style="cursor:default;"><b>${myAllow - myUsed - myPend}</b><span>Days left ${y}</span></div>
      <div class="pmstat" style="cursor:default;"><b>${myUsed}</b><span>Taken / booked</span></div>
      <div class="pmstat" style="cursor:default;"><b${myPend?' class="hot"':''}>${myPend}</b><span>Awaiting approval</span></div>
    </div>
    <p class="stub" style="margin:-4px 2px 10px;font-size:11.5px;">${hrBhCount(ME.id, y) ? 'Includes 1 day for each bank holiday ('+hrBhCount(ME.id, y)+' this year), allocated automatically.' : 'PMs and site managers get 1 day for each bank holiday allocated automatically.'}</p>
    <button type="button" class="pmprimary" style="margin-bottom:12px;" onclick="hrOpenBook()">${ophIcon('plus', 20, 2.4)} Book time off</button>
    ${isAdmin ? `<div class="pmchips" style="margin:0 0 12px;"><button type="button" class="pmchip ${hrView==='cal'?'on':''}" onclick="hrSetView('cal')">Calendar</button><button type="button" class="pmchip ${hrView==='req'?'on':''}" onclick="hrSetView('req')">Requests${pending.length?' ('+pending.length+')':''}</button><button type="button" class="pmchip ${hrView==='set'?'on':''}" onclick="hrSetView('set')">Settings</button></div>` : ''}
    ${hrBookOpen && d ? `
      <div class="card" id="hrBookCard">
        <p class="sectiontitle" style="margin-top:0;">Book time off</p>
        ${isAdmin ? `<div class="formfield"><label class="field-label">Who</label><select onchange="hrDraft.user_id=this.value">${HR.people.map(p=>`<option value="${p.id}" ${d.user_id===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}</select></div>` : ''}
        <div class="formfield"><label class="field-label">Type</label>
          <div class="pmchips" style="margin:0;">${Object.keys(HR_TYPES).map(k=>`<button type="button" class="pmchip ${d.type===k?'on':''}" onclick="hrDraft.type='${k}';render()">${HR_TYPES[k]} (${hrCode(k)})</button>`).join('')}</div></div>
        <div class="row-gap">
          <div class="formfield" style="flex:1;min-width:0;" onclick="openDatePickerRow(this)"><label class="field-label">From</label><input type="date" value="${d.start}" onchange="hrDraft.start=this.value;if(hrDraft.end<hrDraft.start)hrDraft.end=this.value;" onblur="render()"></div>
          <div class="formfield" style="flex:1;min-width:0;" onclick="openDatePickerRow(this)"><label class="field-label">To</label><input type="date" value="${d.end}" onchange="hrDraft.end=this.value;" onblur="render()"></div>
        </div>
        ${d.start===d.end ? `<div class="formfield"><label class="field-label">Day</label><div class="pmchips" style="margin:0;">${[['full','Full day'],['am','Morning'],['pm','Afternoon']].map(([k,l])=>`<button type="button" class="pmchip ${d.part===k?'on':''}" onclick="hrDraft.part='${k}';render()">${l}</button>`).join('')}</div></div>` : `
        <div class="formfield"><label class="field-label">First day</label><div class="pmchips" style="margin:0;">${[['full','Full day'],['pm','Afternoon only']].map(([k,l])=>`<button type="button" class="pmchip ${(d.startPart||'full')===k?'on':''}" onclick="hrDraft.startPart='${k}';render()">${l}</button>`).join('')}</div></div>
        <div class="formfield"><label class="field-label">Last day</label><div class="pmchips" style="margin:0;">${[['full','Full day'],['am','Morning only']].map(([k,l])=>`<button type="button" class="pmchip ${(d.endPart||'full')===k?'on':''}" onclick="hrDraft.endPart='${k}';render()">${l}</button>`).join('')}</div></div>`}
        <p class="stub" style="margin:0 0 10px;">${(()=>{ const n = hrLeaveDays({start_date:d.start, end_date:d.end, half: d.start===d.end && d.part!=='full' ? d.part : null, start_part: d.start!==d.end && d.startPart==='pm' ? 'pm' : null, end_part: d.start!==d.end && d.endPart==='am' ? 'am' : null}); return n+' working day'+(n===1?'':'s')+(d.type==='annual'?' of annual leave':'')+' — weekends and bank holidays (already booked) don’t count.'; })()}</p>
        <div class="formfield"><label class="field-label">Note (optional)</label><input type="text" value="${escapeHtml(d.note||'')}" oninput="hrDraft.note=this.value" placeholder="e.g. Family holiday"></div>
        <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 12px;"><input type="checkbox" style="width:auto;" ${d.link?'checked':''} onchange="hrDraft.link=this.checked">Link with project calendars — operatives on jobs I run can see I'm off</label>
        <div class="row-gap"><button class="darkbtn" style="flex:1;" onclick="hrSaveBooking()">${(isAdmin || d.type==='sick') ? 'Book it' : 'Send for approval'}</button><button class="ghostbtn" style="width:auto;padding:10px 16px;" onclick="hrBookOpen=false;render()">Cancel</button></div>
      </div>` : ''}
    ${(!isAdmin || hrView==='cal') ? `
      <div class="calm">
        <div class="calm-head">
          <button type="button" class="calm-nav" aria-label="Previous month" onclick="hrMonthShift(-1)">‹</button>
          <div class="calm-title">${first.toLocaleDateString('en-GB',{month:'long', year:'numeric'})}</div>
          <button type="button" class="calm-today hrcal-today" onclick="hrMonth=null;hrSel=null;render()">Today</button>
          <button type="button" class="calm-nav" aria-label="Next month" onclick="hrMonthShift(1)">›</button>
        </div>
        <div class="calm-wk">${['M','T','W','T','F','S','S'].map(x=>`<span>${x}</span>`).join('')}</div>
        <div class="hrgrid">${grid}</div>
        <div class="hrkey">${HR.people.map(p=>`<span><i style="background:${hrColour(p.id)};"></i>${escapeHtml(p.name)}</span>`).join('')}<span class="stub" style="margin:0;">${Object.keys(HR_TYPES).map(k=>hrCode(k)+' '+HR_TYPES[k].toLowerCase()).join(' · ')} · BH bank holiday (booked for PMs automatically) · outlined = waiting approval</span></div>
      </div>
      ${isAdmin ? `<p class="sectiontitle">Days left ${y}</p>
      <div class="card" style="padding:6px 14px;margin-bottom:12px;">${HR.people.map(p=>{ const al = hrAllowance(p.id), used = hrUsed(p.id, y, ['approved']), pend = hrUsed(p.id, y, ['pending']), bh = hrBhCount(p.id, y); return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);"><i style="width:10px;height:10px;border-radius:50%;background:${hrColour(p.id)};flex:none;"></i><span style="flex:1;min-width:0;font-weight:700;font-size:13.5px;">${escapeHtml(p.name)}</span><span class="stub" style="margin:0;font-size:11.5px;text-align:right;">${used} used${pend?' · '+pend+' waiting':''}</span><b style="min-width:44px;text-align:right;">${al-used-pend}<span class="stub" style="margin:0;font-size:11px;">/${al}</span></b></div>`; }).join('')}</div>` : ''}
      <p class="calm-selhead">${fmt(hrSel)}${HR_BANK_HOLS.has(hrSel)?' · Bank holiday':''}</p>
      ${selOffs.length ? selOffs.map(l=>`<div class="pmrow pmrow-card" style="cursor:default;">${hrChip(l)}<span class="pmrow-txt"><span class="pmrow-t">${hrTypeLabel(l)}${l.half?(l.half==='am'?' · morning':' · afternoon'):''}</span><span class="pmrow-s">${range(l)}${l.bank_holiday?' · booked automatically':''}${l.status==='pending'?' · waiting approval':''}${l.note?' · '+escapeHtml(l.note):''}</span></span></div>`).join('') : `<p class="stub" style="margin:4px 2px 12px;">${HR_BANK_HOLS.has(hrSel) ? 'Bank holiday — 1 day allocated to each PM automatically.' : 'Everyone\'s in.'}</p>`}
      <button type="button" class="ghostbtn" style="margin:4px 0 14px;" onclick="hrOpenBook('${hrSel}')">+ Book this day</button>
      ${myUpcoming.length ? `<p class="sectiontitle">My upcoming time off</p>${myUpcoming.map(l=>`<div class="pmrow pmrow-card" style="cursor:default;"><span class="pmrow-txt"><span class="pmrow-t">${hrTypeLabel(l)} · ${l.days} day${l.days==1?'':'s'}</span><span class="pmrow-s">${range(l)}${l.status==='pending'?' · waiting approval':''}${l.link_projects?' · on project calendars':''}</span></span><button type="button" class="ghostbtn" style="width:auto;margin:0;padding:6px 10px;font-size:12px;" onclick="hrCancel('${l.id}')">Cancel</button></div>`).join('')}` : ''}
    ` : ''}
    ${isAdmin && hrView==='req' ? `
      ${pending.length ? pending.map(l=>`<div class="card" style="padding:12px 14px;">
        <div style="display:flex;align-items:center;gap:8px;">${hrChip(l)}<span class="stub" style="margin:0;">${l.days} day${l.days==1?'':'s'}</span></div>
        <p style="margin:8px 0 2px;font-weight:700;">${hrTypeLabel(l)} · ${range(l)}</p>
        ${l.note?`<p class="stub" style="margin:0 0 6px;">${escapeHtml(l.note)}</p>`:''}
        <p class="stub" style="margin:0 0 10px;">${hrAllowance(l.user_id) - hrUsed(l.user_id, Number(l.start_date.slice(0,4)), ['approved'])} days left before this</p>
        <div class="row-gap"><button class="darkbtn" style="flex:1;" onclick="hrDecide('${l.id}', true)">Approve</button><button class="ghostbtn" style="flex:1;" onclick="hrDecide('${l.id}', false)">Decline</button></div>
      </div>`).join('') : `<div class="empty">No requests waiting.</div>`}
    ` : ''}
    ${isAdmin && hrView==='set' ? `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">Rules</p>
        <div class="formfield"><label class="field-label">Most people off at the same time</label><input type="number" id="hrMax" min="0" value="${Number(HR.settings.max_off_at_once)||0}"><p class="stub" style="margin:4px 0 0;">0 = no limit. You can still go over it yourself when booking or approving.</p></div>
        <input type="checkbox" id="hrApproval" checked hidden><p class="stub" style="margin:0 0 12px;">PMs' and site managers' time off always comes to an admin to approve. Sick days are recorded straight away.</p>
        <p class="field-label" style="margin:0 0 6px;">Letters shown in the calendar</p>
        ${Object.keys(HR_TYPES).map(k=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;"><input type="text" id="hrCode_${k}" maxlength="2" value="${escapeHtml(hrCode(k))}" style="width:60px;margin:0;text-transform:uppercase;text-align:center;font-weight:800;"><span>${HR_TYPES[k]}</span></div>`).join('')}
      </div>
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">People — allowance &amp; colour</p>
        <p class="stub" style="margin:-4px 0 10px;">Days a year <b>including bank holidays</b>. Bank holidays are booked automatically for PMs and site managers (not admins) and come out of this.</p>
        ${HR.people.map(p=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="flex:1;min-width:0;font-weight:700;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</span>
          <input type="number" id="hrAllow_${p.id}" min="0" step="0.5" value="${hrAllowance(p.id)}" style="width:72px;margin:0;">
        </div>
        <div class="hrswatches"><input type="hidden" id="hrCol_${p.id}" value="${hrColour(p.id)}">${HR_COLOURS.map(c=>`<button type="button" class="hrsw ${hrColour(p.id)===c?'on':''}" data-hrsw="${p.id}" data-c="${c}" style="background:${c};" aria-label="Colour" onclick="hrPickColour('${p.id}','${c}')"></button>`).join('')}</div>`).join('')}
      </div>
      <button class="darkbtn" onclick="hrSaveSettings()">Save settings</button>
    ` : ''}
  `, {title: hrView==='req' ? 'Time off requests' : hrView==='set' ? 'Holiday settings' : 'Holiday calendar', subtitle:'Everyone’s time off', back: (isAdmin && hrView!=='cal') ? '#/hr/holidays' : '#/hr', tabs:false});
}

// ---------- Company policies + handbook ----------
let hrPolOpenId = null, hrPolBusy = false;
async function hrPolicyData(){
  const pols = await dbSelect('company_policies', 'org_id=eq.'+ME.org_id+'&archived=eq.false&order=uploaded_at.asc');
  const sigs = pols.length ? await dbSelect('company_policy_signatures', 'policy_id=in.('+pols.map(p=>p.id).join(',')+')&order=signed_at.asc') : [];
  return {pols, sigs};
}
function hrPolUrl(p){ return publicUrl('mc-documents', p.storage_path); }
window.hrViewPolicy = function(id){
  const p = (window._hrPols||[]).find(x=>x.id===id); if(!p) return;
  const url = hrPolUrl(p);
  if(/\.pdf$/i.test(p.file_name||p.storage_path)) viewDrawing(url, false, p.file_name||p.title);
  else window.open(url, '_blank');
};
window.hrUploadPolicies = async function(input, kind){
  const files = input.files ? Array.from(input.files) : []; if(!files.length) return;
  hrPolBusy = true; render();
  let ok = 0;
  for(const f of files){
    const path = 'company-policies/'+ME.org_id+'/'+crypto.randomUUID()+'-'+f.name.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('mc-documents', path, f, f.type||'application/octet-stream');
    if(!stored) continue;
    const title = f.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();
    const row = await dbInsert('company_policies', {org_id:ME.org_id, kind, title: kind==='handbook' ? (title || 'Company handbook') : title, storage_path:stored, file_name:f.name, uploaded_by:ME.id, archived:false});
    if(row) ok++;
  }
  hrPolBusy = false; input.value='';
  toast(ok ? `${ok} uploaded` : 'Upload failed — try again.');
  render();
};
window.hrArchivePolicy = async function(id){
  if(!(await customConfirm('Remove this document? Signatures already collected are kept on record.'))) return;
  const row = await dbUpdate('company_policies', id, {archived:true});
  if(row){ toast('Removed'); render(); }
};
async function hrNeedSignature(){
  if(ME.signature_path) return true;
  if(await customConfirm('You need to adopt your signature first (once — it’s reused everywhere). Do that now?')) go('#/signature');
  return false;
}
window.hrSignAllPolicies = async function(){
  const ids = (window._hrToSign||[]); if(!ids.length) return;
  if(!(await hrNeedSignature())) return;
  if(!(await customConfirm(`Sign all ${ids.length} company polic${ids.length===1?'y':'ies'}? This confirms you have read and understood ${ids.length===1?'it':'them'}.`))) return;
  let ok = 0;
  const at = new Date().toISOString();
  const res = await Promise.all(ids.map(id=>dbInsert('company_policy_signatures', {policy_id:id, user_id:ME.id, signature_image_path:ME.signature_path, signed_at:at})));
  ok = res.filter(Boolean).length;
  toast(ok ? 'Signed' : 'Could not sign — try again.'); render();
};
window.hrSignHandbook = async function(id){
  if(!(await hrNeedSignature())) return;
  if(!(await customConfirm('I confirm I have read and understood the company handbook.'))) return;
  const r = await dbInsert('company_policy_signatures', {policy_id:id, user_id:ME.id, signature_image_path:ME.signature_path, signed_at:new Date().toISOString()});
  toast(r ? 'Handbook signed' : 'Could not sign — try again.'); render();
};
async function hrBuildPolicyPdf(id){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load.'); return null; }
  const p = (window._hrPols||[]).find(x=>x.id===id); if(!p) return null;
  const sigs = (window._hrSigs||[]).filter(s=>s.policy_id===id);
  await loadAllProfiles();
  let pdfDoc;
  if(/\.pdf$/i.test(p.file_name||p.storage_path)){
    try{ const bytes = await (await fetch(hrPolUrl(p))).arrayBuffer(); pdfDoc = await PDFLib.PDFDocument.load(bytes, {ignoreEncryption:true}); }catch(e){ pdfDoc = null; }
  }
  if(!pdfDoc) pdfDoc = await PDFLib.PDFDocument.create();
  const disclaimer = p.kind==='handbook'
    ? `I have read and understood the ${ORG && ORG.name ? ORG.name+' ' : ''}company handbook (${p.title}) and agree to follow it.`
    : `I have read and understood this company policy (${p.title}) and agree to follow it.`;
  await drawSignatureTablePages(pdfDoc, {title: p.title, disclaimer, signers: sigs.map(s=>({name:nameOf(s.user_id), imagePath:s.signature_image_path, when:new Date(s.signed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}))});
  const filename = exportFilename('', p.title+' (Signed)', 'pdf');
  pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
  return {bytes: await pdfDoc.save(), filename, p};
}
window.hrExportPolicy = async function(id){
  toast('Building PDF…');
  try{ const b = await hrBuildPolicyPdf(id); if(b) await deliverPdf(b.bytes, b.filename); }catch(e){ console.error(e); toast('Could not build the PDF.'); }
};
window.hrEmailPolicy = async function(id){
  const to = await customPrompt('Email the signed record to:', ME.email||''); if(to==null) return;
  const email = String(to).trim(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Enter a valid email address.'); return; }
  toast('Building PDF…');
  try{
    const b = await hrBuildPolicyPdf(id); if(!b) return;
    const path = 'company-policies/'+ME.org_id+'/exports/'+crypto.randomUUID()+'-'+b.filename.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('mc-documents', path, new Blob([b.bytes], {type:'application/pdf'}), 'application/pdf');
    if(!stored){ toast('Could not upload the PDF.'); return; }
    const res = await sbFetch('/functions/v1/send-document-email', {method:'POST', timeoutMs:90000, body: JSON.stringify({general_label: b.p.kind==='handbook'?'Company handbook':'Company policy', recipient_email: email, cc_email: email!==ME.email ? ME.email : undefined, doc_title: b.p.title+' (signed)', file_url: publicUrl('mc-documents', stored), storage_bucket: 'mc-documents', storage_path: stored})}); // storage_path lets the email function fetch the private file itself (CORE-L8)
    toast(res && res.ok ? 'Emailed' : 'Could not send the email — '+(await safeErr(res)));
  }catch(e){ console.error(e); toast('Could not send the email.'); }
};
async function renderHrPolicies(){
  const __gen = RENDER_GEN;
  const [, {pols, sigs}] = await Promise.all([loadAllProfiles(), hrPolicyData()]);
  window._hrPols = pols; window._hrSigs = sigs;
  const isAdmin = hrIsAdmin();
  const people = Object.values(PROFILES).filter(p=>p && ['pm','admin','site_manager'].includes(p.role)).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const signedBy = id => new Map(sigs.filter(s=>s.policy_id===id).map(s=>[s.user_id, s]));
  const policies = pols.filter(p=>p.kind==='policy'), handbooks = pols.filter(p=>p.kind==='handbook');
  const toSign = policies.filter(p=>!signedBy(p.id).has(ME.id));
  window._hrToSign = toSign.map(p=>p.id);
  const fmt = s => new Date(s).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const row = (p, isHb) => {
    const sb = signedBy(p.id), mine = sb.get(ME.id), open = hrPolOpenId===p.id;
    return `<div class="hrpol ${open?'open':''}">
      <div class="hrpol-h">
        <button type="button" class="hrpol-t" onclick="hrViewPolicy('${p.id}')"><b>${escapeHtml(p.title)}</b><span>${/\.pdf$/i.test(p.file_name||'')?'PDF':'Word'}</span></button>
        ${mine ? `<span class="pmbadge done">Signed ${fmt(mine.signed_at)}</span>` : (isHb ? `<button type="button" class="darkbtn" style="width:auto;margin:0;padding:7px 12px;font-size:12px;" onclick="hrSignHandbook('${p.id}')">Read &amp; sign</button>` : `<span class="pmbadge open">To sign</span>`)}
        <button type="button" class="hrpol-view" onclick="hrViewPolicy('${p.id}')">View</button>
        ${isAdmin ? `<button type="button" class="hrpol-x" aria-label="Who has signed" onclick="hrPolOpenId=${open?'null':`'${p.id}'`};render()">${open?'▲':'▼'}</button>` : ''}
      </div>
      ${isAdmin && open ? `<div class="hrpol-b">
        <p class="stub" style="margin:0 0 6px;">${sb.size} of ${people.length} signed</p>
        ${people.map(u=>{ const s = sb.get(u.id); return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:3px 0;"><span>${escapeHtml(u.name)}</span><span style="color:${s?'var(--ok)':'var(--slate)'};font-weight:700;">${s?'✓ '+fmt(s.signed_at):'Not yet'}</span></div>`; }).join('')}
        <div class="row-gap" style="margin-top:10px;"><button class="ghostbtn" style="flex:1;" onclick="hrExportPolicy('${p.id}')">Export PDF</button><button class="ghostbtn" style="flex:1;" onclick="hrEmailPolicy('${p.id}')">Email</button></div>
        <button class="ghostbtn" style="margin-top:8px;color:var(--warn);" onclick="hrArchivePolicy('${p.id}')">Remove document</button>
      </div>` : ''}
    </div>`;
  };
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    <p class="sectiontitle" style="margin-top:0;">Company policies</p>
    ${toSign.length ? `<button type="button" class="pmprimary" style="margin-bottom:12px;" onclick="hrSignAllPolicies()">✍ Sign all ${toSign.length} polic${toSign.length===1?'y':'ies'}</button>` : (policies.length ? `<p class="stub" style="margin:0 0 10px;color:var(--ok);font-weight:700;">✓ You've signed every policy.</p>` : '')}
    ${policies.length ? policies.map(p=>row(p,false)).join('') : `<div class="empty">No policies uploaded yet.</div>`}
    ${isAdmin ? `<label class="ghostbtn" style="display:block;text-align:center;cursor:pointer;margin:8px 0 0;">${hrPolBusy?'Uploading…':'+ Upload policies (PDF or Word, several at once)'}<input type="file" multiple accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="display:none;" ${hrPolBusy?'disabled':''} onchange="hrUploadPolicies(this,'policy')"></label>` : ''}
    <p class="sectiontitle" style="margin-top:22px;">Company handbook</p>
    <p class="stub" style="margin:0 0 8px;">Read it, then sign it on its own — it isn't part of "Sign all".</p>
    ${handbooks.length ? handbooks.map(p=>row(p,true)).join('') : `<div class="empty">No handbook uploaded yet.</div>`}
    ${isAdmin ? `<label class="ghostbtn" style="display:block;text-align:center;cursor:pointer;margin:8px 0 0;">${hrPolBusy?'Uploading…':'+ Upload handbook (PDF or Word)'}<input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="display:none;" ${hrPolBusy?'disabled':''} onchange="hrUploadPolicies(this,'handbook')"></label>` : ''}
  `, {title:'Policies & handbook', subtitle:(ORG&&ORG.name)||'', back:'#/hr', tabs:false});
}

// Approved, linked time off of a project's PM — shown on that project's calendar.
async function hrSiteLeave(siteId, from, to){
  try{
    const res = await sbFetch('/rest/v1/rpc/site_pm_leave', {method:'POST', body: JSON.stringify({p_site: siteId, p_from: from, p_to: to})});
    if(!res || !res.ok) return [];
    return await res.json();
  }catch(e){ return []; }
}
