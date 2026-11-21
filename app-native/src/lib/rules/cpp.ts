// Construction Phase Plan builder (Andy, 19 Nov 2026: "when a main contractor build a construction phase plan in the
// construction phase plan tile ... replicate it as a rams style builder, pull through as much info as you have from the
// job"). Modelled on RTB's Richardson Court CPP (18 sections, project directory, emergency numbers, contact sheet,
// site documents). Pure rules only: the plan's shape, the starting wording and the small sums.
//
// Wording uses {company}, {client}, {site}, {advisor}, {wasteLicence}, {siteHours}, {emergencyMobile}. A line whose
// placeholder has nothing to fill it is left out, so "registered waste carriers (licence {wasteLicence})" only shows
// when there is a licence number.

export type CppParty = { name: string; address: string; phone: string; email: string };
export type CppIssue = { copy: string; version: string; issuedTo: string; date: string };
export type CppUtility = { service: string; company: string; phone: string; emergency: string };
export type CppContact = { role: string; name: string; day: string; ooh: string };
export type CppSection = { id: string; num: string; title: string; body: string };
export type CppHospital = { name: string; address: string; phone: string; distance: string; route: string };
/** One issued version: what changed, when, by whom, and its PDF in the CPP folder. */
export type CppRevision = { version: number; date: string; by: string; note: string; docId?: string | null; path?: string | null };
/** A picture's mark-up: the plain picture (map snapshot or photo) and the marks drawn on it, so it can be marked up again. */
export type CppMarks = { base: string | null; ops: unknown[] };
export type CppPlan = {
  pc: CppParty; siteName: string; siteAddress: string;
  version: number; preparedDate: string; preparedBy: string; issues: CppIssue[];
  outline: string; startDate: string; duration: string; siteHours: string; workers: string;
  advisor: string; wasteLicence: string; emergencyMobile: string;
  client: CppParty & { contact: string }; clientAgent: string; principalDesigner: string; architect: string;
  pm: { name: string; phone: string; email: string }; firstAiders: string;
  hse: string; hospital: CppHospital; utilities: CppUtility[]; contacts: CppContact[];
  sections: CppSection[]; sitePlan: string | null; firePlan: string | null;
  sitePlanMarks: CppMarks; firePlanMarks: CppMarks;
  /** Where the A&E search starts from: the job's address and postcode, changeable (Andy, 19 Nov 2026). */
  hospitalFrom: { address: string; postcode: string };
  revisions: CppRevision[];
};

export const cppUid = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const blankParty = (): CppParty => ({ name: '', address: '', phone: '', email: '' });

export const CPP_HSE = 'Health and Safety Executive: www.hse.gov.uk\nReport incidents (RIDDOR) online at www.hse.gov.uk/riddor\nFatal and specified injuries only: 0345 300 9923';
export const CPP_UTILITIES: CppUtility[] = [
  { service: 'Gas', company: 'National Gas Emergency Service', phone: '', emergency: '0800 111 999' },
  { service: 'Electricity', company: 'Power cut (any network)', phone: '', emergency: '105' },
  { service: 'Water', company: '', phone: '', emergency: '' },
  { service: 'Environment Agency', company: 'Incident hotline', phone: '', emergency: '0800 80 70 60' },
];
export const CPP_CONTACT_ROLES = ['Contract Director', 'Contract Manager', 'Project Manager', 'First Aiders', 'HSEQ', 'Architects', 'Principal Designer'];

/** The site documents list at the end of the plan. */
export const CPP_SITE_DOCUMENTS = ['Method Statements', 'Risk Assessments; COSHH assessments; Manual Handling assessments', 'Fire Safety Plan', 'Traffic Routes', 'Contract Appraisals',
  'Statutory Inspections - Places of Work', 'Statutory Inspections - Work and Lifting Equipment', 'Statutory Inspections - Temporary Electrical Equipment',
  'Personal Protective Equipment and Clothing Register', 'Disciplinary Diary', 'Induction Procedure and Site Rules', 'Training Certificate Records', 'Site Attendance Log',
  'Minutes of Safety Meetings', 'Safety Consultants Reports', 'Certificate of Employers Liability Insurance - display on notice board', 'F10 - current to be posted on notice board when applicable'];

