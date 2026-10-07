/* ================= ACCOUNT / SETTINGS (Home bottom bar — everyone) ================= */
function renderAccountSettings(){
  const __gen = RENDER_GEN;
  const canAdmin = isManager(ME);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${canAdmin ? `
      <div class="card" style="margin-bottom:16px;">
        <p class="sectiontitle" style="margin-top:0;">Admin Centre</p>
        <p class="stub" style="margin:0 0 10px;">Manage your team, branding, integrations and company-wide settings.</p>
        <button class="darkbtn" onclick="go('#/team')">Open Admin Centre</button>
      </div>
    ` : ''}
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Your Account</p>
      <p class="stub" style="margin:0 0 10px;">${escapeHtml(ME.name)} · ${escapeHtml(ME.email)}</p>
      <div class="formfield"><label class="field-label">Phone number</label>
        <input type="tel" id="myPhoneInput" placeholder="e.g. 07123 456789" value="${escapeHtml(ME.phone||'')}">
      </div>
      <p class="stub" style="margin:0 0 10px;">Shown to delivery drivers when you're the site contact for a delivery.</p>
      <button class="ghostbtn" ${myPhoneSaveBusy?'disabled':''} onclick="saveMyPhone()">${myPhoneSaveBusy?'Saving…':'Save Phone Number'}</button>
      <button class="ghostbtn" style="margin-top:8px;" onclick="go('#/signature')">${ME.signature_path?'My signature':'Adopt your signature'}</button>
      <button class="ghostbtn" style="margin-top:8px;color:var(--warn);" onclick="doSignOut()">Sign out</button>
    </div>
  `, {title:'Settings', back: ME.role==='driver' ? '#/driver' : '#/sites', tabs:false}); }
}
let myPhoneSaveBusy = false;
window.saveMyPhone = async function(){
  const el = document.getElementById('myPhoneInput');
  const phone = el ? el.value.trim() : '';
  myPhoneSaveBusy = true; render();
  const row = await dbUpdate('profiles', ME.id, {phone: phone || null});
  myPhoneSaveBusy = false;
  if(row){ ME.phone = row.phone; if(PROFILES[ME.id]) PROFILES[ME.id].phone = row.phone; toast('Phone number saved'); }
  else { toast('Could not save — try again.'); }
  render();
};
