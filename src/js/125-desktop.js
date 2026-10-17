/* ================= DESKTOP LAYOUT (computer web browser only) ================= */
// #(desktop-layout) 2026-10-16: on a computer (wide screen + mouse, and not
// the installed phone app) the app switches to a desktop layout — full
// width, a fixed menu down the left instead of the bottom tab bar, and wider
// grids. Everything is keyed off the "desk" class on <html>, so phones,
// tablets, iPhones and the Android/iOS apps keep exactly today's look.
function isNativeShell(){
  try{ return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }catch(e){ return false; }
}
const DESK_MQ = (()=>{ try{ return window.matchMedia('(min-width:1100px) and (hover:hover) and (pointer:fine)'); }catch(e){ return null; } })();
function isDeskMode(){ return !isNativeShell() && !!(DESK_MQ && DESK_MQ.matches); }
function applyDeskClass(){ try{ document.documentElement.classList.toggle('desk', isDeskMode()); }catch(e){} }
applyDeskClass();
try{
  if(DESK_MQ){
    const onChange = ()=>{ const was = document.documentElement.classList.contains('desk'); applyDeskClass(); if(was !== isDeskMode() && typeof render==='function' && ME) render(); };
    if(DESK_MQ.addEventListener) DESK_MQ.addEventListener('change', onChange); else if(DESK_MQ.addListener) DESK_MQ.addListener(onChange);
  }
}catch(e){}

