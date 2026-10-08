/* ================= router / render ================= */
// Thin wrapper around the real router (renderRoute) so an uncaught error
// anywhere in a page's render — a bad query, a missing field on some older
// record, an admin-only section that hit an edge case — shows a recoverable
// screen instead of silently leaving the DOM exactly as it was when the
// error hit. Before this, that looked like the app "getting stuck": whatever
// dropdown/card had just been expanded stayed frozen because the render()
// call that was supposed to redraw it had thrown partway through and never
// finished, and nothing on screen indicated anything had gone wrong.
async function render(){
  // New page, or the remembered data is more than 30 seconds old: start fresh.
  if(uiReadCache.hash !== location.hash || (Date.now() - uiReadCache.at) > UI_READ_CACHE_MS){
    uiReadCacheClear();
    uiReadCache.hash = location.hash;
    uiReadCache.at = Date.now();
  }
  uiRenderDepth++;
  try{
    await renderRoute();
  }catch(e){
    uiReadCacheClear();
    console.error('render() failed', e);
    const el = document.getElementById('app');
    if(el){
      el.innerHTML = `<div style="max-width:420px;margin:60px auto;padding:24px;text-align:center;">
        <p class="stub" style="margin-bottom:14px;">Something went wrong loading this page. Your data is safe — just tap below to try again.</p>
        <button class="darkbtn" onclick="location.hash='';render()">Go to Home</button>
      </div>`;
    }
  }finally{
    uiRenderDepth = Math.max(0, uiRenderDepth-1);
  }
}
async function renderRoute(){
  RENDER_GEN++; // this render pass now supersedes any still-loading one
  OFFLINE_CACHE_USED = false; // re-earned by dbSelect this pass if anything actually had to fall back to cache
  if(ramsPollTimer){ clearInterval(ramsPollTimer); ramsPollTimer = null; }
  if(coshhPollTimer){ clearInterval(coshhPollTimer); coshhPollTimer = null; }
  if(schedulePollTimer){ clearInterval(schedulePollTimer); schedulePollTimer = null; }
  if(subSchedulePollTimer){ clearInterval(subSchedulePollTimer); subSchedulePollTimer = null; }
  if(siteLayoutPollTimer){ clearInterval(siteLayoutPollTimer); siteLayoutPollTimer = null; }
  const preParts = parseRoute();
  if(preParts[0]==='join' && preParts[1]){ return renderJoin(preParts[1]); }
  if(!SESSION || !ME){ return renderLogin(); }
  if(ME.role==='superadmin'){ return renderAdmin(); }
  if(ME.role==='admin' && ORG && !ORG.logo_path){ return renderCompanySetup(); }
  // Compulsory H&S Policy sign-off — blocks the whole app for every role
  // except superadmin until the current policy is signed (or re-signed,
  // once its expiry rolls the cycle over). The signature route itself stays
  // reachable so someone with no adopted signature yet can go set one up
  // and come straight back.
  if(preParts[0]!=='signature' && await checkHsPolicyGate()){ return renderHsPolicyGate(); }
  const parts = parseRoute();
  // Delivery drivers get their own simplified home instead of the normal
  // site list — they don't work "on a site" the way operatives do, so
  // sending them into renderSites() would show them a screen with nothing
  // for them to do. Any other top-level route (account, signature, etc.)
  // still works normally for them.
  if(ME.role==='driver' && (!parts.length || parts[0]==='sites')){ go('#/driver'); return; }
  if(parts[0]==='driver'){
    if(parts[1]==='checkin') return renderDriverCheckin();
    if(parts[1]==='schedule') return renderDriverSchedule();
    if(parts[1]==='vehicle-checklist') return renderDriverVehicleChecklist();
    return renderDriverHome();
  }
  if(!parts.length || parts[0]==='sites'){ return renderSites(); }
  addSiteFormOpen = false; newSiteStatus = null; newSiteNameDraft=''; newSiteAddrDraft=''; newSitePostcodeDraft=''; newSiteJobNumberDraft=''; newSiteMultiSiteDraft=false; newSiteRepairContractDraft=false; newSiteClientNameDraft=''; newSiteClientPhoneDraft=''; newSiteClientEmailDraft=''; // navigating anywhere off the site list closes the collapsed add-site form back up
  pmFilterOpen = false; // and closes the PM filter dropdown back up
  if(parts[0]==='team'){
    // Web-app return leg of the OneDrive OAuth flow: the callback page
    // redirects here with ?onedrive=success|error so we can toast the
    // result, since there's no app to hand off to like the native flow has.
    const odStatus = routeQuery().get('onedrive');
    if(odStatus){
      toast(odStatus==='success' ? 'OneDrive connected' : 'OneDrive connection failed — try again.');
      history.replaceState(null, '', location.pathname + location.search + '#/team/company/onedrive');
      return renderTeam('company', 'onedrive');
    }
    if(parts[1]==='onedrive-quicklinks') return renderOneDriveFolderPicker(null);
    return renderTeam(parts[1] || null, parts[2] || null);
  }
  if(parts[0]==='companylibrary'){
    if(!ME || !isManager(ME)){ go('#/sites'); return; }
    if(parts[1]) return renderCompanyLibraryDocs(null, parts[1]);
    return renderCompanyLibraryHub(null);
  }
  if(parts[0]==='signature'){ return renderSignaturePad(); }
  if(parts[0]==='rams-library'){ return renderRamsLibrary(); }
  if(parts[0]==='outstanding'){ return renderOutstandingTasks(); }
  if(parts[0]==='general-reports'){
    if(!ME || !isManager(ME)){ toast('Project managers and admins only.'); go('#/sites'); return; }
    if(parts[1]==='fill' && parts[2]) return renderReportFill(GENERAL_REPORTS, parts[2]);
    if(parts[1]==='view' && parts[2]) return renderReportView(GENERAL_REPORTS, parts[2]);
    return renderSiteReports(GENERAL_REPORTS);
  }
  if(parts[0]==='hub'){ if(!ME || !isManager(ME)){ go('#/sites'); return; } return renderHub(); }
  // Inbox is the operative team's messages feed — off-limits to clients,
  // same as Materials/Team/etc; unlike those, this route had no gate at all
  // before, so a client hitting #/my-messages (e.g. a stale link, or before
  // the tab above was hidden) got straight through to real message content.
  if(parts[0]==='my-messages'){ if(ME && isClient(ME)){ go('#/sites'); return; } return renderMyMessages(); }
  if(parts[0]==='operative-dashboard'){ return renderOperativeDashboard(); }
  if(parts[0]==='account'){ return renderAccountSettings(); }
  if(parts[0]==='onboarding-checklist'){ return renderOnboardingChecklist(); }
  if(parts[0]==='dashboard'){
    // Was admin-only; the Home bottom bar's Dashboard button is shown to any
    // manager (isManager — admin or PM), so PMs need to actually land here
    // too instead of being bounced straight back to the sites list.
    if(!ME || !isManager(ME)){ go('#/sites'); return; }
    return renderDashboard();
  }
  if(parts[0]==='templates'){
    if(!ME || !isManager(ME)){ go('#/sites'); return; }
    if(parts[1]) return renderTemplateEditor(parts[1]);
    return renderReportTemplates();
  }
  if(parts[0]==='calendar'){
    if(!ME || !isManager(ME)){ go('#/sites'); return; }
    return renderUnifiedCalendar();
  }
  if(parts[0]==='dashboard-choice'){
    if(!ME || !isManager(ME)){ go('#/sites'); return; }
    return renderDashboardChoice();
  }
  if(parts[0]==='deliveries'){
    if(!ME || !isManager(ME)){ go('#/sites'); return; }
    return renderAdminDeliveriesHub();
  }
  if(parts[0]==='delivery'){
    if(!ME || !isManager(ME)){ go('#/sites'); return; } // Site Managers included — they were shown the delivery tiles but bounced from the pages (RLS now allows them too)
    if(parts[1]==='new') return renderDeliveryForm(null);
    if(parts[1]==='edit' && parts[2]) return renderDeliveryForm(parts[2]);
    if(parts[1]==='driver-view') return renderDriverSchedule(true);
    return renderDeliverySchedulePM();
  }
  if(parts[0]==='sign-templates'){
    if(!ME || !isManager(ME)){ go('#/sites'); return; }
    if(parts[1]) return renderRamsBoxes(null, null, parts[1]);
    return renderSignTemplates();
  }
  if(parts[0]==='vehicle-checklists'){
    if(!ME || !isManager(ME)){ go('#/sites'); return; }
    if(parts[1]) return renderVehicleChecklistDetail(parts[1]);
    return renderVehicleChecklistsAdmin();
  }
  if(parts[0]==='operatives'){
    if(!ME || !isManager(ME)){ go('#/sites'); return; }
    if(parts[1] && parts[2]==='onedrive-folder') return renderOneDriveFolderPicker(null);
    if(parts[1]) return renderOperativeDetail(parts[1]);
    return renderOperativesList();
  }
  if(parts[0]==='site' && parts[1]){
    const siteId = parts[1];
    const page = parts[2] || 'home';
    // Once a job is closed, operatives lose access to it entirely — bounce
    // them back to the site list rather than letting a stale tab/bookmark
    // keep it reachable. Managers still need to get in (to reopen it, pull
    // a final export, etc), so this only applies to operatives.
    if(!isManager(ME)){
      const site = SITES.find(s=>s.id===siteId);
      if(site && site.status==='closed'){ toast('This job is closed.'); go('#/sites'); return; }
    }
    // Clients only ever get home/schedule/hs(rams,coshh,tbt,puwer)/snagging —
    // anything else (messages, materials, price, drawings, todos, check-in,
    // team/admin pages) bounces back to this site's home. Mirrors the
    // server-side RLS lockdown (has_client_view_access) so there's no page
    // that half-loads with an access error.
    if(isClient(ME) && !CLIENT_ALLOWED_SITE_PAGES.includes(page)){ go(`#/site/${siteId}/home`); return; }
    // Subcontractor operatives (see subcontractor_operatives / #(subcontractor-lockdown))
    // only ever see the Main Contractor tile at this site (the CPP/Site
    // Layout/Inductions/Permits/Asbestos/F10 documents, plus their own
    // company's folder under Subcontractors) — nothing else on the site
    // (schedule, snagging, check-in, messages, etc). They still sign up and
    // pick a site normally; once a PM allocates them to a subcontractor
    // company, this is what they get here.
    if(!isManager(ME) && !isClient(ME)){
      const mySubCompanyId = await getMySubcontractorCompanyId(siteId);
      if(mySubCompanyId && page!=='mc'){ go(`#/site/${siteId}/mc/subcontractors/${mySubCompanyId}`); return; }
    }
    // Keep the bottom tab bar's Messages badge fresh on every site-scoped
    // navigation, not just when visiting Messages itself.
    if(page!=='messages'){ refreshUnreadBadge(siteId); }
    if(page!=='drawings' && !(page==='mc' && parts[3]==='programme')){ drawingUploadOpen = false; drawingNewFolderOpen = false; } // the Main Contractor Programme folder is the Drawings page under another route
    if(page!=='todos'){ newTodoDraft = ''; newTodoAssigneeDraft = ''; newTodoDateDraft = ''; newTodoCommentDraft = ''; todoAddOpen = true; todoFilter = 'live'; todoAssigneeEditId = null; todoEditId = null; todoEmailRecipientIds = []; todoEmailFilterText = ''; }
    if(page==='home') return renderSiteHome(siteId);
    if(page==='repairjob'){
      if(parts[4]==='onedrive-folder') return renderOneDriveFolderPicker(siteId);
      return renderRepairJobDetail(siteId, parts[3]);
    }
    if(page==='repairjobs') return parts[3] ? renderRepairJobsListPage(siteId, parts[3]) : renderRepairJobsCategoryHub(siteId);
    if(page==='checkin') return renderCheckin(siteId, parts[3]);
    if(page==='schedule') return renderSchedule(siteId);
    if(page==='snagging'){
      const sub = parts[3];
      if(isClient(ME) && sub && sub!=='list'){ go(`#/site/${siteId}/snagging/list`); return; }
      if(!sub) return isClient(ME) ? renderSnagging(siteId) : renderSnaggingFolder(siteId);
      if(sub==='list') return renderSnagging(siteId);
      if(sub==='variations') return renderVariations(siteId);
      if(sub==='templates') return renderSiteReportTemplates(siteId);
      if(sub==='reports'){
        // Reporting is a PM/admin-only tile — gate the route too, not just
        // the tile, so it can't be reached by a direct link/bookmark either.
        if(!isManager(ME)){ toast('Project managers and admins only.'); go(`#/site/${siteId}/snagging`); return; }
        const rsub = parts[4];
        if(rsub==='fill' && parts[5]) return renderReportFill(siteId, parts[5]);
        if(rsub==='view' && parts[5]) return renderReportView(siteId, parts[5]);
        return renderSiteReports(siteId);
      }
      return renderSnaggingFolder(siteId);
    }
    if(page==='drawings'){
      const folderId = parts[3] || null;
      return renderDrawings(siteId, folderId);
    }
    if(page==='drawings-import') return renderDrawingImportPicker(siteId);
    if(page==='hs'){
      const sub = parts[3];
      // Clients get a cut-down H&S area — RAMS/COSHH/TBT/PUWER only, no
      // briefings/HAVS/incidents/my-tools/policy-as-its-own-page/operatives.
      if(isClient(ME) && sub && !['rams','coshh','tbt','puwer','operatives'].includes(sub)){ go(`#/site/${siteId}/hs`); return; }
      if(!sub) return renderHealthSafety(siteId);
      if(sub==='rams' && parts[4]==='boxes' && parts[5]) return renderRamsBoxes(siteId, parts[5]);
      if(sub==='rams' && parts[4]==='new') return renderRamsNew(siteId);
      if(sub==='rams' && parts[4]==='build' && parts[5]) return renderRamsBuild(siteId, parts[5]);
      if(sub==='rams') return renderRams(siteId);
      if(sub==='coshh') return renderCoshh(siteId);
      if(sub==='coshh-pick') return renderCoshhLibraryPick(siteId);
      if(sub==='coshh-save') return renderCoshhSaveToLibrary(siteId);
      if(sub==='tbt'){
        const tbtId = parts[4];
        if(tbtId) return renderToolboxTalkView(siteId, tbtId);
        return renderToolboxTalks(siteId);
      }
      if(sub==='briefings'){
        const bsub = parts[4];
        if(bsub==='fill' && parts[5]) return renderReportFill(siteId, parts[5], true);
        if(bsub==='view' && parts[5]) return renderReportView(siteId, parts[5], true);
        return renderDailyBriefings(siteId);
      }
      if(sub==='havspuwer') return renderHavsPuwer(siteId);
      if(sub==='havs') return renderHavs(siteId);
      if(sub==='puwer'){
        const puwerUserId = parts[4];
        if(puwerUserId) return renderPuwerFill(siteId, puwerUserId);
        return renderPuwer(siteId);
      }
      // LOLER fill/view reuse the same general Reports fill/view routes MC
      // Inspections already shares (see the comment above renderMcInspections)
      // rather than a bespoke hs/loler/fill path — same "return to Reports"
      // limitation until LOLER gets its own bespoke behaviour, same as MC.
      if(sub==='loler') return renderLolerInspections(siteId);
      if(sub==='mytools') return renderMyTools(siteId);
      if(sub==='policy') return renderHsPolicy(siteId);
      // #383: both old routes now land on the merged Operative Dashboard —
      // 'certifications' is kept only so existing back-links/bookmarks
      // still resolve to somewhere valid.
      if(sub==='certifications') return renderOperativeDashboard(siteId);
      if(sub==='operatives') return renderOperativeDashboard(siteId);
      if(sub==='incidents'){
        const isub = parts[4];
        if(isub==='new') return renderIncidentFill(siteId);
        if(isub) return renderIncidentView(siteId, isub);
        return renderIncidents(siteId);
      }
      return renderHealthSafety(siteId);
    }
    if(page==='mc'){
      const site = SITES.find(s=>s.id===siteId);
      const sub = parts[3];
      // Site Rules & Layout applies to every site regardless of
      // site.acting_as_main_contractor, so it stays reachable here. Site
      // Inductions is deliberately Main-Contractor-only — it belongs
      // exclusively under the Main Contractor tile, nowhere else.
      if(sub==='site_layout') return renderSiteLayout(siteId);
      // Main Contractor tiles — everything from here on is only reachable
      // once a site's been switched on for it (see toggleMainContractor /
      // site.acting_as_main_contractor).
      if(!site || !site.acting_as_main_contractor){ go(`#/site/${siteId}/home`); return; }
      if(sub==='programme'){
        const folderId = parts[4] || await ensureMcProgrammeFolderId(siteId);
        return renderDrawings(siteId, folderId, {rootBackHref:`#/site/${siteId}/mc`});
      }
      if(sub==='site_inductions') return renderSiteInductions(siteId);
      if(sub==='subcontractors'){
        const companyId = parts[4];
        const csub = parts[5];
        // Everyone (including operatives) can browse the full subcontractor
        // list here — it's just names, not the companies' own documents. The
        // access boundary sits one level deeper: a subcontractor operative
        // can only open their OWN company's folder, never another
        // subcontractor's, and (#406) not even their own company's folder
        // just because they're assigned to the site — being on
        // site_assignments never implies a subcontractor_operatives
        // allocation.
        if(!companyId) return renderSubcontractors(siteId);
        if(!isManager(ME) && !isClient(ME)){
          const mySubCompanyId = await getMySubcontractorCompanyId(siteId);
          if(companyId!==mySubCompanyId){ toast("You don't have access to that subcontractor."); go(`#/site/${siteId}/mc/subcontractors`); return; }
        }
        if(!csub) return renderSubcontractorHub(siteId, companyId);
        if(csub==='rams') return renderSubRams(siteId, companyId);
        if(csub==='coshh') return renderSubCoshh(siteId, companyId);
        if(csub==='tbt'){
          const tbtId = parts[6];
          if(tbtId) return renderToolboxTalkView(siteId, tbtId);
          return renderSubTbt(siteId, companyId);
        }
        if(csub==='briefings') return renderSubBriefings(siteId, companyId);
        if(csub==='schedule') return renderSubSchedule(siteId, companyId);
        if(csub==='operatives') return renderSubOperatives(siteId, companyId);
        if(csub==='permits'){
          const permitId = parts[6];
          if(permitId) return renderPermitView(siteId, permitId, companyId);
          return renderPermits(siteId, companyId);
        }
        if(csub==='inspections'){
          const folderId = parts[6];
          return renderSubInspections(siteId, companyId, folderId);
        }
        if(csub==='library') return renderSubCompanyLibrary(siteId, companyId);
        return renderSubcontractorHub(siteId, companyId);
      }
      if(sub==='permits'){
        const permitId = parts[4];
        if(permitId) return renderPermitView(siteId, permitId, null);
        return renderPermits(siteId, null);
      }
      if(sub==='inspections'){
        const isub = parts[4];
        if(isub==='templates') return renderMcInspectionTemplates(siteId);
        return renderMcInspections(siteId);
      }
      if(['cpp','asbestos','f10'].includes(sub)) return renderMcDocuments(siteId, sub);
      if(sub==='companylibrary'){
        const masterId = parts[4];
        if(masterId) return renderCompanyLibraryDocs(siteId, masterId);
        return renderCompanyLibraryHub(siteId);
      }
      // Bare #/mc — the Main Contractor tile's own hub page, listing
      // CPP/Site Rules/Inductions/Subcontractors/Permits/Inspections/
      // Asbestos/F10 underneath the single "Main Contractor" tile on Home.
      return renderMcHome(siteId);
    }
    if(page==='ppe') return renderPpe(siteId);
    if(page==='materials') return renderMaterials(siteId);
    if((page==='expenses' || page==='plant') && !canSeeMatTile(SITES.find(x=>x.id===siteId), page)){ go('#/site/'+siteId+'/materials'); return; }
    if(page==='expenses') return renderExpenses(siteId);
    if(page==='activity'){ if(!isManager(ME)){ go(`#/site/${siteId}/home`); return; } return renderSiteActivity(siteId); }
    if(page==='plant') return renderPlant(siteId);
    if(page==='materialrequests') return renderMaterialRequests(siteId);
    if(page==='materialrequired') return renderMaterialRequiredList(siteId);
    if(page==='materialorders'){
      const matFolderId = parts[3] || null;
      return renderMaterialOrders(siteId, matFolderId);
    }
    if(page==='messages') return renderMessages(siteId);
    if(page==='variations') return renderVariations(siteId);
    if(page==='team'){
      if(!isManager(ME)){ toast('Project managers and admins only.'); go(`#/site/${siteId}/home`); return; }
      return renderAssignTeam(siteId);
    }
    if(page==='client-info'){
      if(!isManager(ME)){ toast('Project managers and admins only.'); go(`#/site/${siteId}/home`); return; }
      return renderClientInfo(siteId);
    }
    if(page==='todos'){
      // To Do List is manager-only on a normal site, but a Maintenance /
      // Repair Contract site's Home has its own small tile row (Health &
      // Safety, Calendar, To Do List, Materials) that's meant for the
      // operative too — so let them through here specifically.
      const __site = SITES.find(s=>s.id===siteId);
      if(!isManager(ME) && !(__site && __site.repair_contract)){ toast('Project managers and admins only.'); go(`#/site/${siteId}/home`); return; }
      return renderTodoList(siteId);
    }
    if(page==='onedrive-folder') return renderOneDriveFolderPicker(siteId);
    if(page==='price'){
      const sub = parts[3];
      // A single sub tile's own page — reachable either way, regardless of
      // the Price/Price Sheet landing split flag below.
      if(sub==='element' && parts[4]) return renderPricingElementDetail(siteId, parts[4]);
      // PRICE_BUILDER_LIVE off: Price behaves as the single Pricing Elements
      // page only (no Price/Price Sheet landing split) — see the flag's
      // definition for why.
      if(!PRICE_BUILDER_LIVE) return renderPriceTile(siteId);
      if(sub==='elements') return renderPriceTile(siteId);
      return renderPriceHome(siteId);
    }
    if(page==='pricebuilder'){
      // Not reachable while the rewrite is still in progress — send anyone
      // hitting an old link/bookmark back to the (still fully live) Pricing
      // Elements page instead of a half-finished screen.
      if(!PRICE_BUILDER_LIVE){ go(`#/site/${siteId}/price`); return; }
      const sub = parts[3];
      if(sub==='edit' && parts[4]) return renderPriceBuilderEdit(siteId, parts[4]);
      if(sub==='view' && parts[4]) return renderPriceBuilderView(siteId, parts[4]);
      return renderPriceBuilderSheets(siteId);
    }
    if(page==='calendar') return renderSiteCalendar(siteId);
  }
  renderSites();
}

// Double-tap protection: while one of these saves is still running, a
// second tap on the same button is ignored instead of creating a duplicate.
['addSnag','submitVariation','addMcDocument','uploadOperativeCert','uploadManualPersonCert','confirmScheduleImport','submitIncidentReport','sendBroadcast','addSubCoshh','addHavsTool','addPriceRateItem'].forEach(name=>{
  const original = window[name];
  if(typeof original !== 'function') return;
  let running = false;
  window[name] = async function(){
    if(running) return;
    running = true;
    try{ return await original.apply(this, arguments); }
    finally{ running = false; }
  };
});

registerOneDriveDeepLinkHandler();
init();