/** The 18 sections, in the Richardson Court plan's order and wording (1 is the Project Directory, built from the fields). */
export const CPP_TEMPLATE: Omit<CppSection, 'id'>[] = [
  { num: '2', title: 'Health and Safety Policy Statement and Site Rules', body: `Serving of notices by the Health and Safety Executive
The Principal Contractor must issue written notification to the Client, Principal Designer and all named Designers within 24 hours of receipt of any of the following from the Health and Safety Executive:
• Fee For Intervention (FFI)
• Improvement Notice
• Prohibition Notice
• Summons
2.1 Site Rules
These site rules will be made known to all persons on site by the display of the rules in the Site Office, Canteen and through induction. Any person found having disregard for these rules will be requested to leave site immediately.
1. Hard hats must be worn within the perimeter of the construction site when signage denotes as such.
2. Protective footwear is to be worn within the perimeter of the site.
3. No alcoholic beverages are to be consumed during working hours.
4. No burning of rubbish will take place on site.
5. Only qualified scaffolders to erect, dismantle or adjust scaffolding.
6. Only certified operators are to operate relevant plant.
7. All materials are to be lifted with a mechanical aid if possible.
8. No tomfoolery or horseplay allowed on site.
9. Ladders are to be tied or footed when in use and made safe or stored when the site is closed.
10. Eye, ear and respiratory protection will be issued when the task requires and must be worn.
11. Shorts and short sleeved shirts are the minimum dress requirement.
12. All portable tools and temporary lighting should be 110v maximum.
13. Plant is only to be operated by trained, competent, authorised personnel aged 18 or over.
14. Do not leave any unprotected holes uncovered.
15. If chemicals are to be used ensure that you are acquainted with the COSHH Assessment.
16. All injuries, however trivial, must be reported and recorded in the Site Accident Book.
17. Ensure you know the Site First Aider and Emergency Procedures.
18. Keep welfare facilities clean and tidy and put all rubbish in the bins provided.
19. Keep your work area tidy and do not leave rubbish or equipment where people can trip over it.
20. Do not attempt to lift any load which is too heavy for you; get help.
21. Do not enter barriered off areas unless authorised to do so.` },
  { num: '3', title: 'Professional Safety Advisors Statement', body: `{advisor} where requested will provide health and safety advice and assistance. The service may include the provision of a comprehensive Health and Safety Management System and Policy. Services include but are not restricted to: general working guidance, covering various aspects of our activities enabling us to formulate risk assessments, safe systems of work (method statements) and audits.` },
  { num: '4', title: 'Nature of Project, Existing Environment, Site Clearance & Preparatory Works', body: `The project is to carry out roofing works to {site}. There are no internal works planned - the roof covering is to be installed as per the quotation / order issued.
Access and egress to the scheme will be by a separate access cordoned off to the public. These must remain closed and secure at all times to prevent unauthorised access, and notices must be in place advising of "Construction works in progress".
4.1 The Project (Additional Information)
It is the client's ({client}) responsibility to carry out pre-condition surveys in tenants' homes.
4.2 Existing Environment
The site is an existing building. The area agreed between all parties during the pre-start will be made exclusive to {company}. All deliveries are to be managed to ensure minimal disruption and delivery to the designated area.
4.3 Site Clearance and Preparatory Works
A waste skip will be sited in the designated area of the property and will be removed and replaced by a licensed waste management company as necessary.
4.4 Site Hours
{siteHours}
4.5 Site Layout
The access, egress and fire escape route plan for the site is shown in the appendix to this plan.` },
  { num: '5', title: 'Environmental Controls', body: `{company} recognises its Duty of Care under current legislation for the Environmental Protection Act, the Environmental Protection (Duty of Care) Regulations, the Controlled Waste (Registration of Carriers and Seizure of Vehicles) Regulations, the Hazardous Waste (England and Wales) Regulations and other associated statutory provisions.
"Controlled Waste" will only be released to a "Registered Carrier" after proof (original only) has been produced by the "authorised person". All parts of the "Waste Transfer Note" will be suitably completed with a copy remaining with {company} for no less than 2 years.
Hazardous materials requiring a "Special Waste" carrier licence were not discovered during pre-construction inspections of the site in the contract area. It is believed that no asbestos or other hazardous waste is present in the premises. However, if asbestos is suspected, work will be halted immediately and the Contracts Administrator and Principal Designer will be notified.
Should "Special Waste" be discovered on site during the construction phase of this project it will be released to a "Registered Carrier" only after the completion of a "Special Waste Transfer Note" (SWTN). Pre-notification of the movement will be given to the Environment Agency and a copy of the SWTN will be retained by {company} for no less than 3 years.
All waste will be suitably packed to ensure the safety of others during storage and carriage and also to prevent spillage / leakage, waste blowing or falling or the pilfering of contents by third parties.
There will be no burning of waste of any type at this site.
{company} are registered waste carriers (licence number: {wasteLicence}).` },
  { num: '6', title: 'Arrangements for Controlling Risks to Health and Safety', body: `The following information is a compilation of risks relevant to this site and is in addition to the requirements and controls to be met and detailed in the Health and Safety Policy of {company}.
6.1 General
This will remain a hard hat site whilst on ground level and accessing / egressing the scaffold, with toe protection worn at all times by all trades until the Project Manager deems there is no longer a foreseeable risk of head or foot injury.
All equipment on site is to be 110V or battery powered, with all leads in compliance with current BS 7671.
All steps or ladders are to be either EN 131 Professional or Class 1 ladders, and to be used for access only. Any ladder longer than 3000 mm will require use of a base stabiliser.
Public and communal areas will be maintained free of obstructions at all times and when necessary protected, e.g. guarding of skips. The presence of the general public, surrounding units, staff, delivery personnel and passing traffic will be given due consideration at all times.
Unusual or particularly hazardous processes are not anticipated during the execution of the works.
All operatives have regular toolbox talks on {company} sites where relevant site issues are covered.
An up to date visitors' book will be available to record those persons present on site. All statutory notices required by law will be displayed in suitable positions.
6.2 Asbestos
Asbestos is not thought to be present on this site. However, if asbestos in any form is suspected, work will be halted immediately and not restarted until suitable and sufficient tests have been carried out, and if asbestos is present, it will be removed by a licensed contractor. The Client will be notified if asbestos is suspected.
6.3 Manual Handling
Manual handling operations will be avoided where reasonably practicable by using mechanical or automatic means. Where manual handling operations cannot be avoided, operatives will be instructed in load reduction and suitable lifting and team lifting techniques, using kinetic lifting as a basis.
6.4 Hazardous Substances
Where the use of any such material on site is unavoidable, Safety Data Sheets will be obtained and a COSHH Assessment generated to provide recommendations and precautions necessary for safe use of the product as part of the development of this Health and Safety Plan.
6.5 Noise
The early construction works may generate noise and these noisy works will be carried out as instructed by relevant parties. {company} will comply fully with the statutory requirements of the current Noise at Work Regulations for all operatives within the site, and will ensure the minimum of inconvenience and disturbance is caused to neighbouring premises.
6.6 Electrical Supplies on Site
Temporary 110 volt supply will be used to provide supply to low volt power tools and festoon lighting. A temporary 240 volt supply protected by RCD may also be connected for computers, chargers and low current appliances for welfare needs. All works to be compliant with BS 7671 (IET Wiring Regulations, 18th Edition), installed by competent persons.
6.7 Protection from Falls and Falling Objects
All work at height will be carried out from equipment such as fixed scaffold or mobile tower, supplied, erected, altered and dismantled by a specialist scaffolding contractor in compliance with TG20, the manufacturer's specification and the Work at Height Regulations 2005. {company} will check the scaffold handover certificate / scaff tag before use.
Ladders and stepladders should only be used for access to a platform, or for tasks of short duration (under 30 minutes) where a platform cannot easily be erected. They must be on a secure level base and footed or lashed through the stiles. The top 2 steps of a stepladder must not be used.
Work with or near fragile materials / structures will be carried out under Permit to Work conditions following a detailed Method Statement and Risk / COSHH assessment.
All lifting operations must comply with LOLER 1998 and PUWER 1998. All lifting equipment must be inspected, tested and maintained, hold current certification and be used by competent personnel. Lifting operations will be managed by a competent Banksman / Slinger.
6.8 Storage, Use and Distribution of Materials (Including Hazardous)
Hazardous materials must not be stored within the building. Flammable materials must be stored in small quantities only, within a fire proof container with closed cover / doors at all times, in a cool area clear of any heat source.
All substances must be used and stored in compliance with manufacturer instructions, the COSHH assessment and a suitable safe system of work. Measures must be in place for dealing with accidental spills. Substances must not be disposed of into foul or surface water sewers. Waste must be removed to waste skips by the end of every shift.
6.9 Controlling Dust, Noise and Vibration
Processes emitting excessive dust must be carried out with suitable dust extraction and filtration in operation, e.g. sawing timber board materials. All plant and equipment must be provided with noise and vibration reduction measures where possible. Any restrictions imposed by the local authority or Environment Agency will be upheld.
6.10 Materials
Delivery of materials and removal of waste will be arranged so that all risks to pedestrians and road traffic are minimised. The Project Manager will make suitable arrangements to comply with road traffic regulations. Storage locations are to be clear of access and egress routes, and at no time will material be stacked more than 3 pallets high.
6.11 Security
Access and emergency exits will be safeguarded during the works, maintaining fire exit routes at not less than 900mm wide. All deliveries will be received via a route approved by the client. The working area will be secured at the end of each working day. Signage and barriers will warn of construction dangers. No visitors are allowed on site without the permission of the Client or Contracts Administrator, and all visitors will be escorted at all times.` },
  { num: '7', title: 'Management of Health and Safety, Setting Standards', body: `{company} will appoint a Project Manager who will have the day to day responsibility for ensuring the site is run in a safe manner, as far as is reasonably practicable. A working foreman will be present at all times.
The aims for this project are that:
• All persons working on this development will ensure that safety is of the utmost concern at all times.
• Any breach of safety standards will not be tolerated and may result in dismissal from the development.
• Current CDM Regulations and ACOPs will be regarded as the minimum standards, with the aim of no lost time accidents or dangerous occurrences.
• All operatives working on site receive a Health and Safety induction prior to starting work.
• There is co-operation and co-ordination of activities between all contractors to achieve a safe working environment.
• We consider how works may affect others, particularly the general public, and reduce the impact before work starts.
• The COSHH hierarchy will be adhered to, i.e. should a safer material be available it will be used in preference.
7.1 Good Neighbour Policy
{company}'s objective is to maintain high standards on all our sites. Employees and contractors are encouraged to respect the people and neighbours around them and keep noise and disruption to a minimum. Everyone affected by the works should be advised before it begins, and site supervisors engage with clients and neighbours throughout the project. Any complaints are logged and handled personally by a director of {company}. Traffic movement, deliveries and parking will be kept to a minimum. Site areas should be clean, tidy and well presented with materials stored neatly.` },
  { num: '8', title: 'Information for Contractors', body: `All operatives on this project will be made aware of the risks applicable to them at the beginning of the construction phase. This information will be updated as and when changes occur and supplied to all operatives, employed, self-employed and any other contractors.
The Construction Phase Health and Safety Plan will be brought to the attention of all contractors before they start on site, and they will return full method statements and risk assessments identifying any significant hazards before commencement.
All documentation will be available for inspection by operatives, and {company} will ensure all information that may be required by others is added to the plan, i.e. Health and Safety Policies, COSHH, Noise, PPE, Manual Handling Assessments and Statutory Inspection Registers.` },
  { num: '9', title: 'Development of the Health and Safety Plan', body: `{company}, throughout the life of the project, will develop this Health and Safety Plan. It sets out the arrangements for securing the health and safety of all those carrying out the work and all others who may be affected by it.
{company} will identify the hazards and assess the risks at each of the main stages of the construction phase, and ensure the plan is kept up to date in the light of changing circumstances, design changes or information from contractors. Changes will be notified to all those working on site who may be affected.` },
  { num: '10', title: 'Co-Operation and Communication', body: `All operatives and contractors are required to co-operate fully with other parties on health and safety matters. Anyone who does not co-operate and co-ordinate their activities with others, or prevents them from complying with their duties, will be given a warning and action will follow if it is not put right.
{company} will ensure all contractors are regularly updated with any changes in health and safety matters that may affect them. The views of any person on site can be expressed directly to the Project Manager, and {company} will act on any reasonable health and safety request.
Communication with employees whose first language is not English will use one or more of: allowing adequate time to consult; an interpreter (which may be a trained colleague); translated information checked with native speakers; pictorial information and internationally understood signs; and clear, simple materials where information has to be in English.` },
  { num: '11', title: 'Emergency Procedures', body: `Operatives will be informed at the site induction of fire points and the notices that denote their location, and again if fire point locations change. Arrangements will be made to safeguard access and emergency exits during the works.
{company} has allocated a fire safety co-ordinator for this project to maintain the above and to implement emergency evacuation procedures in the event of serious and imminent danger. Emergency escape routes and fire points will be displayed on the fire plan.
A mobile telephone ({emergencyMobile}) will be allocated to this project for emergency use.
An Accident Book will be kept on site. Any incident reportable under RIDDOR will be recorded and reported by the Site Manager, who must be informed immediately of any occurrence on site.
In Case of an Accident
• DO NOT ATTEMPT TO MOVE ANYONE
• ENSURE THE SAFETY OF OTHER PERSONNEL
• INFORM {company} STAFF AND ALL OTHERS ON SITE
• USE THE MOBILE PHONE TO SUMMON EMERGENCY SERVICES
• THE FIRST AID BOX IS LOCATED IN THE SITE OFFICE
In Case of Fire
• IF SAFE TO DO SO - EXTINGUISH FIRE WITH SITE APPLIANCES
• RAISE THE ALARM BY SHOUTING "FIRE"
• NOTIFY ALL {company} STAFF AND ALL OTHERS ON SITE
• CALL THE EMERGENCY SERVICES
• GO TO THE ASSEMBLY POINT THAT HAS BEEN ESTABLISHED
There will be NO SMOKING on site other than in designated smoking areas. All personnel are responsible for following the emergency procedure and fire plan and reporting to the designated assembly point.` },
  { num: '12', title: 'First Aid', body: `Details of first aiders will be posted on the {company} notice board. Qualified first aiders will be available at all times during site operation, with access to stocked first aid kits, and competent to treat minor wounds or call for additional emergency services.
All accidents and injuries will be recorded in the accident book. All serious injuries or incidents will be investigated and recorded on the {company} Accident Investigation Report form.
Accident and incident reporting will comply with RIDDOR 2013: over 7 day lost time injuries, specified injuries, dangerous occurrences and fatalities.` },
  { num: '13', title: 'Welfare Arrangements', body: `Welfare facilities including drinking water, toilets and rest areas are to be provided on site and will comply with the current Welfare and CDM Regulations as a minimum. Persons using the welfare facilities must leave them in a clean state.` },
  { num: '14', title: 'Information and Training', body: `{company} will ensure no contractor, operative or designer is permitted to work on this development unless considered competent. Contractors will ensure all their employees have at least the minimum health and safety training before the project starts. Any work requiring specific training or competence will require proof of training certificates before work starts.
All hire companies and material suppliers will make adequate health and safety information available for all materials used on site.
Statutory notices will be displayed in prominent positions, including the "Health and Safety Law" poster, a copy of the F10 (where notifiable), the insurance certificate, site rules, PPE requirements and emergency information. Warning signage will be displayed at the entrance to the project area.` },
  { num: '15', title: 'HSE Notification / Health and Safety File', body: `HSE must be notified of the project if the construction work is expected to last longer than 30 working days and have more than 20 workers working at the same time at any point, or to exceed 500 person days.
{company} will ensure information required by the Principal Designer for inclusion in the Health and Safety File is collated and passed to them, and will assist the Principal Designer in producing the file at the completion of the project.` },
  { num: '16', title: 'Arrangements for Monitoring', body: `The Project Manager will monitor the activities of contractors day to day to ensure they work safely and in line with their task specific risk assessments and method statements. Methods of work are vetted before site operations start. The Site Manager can address a contractor's approach to safety first with verbal warnings, followed by a written notice for further breaches.
All plant and equipment will be inspected before use and as legally required, with findings recorded in the plant inspection register. Defective equipment will not be used until repaired, or will be discarded if beyond repair.` },
  { num: '17', title: 'Method Statements and Risk Assessments, COSHH', body: `Risk of fire - hot works permits will be issued with fire extinguishers as stated in the method statements and risk assessments, with escape routes maintained at a minimum of 900mm wide.
All hazardous construction materials will be accompanied by a COSHH assessment prepared by a competent person and made available to the workforce who could be exposed. Subcontractors will advise of any materials they bring to site and provide the COSHH assessments. When buying new materials, a Safety Data Sheet must be requested and a COSHH assessment prepared.` },
  { num: '18', title: 'Fire Plan', body: `Works are a fire risk; a flame will be present during a small part of the works.
Means of Escape
All escape routes from the construction areas are to be clearly marked using fire exit and escape route signs, kept clear, and lit during the hours of darkness. The Fire Warden will make sure fire exit routes are kept clear at all times. If works are carried out on a fire exit route, an alternative route will be shown.
Means of Extinguishing
Fire points with extinguishers will be prominently located and clearly signposted. A foam, CO2 or dry powder extinguisher will be provided. The site office will have its own extinguisher.
Means to Minimise Risk
Rubbish will be removed daily from the site and not allowed to build up. Gas bottles will be stored in a separate fenced compound clearly marked as flammable. Smoking is NOT permitted other than at the designated smoking area.
Hot Works Permits
Comply with the relevant sections of the "Fire Prevention on Construction Sites" code of practice.
Security
Special attention will be paid to maintaining fire exit routes where this conflicts with maintaining security on site.` },
];

