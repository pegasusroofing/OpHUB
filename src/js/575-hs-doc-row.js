/* ================= Compact H&S document rows (RAMS / COSHH / TBT) =================
   #(hs-compact) 2026-10-17 (Andy): manager rows are one tidy line — name,
   a small "x/y signed" pill and a ▾ menu holding every action — with who
   has / hasn't signed underneath as plain text. Operatives keep the big
   "Tap to sign" box. */
function hsSignPill(done, total, extra){
  if(!total) return `<span class="hspill">${done} signed${extra||''}</span>`;
  const all = done>=total;
  return `<span class="hspill ${all?'ok':'warn'}">${all?'✓ ':''}${done}/${total} signed${extra||''}</span>`;
}
function hsSignersHtml(signed, waiting){
  // signed: [{name, date}], waiting: [name]
  if(!signed.length && !waiting.length) return '';
  const d = t=>new Date(t).toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  return `<div class="hssig">${signed.map(x=>`<span class="ok">✓ ${escapeHtml(x.name)}${x.date?` <i>${d(x.date)}</i>`:''}</span>`).join('')}${waiting.map(n=>`<span class="no">○ ${escapeHtml(n)}</span>`).join('')}</div>`;
}
function hsDocRowHtml(o){
  return `<div class="hsdoc ${o.sel?'sel':''}">
    <div class="hsdoc-top">
      ${o.selHtml||''}
      <div class="hsdoc-main"><div class="hsdoc-name" title="${escapeHtml(o.name)}">${escapeHtml(o.name)}</div>${o.meta?`<div class="hsdoc-meta">${o.meta}</div>`:''}</div>
      ${o.pill||''}
      ${o.menu||''}
    </div>
    ${o.body||''}
  </div>`;
}