// The left-hand menu. Global items for the person's role, plus a "This
// project" section whenever the page belongs to a project.
function deskSidebar(opts){
  if(!isDeskMode() || !ME) return '';
  const parts = (typeof parseRoute==='function') ? parseRoute() : [];
  const top = parts[0] || '';
  const inSite = top==='site' ? parts[1] : null;
  const siteId = opts.siteId || inSite;
  const subActive = inSite ? (parts[2] || 'home') : '';
  const hubN = (typeof homeExtras!=='undefined' && homeExtras && homeExtras.count) || 0;
  const dlvN = (typeof deliveryRequestsCount!=='undefined' && deliveryRequestsCount) || 0;
  let items;
  if(ME.role==='driver'){
    items = [
      {k:'driver', ic:'truck', lbl:'My schedule', go:'#/driver'},
      {k:'account', ic:'gear', lbl:'Settings', go:'#/account'},
    ];
  } else if(isManager(ME)){
    items = [
      ...(usesPmHome(ME) ? [{k:'home', ic:'home', lbl:'Home', go:'#/home'}] : []),
      {k:'sites', ic:'projects', lbl:'Projects', go:'#/sites'},
      {k:'onsite', ic:'users', lbl:'On site now', go:'#/onsite', show: usesPmHome(ME)},
      {k:'delivery', ic:'truck', lbl:'Deliveries', go:'#/delivery', pre:"deliveryScheduleBackHash='#/home';", badge:dlvN},
      {k:'calendar', ic:'calendar', lbl:'Calendar', go:'#/calendar'},
      {k:'hub', ic:'bell', lbl:'HUB', go:'#/hub', badge:hubN},
      {k:'sitemap', ic:'pin', lbl:'Sites map', go:'#/sitemap'},
      {k:'dashboard', ic:'chart', lbl:'Dashboard', go:'#/dashboard'},
      {k:'reports', ic:'reports', lbl:'Reports & surveys', go:'#/reports', show: usesPmHome(ME)},
      {k:'operatives', ic:'admin', lbl:'Operatives', go:'#/operatives'},
      {k:'hr', ic:'users', lbl:'HR', go:'#/hr'},
      {k:'team', ic:'gear', lbl:'Admin', go:'#/team'},
    ].filter(i=>i.show!==false);
  } else {
    items = [
      ...(typeof usesOpHome==='function' && usesOpHome(ME) ? [{k:'home', ic:'home', lbl:'Home', go:'#/home'}] : []),
      {k:'sites', ic:'projects', lbl:'My projects', go:'#/sites'},
      {k:'outstanding', ic:'list', lbl:'Outstanding', go:'#/outstanding', badge:hubN},
      ...(!isClient(ME) ? [{k:'my-messages', ic:'chat', lbl:'Inbox', go:'#/my-messages'}] : []),
      ...(!isClient(ME) ? [{k:'operative-dashboard', ic:'tools', lbl:'My Dashboard', go:'#/operative-dashboard'}] : []),
      {k:'account', ic:'gear', lbl:'Settings', go:'#/account'},
    ];
  }
  const activeTop = inSite ? 'sites' : (top || (usesPmHome(ME) ? 'home' : 'sites'));
  const row = (i, active)=>`<button type="button" class="desknav-i ${active?'on':''}" onclick="${i.pre||''}go('${i.go}')">${ophIcon(i.ic, 18)}<span>${escapeHtml(i.lbl)}</span>${i.badge?`<b class="desknav-badge">${i.badge}</b>`:''}</button>`;
  let siteHtml = '';
  if(siteId){
    const s = SITES.find(x=>x.id===siteId);
    const sitems = [
      {k:'home', ic:'home', lbl:'Project home', go:`#/site/${siteId}/home`},
      {k:'schedule', ic:'clipboard', lbl:'Schedule of Works', go:`#/site/${siteId}/schedule`},
      {k:'hs', ic:'shield', lbl:'Health & Safety', go:`#/site/${siteId}/hs`},
      {k:'checkin', ic:'pin', lbl:'Check In', go:`#/site/${siteId}/checkin`},
      {k:'messages', ic:'chat', lbl:'Inbox', go:`#/site/${siteId}/messages`, badge:(typeof currentUnreadMsgs!=='undefined' && currentUnreadMsgs)||0},
      isManager(ME) ? {k:'team', ic:'gear', lbl:'Project settings', go:`#/site/${siteId}/team`} : null,
    ].filter(Boolean);
    siteHtml = `<div class="desknav-sec">This project</div>
      <div class="desknav-site" title="${escapeHtml(s?s.name:'')}">${escapeHtml(s ? s.name : 'Project')}</div>
      ${sitems.map(i=>row(i, subActive===i.k)).join('')}`;
  }
  return `<aside class="desknav">
      <div class="desknav-brand" onclick="goHome()">
        <img src="${orgLogoUrl(ORG)}" alt="" onerror="this.onerror=null;this.src='${OPHUB_LOGO_INLINE}'">
        <div><div class="desknav-org">${escapeHtml((ORG && ORG.name) || 'OpHUB')}</div><div class="desknav-app">OpHUB</div></div>
      </div>
      ${isManager(ME) ? `<button type="button" class="desknav-add" onclick="openHomeAddProject()">${ophIcon('plus', 18, 2.4)}<span>New project</span></button>` : ''}
      <nav>${items.map(i=>row(i, activeTop===i.k)).join('')}</nav>
      ${siteHtml}
      <div class="desknav-foot">
        <div class="desknav-me">${escapeHtml(ME.name||'')}<span>${escapeHtml(personRoleLabel(ME))}</span></div>
        <button type="button" class="desknav-out" onclick="doSignOut()">Sign out</button>
      </div>
    </aside>`;
}

