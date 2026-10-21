/* ============================================================
   OpHUB Finance — TRIAL MODE (21 Oct 2026, Andy).
   Finance can be switched on for testing (Settings › Show Finance) without
   anything leaving it: no emails to clients or suppliers, no Xero, no
   purchase orders (also blocked in the database — fin_raise_po needs the
   company's PO switch), nothing pushed to PMs, no new jobs created in
   Projects and no changes written into PM price sheets.
   Set FIN_TRIAL = false (and remove this file's overrides) to go live.
   ============================================================ */
const FIN_TRIAL = true;
if(FIN_TRIAL){
  const __finTrialMsg = 'Finance trial — switched off while testing';
  const __sbFetchLive = sbFetch;
  sbFetch = function(path, opts){
    // Directory may talk to Xero (Andy, 21 Oct): reading customers / suppliers and adding new ones.
    let act = ''; try{ act = JSON.parse((opts && opts.body) || '{}').action || ''; }catch(e){}
    const xeroClientOk = /\/functions\/v1\/xero\b/.test(String(path||'')) && ['status','customers','suppliers','contact','create_contact','connect'].includes(act);
    if(!xeroClientOk && /\/functions\/v1\/(send-finance-email|xero|finance-inbox|finance-ai-read)\b/.test(String(path||''))){
      return Promise.resolve(new Response(JSON.stringify({error: __finTrialMsg}), {status:403, headers:{'Content-Type':'application/json'}}));
    }
    return __sbFetchLive(path, opts);
  };
  window.finInboxSendPm = async function(){ toast(__finTrialMsg+' (not sent to PMs).'); };
  window.openFinNewJob = async function(){ toast(__finTrialMsg+' — set new jobs up in Projects.'); };
}
// Nothing from Finance reaches PMs or their price sheets during the trial.
async function pmToBookCounts(){ return {inv:0, wages:0}; }
async function pmWagePushesHtml(){ return ''; }
async function finOpPushToPm(){ return; }
async function finScSyncSheet(){ return; }