// 8am - 5pm by default (Andy, 20 Nov 2026: "change the hours by default to 8am - 5pm in site hours, keep weekend bit in there").
export const CPP_SITE_HOURS = 'The hours on site will be 8.00am - 5.00pm Monday - Friday. Weekend working will only be carried out upon agreement of all parties.';
export const CPP_OLD_SITE_HOURS = 'The hours on site will be 7.00am - 7.00pm Monday - Friday. Weekend working will only be carried out upon agreement of all parties.';

/** A new plan, before the job's details go in. */
export function blankCpp(sections?: Omit<CppSection, 'id'>[] | null): CppPlan {
  return {
    pc: blankParty(), siteName: '', siteAddress: '', version: 1, preparedDate: '', preparedBy: '', issues: [],
    outline: '', startDate: '', duration: '', siteHours: CPP_SITE_HOURS, workers: '', advisor: '', wasteLicence: '', emergencyMobile: '',
    client: { ...blankParty(), contact: '' }, clientAgent: '', principalDesigner: 'N/A', architect: 'N/A',
    pm: { name: '', phone: '', email: '' }, firstAiders: '', hse: CPP_HSE, hospital: { name: '', address: '', phone: '', distance: '', route: '' },
    utilities: CPP_UTILITIES.map((u) => ({ ...u })), contacts: CPP_CONTACT_ROLES.map((role) => ({ role, name: '', day: '', ooh: '' })),
    sections: (sections?.length ? sections : CPP_TEMPLATE).map((s) => ({ ...s, id: cppUid() })), sitePlan: null, firePlan: null,
    sitePlanMarks: { base: null, ops: [] }, firePlanMarks: { base: null, ops: [] }, hospitalFrom: { address: '', postcode: '' }, revisions: [],
  };
}

