/* Finance › project › Sales: the first column (Application / Invoice) lines up under its title and
   filter box, centred like the other columns (Andy 27 Oct). */
(function(){
  const st = document.createElement('style');
  st.textContent = `@media (min-width:701px){
  .finsalesub .finreptbl-wrap .fininvtbl thead th:first-child, .finsalesub .finreptbl-wrap .fininvtbl tbody td:first-child{text-align:center !important;}
}`;
  document.head.appendChild(st);
})();
