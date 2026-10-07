/* ================= LABOUR INVOICES ================= */
// Lives as a dropdown inside each Pricing Element's card — visible to
// managers always, and to an operative only once a PM grants them access via
// the element's combined "Select Operatives" picker (toggleElementAccess),
// which grants both price/build-up and labour-invoice access together.
let labourInvoicesSectionOpen = {}; // elementId -> outer "Labour Invoices" dropdown open
let labourInvoicesListOpen = {};    // elementId -> bool, default true (read with !==false above)
let labourInvoicePreview = {path:null, filename:null, loading:false, error:null, sheetHtml:null};
window.uploadLabourInvoices = async function(siteId, elementId, input){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length) return;
  let uploaded = 0;
  for(const file of files){
    const path = siteId+'/invoices/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-_]/gi,'_');
    const stored = await uploadToStorage('labour-invoices', path, file, file.type);
    if(!stored) continue;
    const rows = await dbInsert('labour_invoices', {site_id:siteId, element_id:elementId, filename:file.name, storage_path:stored, content_type:file.type||null, uploaded_by:ME.id});
    if(rows) uploaded++;
  }
  input.value = '';
  if(uploaded){ toast(uploaded===1 ? 'File uploaded' : uploaded+' files uploaded'); render(); }
};
window.deleteLabourInvoice = async function(siteId, fileId, storagePath){
  if(!await customConfirm('Delete this invoice? This can\'t be undone.')) return;
  const rows = await dbSelect('labour_invoices', 'id=eq.'+fileId+'&select=filename');
  const filename = rows[0] && rows[0].filename;
  try{ await sbFetch('/storage/v1/object/labour-invoices/'+storagePath, {method:'DELETE'}); }catch(e){}
  const ok = await dbDelete('labour_invoices', fileId);
  if(ok){
    toast('Invoice deleted');
    logSiteActivity(siteId, 'labour_invoice_deleted', `Deleted labour invoice "${filename||''}"`);
    if(labourInvoicePreview.path===storagePath) labourInvoicePreview = {path:null, filename:null, loading:false, error:null, sheetHtml:null};
    render();
  }
};
window.viewLabourInvoice = async function(siteId, storagePath, filename){
  const isSheet = /\.(xlsx|xls|csv)$/i.test(filename);
  if(!isSheet){
    const res = await sbFetchOD('/functions/v1/labour-invoice-access', {method:'POST', body:JSON.stringify({site_id:siteId, storage_path:storagePath})});
    const d = await res.json();
    if(!res.ok || d.error || !d.url){ toast(d.error || 'Could not open file.'); return; }
    if(/\.pdf$/i.test(filename)){ await viewPdfInApp(d.url, filename); return; }
    await openExternalFile(d.url);
    return;
  }
  labourInvoicePreview = {path:storagePath, filename, loading:true, error:null, sheetHtml:null};
  render();
  try{
    const res = await sbFetchOD('/functions/v1/labour-invoice-access', {method:'POST', body:JSON.stringify({site_id:siteId, storage_path:storagePath})});
    const d = await res.json();
    if(!res.ok || d.error || !d.url){ labourInvoicePreview = {path:storagePath, filename, loading:false, error: d.error || 'Could not load the file.', sheetHtml:null}; render(); return; }
    if(!(await loadLib('XLSX'))){ labourInvoicePreview = {path:storagePath, filename, loading:false, error:'Excel library failed to load — check connection.', sheetHtml:null}; render(); return; }
    const buf = await (await fetch(d.url)).arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const html = XLSX.utils.sheet_to_html(firstSheet, {id:'labourInvoiceSheetTable'});
    labourInvoicePreview = {path:storagePath, filename, loading:false, error:null, sheetHtml:html};
  }catch(e){
    labourInvoicePreview = {path:storagePath, filename, loading:false, error:'Could not open the file.', sheetHtml:null};
  }
  render();
};
window.closeLabourInvoicePreview = function(){ labourInvoicePreview = {path:null, filename:null, loading:false, error:null, sheetHtml:null}; render(); };