/** A saved plan (or an older shape of one) with every field present. */
export function normaliseCpp(raw: Partial<CppPlan> | null | undefined): CppPlan {
  const b = blankCpp(), r = raw || {};
  return {
    ...b, ...r,
    pc: { ...b.pc, ...(r.pc || {}) }, client: { ...b.client, ...(r.client || {}) }, pm: { ...b.pm, ...(r.pm || {}) }, hospital: { ...b.hospital, ...(r.hospital || {}) },
    sitePlanMarks: { ...b.sitePlanMarks, ...(r.sitePlanMarks || {}) }, firePlanMarks: { ...b.firePlanMarks, ...(r.firePlanMarks || {}) }, hospitalFrom: { ...b.hospitalFrom, ...(r.hospitalFrom || {}) },
    revisions: Array.isArray(r.revisions) ? r.revisions : [],
    issues: Array.isArray(r.issues) ? r.issues : [], utilities: Array.isArray(r.utilities) ? r.utilities : b.utilities, contacts: Array.isArray(r.contacts) ? r.contacts : b.contacts,
    sections: Array.isArray(r.sections) && r.sections.length ? r.sections.map((s) => ({ ...s, id: s.id || cppUid() })) : b.sections,
    version: Number(r.version) > 0 ? Number(r.version) : 1,
  };
}

