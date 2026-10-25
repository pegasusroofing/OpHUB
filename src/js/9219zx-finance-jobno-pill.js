/* Finance › Projects list: every job number pill is the same size (Andy 26 Oct, "fix it in width and
   height"). Long ones are cut short with "…" and show in full when you hover. */
(function(){
  const st = document.createElement('style');
  st.textContent = `.fggrid .fgjob{display:inline-block !important;text-align:center;box-sizing:border-box;width:76px !important;min-width:76px !important;max-width:76px !important;height:26px !important;padding:0 6px !important;overflow:hidden !important;white-space:nowrap !important;text-overflow:ellipsis !important;font-size:11.5px !important;line-height:23px !important;border-radius:8px !important;vertical-align:middle;}
.fggrid td[data-l="Job"]{width:92px;}`;
  document.head.appendChild(st);
})();
