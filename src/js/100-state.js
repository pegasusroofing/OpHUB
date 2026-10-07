/* ================= state ================= */
let ME = null;
let ORG = null; // {id,name,logo_path,color_primary,color_secondary}
let SITES = [];
let PROFILES = {}; // id -> {name,email,role}

const OPHUB_LOGO = 'assets/ophub-logo.png?v=2';
const DEFAULT_BRAND1 = '#4E8FD1';
// The real public web address invite links must always point at — NOT
// location.origin, which inside the native app is the WebView's internal
// capacitor://localhost scheme and produces a link nobody outside the app
// can open. send-invite-email (server-side) already builds its link this
// same way; this constant just brings the client-side Copy Link buttons in
// line with it.
const OPHUB_WEB_URL = 'https://operativehub.co.uk/app.html';
// Feature flag: the Price Sheet rewrite (Excel-driven rate card library,
// Price/Price Sheet tile split, compact builder redesign) is still in
// progress and not signed off yet. While this is false, Price behaves
// exactly like the single, already-live Pricing Elements page (no landing
// split, no Price Sheet entry points reachable), and the Admin Centre
// "Price Sheet Rate Card" section stays hidden. Flip to true once
// that work is finished and ready to ship — all the code for it stays in
// place either way, just unreachable until then.
const PRICE_BUILDER_LIVE = true;
const DEFAULT_BRAND2 = '#101114';
// Inline SVG, can never 404 — the last-resort fallback so a missing/slow
// asset never causes an onerror retry loop (which shows as a "flashing" broken image).
const OPHUB_LOGO_INLINE = 'data:image/png;base64,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';
// Small neutral "photo unavailable" placeholder (light grey square with a
// simple picture glyph) swapped in via onerror when a job/incident/snag/
// tool photo fails to load (deleted from storage, network blip, stale
// path) — previously these just showed the browser's bare broken-image icon.
const PHOTO_PLACEHOLDER_INLINE = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120"><rect width="160" height="120" fill="#E9EAEE"/><path d="M40 82 L64 54 L82 74 L98 58 L120 82 Z" fill="#C7CAD3"/><circle cx="58" cy="42" r="9" fill="#C7CAD3"/><text x="80" y="104" font-family="Arial,sans-serif" font-size="11" fill="#8A8D97" text-anchor="middle">Photo unavailable</text></svg>');

