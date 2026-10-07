/* ================= SNAGGING / VARIATIONS (folder: Snagging + Variations) ================= */
async function renderSnaggingFolder(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const [openSnags, liveVariations, reportTemplateRows] = await Promise.all([
    dbSelect('snags', 'site_id=eq.'+siteId+'&status=eq.open&select=id'),
    dbSelect('variations', 'site_id=eq.'+siteId+'&status=eq.live&select=id'),
    isManager(ME) ? dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&archived=eq.false&select=id') : Promise.resolve([]),
  ]);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="tilegrid">
      <div class="tile" onclick="go('#/site/${siteId}/snagging/list')">
        <div class="icon" style="background:var(--warn-bg);color:var(--warn);">🏷</div>
        <div class="lbl">Snagging</div><div class="sub">${openSnags.length} open</div>
      </div>
      <div class="tile" onclick="go('#/site/${siteId}/snagging/variations')">
        <div class="icon" style="background:#F0E4F5;color:#6B3F86;">✎</div>
        <div class="lbl">Variations</div><div class="sub">${liveVariations.length} live</div>
      </div>
      ${isManager(ME) ? `<div class="tile" onclick="go('#/site/${siteId}/snagging/reports')"><div class="icon" style="background:#EDE7F6;color:#5E35B1;">📊</div><div class="lbl">Reports</div><div class="sub">${reportTemplateRows.length} template${reportTemplateRows.length===1?'':'s'}</div></div>` : ''}
    </div>
  `, {title:snaggingFolderLabel(), subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, siteId, activeTab:'more'}); }
}
