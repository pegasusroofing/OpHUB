/* ================= MULTI-SITE SUB-ADDRESSES: geofence pattern re-parameterized to
   target a site_sub_addresses row instead of a sites row. Mirrors
   openGeoOptions/geoOptionManual/geoOptionClick/saveManualGeo/setGeofence/
   setGeofenceRadius above exactly — reuses parseCoordToken/splitCoordPair/
   updateGeoMapLink as-is since they're generic. ================= */
async function saveSubGeofenceCoords(subId, lat, lon){
  const row = await dbUpdate('site_sub_addresses', subId, {geofence_lat:lat, geofence_lon:lon});
  if(row){
    toast('Address location saved — now choose the check-in distance below');
    checkinGeofenceOpen = true;
    render();
  }
}
window.setSubGeofence = async function(subId){
  if(!orgAllowsGps()){ toast('GPS check-in & geofencing needs OpHUB Pro or above.'); return; }
  toast('Getting GPS lock…');
  const g = await getGeo();
  if(g.error){ toast(g.error); return; }
  const row = await dbUpdate('site_sub_addresses', subId, {geofence_lat:g.lat, geofence_lon:g.lon});
  if(row){
    toast('Address location saved — now choose the check-in distance below');
    checkinGeofenceOpen = true;
    render();
  }
};
window.setSubGeofenceRadius = async function(subId, radius){
  const row = await dbUpdate('site_sub_addresses', subId, {geofence_radius_m: radius});
  if(row){ toast('Check-in distance set to '+radius+'m'); render(); }
};
window.openSubGeoOptions = function(subId){
  if(!orgAllowsGps()){ toast('GPS check-in & geofencing needs OpHUB Pro or above.'); return; }
  let ov = document.getElementById('geoModalOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'geoModalOverlay';
    ov.className = 'geo-modal-overlay';
    ov.onclick = (e)=>{ if(e.target===ov) closeGeoModal(); };
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div class="geo-modal-card">
      <h3>Set address location</h3>
      <p class="stub">Choose how to set the GPS point operatives must check in near for this address.</p>
      <button class="geo-modal-btn" onclick="geoOptionManualSub('${subId}')">Input GPS Co-Ordinates<span class="sub2">Type in latitude &amp; longitude</span></button>
      <button class="geo-modal-btn" onclick="geoOptionClickSub('${subId}')">Click for GPS Co-Ordinates<span class="sub2">Use this device's current location</span></button>
      <button class="geo-modal-cancel" onclick="closeGeoModal()">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
};
window.geoOptionClickSub = async function(subId){
  closeGeoModal();
  await window.setSubGeofence(subId);
};
window.geoOptionManualSub = function(subId){
  const ov = document.getElementById('geoModalOverlay');
  if(!ov) return;
  ov.innerHTML = `
    <div class="geo-modal-card">
      <h3>Input GPS Co-Ordinates</h3>
      <p class="stub">Paste or type this address's latitude and longitude — plain decimal (51.51828) or Google's degrees/minutes/seconds format (51°31'05.8"N) both work. You can also paste a full pair straight from Google into the Latitude box and it'll split itself.</p>
      <div class="formfield"><label class="field-label">Latitude</label><input type="text" id="geoManualLat" placeholder="e.g. 51.51828 or 51°31'05.8&quot;N" oninput="updateGeoMapLink()"></div>
      <div class="formfield"><label class="field-label">Longitude</label><input type="text" id="geoManualLon" placeholder="e.g. -0.15139 or 0°09'05.0&quot;W" oninput="updateGeoMapLink()"></div>
      <p id="geoManualPreview" class="stub" style="display:none;font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;margin:-6px 0 6px;"></p>
      <a id="geoManualMapLink" class="stub" style="display:none;margin:0 0 12px;color:var(--blue);" href="#" target="_blank" rel="noopener">Find this spot on the map ↗</a>
      <button class="darkbtn" style="width:100%;" onclick="saveManualGeoSub('${subId}')">Save Location</button>
      <button class="geo-modal-cancel" onclick="openSubGeoOptions('${subId}')">‹ Back</button>
    </div>`;
};
window.saveManualGeoSub = async function(subId){
  const lat = parseCoordToken(document.getElementById('geoManualLat').value);
  const lon = parseCoordToken(document.getElementById('geoManualLon').value);
  if(!isFinite(lat) || !isFinite(lon) || lat<-90 || lat>90 || lon<-180 || lon>180){
    toast('Could not read that as a co-ordinate — use decimal (51.51828) or degrees/minutes/seconds (51°31\'05.8"N).');
    return;
  }
  closeGeoModal();
  await saveSubGeofenceCoords(subId, lat, lon);
};
