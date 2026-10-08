/* ================= RAMS BUILDER (trial) — data, library, starter content =================
 * Create RAMS on a job from a company library, then issue a Risk Assessment
 * and a Method Statement as two separate PDFs. Issued PDFs become ordinary
 * rams_docs rows (doc_type 'Risk Assessment' / 'Method Statement'), so the
 * existing signing, client signing, reminders and supersede/re-sign flow
 * all work unchanged. Uploading a ready-made RAMS PDF still works as before.
 *
 * Tables:
 *   rams_library_items  org library — kind 'hazard' | 'section' | 'template'
 *     hazard  data: {harm, p, s, rp, rs, controls:[string]}
 *     section data: {part:'general'|'method', body, steps:[string]}
 *     template data: {hazards:[title], sections:[title], ppe:[key], groups:[string]}
 *   rams_builds          one per RAMS being written for a job; holds its own
 *                        COPIES of hazards/sections so job edits never change
 *                        the library (and library edits never change a job).
 *   organizations.rams_settings  {address, phone, dataProtection, nextRa, nextMs}
 */
const RAMS_PPE = [
  {key:'dust', label:'Dust Mask', icon:'😷'}, {key:'ear', label:'Ear Protection', icon:'🎧'}, {key:'eye', label:'Eye Protection', icon:'🥽'},
  {key:'ffp3', label:'FFP3 Mask', icon:'😷'}, {key:'firstaid', label:'First Aid Kit', icon:'⛑️'}, {key:'hand', label:'Hand Protection', icon:'🧤'},
  {key:'hat', label:'Hard Hat', icon:'⛑️'}, {key:'hivis', label:'Hi Visibility Vest', icon:'🦺'}, {key:'boots', label:'Safety Footwear', icon:'🥾'},
  {key:'harness', label:'Harness', icon:'🪢'}, {key:'face', label:'Face Shield', icon:'🛡️'}, {key:'overalls', label:'Overalls', icon:'👷'},
];
const RAMS_GROUPS = ['Client Staff','Employees','Members of Public','Sub Contractors','Tenants','Visitors','Other Trades'];
const RAMS_P_LABELS = ['', 'Highly Unlikely', 'Unlikely', 'Possible', 'Probable', 'Certain'];
const RAMS_S_LABELS = ['', 'Trivial', 'Minor injury', 'Over 3 Day injury', 'Major injury or condition', 'Incapacity or Death'];
// Colour bands match the RTB RAMS: 15+ red, 10–14 orange, 8–9 yellow, below green.
function ramsRiskBand(rr){
  rr = Number(rr)||0;
  if(rr>=15) return {bg:'#E0301E', fg:'#fff', label:'Urgent'};
  if(rr>=10) return {bg:'#F39237', fg:'#fff', label:'High'};
  if(rr>=8)  return {bg:'#F4E04D', fg:'#1A1D21', label:'Medium'};
  if(rr>=3)  return {bg:'#9BD27A', fg:'#1A1D21', label:'Low'};
  return {bg:'#CFE8C0', fg:'#1A1D21', label:'Very low'};
}
function ramsUid(){ return 'x'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); }
function ramsSettings(){
  const s = (ORG && ORG.rams_settings) || {};
  return {
    address: s.address != null ? s.address : '',
    phone: s.phone != null ? s.phone : '',
    dataProtection: s.dataProtection || `The information and data provided herein applies only to the contract for which it was written, it shall not be duplicated, disclosed or disseminated by the recipient in whole or in part for any purpose whatsoever without the prior written permission from ${(ORG&&ORG.name)||'the company'}.\n\nIt is the duty of all employees to observe the following Risk Assessment framed to provide a code of good practice and conduct with the object of preventing accidents. At all times employees must work in a safe manner both to prevent personal injury to themselves or to other personnel.`,
    nextRa: Number(s.nextRa)||1,
    nextMs: Number(s.nextMs)||1,
  };
}
async function saveRamsSettings(patch){
  const next = Object.assign({}, (ORG && ORG.rams_settings) || {}, patch);
  const row = await dbUpdate('organizations', ME.org_id, {rams_settings: next});
  if(row && ORG) ORG.rams_settings = next;
  return !!row;
}

