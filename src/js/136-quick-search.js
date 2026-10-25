/* ================= QUICK SEARCH (21 Oct 2026, Andy: "the pop-up search is
   cool — make it a non-intrusive search button"). A small 🔍 in the left
   menu on a computer (and Ctrl+K / ⌘K), a small magnifier in the top bar on
   a phone. Opens a pop-up that finds projects, people, reports and
   documents, plus quick actions. Nothing is searched until you type. */
let qsState = {q:'', sel:0, items:[], seq:0};
function qsActions(){
  const m = ME && isManager(ME);
  const a = [];
  if(m) a.push({ic:'➕', t:'New project', s:'Set up a new job', go:"openHomeAddProject()", raw:true});
  a.push({ic:'🏗', t:'Projects', s:'All your projects', go:'#/sites'});
  if(m){ a.push({ic:'🚚', t:'Deliveries', s:'Delivery schedule', go:'#/delivery'}, {ic:'📅', t:'Calendar', s:'', go:'#/calendar'}, {ic:'🔔', t:'HUB', s:'Messages and alerts', go:'#/hub'}, {ic:'📋', t:'Reports & surveys', s:'', go:'#/reports'}, {ic:'👷', t:'Operatives', s:'', go:'#/operatives'}, {ic:'⚙️', t:'Admin Centre', s:'', go:'#/team'}); }
  else a.push({ic:'⚙️', t:'Settings', s:'', go:'#/account'});
  return a;
}
window.qsOpen = function(){
  if(!ME) return;
  let ov = document.getElementById('qsOverlay');
  if(!ov){
    ov = document.createElement('div'); ov.id = 'qsOverlay'; ov.className = 'qs-overlay';
    ov.innerHTML = `<div class="qs-box" onclick="event.stopPropagation()">
      <div class="qs-in"><span>🔍</span><input id="qsInput" type="text" autocomplete="off" placeholder="Search projects, people, reports, documents…" oninput="qsType(this.value)" onkeydown="qsKey(event)"><kbd class="qs-kbd">Esc</kbd></div>
      <div class="qs-res" id="qsRes"></div>
      <div class="qs-foot">↑ ↓ to move · Enter to open · Esc to close</div></div>`;
    ov.addEventListener('click', qsClose);
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';
  const inp = document.getElementById('qsInput'); inp.value = ''; qsState.q = ''; qsState.sel = 0;
  qsPaint([]); setTimeout(()=>inp.focus(), 30);
};
window.qsClose = function(){ const ov = document.getElementById('qsOverlay'); if(ov) ov.style.display = 'none'; };
function qsMatch(txt, q){ return String(txt||'').toLowerCase().includes(q); }
window.qsType = function(v){
  const q = String(v||'').trim().toLowerCase(); qsState.q = q; qsState.sel = 0;
  const local = [];
  if(q){
    SITES.filter(s=>[s.name, s.job_number, s.address, s.postcode, s.client_name].some(x=>qsMatch(x, q))).slice(0,6)
      .forEach(s=>local.push({g:'Projects', ic:'🏗', t:(s.job_number?s.job_number+' · ':'')+(s.name||''), s:[s.client_name, s.postcode].filter(Boolean).join(' · '), go:`#/site/${s.id}/home`}));
    if(isManager(ME)) Object.values(PROFILES||{}).filter(p=>p && (!p.org_id || p.org_id===ME.org_id) && [p.name, p.email, p.phone].some(x=>qsMatch(x, q))).slice(0,5)
      .forEach(p=>local.push({g:'People', ic:'👷', t:p.name||p.email, s:[typeof personRoleLabel==='function'?personRoleLabel(p):p.role, p.phone].filter(Boolean).join(' · '), go:p.role==='operative'?`#/operatives`:'#/team'}));
  }
  qsActions().filter(a=>!q || qsMatch(a.t, q)).slice(0, q?4:8).forEach(a=>local.push(Object.assign({g:'Go to'}, a)));
  qsPaint(local);
  if(q.length >= 2) qsRemote(q, local);
};
async function qsRemote(q, local){
  const my = ++qsState.seq;
  const like = encodeURIComponent('*'+q.replace(/[*,()]/g,' ')+'*');
  const siteName = id=>((SITES.find(s=>s.id===id)||{}).name)||'';
  const [reps, docs] = await Promise.all([
    isManager(ME) ? dbSelect('report_submissions', 'org_id=eq.'+ME.org_id+'&or=(template_name.ilike.'+like+',general_label.ilike.'+like+')&select=id,site_id,template_name,general_label,status,submitted_at&order=submitted_at.desc.nullslast&limit=5').catch(()=>[]) : Promise.resolve([]),
    dbSelect('drawing_files', 'name=ilike.'+like+'&status=eq.current&select=id,site_id,name,storage_path,folder_id&limit=6').catch(()=>[]),
  ]);
  if(my !== qsState.seq) return;
  const more = [];
  (reps||[]).filter(r=>r.site_id).forEach(r=>more.push({g:'Reports', ic:'📋', t:r.general_label||r.template_name||'Report', s:[siteName(r.site_id), r.status==='in_progress'?'Draft':''].filter(Boolean).join(' · '), go:`#/site/${r.site_id}/snagging/reports/${r.status==='in_progress'?'fill':'view'}/${r.id}`}));
  (docs||[]).filter(d=>SITES.some(s=>s.id===d.site_id)).forEach(d=>more.push({g:'Documents', ic:/\.(jpe?g|png)$/i.test(d.storage_path||'')?'🖼':/\.docx?$/i.test(d.name||'')?'📝':'📐', t:d.name, s:siteName(d.site_id), go:`#/site/${d.site_id}/drawings${d.folder_id?'/'+d.folder_id:''}`}));
  const acts = local.filter(x=>x.g==='Go to'), rest = local.filter(x=>x.g!=='Go to');
  qsPaint(rest.concat(more, acts));
}
function qsPaint(items){
  qsState.items = items; if(qsState.sel >= items.length) qsState.sel = 0;
  const el = document.getElementById('qsRes'); if(!el) return;
  if(!items.length){ el.innerHTML = `<div class="qs-empty">${qsState.q ? 'Nothing found for “'+escapeHtml(qsState.q)+'”.' : ''}</div>`; return; }
  let last = '', html = '';
  items.forEach((it, i)=>{
    if(it.g!==last){ html += `<div class="qs-g">${escapeHtml(it.g)}</div>`; last = it.g; }
    html += `<div class="qs-i ${i===qsState.sel?'on':''}" onmouseenter="qsHover(${i})" onclick="qsGo(${i})"><span class="qs-ic">${it.ic}</span><span class="qs-t"><b>${escapeHtml(it.t)}</b>${it.s?`<em>${escapeHtml(it.s)}</em>`:''}</span></div>`;
  });
  el.innerHTML = html;
  const on = el.querySelector('.qs-i.on'); if(on && on.scrollIntoView) on.scrollIntoView({block:'nearest'});
}
window.qsHover = function(i){ qsState.sel = i; document.querySelectorAll('#qsRes .qs-i').forEach((e,k)=>e.classList.toggle('on', k===i)); };
window.qsGo = function(i){
  const it = qsState.items[i]; if(!it) return;
  qsClose();
  if(it.raw){ try{ (new Function(it.go))(); }catch(e){} return; }
  go(it.go);
};
window.qsKey = function(e){
  if(e.key==='Escape'){ e.preventDefault(); qsClose(); }
  else if(e.key==='ArrowDown'){ e.preventDefault(); qsState.sel = Math.min(qsState.items.length-1, qsState.sel+1); qsPaint(qsState.items); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); qsState.sel = Math.max(0, qsState.sel-1); qsPaint(qsState.items); }
  else if(e.key==='Enter'){ e.preventDefault(); qsGo(qsState.sel); }
};
document.addEventListener('keydown', e=>{
  if((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase()==='k' && ME && !(typeof isFinanceOnly==='function' && isFinanceOnly())){ e.preventDefault(); qsOpen(); }
});
function qsSideBtnHtml(){
  if(!ME || (typeof isFinanceOnly==='function' && isFinanceOnly())) return '';
  const mac = /Mac|iPhone|iPad/.test(navigator.platform||'');
  return `<button type="button" class="desknav-search" onclick="qsOpen()"><span>🔍</span><span>Search</span><kbd>${mac?'⌘':'Ctrl'} K</kbd></button>`;
}
function qsTopBtnHtml(){
  if(!ME || (typeof isDeskMode==='function' && isDeskMode()) || (typeof isFinanceOnly==='function' && isFinanceOnly()) || ME.role==='driver') return '';
  return `<span class="qs-topbtn" title="Search" onclick="qsOpen()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg></span>`;
}