async function loadOrg(){
  if(!ME || !ME.org_id){ ORG = null; applyTheme(null); return; }
  const r = await dbSelectChecked('organizations', 'id=eq.'+ME.org_id+'&select=*');
  if(r.ok) ORG = r.data[0] || null;
  else if(!(ORG && ORG.id===ME.org_id)){
    const cached = await getCachedRows('organizations', 'id=eq.'+ME.org_id+'&select=*');
    ORG = (cached && cached.data && cached.data[0]) || null;
  } // else: request failed but we already hold this company's details — keep them
  applyTheme(ORG);
}
function readableTextColor(hex){
  // Picks black or white text depending on how light the given colour is,
  // so a company that sets a near-white primary colour still gets legible
  // header text instead of white-on-white.
  if(!hex) return '#fff';
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if(!m) return '#fff';
  const r = parseInt(m[1],16), g = parseInt(m[2],16), b = parseInt(m[3],16);
  const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
  return luminance > 0.72 ? '#101114' : '#fff';
}
// Like readableTextColor, but for coloured text sitting ON a light/white
// card or chip background (a brand1-outlined tab/chip with brand2 text)
// rather than a solid brand1 fill behind it — a pale brand2 would be
// unreadable there, so this falls back to near-black instead of forcing
// white the way readableTextColor does for a dark background.
function onLightTextColor(hex, fallback){
  if(!hex) return fallback;
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if(!m) return fallback;
  const r = parseInt(m[1],16), g = parseInt(m[2],16), b = parseInt(m[3],16);
  const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
  return luminance > 0.65 ? fallback : hex;
}
function applyTheme(org){
  const root = document.documentElement.style;
  const brand1 = (org && org.color_primary) || DEFAULT_BRAND1;
  const brand2 = (org && org.color_secondary) || DEFAULT_BRAND2;
  root.setProperty('--brand1', brand1);
  root.setProperty('--brand2', brand2);
  // --brand1-text is only used for solid-brand1-background buttons/badges
  // now (the header banner opacity/text-colour controls this used to also
  // feed were removed once the app bar went flat/white) — always the
  // auto black-or-white pick based on how light the primary colour is.
  root.setProperty('--brand1-text', readableTextColor(brand1));
  root.setProperty('--brand2-onlight', onLightTextColor(brand2, '#101114'));
}
// Feature gating by company package. 'starter' (OpHUB Basic) doesn't include
// GPS check-in & geofencing — everything else (growth/enterprise) does.
// Superadmin has no ORG at all, so treat that as unrestricted.
function orgAllowsGps(){ return !ORG || ORG.plan_tier !== 'starter'; }
const PLAN_LABEL = { starter:'OpHUB Basic', growth:'OpHUB Pro', enterprise:'OpHUB Enterprise' };
const REPORT_FIELD_TYPES = [
  {k:'text', lbl:'Short Text'},
  {k:'textarea', lbl:'Notes Box (long text)'},
  {k:'number', lbl:'Number'},
  {k:'passfail', lbl:'Yes / No / N-A'},
  {k:'choice', lbl:'Multiple Choice (pick one)'},
  {k:'multichoice', lbl:'Multiple Choice (tick many)'},
  {k:'checkbox', lbl:'Yes / No'},
  {k:'photo', lbl:'Photo(s)'},
  {k:'operatives', lbl:'Operatives On Site'},
  {k:'date', lbl:'Date'},
  {k:'signature', lbl:'Signature'},
  {k:'instruction', lbl:'Instruction Text (no answer)'},
];
// Pass-fail questions are stored internally as Pass/Fail/N-A (this is also
// the scoring key), but displayed as Yes/No/N-A to match how these
// questions are actually phrased and shown on RTB's SafetyCulture forms.
const PASSFAIL_LABEL = {Pass:'Yes', Fail:'No', 'N/A':'N/A'};
// A pass-fail question normally reads Yes / No / N/A; one set up as
// "Pass / Fail / N-A" (pfWords) keeps the words Pass and Fail instead.
function pfLbl(it, v){ return (it && it.pfWords) ? v : (PASSFAIL_LABEL[v]||v); }
// Auto-fill: lets a template question pull its answer in automatically when
// a PM opens the form, instead of them typing it every time. Only offered on
// the field types it makes sense for (text -> address/name, date -> today).
const AUTOFILL_OPTIONS = [
  {k:'', lbl:'None', types:['text','date']},
  {k:'site_address', lbl:'Site Address (from the site)', types:['text']},
  {k:'today_date', lbl:"Today's Date", types:['date']},
  {k:'inspector_name', lbl:'Inspector / Filler Name', types:['text']},
];
function autofillValue(kind, site){
  if(kind==='site_address') return fullSiteAddress(site) || '';
  if(kind==='today_date') return todayISODate();
  if(kind==='inspector_name') return ME.name || '';
  return undefined;
}
// Conditional logic: a question with showIf={qId, mode, values} only counts
// as "on the form" when the referenced earlier question's current answer
// satisfies the condition. Two modes:
//  - 'notblank' — trigger question just needs *any* answer at all (works for
//    every question type, including free text/number/photo — e.g. "if they
//    wrote anything in the notes field, ask a follow-up").
//  - 'equals' (default, for backwards compatibility with templates saved
//    before 'notblank' existed) — trigger question's answer must be one of
//    the listed values; mirrors SafetyCulture's "If answer is X then ask
//    questions" branching. Only offered for fixed-option question types
//    (Pass/Fail/N-A, choice, Yes/No). Checkbox answers are booleans in state
//    but compared as 'Yes'/'No' here since that's how their options are
//    offered.
// "Show unanswered questions" (template setting, kept on the first section
// so it travels with every report started from the template). Off = the
// finished report and PDF leave out questions nobody answered.
// ---- Traffic light system (template setting) ---------------------------
// A template can switch on a colour-coded condition rating. The key (which
// colour means what) is kept on the first section so it travels with every
// report started from the template; each question can opt out. The chosen
// colour for a question is saved beside its answer as <question id>__tl.
const TRAFFIC_COLOURS = [
  {k:'red', lbl:'Red', hex:'#D32F2F'}, {k:'orange', lbl:'Orange', hex:'#EF7D00'}, {k:'yellow', lbl:'Yellow', hex:'#E0B400'},
  {k:'purple', lbl:'Purple', hex:'#7B3FB5'}, {k:'blue', lbl:'Blue', hex:'#2F6FD9'}, {k:'green', lbl:'Green', hex:'#1F9D52'}, {k:'grey', lbl:'Grey', hex:'#76767A'},
];
function trafficHex(k){ const c = TRAFFIC_COLOURS.find(c=>c.k===k); return c ? c.hex : '#76767A'; }
function trafficDefaultLevels(){ return [
  {id:'tl_green', color:'green', label:'OK'},
  {id:'tl_yellow', color:'yellow', label:'Repair'},
  {id:'tl_orange', color:'orange', label:'Replacement should be planned'},
  {id:'tl_red', color:'red', label:'Immediate replacement'},
]; }
function trafficLevels(sections){
  const t = sections && sections[0] && sections[0].traffic;
  return (t && t.on && Array.isArray(t.levels) && t.levels.length) ? t.levels : null;
}
function itemHasTraffic(sections, it){
  if(!it || it.traffic===false) return false;
  if(['instruction','photo','signature','operatives'].includes(it.type)) return false;
  return !!trafficLevels(sections);
}
function itemTrafficLevel(sections, it, answers){
  if(!itemHasTraffic(sections, it)) return null;
  const id = answers && answers[it.id+'__tl'];
  return id ? (trafficLevels(sections).find(l=>l.id===id) || null) : null;
}
function trafficKeyHtml(sections){
  const lv = trafficLevels(sections); if(!lv) return '';
  return `<div class="card" style="margin-bottom:12px;"><p class="sectiontitle" style="margin-top:0;">Condition key</p>${lv.map(l=>`<div style="display:flex;align-items:center;gap:8px;margin:5px 0;"><span style="width:16px;height:16px;border-radius:50%;flex:0 0 16px;background:${trafficHex(l.color)};"></span><span style="font-size:13px;">${escapeHtml(l.label||'')}</span></div>`).join('')}</div>`;
}
function reportListsSection(sections, sec, answers){
  if(templateShowsUnanswered(sections)) return true;
  return (sec.items||[]).some(it=>it.type!=='instruction' && itemVisible(it, answers) && reportListsItem(sections, it, answers));
}
// The tick box is read from the template as it is NOW, so unticking it also
// tidies reports that were started before the change.
async function applyLiveShowUnanswered(sub){
  try{
    if(!sub || !sub.template_id || !sub.sections || !sub.sections[0]) return;
    const rows = await dbSelectNet('report_templates', 'id=eq.'+sub.template_id+'&select=sections&limit=1');
    const live = rows[0] && rows[0].sections && rows[0].sections[0];
    if(!live) return;
    if(live.showUnanswered===false) sub.sections[0].showUnanswered = false; else delete sub.sections[0].showUnanswered;
  }catch(e){}
}
function templateShowsUnanswered(sections){ return !(sections && sections[0] && sections[0].showUnanswered===false); }
function reportListsItem(sections, it, answers){
  if(templateShowsUnanswered(sections)) return true;
  if(it.type==='instruction') return true;
  const a = answers || {};
  return isAnswered(a[it.id]) || isAnswered(a[it.id+'__note']) || isAnswered(a[it.id+'__media']) || isAnswered(a[it.id+'__tl']);
}
function isAnswered(val){
  if(val===undefined || val===null) return false;
  if(typeof val==='string') return val.trim()!=='';
  if(Array.isArray(val)) return val.length>0;
  return true; // booleans (checkbox once tapped) and numbers always count as answered
}
function itemVisible(it, answers){
  if(!it.showIf || !it.showIf.qId) return true;
  const raw = answers ? answers[it.showIf.qId] : undefined;
  if(it.showIf.mode==='notblank') return isAnswered(raw);
  if(Array.isArray(raw)) return raw.some(v=>(it.showIf.values||[]).includes(v));
  const val = typeof raw === 'boolean' ? (raw ? 'Yes' : 'No') : raw;
  return (it.showIf.values||[]).includes(val);
}
// Mirrors SafetyCulture-style scoring: a "Count towards score" question adds
// to a running earned/possible tally. Pass-fail: Pass=1pt, Fail=0pt, N/A is
// excluded from the denominator entirely. Checkbox: Yes=1pt, No=0pt (always
// counted, since a checkbox has no true "not applicable" state). Unanswered
// scored questions count as 0 earned but still add to the denominator, same
// as SafetyCulture showing a red bar and reducing the section's score.
// Questions hidden by conditional logic (their trigger condition isn't met)
// are skipped entirely — they were never asked, so they shouldn't count.
function scoreSections(sections, answers){
  const bySection = {};
  let overallEarned = 0, overallPossible = 0;
  (sections||[]).forEach(s=>{
    let earned = 0, possible = 0;
    (s.items||[]).forEach(it=>{
      if(!it.scored) return;
      if(!itemVisible(it, answers)) return;
      const val = answers ? answers[it.id] : undefined;
      if(it.type==='passfail'){
        if(val==='N/A') return; // excluded entirely
        possible += 1;
        if(val==='Pass') earned += 1;
      } else if(it.type==='checkbox'){
        possible += 1;
        if(val) earned += 1;
      }
    });
    if(possible>0){ bySection[s.id] = {earned, possible}; overallEarned += earned; overallPossible += possible; }
  });
  return {overall:{earned:overallEarned, possible:overallPossible}, bySection};
}
function scoreLabel(sc){
  if(!sc || sc.possible===0) return '';
  const pct = Math.round((sc.earned/sc.possible)*100);
  return `${sc.earned} / ${sc.possible} (${pct}%)`;
}
// Optional photo attachment on any answer (not just dedicated Photo
// questions) — every question offers this by default now, except ones that
// wouldn't make sense (photo/signature/instruction questions, and fields
// that auto-fill themselves like site address/date/inspector name). An
// admin can still switch it off per-question in the template builder.
function itemAllowsMedia(it){
  if(!it) return false;
  if(it.type==='photo' || it.type==='signature' || it.type==='instruction' || it.type==='operatives') return false;
  if(it.autofill) return false;
  if(it.allowMedia===false) return false;
  return true;
}
// The set of discrete values a question's own answer can take, used to build
// the "require the photo when the answer is…" picker. null means the answer
// is free-form (text/number/date), so there's nothing to branch on there.
function itemOwnValueOptions(it){
  if(it.type==='passfail') return ['Pass','Fail','N/A'];
  if(it.type==='checkbox') return [true,false];
  if(it.type==='choice' || it.type==='multichoice') return it.options||[];
  return null;
}
// Whether the attached photo is mandatory given the question's CURRENT
// answer — mediaRequiredWhen is a list of trigger values, or ['__always__']
// for free-form questions where "require it whenever answered" is the only
// option. A multichoice answer (an array) counts as a match if ANY ticked
// option is in the trigger list.
function mediaRequiredFor(it, answers){
  if(!itemAllowsMedia(it) || !it.mediaRequiredWhen || !it.mediaRequiredWhen.length) return false;
  if(it.mediaRequiredWhen.includes('__always__')) return true;
  const val = answers ? answers[it.id] : undefined;
  if(Array.isArray(val)) return val.some(v=>it.mediaRequiredWhen.includes(v));
  return it.mediaRequiredWhen.includes(val);
}
function orgLogoUrl(org){
  return org && org.logo_path ? publicUrl('org-logos', org.logo_path) : OPHUB_LOGO;
}
// 'admin' is a superset of 'pm' capabilities everywhere in this app, and
// 'site_manager' is a day-to-day-operational subset of 'pm' — mirrors the
// DB's is_pm() (pm/admin/site_manager: uploads, sign-offs, schedule,
// subcontractor management, etc.). A handful of things stay stricter than
// isManager() on purpose (true PM/admin only, excluding site_manager) —
// see isFullManager(): seeing every site without being assigned, creating/
// editing/deleting a site, becoming a site's Responsible PM, and managing
// other people's roles/accounts. Those are enforced server-side (RLS) so
// this client-side split is a UI convenience, not the actual boundary.
function isManager(u){ return !!u && (u.role==='pm' || u.role==='admin' || u.role==='site_manager'); }
function isSiteManager(u){ return !!u && u.role==='site_manager'; }
// The stricter "true PM or admin" check — used wherever a Site Manager
// should NOT get the same rights as a Project Manager (site creation/
// deletion, becoming a Responsible PM, managing other users' roles). Mirrors
// the DB's is_pm_or_admin().
function isFullManager(u){ return !!u && (u.role==='pm' || u.role==='admin'); }
// Client login — assigned to a site the same way an operative is
// (site_assignments), but strictly view-only: RAMS, COSHH, Toolbox Talks,
// Schedule of Works, PUWER (completed inspections), Snagging and the
// Operative Dashboard roster. Everything else (messages, materials, price,
// drawings, todos, check-in, etc.) is off-limits — enforced both by the
// route guard (see the router's 'site' branch) and server-side by RLS
// (has_client_view_access — see migration add_client_role_rls).
function isClient(u){ return !!u && u.role==='client'; }
const CLIENT_ALLOWED_SITE_PAGES = ['home','schedule','hs','snagging'];
// Subcontractor operatives — a normal operative account, allocated by a PM
// (see the Operatives sub-tile under a Subcontractors company) to exactly
// one subcontractor company per site. Cached per site for the session since
// it rarely changes mid-visit; cleared implicitly on reload.
let subOpCache = {};
async function getMySubcontractorCompanyId(siteId){
  if(isManager(ME) || isClient(ME)) return null;
  if(Object.prototype.hasOwnProperty.call(subOpCache, siteId)) return subOpCache[siteId];
  const rows = await dbSelect('subcontractor_operatives', 'site_id=eq.'+siteId+'&user_id=eq.'+ME.id+'&select=subcontractor_company_id&limit=1');
  const val = rows.length ? rows[0].subcontractor_company_id : null;
  subOpCache[siteId] = val;
  return val;
}
// Price Sheet: full create/edit/delete access for PMs and Admin (the same
// "Full Manager" group used elsewhere for higher-trust pricing actions).
// Site Managers still only see already-ISSUED sheets on their site (handled
// separately in renderPriceHome/renderPriceBuilderSheets), same as before.
function canUsePriceBuilder(){ return isFullManager(ME); }
// Admins/PMs see this folder as "Snagging & Reports" (it's where inspections
// now live too); operatives still see the original "Snagging / Variations"
// name since Reports isn't visible to them anyway.
function snaggingFolderLabel(){ return isManager(ME) ? 'Inspections & Reports' : 'Snagging & Variations'; }
function materialsTileLabel(){ return 'Materials'; }
function todayISODate(){ const d = new Date(); const p = n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
// Estimator = a Project Manager (identical access everywhere) flagged to
// receive no notifications: no push to their phone, no automatic emails.
// The role itself stays 'pm' so every permission check keeps working.
function isEstimator(p){ return !!p && p.role==='pm' && !!p.is_estimator; }
function personRoleLabel(p){ return isEstimator(p) ? 'Estimator' : roleLabel(p && p.role); }
function roleLabel(role){
  if(role==='estimator') return 'Estimator';
  return role==='admin' ? 'Company Admin' : role==='pm' ? 'Project Manager' : role==='site_manager' ? 'Site Manager' : role==='superadmin' ? 'Super Admin' : role==='client' ? 'Client' : role==='driver' ? 'Delivery Driver' : 'Operative';
}
// Admin Centre > Users role-change control: what roles a given viewer (ME)
// is allowed to move a given person into, and whether they may remove them.
// Mirrors the exact permission rules that used to be spread across separate
// "Make X" buttons per role group — kept here in one place so the dropdown
// in each group renders consistently and stays in sync with those rules.
function roleActionsFor(ME, p, allPeople){
  const iAmAdmin = ME.role==='admin';
  const iAmFullManager = isFullManager(ME);
  const isSelf = p.id===ME.id;
  const adminCount = allPeople.filter(x=>x.role==='admin').length;
  let options = null, canRemove = false;
  if(isSelf) return {options:null, canRemove:false};
  if(p.role==='admin'){
    if(!iAmAdmin) return {options:null, canRemove:false};
    options = [{value:'admin', label:'Company Admin'}];
    if(adminCount>1) options.push({value:'pm', label:'Project Manager'}, {value:'operative', label:'Operative'});
    canRemove = true;
  } else if(p.role==='pm'){
    if(!iAmFullManager) return {options:null, canRemove:false};
    options = [{value:'pm', label:'Project Manager'}, {value:'estimator', label:'Estimator (no notifications)'}, {value:'operative', label:'Operative'}, {value:'site_manager', label:'Site Manager'}];
    if(iAmAdmin) options.push({value:'admin', label:'Company Admin'});
    canRemove = iAmAdmin;
  } else if(p.role==='site_manager'){
    if(!iAmFullManager) return {options:null, canRemove:false};
    options = [{value:'site_manager', label:'Site Manager'}, {value:'operative', label:'Operative'}, {value:'pm', label:'Project Manager'}, {value:'estimator', label:'Estimator (no notifications)'}];
    if(iAmAdmin) options.push({value:'admin', label:'Company Admin'});
    canRemove = iAmAdmin;
  } else if(p.role==='operative'){
    options = [{value:'operative', label:'Operative'}];
    // Delivery Driver used to only be choosable at invite time — there was
    // no way to turn an existing operative into one afterwards, even though
    // the reverse (driver -> operative, below) already worked. Same
    // iAmFullManager gate as PM/Site Manager since it's no higher-trust
    // than those.
    if(iAmFullManager) options.push({value:'pm', label:'Project Manager'}, {value:'estimator', label:'Estimator (no notifications)'}, {value:'site_manager', label:'Site Manager'}, {value:'driver', label:'Delivery Driver'});
    if(iAmAdmin) options.push({value:'admin', label:'Company Admin'});
    canRemove = iAmFullManager;
  } else if(p.role==='driver'){
    options = [{value:'driver', label:'Delivery Driver'}];
    if(iAmFullManager) options.push({value:'operative', label:'Operative'});
    canRemove = iAmFullManager;
  } else if(p.role==='client'){
    options = null; // clients aren't moved between roles from here, same as before
    canRemove = iAmFullManager;
  }
  return {options, canRemove};
}
function estimatorsSectionHtml(people){
  return `
    <p class="sectiontitle" style="margin-top:18px;">Estimators</p>
    <p class="stub" style="margin:-4px 0 8px;">Same access as a Project Manager, but they get no notifications or automatic emails.</p>
    ${people.filter(p=>isEstimator(p)).map(p=>`
      <div class="sitecard" style="flex-wrap:wrap;${p.id!==ME.id && isFullManager(ME) ? 'cursor:pointer;' : ''}" ${p.id!==ME.id && isFullManager(ME) ? `onclick="toggleUserActions('${p.id}')"` : ''}>
        <div class="swatch personswatch">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name">${escapeHtml(p.name)}${p.id===ME.id?' (you)':''}</div><div class="addr">${escapeHtml(p.email)}</div></div>
        ${userActionsOpenFor[p.id] ? roleActionsHtml(ME, p, people) : ''}
      </div>
    `).join('')}`;
}
function roleActionsHtml(ME, p, allPeople){
  const {options, canRemove} = roleActionsFor(ME, p, allPeople);
  if(!options && !canRemove) return '';
  const smallBtn = 'width:auto;padding:4px 6px;font-size:6.75px;'; // matches the smallBtn style used elsewhere in this admin screen
  return `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;" onclick="event.stopPropagation()">
      ${options ? `<select style="${smallBtn}" onchange="setUserRole('${p.id}', this.value)">
        ${options.map(o=>`<option value="${o.value}" ${o.value===(isEstimator(p)?'estimator':p.role)?'selected':''}>${o.label}</option>`).join('')}
      </select>` : ''}
      ${canRemove ? `<button class="ghostbtn" style="${smallBtn}color:var(--warn);" onclick="removeTeamMember('${p.id}','${jsAttr(p.name)}')">Remove</button>` : ''}
    </div>
  `;
}

// loadAllProfiles() is called from nearly every render() — almost every
// screen shows someone's name — so it was re-fetching the entire profiles
// table over the network on every single navigation, including the back
// button, which is what made back feel slow: the destination screen sat
// waiting on a full profiles re-fetch before it could even start painting.
// Names/roles don't change from tap to tap, so cache for a short TTL and
// only force a real re-fetch when something that changes this data just ran
// (see setUserRole/removeTeamMember, which also patch PROFILES in place so
// they don't need to wait on this at all).
let profilesLoadedAt = 0;
const PROFILES_TTL_MS = 45000;
async function loadAllProfiles(force){
  if(!force && profilesLoadedAt && Object.keys(PROFILES).length && (Date.now()-profilesLoadedAt) < PROFILES_TTL_MS) return;
  // Must include every column any screen reads off a cached PROFILES[id]
  // entry (not just id/name/email/role) — signature_path (TBT "Carried out
  // by", etc.) and the onedrive_* columns (per-operative Certifications
  // sync) were previously missing here, so a PM linking an operative's
  // OneDrive folder would see "Sync Now" silently revert to "Link OneDrive
  // Folder" the moment this 45s cache refreshed, wiping the just-set
  // onedrive_folder_id/onedrive_last_synced_at back to undefined client-side
  // even though the database row itself was correct — reading as "sync
  // isn't working" when it actually was.
  const rows = await dbSelect('profiles', 'select=id,name,email,role,is_estimator,phone,signature_path,onedrive_folder_id,onedrive_folder_name,onedrive_drive_id,onedrive_last_synced_at');
  // An organisation always has at least one profile (yours), so an empty
  // answer means the request failed — keep the names we already have.
  if(!rows.length && Object.keys(PROFILES).length) return;
  PROFILES = {};
  rows.forEach(p=> PROFILES[p.id]=p);
  profilesLoadedAt = Date.now();
}
function nameOf(userId){ return (PROFILES[userId] && PROFILES[userId].name) || 'Unknown'; }

// Per-site deletion/closure audit trail (Settings & Admin > Activity Log).
// Fire-and-forget: never block or fail the actual delete/close action if
// logging itself has a hiccup — the action already succeeded, losing the
// log entry is much better than losing the ability to delete something.
function logSiteActivity(siteId, action, description){
  dbInsert('site_activity_log', {site_id: siteId, org_id: ME.org_id, actor_id: ME.id, action, description}).catch(()=>{});
}

const MERCHANTS = ['SIG Roofing','Roofers Merchant','CCF'];