// ---- Starter library (taken from RTB's own Cleveland Primary School RAMS) ----
const RAMS_STARTER_HAZARDS = [
  ['Tile Bumpa', 'Falling of materials, machine falling', 4,5,2,5, [
    'Check for overhead obstructions, ensure machine is securely fastened to the scaffolding at the top and brakes are on.',
    'Ensure the loading platform is clear from debris and trip hazards. Ensure the path from the top of the hoist to where the tiles are to be taken is clear with no trip hazard. Run the machine with no load to check correct operation.',
    'Ensure the hoist is inspected weekly and results recorded in the LOLER register. The Bumpa hoist will have an in-date thorough examination certificate as per LOLER regs.',
    'Only competent trained operators to use the Bumpa hoist; anyone who has not used these machines before must report to a supervisor who will carry out training. Hoist to be installed on the scaffolding using the clip provided to attach to the handrail.',
    'An exclusion zone will be fitted around the machine and its path so no one apart from the operatives using the hoist can come close to it or walk under it. The zone must be wide enough that a falling load would land inside it. Checked by a supervisor before lifting starts.',
    'Supervisor to monitor and check that the processes are being followed.',
    'The Bumpa will be checked before each use for any damage or missing parts.']],
  ['Paslode Gun', 'Serious injury, death, severe damage to limbs', 4,4,2,4, [
    'Always maintain secure and unobstructed footing when on ladders, platforms and other access-to-height equipment.',
    'When operating the tool at height it should be attached to a suitable tether or lanyard.',
    'ALWAYS point the tool away from yourself and others when clearing jams or removing fasteners. Isolate the tool where possible.',
    'ALWAYS store the tool with the fuel cell and battery removed. Store the fuel cell in the case with the nailer.',
    'Be aware of the potential for ricochets; make sure the opposite side of where the gun is being used is clear.',
    'DO NOT drive fasteners into knots or on top of other fasteners.',
    'DO NOT load fasteners with the trigger and/or work contacting element pressed in.',
    'DO NOT put your face or any other part of your body in the firing line.',
    'NEVER assume the tool is empty. NEVER point the tool at yourself or anyone else. NEVER carry it with a finger on the trigger. NEVER engage in horseplay with the tool.',
    'The gun should be inspected in an isolated condition to ensure all protection systems are in good condition before energising.']],
  ['Material Handling / Distribution', 'Falling objects, machine malfunction, human error', 4,4,2,4, [
    'A rope & wheel will be used to lift awkward and longer items under 50kg — one operative at the bottom and one at the top pulling the material onto the scaffold.',
    'Area where lifting/loading takes place is to be cordoned off from the public.',
    'Only competent operatives are to use the Bumpa machine and the wheel/rope.',
    'Installation of the rope/wheel is by a trained and competent scaffolding company, with maximum lifting instructions handed over to us.',
    'Machine / rope / wheel to be inspected prior to every lift.',
    'Materials are to be delivered as close as possible to the loading area, and part-delivered to minimise storage.',
    'Materials are to be loaded via a tile Bumpa where possible to reduce manual handling.',
    'Operatives are to be manual handling trained.']],
  ['Hand Tools (Use)', 'Bruising, cuts, eye damage — improper use or defective hand tools', 4,3,2,3, [
    'All hand tools are kept in tool bags/boxes when not in use.',
    'All hand tools should be in good condition and must be inspected prior to use.',
    'All tools to be tethered when working at height.',
    'Daily checks of equipment in place; damaged or blunt equipment removed immediately until repaired.']],
  ['Fixed Scaffold Erection', 'Collapse of structure, death / serious injury', 4,5,1,5, [
    'Scaffolding must not be altered by anyone other than the competent scaffolder.',
    'Fixed scaffold to be erected by trained competent scaffolders in compliance with current TG20.',
    'Fixed scaffold to be inspected on completion of erection and a handover certificate issued.',
    'Scaffold access ladders to be closed off and secured or removed outside working shifts.']],
  ['Working At Height', 'Serious injury caused by incorrect selection and use of equipment', 4,5,1,5, [
    'Lone workers are not permitted to work at height.',
    'Tool tethering is required for all tools that have a risk of falling where tethering is possible.',
    'Weather conditions are considered and planned for. Suitable clothing and equipment is provided (including sun protection).',
    'Where there is a risk of falling items or a threat from above, a hard hat must be worn.',
    'Work at height equipment (hop-ups, ladders etc) to be visually inspected prior to each use.',
    'Working at height training is carried out with the staff it affects.']],
  ['Slips Trips and Falls', 'Risk of injury from access/egress hazards that can cause trips & falls', 4,4,1,4, [
    'Good housekeeping standards observed & maintained by operatives throughout the task.']],
  ['Manual Handling', 'Musculoskeletal disorders — twisting, over-reaching, poor technique, load too heavy', 4,3,1,3, [
    'Manual handling training is provided.',
    'Team lifting to be used when loads are heavy or awkward.']],
  ['Access/Egress', 'Slips, trips and falls, fractures, collisions', 4,1,1,1, [
    'Access to the roof is via designated ladder access to scaffold lifts, clipped tight and removed by the MC at the end of each shift.',
    'Work in particularly busy areas to be programmed for quieter times of day.',
    'Exclusion zones around access points and loading areas (ginny wheel, Bumpa hoist). Works only proceed once exclusion zones are in place.',
    'Fencing or barriers with signage highlighting the dangers of falling objects.',
    'Take extra care crossing roads and around pedestrians when moving tools and materials.']],
  ['Loading / Unloading Deliveries', 'Serious injury, crushing, death', 4,1,1,1, [
    'Drivers coming onto site receive instructions on vehicle movement restrictions and loading/unloading areas.',
    'Deliveries mostly unloaded by the driver; staff only assist when authorised by the manager.',
    'Gloves are to be worn. Lifting aids used where possible (ginny wheel and/or tile Bumpa).',
    'Materials unloaded into the designated storage area. Unloading supervised by the driver where required.']],
  ['Working With Lead', 'Burns, inhalation, poisoning, death', 4,1,1,1, [
    '1 hour firewatch after the lead burning kit has been extinguished at the end of the shift.',
    'Fire extinguishers to be present during works. Hot works permit issued daily.',
    'Portable Oxyturbo lead welding kit to be used and taken off site after each shift.',
    'Gloves are to be worn when working with lead.',
    'Visual inspection of equipment before use; defective equipment reported and not used.']],
  ['Noise', 'Hearing damage', 4,1,1,1, [
    'All staff must wear appropriate ear defenders in noisy areas.',
    'Staff rotation in place to reduce exposure to noise.',
    'Where noise is likely to be above 80 dB(A) a noise assessment is carried out and hearing protection provided.',
    'Where possible, less noisy work equipment will be used.']],
];
const RAMS_STARTER_SECTIONS = [
  ['general','Communication with Other Workers on Site','All staff will report to the site office for induction on arrival at the site. The site manager will inform staff of any hazards present on site. Staff will inform the site manager of the work to be carried out and how it could affect other trades.\n\nWhere necessary notices will be posted advising of any hazards present during the works. Where contractor activities cross, the senior person must liaise with the other trades to ensure safe operation.',[]],
  ['general','First Aid','It is the responsibility of the Main Contractor to ensure adequate First Aid provision for its staff — a trained first aider, suitable first aid equipment and/or an appointed person at the minimum. All staff when inducted will be made aware of the location of the First Aid kit.',[]],
  ['general','Manual Handling','All staff and contractors have been instructed on the potential dangers of manual handling and have received manual handling training. Equipment provided to reduce manual handling must be used where possible. Heavy or awkward items will be split into smaller units or dual lifted.',[]],
  ['general','Material Handling','All materials will be unloaded to a designated unloading and storage area away from the work area as far as practicable, kept tidy to minimise trip hazards. When stacking materials care must be taken to ensure the stack is secure.',[]],
  ['general','Personal Protective Equipment (PPE)','PPE will be provided as a last form of protection against a hazard. Wearing of PPE is mandatory on all client contracts: safety boots (EN20345 with midsole), hi-visibility clothing, hard hat (EN397), gloves (EN388) and glasses (EN166) at all times. Other PPE such as hearing protection, face-fit tested FFP2/FFP3 masks and face shields are worn as determined by the risk assessment.',['Impact goggles — drilling, cutting','Ear defenders — drilling, cutting','Face-fit dust mask — drilling, cutting (certificate available on site)']],
  ['general','Preparation and Induction','Staff and contractors will be inducted onto site to understand the hazards present and the tasks taking place, and advised of other site activities that could impact their work. Staff will follow all site rules and safety procedures.',[]],
  ['general','Staff and Training','The task will be carried out by our own trained, qualified and experienced operatives holding suitable qualifications for this project (working at height, CSCS, manual handling, asbestos awareness).',[]],
  ['general','Tools and Electrical Equipment','All tools and equipment will be visually inspected regularly; defective or damaged equipment removed from service. Electrical tools will be 110V or battery operated where possible. Portable electrical equipment must be PAT tested every 3 months on construction sites.',[]],
  ['general','Welfare','The principal contractor is responsible for providing adequate washing, toilet, drying and refreshment facilities. Staff are responsible for keeping welfare facilities clean.',[]],
  ['general','Controlling Dust — Drilling and Cutting','During cutting of tiles / installation of loft insulation dust may be created. Correct PPE including a face-fitted dust mask must be worn. All cutting equipment must have dust suppression or extraction; cutting areas ventilated and restricted to authorised persons.',[]],
  ['general','Daily Briefings','The working foreman carries out a daily briefing on the location and scope of works for the day with any notable risks/hazards, documented daily.',[]],
  ['general','Loading / Weight','Loading of materials will be kept to a minimum to prevent overloading trusses/joists and materials falling through the scaffold. Materials are transported to the roof via a Bumpa machine and/or rope & wheel.',[]],
  ['general','Plant & Tool Register','All tools are to be visually inspected prior to use, with exclusion zones for any plant/tools that require it.',['Paslode gun','Hand tools (hammer, stapler, knife, handsaw)','Petrol grinder (refuel off site, exclusion zone while running)','Bumpa machine (exclusion zone required)','Circular saw']],
  ['general','Waste Management','',['Waste cleared regularly from each elevation into skips supplied and managed by us','Waste segregated where applicable','Waste disposed of via the chute and/or ginny wheel','Do not overload skips — report a full skip to the site manager']],
  ['general','Working at Height','All working at height will be properly planned, organised and supervised; only operatives with a working at height certificate will work at height. The site foreman ensures conditions are safe before work at height starts. All company access equipment is inspected regularly and damaged equipment withdrawn immediately.',[]],
  ['general','Working with COSHH Materials','',['COSHH assessments to be followed','COSHH materials stored in designated storage','Kept out of direct sunlight/heat where required','Staff at risk instructed on safe clean-up and disposal']],
  ['method','Pitched Roof Strip & Renewal (Refurbishment)','Attend site to strip the existing roof covering and replace with new. Works carried out off a scaffold with adequate fall protection in place.',[
    'Scaffolding erected to access the roof (by others) — handed over and visually inspected by our working foreman before we start; concerns reported to the site manager.',
    'Remove existing roof covering (tiles/slates, felt & battens) working from the top down in sections that can be made watertight; waste into the skip via the chute/pulley.',
    'Working from the top down lets operatives stand on the battens as a safe footing.',
    'Install the eaves system side to side.',
    'From the bottom up, using the scaffold as the starting platform, roll out and fix the breather membrane.',
    'Fix timber battens to each rafter using a Paslode gun, forming the "ladder" for access up the roof.',
    'Once an elevation is felt and battened, set up the Bumpa with an exclusion zone and load tiles to the roof — one man up, one man down.',
    'Load tiles onto the battens spread across the rafters so weight is evenly distributed.',
    'Tile as a rake so there is always a standing point on the battens; use ladders near completion if the pitch requires.',
    'Install ridges as we tile (dry vented system); use a ridge ladder if required.',
    'Leadwork as per its own method statement.',
    'On completion clear all leftover materials and waste via the ginny wheel and/or chute.']],
  ['method','Leadworks','',[
    'Hot works permit required daily when lead welding.',
    'All lead welding using a portable Oxyturbo kit, removed from site after each shift.',
    'Load lead to the working area (cut down to reduce weight where required).',
    'Install building paper to the surface.',
    'Cut and dress lead to suit the substructure following manufacturer\'s guidelines.',
    'Weld gussets and corners as required.',
    'Oil lead on completion.',
    '1 hour firewatch to be carried out.']],
];
const RAMS_STARTER_TEMPLATE = {
  title:'Pitched Roof Strip & Renewal',
  data:{hazards: RAMS_STARTER_HAZARDS.map(h=>h[0]), sections: RAMS_STARTER_SECTIONS.map(s=>s[1]),
    ppe:['dust','ear','eye','ffp3','firstaid','hand','hat','hivis','boots'], groups:['Client Staff','Employees','Members of Public','Sub Contractors','Tenants']},
};
async function ramsLoadLibrary(){
  return await dbSelect('rams_library_items', 'org_id=eq.'+ME.org_id+'&order=sort_order.asc,title.asc');
}
async function ramsSeedLibrary(){
  const rows = [];
  RAMS_STARTER_HAZARDS.forEach((h,i)=>rows.push({org_id:ME.org_id, kind:'hazard', title:h[0], sort_order:i, created_by:ME.id,
    data:{harm:h[1], p:h[2], s:h[3], rp:h[4], rs:h[5], controls:h[6]}}));
  RAMS_STARTER_SECTIONS.forEach((s,i)=>rows.push({org_id:ME.org_id, kind:'section', title:s[1], sort_order:i, created_by:ME.id,
    data:{part:s[0], body:s[2], steps:s[3]}}));
  rows.push({org_id:ME.org_id, kind:'template', title:RAMS_STARTER_TEMPLATE.title, sort_order:0, created_by:ME.id, data:RAMS_STARTER_TEMPLATE.data});
  return await dbInsert('rams_library_items', rows);
}
// Library row → a job copy (fresh id so the same hazard can be added twice
// and edited independently).
function ramsHazardFromLib(it){
  const d = it.data||{};
  return {id:ramsUid(), libId:it.id, title:it.title, harm:d.harm||'', p:d.p||1, s:d.s||1, rp:d.rp||1, rs:d.rs||1, controls:(d.controls||[]).slice()};
}
function ramsSectionFromLib(it){
  const d = it.data||{};
  return {id:ramsUid(), libId:it.id, part:d.part==='method'?'method':'general', title:it.title, body:d.body||'', steps:(d.steps||[]).slice()};
}
