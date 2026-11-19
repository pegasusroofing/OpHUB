// Admin Centre sections (260 ADMIN_PAGES / ADMIN_ITEMS): where each lives,
// what it's called, who sees it, and its screen in the new app (null = still
// in the current app for now).
// The tabs (Andy, 18 Nov 2026: "keep tab style but add into the main admin tabs for finance settings, then a project
// settings etc"): People · Projects · Finance · H&S · Company. Projects has what was under Libraries for jobs (job
// numbers, works and pricing, reports); Finance has each part of Finance's settings as its own row; H&S has the policy,
// libraries and registers.
// Then sub tabs (Andy, the same day: "can we make the admin centre more tab style please and sub tabs"): each tab's
// rows are a second row of tabs, and the one chosen opens straight under them (components/AdminTabs).
import { isBetaSite } from '@/lib/betaOnly';
import { isFinanceUser, isFullManager, isManager } from '@/lib/roles';
import { can } from '@/lib/rules/rolePerms';
import type { Organization, Profile } from '@/lib/types';

export type AdminPage = 'people' | 'projects' | 'finance' | 'hs' | 'company';
export const ADMIN_PAGES: Record<AdminPage, { label: string; sub: string; icon: string; show: (me: Profile, org: Organization | null) => boolean }> = {
  people: { label: 'People', sub: 'Users · Roles · Phones · Check-in logs', icon: '👥', show: (me) => isManager(me) },
  projects: { label: 'Projects', sub: 'Job numbers · Works & pricing · Reports', icon: '🏗', show: (me) => isManager(me) },
  finance: { label: 'Finance', sub: 'Invoices · VAT · Purchases · Xero', icon: '💷', show: (me, org) => isManager(me) && isFinanceUser(me, org) },
  hs: { label: 'H&S', sub: 'Policy · RAMS · COSHH · Toolbox talks', icon: '🦺', show: (me) => isManager(me) },
  company: { label: 'Company', sub: 'Logo · Theme · Integrations', icon: '🎨', show: (me) => me.role === 'admin' },
};
/** Old links to a tab that has moved. */
export const OLD_ADMIN_PAGE: Record<string, AdminPage> = { libraries: 'projects' };

export type AdminItem = { key: string; page: AdminPage; group: string; icon: string; label: string; sub: string; kw: string; route: string | null; show: (me: Profile, org: Organization | null) => boolean };
const admin = (me: Profile) => me.role === 'admin';
const fin = (me: Profile, org: Organization | null) => isFinanceUser(me, org);
/** A group of Finance's settings, on one page from the Admin Centre (the same parts as on Finance › Settings). */
export const FIN_GROUPS: Record<string, string[]> = { sales: ['inv', 'bill', 'def'], vatohp: ['vat', 'ohp'], buy: ['po', 'pi', 'inbox'], xero: ['xero'] };
const finPart = (key: string, group: string, label: string, sub: string, kw: string, show = fin): AdminItem =>
  ({ key: `fin_${key}`, page: 'finance', group, icon: '💷', label, sub, kw: `finance ${kw}`, route: `/pm/admin/finsettings?part=${key}`, show });