/* ---------------- Sites map (website only) ---------------- */
// #(sites-map) 2026-10-16: every site with a postcode dropped on a map. A
// small preview on the Home page (computer only); click it for the full
// map page (#/sitemap). Postcodes are turned into map positions with the
// free UK postcodes.io service and remembered in this browser.
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
let _leafletP = null;
function loadLeaflet(){
  if(window.L && window.L.map) return Promise.resolve(true);
  if(_leafletP) return _leafletP;
  _leafletP = new Promise(resolve=>{
    if(!document.querySelector('link[data-leaflet]')){
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = LEAFLET_CSS; l.setAttribute('data-leaflet','1'); document.head.appendChild(l);
    }
    const s = document.createElement('script'); s.src = LEAFLET_JS; s.async = true;
    s.onload = ()=>resolve(!!(window.L && window.L.map));
    s.onerror = ()=>{ _leafletP = null; s.remove(); resolve(false); };
    document.head.appendChild(s);
  });
  return _leafletP;
}
const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
function sitePostcodeFor(s){
  const m = UK_POSTCODE_RE.exec(String(s.postcode||'')) || UK_POSTCODE_RE.exec(String(s.address||''));
  return m ? (m[1]+' '+m[2]).toUpperCase() : null;
}
const GEO_KEY = 'ophub_pc_geo_v1';
function geoCacheRead(){ try{ return JSON.parse(localStorage.getItem(GEO_KEY)||'{}') || {}; }catch(e){ return {}; } }
function geoCacheWrite(c){ try{ localStorage.setItem(GEO_KEY, JSON.stringify(c)); }catch(e){} }
let _geoMem = null;
async function geocodePostcodes(list){
  const cache = _geoMem || (_geoMem = geoCacheRead());
  const want = Array.from(new Set(list.filter(Boolean))).filter(pc=>!(pc in cache));
  for(let i=0; i<want.length; i+=100){
    const chunk = want.slice(i, i+100);
    try{
      const r = await fetchWithTimeout('https://api.postcodes.io/postcodes', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({postcodes: chunk})}, 15000);
      if(!r.ok) break;
      const d = await r.json();
      (d.result||[]).forEach(x=>{
        const key = String(x.query||'').toUpperCase();
        cache[key] = (x.result && x.result.latitude!=null) ? [x.result.latitude, x.result.longitude] : 0;
      });
    }catch(e){ break; }
  }
  geoCacheWrite(cache);
  return cache;
}
const SITEMAP_COLOURS = {live:'#1E9E5A', upcoming:'#E08A00', closed:'#8A8D93'};
let siteMapShow = {live:true, upcoming:true, closed:false};
let siteMapFocus = null;
let _siteMaps = {};
async function siteMapPoints(){
  const sites = SITES.slice();
  const pcs = sites.map(sitePostcodeFor);
  const geo = await geocodePostcodes(pcs);
  const pts = [], missing = [];
  sites.forEach((s,i)=>{
    const pc = pcs[i]; const g = pc ? geo[pc] : null;
    const st = siteStatusKey(s);
    if(g) pts.push({s, pc, st, lat:g[0], lng:g[1]}); else missing.push({s, pc, st});
  });
  return {pts, missing};
}
function siteMapPopupHtml(p){
  return `<div class="smpop"><b>${escapeHtml(p.s.name)}</b>
    <div>${escapeHtml(fullSiteAddress(p.s) || p.pc || '')}</div>
    <div class="smpop-st" style="color:${SITEMAP_COLOURS[p.st]};">● ${escapeHtml(SITE_STATUS_LABEL[p.st]||p.st)}${p.s.job_number?` · Job ${escapeHtml(p.s.job_number)}`:''}</div>
    <button type="button" onclick="go('#/site/${p.s.id}/home')">Open project ›</button></div>`;
}
// #(sites-map-modern) 2026-10-17: modern, clean vector map (MapLibre +
// OpenFreeMap's "positron" style — free, no account or API key) with
// pin-style markers. Falls back to the plain OpenStreetMap map if the
// computer can't draw it (very old browser / no graphics acceleration).
const MAPLIBRE_JS = ['https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js', 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js'];
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const SITEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
let _mlP = null;
function loadMapLibre(){
  if(window.maplibregl && window.maplibregl.Map) return Promise.resolve(true);
  if(_mlP) return _mlP;
  _mlP = (async()=>{
    if(!document.querySelector('link[data-maplibre]')){ const l = document.createElement('link'); l.rel='stylesheet'; l.href=MAPLIBRE_CSS; l.setAttribute('data-maplibre','1'); document.head.appendChild(l); }
    for(const src of MAPLIBRE_JS){
      const ok = await new Promise(res=>{ const sc = document.createElement('script'); sc.src = src; sc.async = true; sc.onload = ()=>res(!!(window.maplibregl && window.maplibregl.Map)); sc.onerror = ()=>{ sc.remove(); res(false); }; document.head.appendChild(sc); });
      if(ok) return true;
    }
    _mlP = null; return false;
  })();
  return _mlP;
}
function webglOk(){ try{ const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }catch(e){ return false; } }
function siteMapPinEl(p, mini){
  const el = document.createElement('div');
  el.className = 'smpin'+(mini?' mini':'');
  el.style.setProperty('--c', SITEMAP_COLOURS[p.st]||'#555');
  el.title = p.s.name;
  el.innerHTML = '<span></span>';
  return el;
}
async function mountSiteMapGL(box, elId, mini, pts, missing){
  if(!webglOk() || !(await loadMapLibre())) return false;
  const shown = pts.filter(p=>mini ? p.st!=='closed' : siteMapShow[p.st]);
  let map;
  try{
    map = new maplibregl.Map({container: box, style: SITEMAP_STYLE, center:[-1.5, 52.6], zoom:5.3, attributionControl:{compact:true}, interactive: !mini, cooperativeGestures:false, dragRotate:false, pitchWithRotate:false});
  }catch(e){ return false; }
  _siteMaps[elId] = map;
  if(!mini) map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-right');
  const markers = {};
  shown.forEach(p=>{
    const mk = new maplibregl.Marker({element: siteMapPinEl(p, mini), anchor:'bottom'}).setLngLat([p.lng, p.lat]);
    if(!mini) mk.setPopup(new maplibregl.Popup({offset:28, closeButton:true, maxWidth:'280px'}).setHTML(siteMapPopupHtml(p)));
    mk.addTo(map); markers[p.s.id] = mk;
  });
  const fit = ()=>{
    if(!shown.length) return;
    if(shown.length===1){ map.jumpTo({center:[shown[0].lng, shown[0].lat], zoom:12}); return; }
    const b = new maplibregl.LngLatBounds(); shown.forEach(p=>b.extend([p.lng, p.lat]));
    map.fitBounds(b, {padding: mini?40:70, maxZoom:13, duration:0});
  };
  fit();
  map._ophubFocus = id=>{ const mk = markers[id]; if(!mk) return; map.flyTo({center: mk.getLngLat(), zoom:14, speed:1.6}); if(mk.getPopup() && !mk.getPopup().isOpen()) mk.togglePopup(); };
  // (the mini map's own onclick opens the full map — no second handler here)
  if(!mini && siteMapFocus && markers[siteMapFocus]) map.once('load', ()=>map._ophubFocus(siteMapFocus));
  setTimeout(()=>{ try{ map.resize(); fit(); }catch(e){} }, 80);
  return true;
}
// Draws a map into the element with this id. mini = the small Home preview
// (no dragging/zooming; clicking it opens the full map).
async function mountSiteMap(elId, mini){
  const el = document.getElementById(elId);
  if(!el) return;
  {
    const {pts, missing} = await siteMapPoints();
    const box = document.getElementById(elId);
    if(!box) return;
    if(_siteMaps[elId]){ try{ _siteMaps[elId].remove(); }catch(e){} delete _siteMaps[elId]; }
    box.innerHTML = '';
    if(await mountSiteMapGL(box, elId, mini, pts, missing)){
      const n = document.getElementById(elId+'Count');
      const shownN = pts.filter(p=>p.st!=='closed').length, missN = missing.filter(x=>x.st!=='closed').length;
      if(mini && n) n.textContent = shownN+' site'+(shownN===1?'':'s')+' on the map'+(missN ? ' · '+missN+' without a postcode' : '');
      if(!mini) siteMapRenderList(pts, missing);
      return;
    }
  }
  if(!(await loadLeaflet())){ el.innerHTML = '<div class="empty">Map could not load — check your connection.</div>'; return; }
  const {pts, missing} = await siteMapPoints();
  const box = document.getElementById(elId);
  if(!box) return; // page changed while loading
  if(_siteMaps[elId]){ try{ _siteMaps[elId].remove(); }catch(e){} }
  box.innerHTML = '';
  const map = L.map(box, {zoomControl:!mini, dragging:!mini, scrollWheelZoom:!mini, doubleClickZoom:!mini, boxZoom:!mini, keyboard:!mini, touchZoom:!mini, attributionControl:true});
  _siteMaps[elId] = map;
  // OpenStreetMap's own free map tiles — no account or API key needed.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
  }).addTo(map);
  const shown = pts.filter(p=>mini ? p.st!=='closed' : siteMapShow[p.st]);
  const markers = {};
  shown.forEach(p=>{
    const m = L.circleMarker([p.lat, p.lng], {radius: mini?7:9, color:'#fff', weight:2, fillColor:SITEMAP_COLOURS[p.st]||'#555', fillOpacity:1});
    if(!mini) m.bindPopup(siteMapPopupHtml(p)); else m.bindTooltip(escapeHtml(p.s.name));
    m.addTo(map); markers[p.s.id] = m;
  });
  map._ophubMarkers = markers;
  if(shown.length){ map.fitBounds(L.latLngBounds(shown.map(p=>[p.lat,p.lng])).pad(0.2), {maxZoom: 13}); }
  else map.setView([52.6, -1.5], 6);
  if(mini){
    // click handled by the mini card's own onclick
    const n = document.getElementById(elId+'Count');
    if(n) n.textContent = shown.length+' site'+(shown.length===1?'':'s')+' on the map'+(missing.filter(x=>x.st!=='closed').length ? ' · '+missing.filter(x=>x.st!=='closed').length+' without a postcode' : '');
  } else {
    siteMapRenderList(pts, missing);
    if(siteMapFocus && markers[siteMapFocus]){ const m = markers[siteMapFocus]; map.setView(m.getLatLng(), 14); m.openPopup(); }
  }
  setTimeout(()=>{ try{ map.invalidateSize(); }catch(e){} }, 60);
}
function siteMapRenderList(pts, missing){
  const box = document.getElementById('siteMapList');
  if(!box) return;
  const vis = pts.filter(p=>siteMapShow[p.st]).sort((a,b)=>a.s.name.localeCompare(b.s.name));
  const miss = missing.filter(p=>siteMapShow[p.st]);
  box.innerHTML = vis.map(p=>`<button type="button" class="smrow" onclick="siteMapFocusOn('${p.s.id}')"><i style="background:${SITEMAP_COLOURS[p.st]};"></i><span><b>${escapeHtml(p.s.name)}</b><small>${escapeHtml(p.pc)}</small></span></button>`).join('')
    + (miss.length ? `<div class="smmiss">No postcode found (${miss.length})</div>` + miss.map(p=>`<button type="button" class="smrow dim" onclick="go('#/site/${p.s.id}/home')"><i style="background:${SITEMAP_COLOURS[p.st]};"></i><span><b>${escapeHtml(p.s.name)}</b><small>Add a postcode to show it</small></span></button>`).join('') : '')
    || '<div class="empty">No sites to show.</div>';
}
window.siteMapFocusOn = function(siteId){
  const map = _siteMaps.siteMapFull; if(map && map._ophubFocus){ map._ophubFocus(siteId); return; }
  if(!map || !map._ophubMarkers) return;
  const m = map._ophubMarkers[siteId]; if(!m) return;
  map.setView(m.getLatLng(), 14); m.openPopup();
};
window.siteMapToggle = function(k){ siteMapShow[k] = !siteMapShow[k]; siteMapFocus = null; render(); };
function siteMapMiniCardHtml(){
  if(!isDeskMode() || !isManager(ME)) return '';
  return `<div class="smcard">
      <div class="smcard-h"><b>Sites map</b><span id="deskMapMiniCount" class="stub" style="margin:0;"></span><button type="button" onclick="go('#/sitemap')">Open full map ›</button></div>
      <div id="deskMapMini" class="smmini" onclick="go('#/sitemap')"><div class="empty">Loading map…</div></div>
    </div>`;
}
async function renderSiteMapPage(){
  const __gen = RENDER_GEN;
  if(__gen !== RENDER_GEN) return;
  const chip = (k, lbl)=>`<button type="button" class="smchip ${siteMapShow[k]?'on':''}" onclick="siteMapToggle('${k}')"><i style="background:${SITEMAP_COLOURS[k]};"></i>${lbl}</button>`;
  document.getElementById('app').innerHTML = shell(`
    <div class="smpage">
      <div class="smside">
        <div class="smchips">${chip('live','Live')}${chip('upcoming','Upcoming')}${chip('closed','Closed')}</div>
        <div id="siteMapList" class="smlist"><div class="empty">Loading…</div></div>
      </div>
      <div id="siteMapFull" class="smfull"><div class="empty">Loading map…</div></div>
    </div>
  `, {title:'Sites map', back: usesPmHome(ME) ? '#/home' : '#/sites', tabs:false});
  mountSiteMap('siteMapFull', false);
}