/** {company} and friends filled in; a line whose placeholder has nothing to fill it is dropped. */
export function fillCpp(text: string, p: CppPlan): string {
  const v: Record<string, string> = {
    company: p.pc.name.trim(), client: p.client.name.trim(), site: p.siteName.trim(), wasteLicence: p.wasteLicence.trim(), siteHours: p.siteHours.trim(), emergencyMobile: p.emergencyMobile.trim(),
    advisor: p.advisor.trim() || 'Our appointed health and safety advisor',
  };
  if (!v.company) v.company = 'The Principal Contractor';
  if (!v.client) v.client = 'the client';
  if (!v.site) v.site = 'the site';
  return String(text || '').split('\n').filter((line) => !/\{(\w+)\}/.test(line) || [...line.matchAll(/\{(\w+)\}/g)].every((m) => m[1] in v && v[m[1]] !== '')).map((line) => line.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m))).join('\n');
}

/** Is this line a sub-heading ("4.1 The Project", "Means of Escape", "In Case of Fire")? Used by the PDF and the preview. */
export const isCppHeading = (line: string) => /^\d+\.\d+[a-z]?\s+\S/.test(line.trim()) || (/^[A-Z][A-Za-z ()/&-]{2,60}$/.test(line.trim()) && !/[.:;]$/.test(line.trim()) && line.trim().split(/\s+/).length <= 10);

