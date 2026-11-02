/* ============================================================
   File uploads go up two at a time (2 Nov 2026, Andy: "the app is freezing uploading photos to M&S liverpool").
   Each photo is three files (full, medium, small). Choosing several photos at once sent them all together;
   every upload is checked by the database's file rules (about half a second of work each), and a pile of them
   at once, plus the automatic retries when the first ones were slow, kept the server busy for minutes —
   uploads timed out (504/544) and the page looked frozen. Now uploads queue and go two at a time, and the
   time limit only starts once a file is actually being sent.
   ============================================================ */
(function(){
  const base = fetchWithTimeout;
  const MAX = 2;
  let running = 0;
  const waiting = [];
  const isUpload = (url, opts)=> typeof url==='string' && url.indexOf('/storage/v1/object/')>=0 && url.indexOf('/storage/v1/object/sign/')<0
    && opts && /^(POST|PUT)$/i.test(opts.method||'');
  const next = ()=>{ if(running<MAX && waiting.length){ running++; waiting.shift()(); } };
  fetchWithTimeout = function(url, opts, ms){
    if(!isUpload(url, opts)) return base.apply(this, arguments);
    const self = this, args = arguments;
    return new Promise(go=>{ waiting.push(go); next(); }).then(()=>{
      let p;
      try{ p = Promise.resolve(base.apply(self, args)); }catch(e){ p = Promise.reject(e); }
      return p.finally(()=>{ running--; next(); });
    });
  };
  window.fetchWithTimeout = fetchWithTimeout;
})();
