/* ============================================================
   Plain-English save errors (26 Oct 2026, Andy: "when adding lines into the BOQ, i get the
   attached pop up [null value in column "value" ... violates not-null constraint] ... everywhere
   we can input something, or add a line, or upload a document, i dont want to see this in the
   finance ANYWHERE please").
   The database now fills blank boxes on Finance tables itself (fin_fill_defaults, 26 Oct). This is
   the safety net: any database or storage message that still reaches a pop-up is turned into a
   plain sentence. Messages our own checks raise (already plain English) are left alone.
   ============================================================ */
const PLAIN_FIELD = {value:'value', description:'description', name:'name', title:'title', amount:'amount', qty:'quantity', rate:'rate',
  item:'item', work_date:'date', po_number:'PO number', invoice_no:'invoice number', supplier_name:'supplier', number:'number',
  on_hire:'on-hire date', period_start:'start date', period_end:'end date', file_path:'file', category:'category', src_key:'reference'};
function plainDbError(raw){
  const m = String(raw==null ? '' : raw);
  let x;
  if((x = /null value in column "([a-z0-9_]+)"/i.exec(m))){
    const c = x[1];
    if(/(^|_)id$/.test(c)) return 'Something this needs is missing. Refresh the page and try again.';
    return 'Please fill in the '+(PLAIN_FIELD[c] || c.replace(/_/g,' '))+' box.';
  }
  if(/resource already exists/i.test(m)) return 'A file with that name is already there. Rename it and try again.';
  if(/duplicate key value|already exists|23505/i.test(m)) return 'That already exists. Try a different number or name.';
  if(/violates foreign key constraint/i.test(m)) return /delete|update or delete/i.test(m)
    ? 'It’s still used somewhere else, so it can’t be removed yet.'
    : 'Something this links to no longer exists. Refresh the page and try again.';
  if(/violates check constraint/i.test(m)) return 'One of the boxes has a value that isn’t allowed. Check it and try again.';
  if(/row-level security|permission denied|not allowed|42501|new row violates/i.test(m)) return 'You don’t have permission to do that.';
  if(/invalid input syntax for type (numeric|integer|bigint|double|real)|numeric field overflow|out of range for type/i.test(m)) return 'A number box has something that isn’t a number, or is too big.';
  if(/invalid input syntax for type (date|timestamp)|date\/time field value out of range|invalid input value for enum/i.test(m)) return 'One of the dates isn’t valid.';
  if(/value too long/i.test(m)) return 'One of the boxes has too much text.';
  if(/JWT expired|invalid JWT|jwt/i.test(m)) return 'Your sign-in has run out. Sign in again and try once more.';
  if(/payload too large|entity too large|exceeded the maximum allowed size|413/i.test(m)) return 'That file is too big to upload.';
  if(/mime type|invalid mime/i.test(m)) return 'That type of file can’t be uploaded here.';
  if(/^\s*(4\d\d|5\d\d)\s*$/.test(m) || /PGRST\d+|relation "|column "|constraint|syntax error|could not find the|schema cache|function .*does not exist|violates/i.test(m))
    return 'That didn’t save. Please try again. If it keeps happening, let your admin know.';
  return m;
}
// Only rewrites text that looks like it came from the database.
function plainDbText(text){
  const t = String(text==null ? '' : text);
  if(!/null value|duplicate key|violates|row-level security|permission denied|invalid input|out of range|value too long|JWT|PGRST|relation "|column "|constraint|syntax error|schema cache|payload too large|mime type|resource already exists|function .*does not exist/i.test(t)) return text;
  const i = t.indexOf(' — ');
  if(i > 0 && i < 40) return t.slice(0, i)+' — '+plainDbError(t.slice(i+3));
  return plainDbError(t);
}
(function(){
  const se = safeErr;
  safeErr = async function(){ const r = await se.apply(this, arguments); return plainDbError(r); };
  window.safeErr = safeErr;
  const tb = toast;
  toast = function(msg){ return tb.call(this, plainDbText(msg)); };
  window.toast = toast;
  if(typeof customAlert==='function'){
    const ca = customAlert;
    customAlert = function(msg){ const a = Array.prototype.slice.call(arguments); a[0] = plainDbText(msg); return ca.apply(this, a); };
    window.customAlert = customAlert;
  }
  if(typeof finDupKeyCheck==='function'){
    const fd = finDupKeyCheck;
    finDupKeyCheck = async function(){ const r = await fd.apply(this, arguments); if(r && !r.dup) r.msg = plainDbError(r.msg); return r; };
    window.finDupKeyCheck = finDupKeyCheck;
  }
})();