export const ADMIN_ITEMS: AdminItem[] = [
  { key: 'invites', page: 'people', group: 'Team', icon: '✉️', label: 'Invites', sub: 'Invite links and pending invites', kw: 'invite link join', route: '/pm/admin/invites', show: (u) => isManager(u) && can(u, 'people') },
  { key: 'users', page: 'people', group: 'Team', icon: '👥', label: 'Users', sub: 'Roles, passwords, removing people', kw: 'user role admin pm estimator operative driver', route: '/pm/admin/users', show: (u) => isManager(u) && can(u, 'people') },
  { key: 'roles', page: 'people', group: 'Team', icon: '🏷', label: 'Roles', sub: 'Your list of roles and what each one uses', kw: 'role roles job title contracts administrator quantity surveyor document controller contracts manager money on home', route: '/pm/admin/roles', show: admin },
  // Office roles get See Material Costs on Admin › Roles. Operatives one by one: hidden (Andy, 18 Nov 2026: "what is the need
  // for material costs for operatives?" ... "Yes, remove it"; nobody had it on). The page and the setting are kept.
  { key: 'matcosts', page: 'people', group: 'Team', icon: '💷', label: 'Material Costs For Operatives', sub: 'Which operatives see material prices', kw: 'material costs prices see operatives cost', route: '/pm/admin/matcosts', show: () => false },
  { key: 'devicelocks', page: 'people', group: 'Team', icon: '📱', label: 'Device Locks', sub: 'One phone = one person', kw: 'device phone lock approve', route: '/pm/admin/devicelocks', show: (u) => isFullManager(u) && can(u, 'people') },
  { key: 'checkinlogs', page: 'people', group: 'Logs', icon: '📍', label: 'Check-In Logs', sub: 'Everyone’s check-ins, drivers too, by dates', kw: 'check in out log site attendance driver shift break hours', route: '/pm/admin/checkinlogs', show: isManager },
  { key: 'drivercheckins', page: 'people', group: 'Logs', icon: '🚚', label: 'Driver Check-In Log', sub: 'Shifts, breaks, hours', kw: 'driver check in shift break hours', route: '/pm/admin/drivercheckins', show: () => false }, // in Check-In Logs now (Andy, 18 Nov 2026)
  { key: 'subapplications', page: 'people', group: 'Subcontractors', icon: '🏗', label: 'Subcontractor Sign-Up', sub: 'Sign-up form link and applications', kw: 'subcontractor sign up form application apply', route: '/pm/admin/subapps', show: isManager },

  // Projects.
  // Job numbers, from the Projects side too (Andy, 18 Nov 2026: 'There is no simple way of setting up job numbers ... when setting up in projects it links to finance and vice versa'): the same company setting Finance › Settings › Project Numbers uses.
  { key: 'jobnumbers', page: 'projects', group: 'New Projects', icon: '#', label: 'Job Numbers', sub: 'Automatic numbers with an optional prefix', kw: 'job number numbers prefix project automatic next', route: '/pm/admin/jobnumbers', show: admin },
  { key: 'sowlibrary', page: 'projects', group: 'Works & Pricing', icon: '🧱', label: 'Schedule of Works Library', sub: 'Standard sections and tasks', kw: 'sow schedule works library', route: '/pm/admin/sowlibrary', show: isManager },
  { key: 'ratecard', page: 'projects', group: 'Works & Pricing', icon: '💷', label: 'Price Sheet Rate Card', sub: 'Rates, dropdown options and Terms', kw: 'price sheet rate card terms conditions builder', route: '/pm/admin/ratecard', show: admin },
  { key: 'suppliers', page: 'projects', group: 'Works & Pricing', icon: '🏪', label: 'Suppliers', sub: 'Suppliers, order emails and branches', kw: 'supplier merchant branch address materials', route: '/pm/admin/suppliers', show: isFullManager },
  { key: 'maincontractor', page: 'projects', group: 'Works & Pricing', icon: '🏢', label: 'Main Contractor', sub: 'Subcontractor Library and inspection templates', kw: 'main contractor mc inspection subcontractor library', route: '/pm/admin/companylibrary', show: isManager },
  { key: 'reporttemplates', page: 'projects', group: 'Reports & Documents', icon: '📝', label: 'Report Templates', sub: 'Inspections, surveys, briefings', kw: 'inspection survey report template briefing', route: '/pm/admin/templates', show: isManager },
  { key: 'signtemplates', page: 'projects', group: 'Reports & Documents', icon: '✍️', label: 'Signing Templates', sub: 'RAMS signature boxes', kw: 'rams signature sign template docusign', route: '/pm/admin/signtemplates', show: isManager },

  // Finance: each part of Finance › Settings as its own row. Job numbers are under Projects; who sees material costs is
  // in People and Roles; OneDrive is under Company.
  // Grouped into fewer tabs (Andy, 18 Nov 2026: "you can still group the items, ie purchases (put purchase orders and
  // invoices etc into this tab), make less tabs"): each group's parts on one page.
  finPart('sales', 'Settings', 'Sales', 'Invoice numbers, what goes on your invoices, defaults for new projects', 'sales invoice number numbers prefix next address bank sort code account vat number company number utr cis employer footer default defaults retention payment terms due days application date'),
  finPart('vatohp', 'Settings', 'VAT & Overheads', 'VAT rates and the company overheads', 'vat rate rates reverse charge default overheads ohp percent'),
  finPart('buy', 'Settings', 'Purchases', 'Purchase orders, purchase invoices and the invoice inbox', 'purchase purchases order orders po invoice invoices approve automatic inbox email power automate key'),
  { key: 'fin_codes', page: 'finance', group: 'Settings', icon: '💷', label: 'Cost Codes', sub: 'The codes costs are booked to', kw: 'finance cost codes code nominal', route: '/pm/admin/fincodes?kind=codes', show: fin },
  { key: 'fin_templates', page: 'finance', group: 'Settings', icon: '💷', label: 'Templates', sub: 'Invoices, applications and orders', kw: 'finance templates template invoice application order layout', route: '/pm/admin/fintemplates', show: fin },
  finPart('xero', 'Settings', 'Xero', 'The connection to your accounts', 'xero accounts connect'),

  // Health & Safety.
  { key: 'hspolicy', page: 'hs', group: 'Policy & Registers', icon: '📕', label: 'H&S Policy', sub: 'Policy document and who has signed', kw: 'health safety policy', route: '/pm/admin/hspolicy', show: isFullManager },
  { key: 'ppelog', page: 'hs', group: 'Policy & Registers', icon: '🦺', label: 'PPE Log', sub: 'Issued PPE and the register', kw: 'ppe register', route: '/pm/admin/ppelog', show: isFullManager },
  { key: 'havstools', page: 'hs', group: 'Policy & Registers', icon: '🛠️', label: 'HAVS Tools', sub: 'Vibration tool list', kw: 'havs vibration tools', route: '/pm/admin/havstools', show: isFullManager },
  { key: 'ramslibrary', page: 'hs', group: 'Libraries', icon: '🦺', label: 'RAMS Library', sub: 'Hazards, method statements, templates', kw: 'rams risk assessment method statement hazard template', route: '/pm/admin/ramslibrary', show: isFullManager },
  { key: 'coshhbuilder', page: 'hs', group: 'Libraries', icon: '🧪', label: 'COSHH Library', sub: 'Data sheets → products → assessments in folders', kw: 'coshh substance product data sheet', route: '/pm/admin/coshh', show: isFullManager },
  // The Construction Phase Plan template (Andy, 19 Nov 2026), beta link only like the builder.
  { key: 'cpptemplate', page: 'hs', group: 'Libraries', icon: '📘', label: 'CPP Template', sub: 'Construction Phase Plan wording for new plans', kw: 'cpp construction phase plan template main contractor', route: '/pm/admin/cpptemplate', show: (me) => isFullManager(me) && isBetaSite() },
  // One tab since 19 Nov 2026 (Andy: "move the toolbox talks required into the toolbox talks templates and have the tab
  // header as toolbox talks"): how often each live project needs a talk (14 Nov), the templates, and Create A Toolbox Talk.
  { key: 'tbt', page: 'hs', group: 'Toolbox Talks', icon: '🗣️', label: 'Toolbox Talks', sub: 'How often, templates and making talks', kw: 'toolbox talk tbt template create builder how often monthly frequency rule required', route: '/pm/admin/tbt', show: (me) => isFullManager(me) && admin(me) },
  // The office copy of H&S emails, each company its own (19 Nov 2026; one fixed address for everyone until 15 Nov). Admins only.
  { key: 'hsemails', page: 'hs', group: 'Emails', icon: '✉️', label: 'H&S Emails', sub: 'Office copy of reports, COSHH, HAVS, PUWER and incidents', kw: 'email emails copy cc office report reports coshh havs puwer incident accident health safety', route: '/pm/admin/hsemails', show: admin },

  // Company.
  { key: 'hometiles', page: 'company', group: 'Branding', icon: '🏠', label: 'Home Page', sub: 'Who sees the finance tiles on Home', kw: 'home page tiles finance money due in pm project manager site manager', route: '/pm/admin/hometiles', show: () => false }, // now Money On Home on Admin › Roles (18 Nov 2026)
  { key: 'branding', page: 'company', group: 'Branding', icon: '🖼️', label: 'Company Logo & Theme', sub: 'Logo and colours', kw: 'logo theme colour color brand', route: '/pm/admin/branding', show: admin },
  { key: 'expensesemail', page: 'company', group: 'Integrations', icon: '🧾', label: 'Expenses', sub: 'Where receipts go, and who books them in Finance', kw: 'expenses receipts email', route: '/pm/admin/expensesemail', show: admin },
  { key: 'onedrive', page: 'company', group: 'Integrations', icon: '☁️', label: 'OneDrive', sub: 'New job folders, where things save, and each job’s folders', kw: 'onedrive sync folder sharepoint microsoft integrations save template job pack', route: '/pm/admin/onedrive', show: admin },
];

