/* ================= PLATFORM ADMIN (superadmin oversight across all companies) ================= */
let adminResetBusy = null; // email currently being reset
let adminResetResult = null; // {email, new_password}
let adminExpandedOrg = null; // org id currently expanded to show its members
let newCompanyInvite = null; // {org_name, invite_link} after creating a company
let newCompanyBusy = false;
async function renderAdmin(){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  const [orgs, subs, allProfiles] = await Promise.all([
    dbSelect('organizations', 'select=*&order=created_at.desc'),
    dbSelect('subscriptions', 'select=*'),
    dbSelect('profiles', 'select=*&order=name.asc'),
  ]);
  const subByOrg = {}; subs.forEach(s=>{ subByOrg[s.org_id] = s; });
  const peopleByOrg = {};
  allProfiles.forEach(p=>{ if(!p.org_id) return; (peopleByOrg[p.org_id] = peopleByOrg[p.org_id]||[]).push(p); });

  if(__gen === RENDER_GEN){ app.innerHTML = shell(`
    <p class="sectiontitle">My Account</p>
    <div class="card">
      <div class="sitecard" style="margin:0;">
        <div class="info"><div class="name">${escapeHtml(ME.name)}${' (you)'}</div><div class="addr">${escapeHtml(ME.email)} · Super Admin</div></div>
        <button class="ghostbtn" style="width:auto;padding:8px 12px;" ${adminResetBusy===ME.email?'disabled':''} onclick="resetUserPassword('${escapeHtml(ME.email)}')">${adminResetBusy===ME.email?'…':'Reset My Password'}</button>
      </div>
    </div>
    ${adminResetResult ? `
      <div class="card" style="border-color:var(--ok);">
        <p class="stub" style="margin:0 0 6px;color:var(--ok);">New password for <b>${escapeHtml(adminResetResult.email)}</b> — share this with them securely, they should change it after signing in:</p>
        <input type="text" readonly value="${escapeHtml(adminResetResult.new_password)}" style="font-size:14px;font-weight:800;margin-bottom:8px;" onclick="this.select()">
        <button class="ghostbtn" onclick="adminResetResult=null;render()">Dismiss</button>
      </div>
    ` : ''}
    <p class="sectiontitle" style="margin-top:18px;">Invite a Company</p>
    <div class="card">
      ${newCompanyInvite ? `
        <p class="stub" style="margin:0 0 8px;color:var(--ok);">Company "<b>${escapeHtml(newCompanyInvite.org_name)}</b>" created — share this link with whoever should become their admin. It works once, for the next 14 days:</p>
        <input type="text" readonly value="${escapeHtml(newCompanyInvite.invite_link)}" style="font-size:11.5px;margin-bottom:8px;" onclick="this.select()">
        <div style="display:flex;gap:8px;">
          <button class="ghostbtn" style="width:auto;" onclick="copyNewCompanyInvite()">Copy Link</button>
          <button class="ghostbtn" style="width:auto;" onclick="newCompanyInvite=null;render()">Invite Another</button>
        </div>
      ` : `
        <div class="formfield"><input type="text" id="newCompanyName" placeholder="Company name"></div>
        <div class="formfield"><input type="email" id="newCompanyEmail" placeholder="Their email (optional)"></div>
        <button class="darkbtn" ${newCompanyBusy?'disabled':''} onclick="createCompanyInvite()">${newCompanyBusy?'Creating…':'Create Company & Invite'}</button>
        <p class="stub" style="margin:8px 0 0;">Sets up a new company outside of Stripe checkout and gives you a founding-admin invite link to send them directly.</p>
      `}
    </div>
    <p class="sectiontitle" style="margin-top:18px;">All Companies (${orgs.length})</p>
    ${orgs.map(o=>{
      const sub = subByOrg[o.id];
      const people = (peopleByOrg[o.id]||[]).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
      const ROLES = ['operative','site_manager','pm','admin'];
      const expanded = adminExpandedOrg === o.id;
      return `
      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="toggleAdminOrg('${o.id}')">
          <img src="${orgLogoUrl(o)}" onerror="this.onerror=null;this.src='${OPHUB_LOGO_INLINE}'" style="width:36px;height:36px;border-radius:8px;object-fit:cover;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:14.5px;">${escapeHtml(o.name)}</div>
            <div class="stub" style="margin:0;">${escapeHtml(PLAN_LABEL[o.plan_tier] || o.plan_tier)} · ${sub ? `${escapeHtml(sub.status)}` : 'no Stripe subscription'} · ${people.length} member${people.length===1?'':'s'}</div>
          </div>
          <span class="stub" style="margin:0;font-size:16px;">${expanded?'▲':'▼'}</span>
        </div>
        ${expanded ? `
          <div style="margin-top:10px;">
            <div class="formfield" style="margin-top:0;" onclick="event.stopPropagation();">
              <label class="field-label">Package</label>
              <select onchange="setOrgPlanTier('${o.id}', this.value)" onclick="event.stopPropagation();">
                <option value="starter" ${o.plan_tier==='starter'?'selected':''}>OpHUB Basic — no GPS check-in/geofencing</option>
                <option value="growth" ${o.plan_tier==='growth'?'selected':''}>OpHUB Pro — GPS check-in & geofencing</option>
                <option value="enterprise" ${o.plan_tier==='enterprise'?'selected':''}>OpHUB Enterprise — everything, priority support</option>
              </select>
            </div>
            <button class="ghostbtn" style="width:auto;padding:6px 10px;color:var(--warn);margin:10px 0 8px;" onclick="event.stopPropagation();deleteCompany('${o.id}','${jsAttr(o.name)}')">Delete Company</button>
            ${people.map(p=>`
              <div class="sitecard" style="padding:8px 10px;flex-wrap:wrap;">
                <div class="info"><div class="name">${escapeHtml(p.name)}</div><div class="addr">${escapeHtml(p.email)} · ${personRoleLabel(p)}</div></div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  ${ROLES.filter(r=>r!==p.role).map(r=>`<button class="ghostbtn" style="width:132px;padding:6px 8px;font-size:10px;font-weight:400;text-transform:none;" onclick="setUserRole('${p.id}','${r}')">Make ${roleLabel(r)}</button>`).join('')}
                  <button class="ghostbtn" style="width:132px;padding:6px 8px;font-size:10px;font-weight:400;text-transform:none;" ${adminResetBusy===p.email?'disabled':''} onclick="resetUserPassword('${escapeHtml(p.email)}')">${adminResetBusy===p.email?'…':'Reset Password'}</button>
                  <button class="ghostbtn" style="width:132px;padding:6px 8px;font-size:10px;font-weight:800;text-transform:none;color:var(--warn);" onclick="deleteUserPlatform('${p.id}','${jsAttr(p.name)}')">Delete User</button>
                </div>
              </div>
            `).join('') || `<div class="empty" style="padding:10px;">No members yet.</div>`}
          </div>
        ` : ''}
      </div>
    `;}).join('') || `<div class="empty">No companies registered yet.</div>`}
    <p style="text-align:center;margin-top:8px;">
      <span class="stub" style="cursor:pointer;text-decoration:underline;" onclick="doSignOut()">Sign out</span>
    </p>
  `, {title:'Platform Admin', subtitle:'OpHUB · all companies', tabs:false}); }
}
window.setOrgPlanTier = async function(orgId, tier){
  const row = await dbUpdate('organizations', orgId, {plan_tier: tier});
  if(row){ toast('Package updated — '+(PLAN_LABEL[tier]||tier)); render(); }
};
window.createCompanyInvite = async function(){
  const company_name = document.getElementById('newCompanyName').value.trim();
  const email = document.getElementById('newCompanyEmail').value.trim();
  if(!company_name){ toast('Enter a company name.'); return; }
  newCompanyBusy = true; render();
  try{
    const res = await sbFetch('/functions/v1/admin-create-company', {method:'POST', body: JSON.stringify({company_name, email: email||undefined})});
    const d = await res.json();
    newCompanyBusy = false;
    if(!res.ok || d.error){ toast('Could not create company — '+(d.error||res.status)); render(); return; }
    newCompanyInvite = {org_name: company_name, invite_link: OPHUB_WEB_URL + '#/join/' + d.invite_id};
    toast('Company created');
    render();
  }catch(e){ newCompanyBusy=false; toast('Could not reach the server.'); render(); }
};
window.copyNewCompanyInvite = async function(){
  if(!newCompanyInvite) return;
  try{ await navigator.clipboard.writeText(newCompanyInvite.invite_link); toast('Link copied'); }
  catch(e){ toast('Could not copy — select and copy the link manually.'); }
};
window.toggleAdminOrg = function(orgId){
  adminExpandedOrg = adminExpandedOrg === orgId ? null : orgId;
  render();
};
window.setUserRole = async function(userId, role){
  if(!await customConfirm(`Change this person's role to ${roleLabel(role)}?`)) return;
  // 'estimator' isn't a separate role in the database: it is a Project
  // Manager with the no-notifications flag on.
  const est = role==='estimator';
  const row = await dbUpdate('profiles', userId, {role: est ? 'pm' : role, is_estimator: est});
  if(row){
    if(PROFILES[userId]){ PROFILES[userId].role = est ? 'pm' : role; PROFILES[userId].is_estimator = est; } // keep the cache correct without a re-fetch
    toast(`Role changed to ${roleLabel(role)}`); render();
  }
};
window.resetUserPassword = async function(email){
  const custom = await customPrompt(`Set a new password for ${email}.\n\nType a password (min 8 characters), or leave this blank and press OK for a random one to be generated instead.`);
  if(custom === null) return; // cancelled
  const newPassword = custom.trim();
  if(newPassword && newPassword.length < 8){ toast('Password must be at least 8 characters.'); return; }
  adminResetBusy = email; adminResetResult = null; render();
  try{
    const res = await sbFetch('/functions/v1/admin-reset-password', {method:'POST', body: JSON.stringify({target_email: email, new_password: newPassword || undefined})});
    const d = await res.json();
    adminResetBusy = null;
    if(!res.ok || d.error){ toast('Reset failed — '+(d.error||res.status)); render(); return; }
    adminResetResult = {email: d.email, new_password: d.new_password};
    render();
  }catch(e){
    adminResetBusy = null;
    toast('Reset failed — could not reach the server.');
    render();
  }
};
window.deleteUserPlatform = async function(userId, name){
  if(userId===ME.id){ toast("You can't delete your own account this way."); return; }
  if(!await customConfirm(`Permanently delete ${name||'this user'}? This removes their login completely — they will not be able to sign in again. This cannot be undone.`)) return;
  try{
    const res = await sbFetch('/functions/v1/admin-delete-user', {method:'POST', body: JSON.stringify({user_id: userId})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Delete failed — '+(d.error||res.status)); return; }
    toast(`${d.deleted||name||'User'} deleted`);
    render();
  }catch(e){
    toast('Delete failed — could not reach the server.');
  }
};
window.deleteCompany = async function(orgId, name){
  if(!await customConfirm(`Permanently delete "${name}"? This removes the company, all its sites, and all its team members' access. This cannot be undone.`)) return;
  // customPrompt, not the native prompt() — the Capacitor WebView doesn't
  // reliably support window.prompt() (see the comment by customPrompt's
  // definition), which silently made this "type to confirm" step impossible
  // to pass on the phone app.
  if(await customPrompt(`Type the company name to confirm deleting "${name}":`) !== name) { toast("Names didn't match — nothing deleted."); return; }
  try{
    const res = await sbFetch('/functions/v1/admin-delete-company', {method:'POST', body: JSON.stringify({org_id: orgId})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Delete failed — '+(d.error||res.status)); return; }
    toast(`Deleted ${d.deleted}`);
    render();
  }catch(e){
    toast('Delete failed — could not reach the server.');
  }
};