/** Days between two ISO dates, or from a written duration ("6 weeks", "30 days", "3 months"). */
export function durationDays(duration: string): number | null {
  const m = String(duration || '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*(day|week|month|wk)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Math.round(m[2].startsWith('day') ? n : m[2].startsWith('month') ? n * 22 : n * 5);
}
/** F10: more than 30 working days with more than 20 at once, or over 500 person days. */
export function f10Needed(duration: string, workers: string): boolean | null {
  const d = durationDays(duration), w = Number(String(workers || '').replace(/[^\d.]/g, ''));
  if (d === null || !w) return null;
  return (d > 30 && w > 20) || d * w > 500;
}

/** The outline of works from the Schedule of Works: each section, and its tasks underneath. */
export function outlineFromSow(sections: { id: string; name: string }[], tasks: { name: string; section_id: string | null }[]): string {
  const lines: string[] = [];
  sections.forEach((s) => {
    lines.push(s.name.trim());
    tasks.filter((t) => t.section_id === s.id).forEach((t) => lines.push(`- ${t.name.trim()}`));
  });
  tasks.filter((t) => !t.section_id || !sections.some((s) => s.id === t.section_id)).forEach((t) => lines.push(t.name.trim()));
  return lines.filter(Boolean).slice(0, 40).join('\n');
}

/** Straight-line miles between two points. */
export function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3958.8, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The A&E nearest the site from OpenStreetMap hospitals (emergency=yes first). */
export function pickHospital(site: { lat: number; lon: number }, els: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]): CppHospital | null {
  const withPos = els.map((e) => ({ e, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon })).filter((x) => typeof x.lat === 'number' && typeof x.lon === 'number' && x.e.tags?.name) as { e: (typeof els)[number]; lat: number; lon: number }[];
  if (!withPos.length) return null;
  const ae = withPos.filter((x) => x.e.tags?.emergency === 'yes'), pool = ae.length ? ae : withPos;
  const best = pool.map((x) => ({ ...x, mi: milesBetween(site, x) })).sort((p, q) => p.mi - q.mi)[0];
  const t = best.e.tags || {};
  const address = [[t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), t['addr:city'] || t['addr:town'], t['addr:postcode']].filter(Boolean).join(', ');
  return {
    name: t.name, address, phone: t.phone || t['contact:phone'] || '', distance: `${best.mi.toFixed(1)} miles (straight line)${ae.length ? '' : ' - check it has an A&E'}`,
    route: `https://www.google.com/maps/dir/?api=1&origin=${site.lat.toFixed(5)},${site.lon.toFixed(5)}&destination=${best.lat.toFixed(5)},${best.lon.toFixed(5)}&travelmode=driving`,
  };
}

