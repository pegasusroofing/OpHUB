/* ================= MANAGE TEAM (admin/PM grant, revoke, and remove team members) ================= */
let teamLogoProcessing = false; // compressing the chosen file
let teamLogoBusy = false; // uploading + saving
let teamLogoPreview = null; // compressed data URL, staged but not saved yet
let teamLogoError = null;
window.onTeamLogoChosen = async function(e){
  const file = e.target.files[0];
  if(!file) return;
  teamLogoProcessing = true; teamLogoError = null; render();
  try{
    // Same fast, small logo target as Company Setup — a logo is never shown
    // bigger than a small icon, so there's no reason to run it through the
    // full 1600px photo pipeline (which is what made this feel "frozen" on
    // a large camera photo before this fix).
    teamLogoPreview = await compressImage(file, {maxW:400, quality:0.85});
  }catch(err){
    teamLogoError = 'Could not process that image — try a different photo.';
  }
  teamLogoProcessing = false;
  render();
};
window.saveTeamLogo = async function(){
  if(!teamLogoPreview) return;
  teamLogoBusy = true; teamLogoError = null; render();
  try{
    const path = await uploadDataUrl('org-logos', ME.org_id+'/logo-'+Date.now()+'.jpg', teamLogoPreview);
    if(!path){ teamLogoBusy=false; teamLogoError='Logo upload failed — try again.'; render(); return; }
    const row = await dbUpdate('organizations', ME.org_id, {logo_path: path});
    teamLogoBusy = false;
    if(!row){ teamLogoError='Could not save — try again.'; render(); return; }
    await loadOrg();
    teamLogoPreview = null;
    toast('Logo updated');
    render();
  }catch(err){
    teamLogoBusy = false;
    teamLogoError = 'Something went wrong saving that — check your connection and try again.';
    render();
  }
};
let newInviteLink = null;
let newInviteId = null;
let invitesBusy = false;
let inviteEmailBusy = false;
let permanentInviteBusy = false;