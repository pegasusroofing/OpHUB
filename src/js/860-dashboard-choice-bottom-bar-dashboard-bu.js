/* ================= DASHBOARD CHOICE (bottom bar "Dashboard" button) ================= */
// The bottom bar's Dashboard button used to jump straight to the company
// overview dashboard. Now it stops here first so a PM/admin can pick
// between that and the Delivery Dashboard (the Delivery Schedule PM view).
async function renderDashboardChoice(){
  document.getElementById('app').innerHTML = shell(`
    <div class="tilegrid" style="grid-auto-rows:1fr;">
      <div class="tile" onclick="go('#/dashboard')">
        <div class="icon" style="background:var(--blue-bg);color:var(--blue);">📊</div>
        <div class="lbl">Dashboard</div><div class="sub">Company-wide overview</div>
      </div>
      <div class="tile" onclick="deliveryScheduleBackHash='#/dashboard-choice';go('#/delivery')">
        <div class="icon" style="background:var(--warn-bg);color:var(--warn);">🚚</div>
        <div class="lbl">Delivery Dashboard</div><div class="sub">This week's deliveries</div>
      </div>
    </div>
  `, {title:'Dashboard', back:'#/sites', tabs:false});
}