/** What still needs filling in before the plan is issued. */
export function cppMissing(p: CppPlan): string[] {
  const m: string[] = [];
  if (!p.pc.name.trim()) m.push('Principal Contractor');
  if (!p.siteAddress.trim()) m.push('Site address');
  if (!p.outline.trim()) m.push('Outline of works');
  if (!p.hospital.name.trim()) m.push('Nearest A&E');
  if (!p.emergencyMobile.trim()) m.push('Emergency mobile');
  return m;
}

/** Is this name one of our own companies (Ltd / Limited and punctuation ignored)? */
export function isOurCompany(name: string, ours: string[]): boolean {
  const n = (s: string) => String(s || '').toLowerCase().replace(/\b(ltd|limited|plc|llp)\b/g, '').replace(/[^a-z0-9]/g, '');
  const k = n(name);
  return !!k && ours.some((o) => n(o) === k);
}
/** People on the contact sheet who belong to one job (the rest are the company's and carry over). */
const JOB_ROLES = /project manager|first aid|architect|principal designer/i;
/** Fills what a plan is missing (Andy, 20 Nov 2026): the safety advisor, waste carrier licence, HSE details and the
 *  company's contacts (HSEQ, directors…) from the last plan the company made; our address and phone (we're the
 *  principal contractor); 8am - 5pm for the old 7am - 7pm hours; and a client that is really one of our own companies
 *  is cleared ("the client shouldnt pull through company name, we are the main contractor not the client"). Only blanks
 *  are filled, so anything typed stays. */
