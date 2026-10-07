/* ================= APP SEARCH (Home Screen) =================
   A small 🔍 button above the project list. Tapping it opens a search bar
   that looks through jobs (name, address, postcode, client), people, the
   Admin Centre screens (managers), and — after a short pause — materials,
   to-dos and snags. Only the results area is
   re-drawn while typing, so the cursor is never lost. */
let appSearchOpen = false, appSearchQ = '';
let appSearchSeq = 0, appSearchTimer = null;
function appSearchHtml(){
  if(!appSearchOpen) return `<div style="display:flex;justify-content:flex-end;margin:-6px 0 0;"><span class="homebtn" style="flex:none;" title="Search" onclick="openAppSearch()">🔍</span></div>`;
  return `<div style="display:flex;gap:6px;align-items:center;margin:0 0 8px;">
      <input type="text" id="appSearchInput" placeholder="Search jobs, people${isManager(ME)?', settings':''}…" value="${escapeHtml(appSearchQ)}" oninput="appSearchQ=this.value;appSearchRender()" autocomplete="off" style="flex:1;min-width:0;margin:0;">
      <span class="homebtn" style="flex:none;" title="Close search" onclick="appSearchOpen=false;appSearchQ='';render()">✕</span>
    </div>
    <div id="appSearchResults" style="margin-bottom:10px;"></div>`;
}
window.openAppSearch = function(){ appSearchOpen = true; render().then(()=>{ const e = document.getElementById('appSearchInput'); if(e) e.focus(); appSearchRender(); }); };
window.appSearchRender = function(){
  const res = document.getElementById('appSearchResults'); if(!res) return;
  const q = (appSearchQ||'').trim().toLowerCase();
  if(q.length < 2){ res.innerHTML = q ? `<p class="stub" style="margin:0;">Keep typing…</p>` : ''; return; }
  const row = (icon, name, sub, hash)=>`<div class="sitecard" style="cursor:pointer;" onclick="go('${hash}')"><div style="font-size:20px;flex:0 0 auto;width:26px;text-align:center;">${icon}</div><div class="info"><div class="name">${escapeHtml(name)}</div>${sub ? `<div class="addr">${escapeHtml(sub)}</div>` : ''}</div><div style="color:var(--slate);font-size:20px;flex:0 0 auto;">›</div></div>`;
  const has = (...v)=>v.some(x=>String(x||'').toLowerCase().includes(q));
  const jobs = (SITES||[]).filter(s=>has(s.name, s.address, s.postcode, s.client_name, s.client_contact_name)).slice(0,12);
  const mgr = isManager(ME);
  const people = isClient(ME) ? [] : Object.values(PROFILES||{}).filter(p=>p && has(p.name, mgr ? p.email : '', mgr ? p.phone : '')).slice(0,10);
  const settings = mgr ? Object.keys(ADMIN_ITEMS).filter(k=>{ const it = ADMIN_ITEMS[k]; return it.show() && ADMIN_PAGES[it.page].show() && has(it.label, it.kw, it.group); }).slice(0,8) : [];
  let out = '';
  if(jobs.length) out += `<p class="sectiontitle" style="margin-top:0;">Jobs</p>` + jobs.map(s=>row('🏗️', s.name, fullSiteAddress(s)||'', '#/site/'+s.id+'/home')).join('');
  if(people.length) out += `<p class="sectiontitle" style="margin-top:${out?'14px':'0'};">People</p>` + people.map(p=>row('👤', p.name, personRoleLabel(p)+(mgr && p.email ? ' · '+p.email : ''), (isFullManager(ME) && (p.role==='operative'||p.role==='driver'||p.role==='site_manager')) ? '#/operatives/'+p.id : (mgr ? '#/team/people/users' : '#/sites'))).join('');
  if(settings.length) out += `<p class="sectiontitle" style="margin-top:${out?'14px':'0'};">Settings</p>` + settings.map(k=>adminRowHtml(k, ADMIN_PAGES[ADMIN_ITEMS[k].page].label)).join('');
  const seq = ++appSearchSeq; clearTimeout(appSearchTimer);
  const deep = q.length>=3 && navigator.onLine!==false && !isClient(ME);
  res.innerHTML = (out || (deep ? '' : `<div class="empty">Nothing matches "${escapeHtml(appSearchQ.trim())}".</div>`)) + (deep ? `<p class="stub" id="appSearchDeep" style="text-align:center;margin:12px 0 0;">Searching materials, to-dos and snags…</p>` : '');
  if(!deep) return;
  // After a short pause, also look in the database. It only ever returns
  // rows the signed-in person is allowed to see.
  appSearchTimer = setTimeout(async ()=>{
    const term = encodeURIComponent('*'+q.replace(/[*%,()\\]/g, ' ')+'*');
    const siteName = id=>{ const s = SITES.find(x=>x.id===id); return s ? s.name : 'Job'; };
    const known = r=>SITES.some(x=>x.id===r.site_id);
    let mats = [], todos = [], snags = [];
    try{
      [mats, todos, snags] = await Promise.all([
        dbSelectNet('materials', 'item=ilike.'+term+'&select=id,site_id,item,qty,status&order=created_at.desc&limit=12').catch(()=>[]),
        mgr ? dbSelectNet('todos', 'text=ilike.'+term+'&select=id,site_id,text,done&order=created_at.desc&limit=12').catch(()=>[]) : Promise.resolve([]),
        dbSelectNet('snags', 'or=(title.ilike.'+term+',location.ilike.'+term+')&select=id,site_id,title,location,status&order=created_at.desc&limit=12').catch(()=>[]),
      ]);
    }catch(e){}
    if(seq !== appSearchSeq) return;
    const box = document.getElementById('appSearchResults'); if(!box) return;
    let more = '';
    const sec = (title, rows)=>{ if(rows.length) more += `<p class="sectiontitle" style="margin-top:14px;">${title}</p>` + rows.join(''); };
    sec('Materials', (mats||[]).filter(known).map(r=>row('📦', r.item, siteName(r.site_id)+' · qty '+(r.qty||'')+' · '+(r.status||''), '#/site/'+r.site_id+'/materialrequests')));
    sec('To-dos', (todos||[]).filter(known).map(r=>row('✅', r.text, siteName(r.site_id)+(r.done ? ' · done' : ''), '#/site/'+r.site_id+'/todos')));
    sec('Snags', (snags||[]).filter(known).map(r=>row('🔧', r.title || 'Snag', siteName(r.site_id)+(r.location ? ' · '+r.location : '')+' · '+(r.status||''), '#/site/'+r.site_id+'/snagging/list')));
    box.innerHTML = (out + more) || `<div class="empty">Nothing matches "${escapeHtml(appSearchQ.trim())}".</div>`;
  }, 350);
};