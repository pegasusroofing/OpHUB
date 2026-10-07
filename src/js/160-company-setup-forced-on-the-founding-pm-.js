/* ================= COMPANY SETUP (forced on the founding PM until logo+colours are set) ================= */
let setupBusy = false;
let setupError = null;
let setupLogoDataUrl = null; // preview + upload source
let setupColor1 = DEFAULT_BRAND1;
let setupColor2 = DEFAULT_BRAND2;
function renderCompanySetup(){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  if(__gen === RENDER_GEN){ app.innerHTML = shell(`
    <div class="card">
      <p class="stub" style="margin:0 0 12px;">Before you get started, set up <b>${escapeHtml(ORG.name)}</b>'s branding — this is shown throughout the app and on your team's invite link.</p>
      ${setupError ? `<div class="errbox">${escapeHtml(setupError)}</div>` : ''}
      <div class="formfield">
        <label class="field-label">Company logo (required)</label>
        <div class="photoupload" style="cursor:${setupLogoProcessing?'default':'pointer'};" onclick="${setupLogoProcessing?'':"document.getElementById('setupLogoInput').click()"}">
          ${setupLogoProcessing ? `<span><span class="spinner"></span> Processing photo…</span>` : setupLogoDataUrl ? `<img src="${setupLogoDataUrl}">` : `<span>Tap to upload your logo</span>`}
        </div>
        <input type="file" id="setupLogoInput" accept="image/*" style="display:none;" onchange="onSetupLogoChosen(event)" ${setupLogoProcessing?'disabled':''}>
      </div>
      <div class="formfield">
        <label class="field-label">Brand colour 1 (required)</label>
        <input type="color" id="setupColor1" value="${setupColor1}" oninput="setupColor1=this.value;document.documentElement.style.setProperty('--brand1',this.value);document.documentElement.style.setProperty('--brand1-text',readableTextColor(this.value));" style="width:100%;height:44px;padding:4px;">
      </div>
      <div class="formfield">
        <label class="field-label">Brand colour 2 (required)</label>
        <input type="color" id="setupColor2" value="${setupColor2}" oninput="setupColor2=this.value;document.documentElement.style.setProperty('--brand2',this.value);document.documentElement.style.setProperty('--brand2-onlight',onLightTextColor(this.value,'#101114'));" style="width:100%;height:44px;padding:4px;">
      </div>
      <button class="primarybtn" ${setupBusy || setupLogoProcessing || !setupLogoDataUrl ?'disabled':''} onclick="saveCompanySetup()">
        ${setupBusy ? '<span class="spinner"></span>Saving…' : 'Save & Continue'}
      </button>
    </div>
  `, {title:'Set Up Your Company', tabs:false}); }
  document.documentElement.style.setProperty('--brand1', setupColor1);
  document.documentElement.style.setProperty('--brand2', setupColor2);
  document.documentElement.style.setProperty('--brand1-text', readableTextColor(setupColor1));
  document.documentElement.style.setProperty('--brand2-onlight', onLightTextColor(setupColor2, '#101114'));
}
let setupLogoProcessing = false;
window.onSetupLogoChosen = async function(e){
  const file = e.target.files[0];
  if(!file) return;
  // Show visible progress and handle failure — previously this ran silently
  // with nothing on screen until it finished, which on a big camera photo
  // looked exactly like the app had frozen.
  setupLogoProcessing = true; setupError = null; renderCompanySetup();
  try{
    // Logos are only ever shown at a small size in the app (max ~250px), so
    // there's no need to run them through the full 1600px photo pipeline —
    // 400px keeps the upload and processing fast regardless of how large the
    // original camera photo is.
    setupLogoDataUrl = await compressImage(file, {maxW:400, quality:0.85});
  }catch(err){
    setupError = 'Could not process that image — try a different photo.';
  }
  setupLogoProcessing = false;
  renderCompanySetup();
};
window.saveCompanySetup = async function(){
  if(!setupLogoDataUrl){ setupError='A logo is required.'; renderCompanySetup(); return; }
  setupBusy = true; setupError = null; renderCompanySetup();
  try{
    const path = await uploadDataUrl('org-logos', ME.org_id+'/logo-'+Date.now()+'.jpg', setupLogoDataUrl);
    if(!path){ setupBusy=false; setupError='Logo upload failed — try again.'; renderCompanySetup(); return; }
    const row = await dbUpdate('organizations', ME.org_id, {logo_path: path, color_primary: setupColor1, color_secondary: setupColor2});
    setupBusy = false;
    if(!row){ setupError='Could not save — try again.'; renderCompanySetup(); return; }
    await loadOrg();
    toast('Company set up');
    go('#/sites');
  }catch(err){
    // A network hiccup mid-upload used to leave this stuck on "Saving…"
    // forever with no way to retry short of reloading the whole app.
    setupBusy = false;
    setupError = 'Something went wrong saving that — check your connection and try again.';
    renderCompanySetup();
  }
};
