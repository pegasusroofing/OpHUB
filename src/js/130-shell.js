/* ================= shell ================= */
let CURRENT_BACK_HASH = null; // kept in sync with each screen's header back-arrow target, so edge-swipe-to-go-back goes up one folder level (same as tapping '‹') instead of replaying raw browser history.
// The header's smaller subtitle line (site address, etc) copies its text
// instead of navigating home — only the bold title above it does that now.
window.copyHeaderSubtitle = async function(text){
  if(!text) return;
  try{ await navigator.clipboard.writeText(text); toast('Copied'); }
  catch(e){ toast('Could not copy — try again.'); }
};
function shell(innerHtml, opts){
  opts = opts||{};
  CURRENT_BACK_HASH = opts.back || null;
  return `
    <div class="appshell" style="display:flex;flex-direction:column;min-height:100vh;">
      <div class="stripe-edge"></div>
      ${OFFLINE_CACHE_USED ? `<div style="background:var(--warn-bg);color:var(--warn);padding:6px 14px;font-size:12px;font-weight:700;text-align:center;">📡 Offline — showing saved data from earlier</div>` : ''}
      <div class="appbar">
        ${opts.centerTitle ? `
          <div class="row" style="justify-content:center;text-align:center;">
            <h2 style="white-space:normal;overflow:visible;text-overflow:clip;line-height:1.25;max-width:92%;cursor:pointer;" onclick="go('#/sites')"><span style="color:var(--brand1);">Op</span><span style="color:var(--ink);">HUB</span>${ORG && ORG.name ? ` - <span style="color:var(--brand1);">${escapeHtml(ORG.name)}</span>` : ' - Welcome to your Operative Hub'}</h2>
          </div>
        ` : opts.centerHeader ? `
          <div class="row" style="flex-direction:row;align-items:center;justify-content:space-between;gap:12px;">
            <div style="flex:0 0 72px;display:flex;align-items:center;justify-content:center;">
              <img class="brandmark" src="${orgLogoUrl(ORG)}" alt="OpHUB" onerror="this.onerror=null;this.src='${OPHUB_LOGO_INLINE}'" style="width:72px;height:72px;flex:none;cursor:pointer;" onclick="go('#/sites')">
            </div>
            <div style="flex:1;text-align:center;cursor:pointer;" onclick="go('#/sites')">
              ${ORG && ORG.name ? `<div class="brandline lg" style="font-family:'Sora',-apple-system,sans-serif;font-weight:700;text-transform:none;color:var(--brand1);">${escapeHtml(ORG.name)}</div>
              <div style="width:28px;height:2.5px;background:var(--line);margin:3px auto;"></div>` : ''}
              <div class="brandline orgname" style="font-family:'Sora',Calibri,sans-serif;font-weight:800;text-transform:none;color:var(--ink);">OpHUB</div>
              ${opts.title ? `<h2 class="lg" style="font-family:'Sora',-apple-system,sans-serif;font-weight:800;">${escapeHtml(opts.title)}</h2>` : ''}
            </div>
            <div style="flex:0 0 72px;display:flex;align-items:center;justify-content:center;">
              ${ME && opts.showRefresh ? `
                <span onclick="refreshAppData()" title="Refresh — pull latest from Admin Centre" class="homebtn" style="${refreshingAppData?'opacity:.5;':''}">${refreshingAppData?'…':'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>'}</span>
              ` : ''}
            </div>
          </div>
        ` : `
        <div class="row" style="align-items:center;">
          ${opts.back ? `<span class="backarrow" onclick="go('${opts.back}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 5 8 12 15 19"></polyline></svg></span>` : `<img class="brandmark" src="${orgLogoUrl(ORG)}" alt="OpHUB" onerror="this.onerror=null;this.src='${OPHUB_LOGO_INLINE}'" style="cursor:pointer;" onclick="go('#/sites')">`}
          <div style="flex:1;min-width:0;min-height:59.4px;display:flex;flex-direction:column;justify-content:center;text-align:center;padding-top:4px;">
            ${!opts.back ? `<div class="brandline" style="cursor:pointer;" onclick="go('#/sites')">OpHUB${ORG && ORG.name ? ` <span style="color:var(--brand1);">- ${escapeHtml(ORG.name)}</span>` : ''}</div>` : ''}
            <h2 style="cursor:pointer;${opts.titleTwoLine ? 'white-space:normal;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.2;' : ''}" onclick="go('#/sites')">${escapeHtml(opts.title||'')}</h2>
            ${opts.subtitle ? `<div class="meta" style="cursor:pointer;" onclick="event.stopPropagation();copyHeaderSubtitle('${jsAttr(opts.subtitle)}')" title="Tap to copy">${escapeHtml(opts.subtitle)}</div>` : ''}
          </div>
          <div style="flex:0 0 auto;min-width:72px;display:flex;align-items:center;justify-content:flex-end;">
            ${ME && opts.showRoleChip ? `<span class="plaintag" style="margin-left:auto;">${personRoleLabel(ME)}</span>` : (ME && opts.siteId && opts.activeTab!=='home' ? `<span class="homebtn" title="Site home" onclick="go('#/site/${opts.siteId}/home')">🏠</span>` : '')}
          </div>
        </div>
        `}
      </div>
      <div class="scrollarea"${opts.tightBottom ? ' style="padding-bottom:24px;"' : ''}>${innerHtml}</div>
      ${opts.homeBar ? homeBottomBar(opts.homeBarCanAdd, opts.homeBarOutstanding) : (opts.tabs===false ? '' : tabbar(opts.siteId, opts.activeTab))}
    </div>
  `;
}
let currentUnreadMsgs = 0;
let unreadMsgsCache = {}; // { [siteId]: {count, at} } - background-refreshed, non-blocking (see refreshUnreadBadge)
const UNREAD_MSGS_TTL_MS = 20000;
function tabbar(siteId, active){
  if(!siteId) return '';
  // Already on this site's own Home tab? Tapping "Home" again then takes you
  // out to the overall Your Projects home instead of doing nothing — from
  // any other tab/subfolder it still takes you to this site's home page.
  const tabs = [
    {k:'home', ic:'🏠', lbl:'Home', href: active==='home' ? '#/sites' : `#/site/${siteId}/home`},
    {k:'schedule', ic:'📋', lbl:'SOW', href:`#/site/${siteId}/schedule`},
    {k:'checkin', ic:'📍', lbl:'Check In', href:`#/site/${siteId}/checkin`, emph:true},
    {k:'messages', ic:'💬', lbl:'Inbox', href:`#/site/${siteId}/messages`, badge:currentUnreadMsgs},
    // "More" is now a direct jump to Settings & Admin (managers/admins) or
    // personal Account settings (operatives — Settings & Admin is gated to
    // managers/admins anyway) instead of opening a separate pop-out/page of
    // links first.
    {k:'more', ic:'⚙️', lbl:'Settings', href: isManager(ME) ? `#/site/${siteId}/team` : '#/account'},
  ];
  return `<div class="tabbar">${tabs.map(t=>`
    <div class="tb ${t.emph?'tb-emph':''} ${active===t.k?'active':''}" onclick="go('${t.href}')" style="position:relative;">
      <span class="tabicon">${t.ic}</span>${t.lbl}
      ${t.badge?`<span class="badge-count" style="position:absolute;top:2px;right:calc(50% - 22px);">${t.badge}</span>`:''}
    </div>`).join('')}</div>`;
}
// Home screen ("Your Projects") bottom bar — same visual design as the
// per-site tabbar (.tabbar/.tb/.tb-emph), but with its own 3 items:
// Outstanding Tasks (left), Add Project (middle, emphasized — replaces the
// old inline "Add a Project" card), Settings (right — replaces the old
// inline "Admin Centre" button). Sticky to the bottom of the page.
// Aggregate count, for the current user, of RAMS/COSHH/TBT items awaiting
// their signature across every live/upcoming site they're on — feeds the
// notification-style badge on the Outstanding tile in the home bar.
// #(outstanding-badge-fix): the home-bar "Outstanding" badge used to run its
// own separate, simpler query instead of reusing computeOutstandingRows()
// below — which meant it never got the #327 fix that stops COSHH being
// counted against a PM/admin personally (PMs/admins can't sign COSHH at all
// since #237, so the old per-user signature check could never clear and the
// badge sat stuck non-zero forever for every PM/admin). It also didn't
// surface Schedule/Snags/Materials items a manager's Outstanding page does.
// Now it just calls the exact same data function the Outstanding page uses,
// for "me" specifically, so the badge count and the page contents can never
// drift apart again.
let homeExtras = {uid:null, onboarding:null, count:0, at:0, loading:false};
function isSitesRoute(){ const p = parseRoute(); return !p.length || p[0]==='sites'; }
function refreshHomeExtras(){
  if(!ME || !SESSION || navigator.onLine === false) return;
  if(homeExtras.uid !== ME.id) homeExtras = {uid: ME.id, onboarding: null, count: 0, at: 0, loading: false};
  if(homeExtras.loading || (Date.now() - homeExtras.at) < 20000) return;
  homeExtras.loading = true;
  const uid = ME.id;
  Promise.all([computeOnboardingChecklist(), computeMyOutstandingCount()]).then(([onboarding, count])=>{
    if(!ME || ME.id !== uid) return;
    const changed = JSON.stringify(onboarding||null) !== JSON.stringify(homeExtras.onboarding||null) || count !== homeExtras.count;
    homeExtras = {uid, onboarding: onboarding||null, count: count||0, at: Date.now(), loading: false};
    saveBootSnapshot();
    if(changed && isSitesRoute() && !scheduleControlBusy()) render();
  }).catch(e=>{ console.error('refreshHomeExtras failed', e); homeExtras.loading = false; });
}
async function computeMyOutstandingCount(){
  // Managers now see the Notifications feed (computeNotificationRows) on
  // this tile instead of the old generic Outstanding list — the badge must
  // count from the same function the page itself renders from, or the
  // number on the tile and what's actually on the page drift apart again
  // (exactly the bug #(outstanding-badge-fix) below existed to prevent).
  if(isManager(ME)){
    // The home-bar badge for managers now reflects the combined HUB feed
    // (Notifications + Messages merged — see computeHubItems/renderHub)
    // instead of the old Notifications-only count. Forced to '' (self)
    // regardless of hubFilterPmId so the badge is always YOUR OWN count,
    // never whatever another PM/"All PMs" view you last left HUB on.
    const {items} = await computeHubItems('');
    return items.length;
  }
  const {rows} = await computeOutstandingRows(ME.id);
  return rows.reduce((sum,r)=>sum+r.items.length, 0);
}
function homeBottomBar(canAdd, outstandingCount){
  const items = [
    {ic:'📝', lbl: canAdd ? 'HUB' : 'Outstanding', onclick: canAdd ? "go('#/hub')" : "go('#/outstanding')", badge: outstandingCount||0},
    // Inbox is the operative team's messages feed — a client shouldn't see
    // it at all (they're not part of that audience), so it's excluded here
    // even though clients otherwise fall into the same !canAdd bucket as
    // operatives. The route itself is gated the same way below.
    ...(!canAdd && !isClient(ME) ? [{ic:'💬', lbl:'Inbox', onclick:"go('#/my-messages')"}] : []),
    ...(!canAdd ? [{ic:'🧰', lbl:'My Dashboard', onclick:"go('#/operative-dashboard')"}] : []),
    // Company Dashboard now lives in Settings; this slot is the Delivery Schedule.
    ...(canAdd ? [{ic:'🚚', lbl:'Deliveries', onclick:"deliveryScheduleBackHash='#/sites';go('#/delivery')"}] : []),
    // Styled in the company's theme colour (brand1) rather than the plain
    // paper/border look the other tabs use, so it reads as the primary
    // action in the row.
    ...(canAdd ? [{ic:'+', lbl:'Add', emph:true, branded:true, onclick:"openHomeAddProject()"}] : []),
    ...(canAdd ? [{ic:'📅', lbl:'Calendar', onclick:"go('#/calendar')"}] : []),
    // Managers land straight in the Admin Centre — no intermediate page.
    // Operatives (no Admin Centre) go to the lighter Account page instead.
    {ic:'⚙️', lbl: canAdd ? 'Admin' : 'Settings', onclick: canAdd ? "go('#/team')" : "go('#/account')"},
  ];
  return `<div class="tabbar">${items.map(t=>`
    <div class="tb ${t.emph?'tb-emph':''}" style="position:relative;${t.branded?'background:var(--brand1);border-color:var(--brand1);color:var(--brand1-text);':''}" onclick="${t.onclick}">
      <span class="tabicon">${t.ic}</span>${t.lbl}
      ${t.badge?`<span class="badge-count" style="position:absolute;top:2px;right:calc(50% - 22px);">${t.badge}</span>`:''}
    </div>`).join('')}</div>`;
}
// Jumps straight into Admin Centre with Invites & Users → Invites already
// expanded, instead of landing on the Admin Centre root and making the PM/
// admin find and open it themselves.
window.openInvitesFromHome = function(){
  go('#/team/people/invites');
};
window.openHomeAddProject = function(){
  addSiteFormOpen = true;
  render();
  requestAnimationFrame(()=>appScrollTo(0));
};
// #(app-shell) Normal pages are a fixed-height column: header, the scrolling
// .scrollarea, then the bottom bar. The page itself never scrolls (see the
// .appshell CSS), so the bar stays locked to the bottom on phones instead of
// drifting with the browser's toolbar / bounce. These helpers read and set the
// scroll position of whichever element is actually scrolling.
function appScroller(){
  const s = document.querySelector('.appshell > .scrollarea');
  if(s && getComputedStyle(document.documentElement).overflowY === 'hidden') return s;
  return null;
}
function appScrollY(){ const s = appScroller(); return s ? s.scrollTop : (window.scrollY || 0); }
function appScrollTo(y, smooth){
  const s = appScroller();
  try{
    if(s) s.scrollTo({top:y||0, behavior: smooth ? 'smooth' : 'auto'});
    else window.scrollTo({top:y||0, behavior: smooth ? 'smooth' : 'auto'});
  }catch(e){ if(s) s.scrollTop = y||0; else window.scrollTo(0, y||0); }
}
function appScrollBy(dy){ const s = appScroller(); if(s) s.scrollTop += dy; else window.scrollBy(0, dy); }
window.appScrollTo = appScrollTo;
// #(tabbar-snap-back) Phones (iOS especially) can leave the fixed bottom bar
// floating out of place after the keyboard closes, a pop-up closes, or the
// browser bars show/hide while a long page (e.g. Schedule of Works with lots
// of photos) is still loading images. Whenever the visible area changes we
// hide the bar while the keyboard is up, and nudge it back into place after.
(function(){
  let t = null;
  function snap(){
    clearTimeout(t);
    t = setTimeout(()=>{
      const bars = document.querySelectorAll('.tabbar');
      const vv = window.visualViewport;
      // Only treat it as "keyboard up" while something you type into has focus.
      // (Pinch-zoom also shrinks the visual viewport - vv.scale accounts for
      // that - and without the focus check the bar could stay hidden on Home.)
      const ae = document.activeElement;
      const typing = !!(ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) && !/^(checkbox|radio|button|submit|range|file|color)$/i.test(ae.type||''));
      const keyboardUp = !!(typing && vv && vv.height * (vv.scale || 1) < window.innerHeight * 0.72);
      bars.forEach(b=>{
        b.style.visibility = keyboardUp ? 'hidden' : '';
        if(!keyboardUp){ b.style.transform = 'translateZ(0) translateY(0.01px)'; void b.offsetHeight; b.style.transform = ''; }
      });
    }, 120);
  }
  if(window.visualViewport){ window.visualViewport.addEventListener('resize', snap); window.visualViewport.addEventListener('scroll', snap); }
  window.addEventListener('resize', snap);
  window.addEventListener('orientationchange', snap);
  document.addEventListener('focusout', snap, true);
  document.addEventListener('focusin', snap, true);
  window.addEventListener('hashchange', snap);
  window.ophubTabbarSnap = snap;
  document.addEventListener('load', e=>{ if(e.target && e.target.tagName==='IMG') snap(); }, true);
})();
