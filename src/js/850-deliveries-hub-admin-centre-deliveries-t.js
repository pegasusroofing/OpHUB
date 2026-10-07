/* ================= DELIVERIES HUB (Admin Centre "Deliveries" tile) ================= */
// Admin Centre used to show Delivery Schedule and Vehicle Checklists as two
// separate top-level rows; they're now one "Deliveries" tile that lands here
// first — same "hub tile leads to a small pick-one page" pattern as
// renderDashboardChoice just below.
async function renderAdminDeliveriesHub(){
  document.getElementById('app').innerHTML = shell(`
    <div class="tilegrid" style="grid-auto-rows:1fr;">
      <div class="tile" onclick="deliveryScheduleBackHash='#/deliveries';go('#/delivery')">
        <div class="icon" style="background:var(--warn-bg);color:var(--warn);">🚚</div>
        <div class="lbl">Delivery Schedule</div>
      </div>
      <div class="tile" onclick="go('#/vehicle-checklists')">
        <div class="icon" style="background:var(--blue-bg);color:var(--blue);">🚐</div>
        <div class="lbl">Vehicle Checklists</div>
      </div>
    </div>
  `, {title:'Deliveries', back:'#/team', tabs:false});
}