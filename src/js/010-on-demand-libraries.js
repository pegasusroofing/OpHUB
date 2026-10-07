/* ================= on-demand libraries ================= */
const LIB_SRC = {
  XLSX: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  ExcelJS: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  PDFLib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  pdfjsLib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
};
const _libLoading = {};
function _libReady(name){
  if(name==='PDFLib') patchPdfLibText(window.PDFLib);
  if(name==='pdfjsLib' && window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions){
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}
// Resolves true once the named library (XLSX / ExcelJS / PDFLib / pdfjsLib)
// is available, loading it first if it isn't yet; false if it could not be
// loaded (offline, CDN blocked). Safe to call repeatedly and concurrently.
function loadLib(name){
  if(window[name]){ _libReady(name); return Promise.resolve(true); }
  if(!_libLoading[name]){
    _libLoading[name] = new Promise(resolve=>{
      const el = document.createElement('script');
      el.src = LIB_SRC[name]; el.async = true;
      el.onload = ()=>{ if(window[name]){ _libReady(name); resolve(true); } else { delete _libLoading[name]; resolve(false); } };
      el.onerror = ()=>{ delete _libLoading[name]; el.remove(); resolve(false); };
      document.head.appendChild(el);
    });
  }
  return _libLoading[name];
}
// Called once the first screen has painted: fetches the libraries one at a
// time in the background so the first export/upload doesn't have to wait
// for a download, without getting in the way of start-up itself.
let _libWarmupStarted = false;
function warmUpLibs(){
  if(_libWarmupStarted) return;
  _libWarmupStarted = true;
  const run = async ()=>{
    if(navigator.onLine === false) { _libWarmupStarted = false; return; }
    for(const name of ['PDFLib','XLSX','pdfjsLib','ExcelJS']){ try{ await loadLib(name); }catch(e){} }
  };
  setTimeout(()=>{ (window.requestIdleCallback || (fn=>setTimeout(fn, 1)))(run); }, 2500);
}
// Standard PDF fonts (Helvetica etc.) can only draw the WinAnsi character
// set. pdf-lib throws on anything else — an emoji, a tick, a Polish "ł", or
// even a line break when measuring text — and one such character anywhere
// in a task name, note or site name used to fail the entire export. This
// patches pdf-lib once so unsupported characters are swapped for a close
// plain equivalent (or dropped) instead: the export always builds.
function patchPdfLibText(P){
  if(!P || P.__ophubTextPatched || !P.PDFFont) return;
  P.__ophubTextPatched = true;
  const proto = P.PDFFont.prototype;
  const origEncode = proto.encodeText, origWidth = proto.widthOfTextAtSize;
  const SWAP = {'✓':'', '✔':'', '✗':'x', '✘':'x', '⚠':'!', '→':'->', '←':'<-', '≥':'>=', '≤':'<=', ' ':' ', '‑':'-', '‐':'-', '−':'-', '️':'', '​':'', '‍':''};
  function safeText(font, text){
    let set = font.__ophubCharSet;
    if(set === undefined){ try{ set = new Set(font.getCharacterSet()); }catch(e){ set = null; } font.__ophubCharSet = set; }
    let out = '';
    for(const ch of String(text == null ? '' : text)){
      const cp = ch.codePointAt(0);
      if(set ? set.has(cp) : (cp >= 32 && cp <= 126)){ out += ch; continue; }
      if(ch === '\n' || ch === '\r' || ch === '\t'){ out += ' '; continue; }
      if(SWAP[ch] !== undefined){ out += SWAP[ch]; continue; }
      // Accented Latin letters outside WinAnsi (ł, ś, ž…): fall back to the
      // unaccented base letter where there is one.
      const base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g,'') : '';
      if(base && base !== ch && [...base].every(b=> set ? set.has(b.codePointAt(0)) : b.charCodeAt(0) <= 126)){ out += base; continue; }
      if(ch === 'ł') out += 'l'; else if(ch === 'Ł') out += 'L';
      // anything else (emoji, symbols) is dropped
    }
    return out.replace(/ {2,}/g,' ');
  }
  proto.encodeText = function(text){
    try{ return origEncode.call(this, text); }
    catch(e){ return origEncode.call(this, safeText(this, text)); }
  };
  proto.widthOfTextAtSize = function(text, size){
    try{ return origWidth.call(this, text, size); }
    catch(e){ return origWidth.call(this, safeText(this, text), size); }
  };
}