export function pullThroughCpp(p: CppPlan, src: { prev: CppPlan | null; address: string; phone: string; ours: string[] }): CppPlan {
  const blank = (s: string | null | undefined) => !String(s || '').trim();
  const prev = src.prev;
  const x: CppPlan = { ...p, pc: { ...p.pc }, client: { ...p.client } };
  if (blank(x.advisor) && prev && !blank(prev.advisor)) x.advisor = prev.advisor;
  if (blank(x.wasteLicence) && prev && !blank(prev.wasteLicence)) x.wasteLicence = prev.wasteLicence;
  if ((blank(x.hse) || x.hse === CPP_HSE) && prev && !blank(prev.hse)) x.hse = prev.hse;
  if (blank(x.pc.address)) x.pc.address = src.address.trim() || prev?.pc.address || '';
  if (blank(x.pc.phone)) x.pc.phone = src.phone.trim() || prev?.pc.phone || '';
  if (blank(x.siteHours) || x.siteHours.trim() === CPP_OLD_SITE_HOURS) x.siteHours = CPP_SITE_HOURS;
  if (prev) {
    x.contacts = x.contacts.map((c) => {
      if (!blank(c.name) || JOB_ROLES.test(c.role)) return c;
      const m = prev.contacts.find((q) => q.role.trim().toLowerCase() === c.role.trim().toLowerCase() && !blank(q.name));
      return m ? { ...c, name: m.name, day: m.day, ooh: m.ooh } : c;
    });
  }
  if (isOurCompany(x.client.name, [...src.ours, x.pc.name])) x.client = { ...x.client, name: '', contact: '', phone: '', email: '', address: '' };
  return x;
}

// ----- The job's Site Rules sheet, put into the plan (Andy, 21 Nov 2026: "if a cpp has been completed to include within
// cpp. This then automatically updates the cpp with revision and issues and saves to one drive"). The rules go in as
// the numbered list under "2.1 Site Rules"; the wording around them stays as the company wrote it.
const RULES_HEAD = /^\d+(\.\d+)?\s+Site Rules\b/i;
const NUMBERED = /^\d+\.\s+\S/;
const oneLine = (r: string) => String(r || '').replace(/\s*\n\s*/g, ' ').trim();
/** Where the site rules are in the plan: the section, the heading line, and the numbered lines under it. */
function findRules(p: CppPlan): { si: number; lines: string[]; head: number; from: number; to: number } | null {
  for (let si = 0; si < p.sections.length; si++) {
    const lines = String(p.sections[si].body || '').split('\n');
    const head = lines.findIndex((l) => RULES_HEAD.test(l.trim()));
    if (head < 0) continue;
    // The heading's own lines (the "made known to all persons" wording) come before the first numbered rule.
    let from = head + 1;
    while (from < lines.length && !NUMBERED.test(lines[from].trim()) && !isCppHeading(lines[from])) from++;
    let to = from;
    while (to < lines.length && NUMBERED.test(lines[to].trim())) to++;
    return { si, lines, head, from, to };
  }
  return null;
}
/** The rules the plan has now (empty if it has none). */
export function cppSiteRules(p: CppPlan): string[] {
  const f = findRules(p);
  return f ? f.lines.slice(f.from, f.to).map((l) => l.trim().replace(/^\d+\.\s+/, '')) : [];
}
/** Are the sheet's rules already the plan's rules? */
export function cppHasRules(p: CppPlan, rules: string[]): boolean {
  const want = rules.map(oneLine).filter(Boolean), have = cppSiteRules(p);
  return want.length === have.length && want.every((r, i) => r === have[i]);
}
/** The plan with the sheet's rules as its site rules: in place of the old list, or added to section 2 (or a section of
 *  their own) when the plan has none. */
export function withSiteRules(p: CppPlan, rules: string[]): CppPlan {
  const list = rules.map(oneLine).filter(Boolean).map((r, i) => `${i + 1}. ${r}`);
  const f = findRules(p);
  if (f) {
    const lines = [...f.lines.slice(0, f.from), ...list, ...f.lines.slice(f.to)];
    return { ...p, sections: p.sections.map((s, k) => (k === f.si ? { ...s, body: lines.join('\n') } : s)) };
  }
  const block = ['2.1 Site Rules', 'These site rules will be made known to all persons on site by the display of the rules in the Site Office, Canteen and through induction. Any person found having disregard for these rules will be requested to leave site immediately.', ...list];
  const two = p.sections.findIndex((s) => String(s.num).trim() === '2');
  if (two >= 0) return { ...p, sections: p.sections.map((s, k) => (k === two ? { ...s, body: [String(s.body || '').trimEnd(), ...block].filter(Boolean).join('\n') } : s)) };
  const last = p.sections.reduce((n, s) => Math.max(n, parseInt(String(s.num), 10) || 0), 1);
  return { ...p, sections: [...p.sections, { id: cppUid(), num: String(last + 1), title: 'Site Rules', body: [`${last + 1}.1 Site Rules`, ...block.slice(1)].join('\n') }] };
}