export const visibleItems = (me: Profile, org: Organization | null) => ADMIN_ITEMS.filter((i) => i.show(me, org) && ADMIN_PAGES[i.page].show(me, org));
/** The tabs someone has: those with something in them (Company always has the Set-Up Guide for an admin). */
export const visiblePages = (me: Profile, org: Organization | null) => {
  const items = visibleItems(me, org);
  return (Object.keys(ADMIN_PAGES) as AdminPage[]).filter((k) => ADMIN_PAGES[k].show(me, org) && (k === 'company' || items.some((i) => i.page === k)));
};
export function searchItems(me: Profile, org: Organization | null, q: string) {
  const s = q.trim().toLowerCase();
  return s ? visibleItems(me, org).filter((i) => `${i.label} ${i.kw} ${i.group} ${ADMIN_PAGES[i.page].label}`.toLowerCase().includes(s)) : [];
}

/** The row (sub tab) a page is: its address, and any ?part= / ?kind= it needs, match the row's. */
export function adminItemAt(items: AdminItem[], path: string, params: Record<string, unknown>): AdminItem | null {
  const p = path.replace(/\/$/, '');
  return items.find((i) => {
    if (!i.route) return false;
    const [rp, q] = i.route.split('?');
    if (rp !== p) return false;
    return !q || q.split('&').every((kv) => { const [k, v] = kv.split('='); return String(params[k] ?? '') === v; });
  }) ?? null;
}
