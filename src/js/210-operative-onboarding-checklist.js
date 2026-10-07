/* ================= OPERATIVE ONBOARDING CHECKLIST ================= */
// Only shown to operatives, and only once at least one live site is
// assigned to them — self-hides for good once every step is ticked off.
// Steps auto-tick from data that already exists elsewhere in the app
// (signature, H&S Policy/RAMS/COSHH signatures, tool photos) except "viewed
// the schedule of works", which is tracked with a new profiles column set
// the first time renderSchedule() runs for that operative.
async function computeOnboardingChecklist(){
  if(isManager(ME)) return null;
  const assignments = await dbSelect('site_assignments', 'user_id=eq.'+ME.id+'&select=site_id');
  const assignedIds = new Set(assignments.map(a=>a.site_id));
  const activeSites = SITES.filter(s=>assignedIds.has(s.id) && siteStatusKey(s)==='live');
  if(!activeSites.length) return null;
  const firstSiteId = activeSites[0].id;
  const [hsPolicyData, ramsSigs, coshhSigs, tools] = await Promise.all([
    fetchHsPolicyData(),
    dbSelect('rams_signatures', 'user_id=eq.'+ME.id+'&select=id&limit=1'),
    dbSelect('coshh_signatures', 'user_id=eq.'+ME.id+'&select=id&limit=1'),
    dbSelect('operative_tools', 'user_id=eq.'+ME.id+'&select=id&limit=1'),
  ]);
  const hsSigned = hsPolicyData.doc ? hsPolicyData.sigs.some(s=>s.user_id===ME.id && hsPolicySigStillValid(hsPolicyData.doc, s)) : false;
  const items = [
    {key:'signature', label:'Create your signature', desc:'Draw your signature once — it\'s reused everywhere you need to sign (RAMS, COSHH, sign-offs) so you never have to redraw it.', done: !!ME.signature_path, href:'#/signature'},
    {key:'hspolicy', label:'Sign the H&S Policy', desc:'Our company Health & Safety Policy — a one-off sign-off confirming you\'ve read and understood it.', done: hsSigned, href:`#/site/${firstSiteId}/hs/rams`},
    {key:'rams', label:'Sign RAMS', desc:'Risk Assessment & Method Statements for your site — read through them and sign to confirm you understand the risks and how to work safely.', done: ramsSigs.length>0, href:`#/site/${firstSiteId}/hs/rams`},
    {key:'coshh', label:'Sign COSHH', desc:'Control of Substances Hazardous to Health — sign to confirm you understand any hazardous substances used on site.', done: coshhSigs.length>0, href:`#/site/${firstSiteId}/hs/coshh`},
    {key:'tools', label:'Upload your tool photos', desc:'A quick photo record of your own tools on site, kept against your profile.', done: tools.length>0, href:`#/site/${firstSiteId}/hs/mytools`},
    {key:'schedule', label:'Open and view the Schedule of Works', desc:'See the full list of tasks for your project, and what\'s still to do.', done: !!ME.viewed_schedule_at, href:`#/site/${firstSiteId}/schedule`},
  ];
  return {items, allDone: items.every(i=>i.done), firstSiteId};
}
// #332: two purely-informational "Add to Home Screen" walkthrough steps —
// there's nothing in the database to tick these against (installing to a
// home screen isn't something the app can detect), so "done" is just a
// per-device localStorage flag the operative sets themselves by tapping
// "Got it", entirely separate from the functional items above which stay
// driven by real data and still gate the Sites-screen "Getting Started" card.
function onboardingHomeScreenDone(key){
  try{ return localStorage.getItem('ophub_onboard_'+key)==='1'; }catch(e){ return false; }
}
window.setOnboardingHomeScreenDone = function(key){
  try{ localStorage.setItem('ophub_onboard_'+key, '1'); }catch(e){}
  render();
};
let onboardingStepIndex = 0;
window.onboardingGoStep = function(i){ onboardingStepIndex = i; render(); };
async function renderOnboardingChecklist(){
  const __gen = RENDER_GEN;
  const data = await computeOnboardingChecklist();
  // Build the full guided walkthrough: a welcome step, then each functional
  // item (with a plain-English explanation of why it matters and a button
  // straight to it), then the two home-screen install guides, then a finish
  // step — one step shown at a time rather than a flat checklist, per #332.
  const functionalSteps = (data ? data.items : []).map(it=>({
    key:it.key, title:it.label, done:it.done,
    body:`<p class="stub" style="margin:0 0 14px;font-size:13.5px;">${escapeHtml(it.desc||'')}</p>`,
    cta: it.done ? null : {label:'Go do this now', href:it.href},
  }));
  const steps = [
    {key:'welcome', title:'Welcome to OpHUB', done:true, body:`<p class="stub" style="margin:0 0 14px;font-size:13.5px;">Let's get you fully set up — a few quick steps, then two tips on adding OpHUB to your phone's home screen so it opens like a normal app.</p>`},
    ...functionalSteps,
    {key:'android-home', title:'Add to Home Screen — Android', done:onboardingHomeScreenDone('android'), body:`
      <p class="stub" style="margin:0 0 10px;font-size:13.5px;">On an Android phone, using Chrome:</p>
      <ol style="margin:0 0 14px;padding-left:20px;font-size:13.5px;color:var(--ink);line-height:1.7;">
        <li>Tap the <b>⋮</b> menu (three dots, top-right of Chrome)</li>
        <li>Tap <b>Add to Home Screen</b> (or <b>Install app</b>, if you see that instead)</li>
        <li>Confirm the name, then tap <b>Add</b> / <b>Install</b></li>
      </ol>
      <p class="stub" style="margin:0;font-size:13.5px;">OpHUB will appear on your home screen with its own icon — tap it any time instead of opening Chrome.</p>
    `, cta: onboardingHomeScreenDone('android') ? null : {label:"Got it — I've added it", action:"setOnboardingHomeScreenDone('android')"}},
    {key:'iphone-home', title:'Add to Home Screen — iPhone', done:onboardingHomeScreenDone('iphone'), body:`
      <p class="stub" style="margin:0 0 10px;font-size:13.5px;">On an iPhone, using Safari:</p>
      <ol style="margin:0 0 14px;padding-left:20px;font-size:13.5px;color:var(--ink);line-height:1.7;">
        <li>Tap the <b>Share</b> button (the square with an arrow pointing up, at the bottom of Safari)</li>
        <li>Scroll down and tap <b>Add to Home Screen</b></li>
        <li>Confirm the name, then tap <b>Add</b> (top-right)</li>
      </ol>
      <p class="stub" style="margin:0;font-size:13.5px;">OpHUB will appear on your home screen with its own icon — tap it any time instead of opening Safari. This only works from Safari, not other browsers.</p>
    `, cta: onboardingHomeScreenDone('iphone') ? null : {label:"Got it — I've added it", action:"setOnboardingHomeScreenDone('iphone')"}},
    {key:'finish', title:"You're all set", done:true, body:`<p class="stub" style="margin:0;font-size:13.5px;">That's everything — head back to your projects whenever you're ready.</p>`},
  ];
  if(!data){
    if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`<div class="empty">Nothing to do here right now.</div>`, {title:'Getting Started', back:'#/sites', tabs:false}); }
    return;
  }
  const idx = Math.max(0, Math.min(onboardingStepIndex, steps.length-1));
  const step = steps[idx];
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 4px;">Step ${idx+1} of ${steps.length}</p>
    <div style="display:flex;gap:4px;margin-bottom:16px;">
      ${steps.map((s,i)=>`<div style="flex:1;height:4px;border-radius:2px;background:${i<=idx?'var(--brand1)':'var(--line)'};cursor:pointer;" onclick="onboardingGoStep(${i})"></div>`).join('')}
    </div>
    <div class="card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div class="swatch" style="width:32px;height:32px;flex:0 0 32px;background:${step.done?'var(--ok-bg)':'var(--warn-bg)'};color:${step.done?'var(--ok)':'var(--warn)'};">${step.done?'✓':(idx+1)}</div>
        <p class="sectiontitle" style="margin:0;">${escapeHtml(step.title)}</p>
      </div>
      ${step.body}
      ${step.cta ? (step.cta.href
        ? `<button class="darkbtn" onclick="go('${step.cta.href}')">${escapeHtml(step.cta.label)}</button>`
        : `<button class="darkbtn" onclick="${step.cta.action}">${escapeHtml(step.cta.label)}</button>`) : ''}
    </div>
    <div class="row-gap" style="margin-top:16px;">
      <button class="ghostbtn" ${idx===0?'disabled':''} onclick="onboardingGoStep(${idx-1})">‹ Back</button>
      ${idx<steps.length-1
        ? `<button class="darkbtn" onclick="onboardingGoStep(${idx+1})">Next ›</button>`
        : `<button class="darkbtn" onclick="go('#/sites')">Finish</button>`}
    </div>
  `, {title:'Getting Started', back:'#/sites', tabs:false}); }
}
