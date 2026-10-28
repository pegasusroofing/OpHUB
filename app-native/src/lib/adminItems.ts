// Admin Centre sections (260 ADMIN_PAGES / ADMIN_ITEMS): where each lives,
// what it's called, who sees it, and its screen in the new app (null = still
// in the current app for now).
import { isFinanceUser, isFullManager, isManager } from '@/lib/roles';
import type { Organization, Profile } from '@/lib/types';

export type AdminPage = 'people' | 'libraries' | 'company';
export const ADMIN_PAGES: Record<AdminPage, { label: string; sub: string; icon: string; show: (me: Profile) => boolean }> = {
  people: { label: 'People', sub: 'Users · Phones · Check-in logs', icon: '👥', show: (me) => isManager(me) },
  libraries: { label: 'Libraries', sub: 'Templates · Rates · H&S', icon: '📚', show: (me) => isManager(me) },
  company: { label: 'Company', sub: 'Logo · Theme · Integrations', icon: '🎨', show: (me) => me.role === 'admin' },
};

export type AdminItem = { key: string; page: AdminPage; group: string; icon: string; label: string; sub: string; kw: string; route: string | null; show: (me: Profile, org: Organization | null) => boolean };
const admin = (me: Profile) => me.role === 'admin';
export const ADMIN_ITEMS: AdminItem[] = [
  { key: 'invites', page: 'people', group: 'Team', icon: '✉️', label: 'Invites', sub: 'Invite links and pending invites', kw: 'invite link join', route: '/pm/admin/invites', show: isManager },
  { key: 'users', page: 'people', group: 'Team', icon: '👥', label: 'Users', sub: 'Roles, passwords, removing people', kw: 'user role admin pm estimator operative driver', route: '/pm/admin/users', show: isManager },
  { key: 'devicelocks', page: 'people', group: 'Team', icon: '📱', label: 'Device Locks', sub: 'One phone = one person', kw: 'device phone lock approve', route: '/pm/admin/devicelocks', show: isFullManager },
  { key: 'checkinlogs', page: 'people', group: 'Logs', icon: '📍', label: 'Check-In Logs', sub: 'Operatives and PM logins by site', kw: 'check in out log site attendance', route: '/pm/admin/checkinlogs', show: isManager },
  { key: 'drivercheckins', page: 'people', group: 'Logs', icon: '🚚', label: 'Driver Check-In Log', sub: 'Shifts, breaks, hours', kw: 'driver check in shift break hours', route: '/pm/admin/drivercheckins', show: isFullManager },
  { key: 'subapplications', page: 'people', group: 'Subcontractors', icon: '🏗', label: 'Subcontractor sign-up', sub: 'Sign-up form link and applications', kw: 'subcontractor sign up form application apply', route: '/pm/admin/subapps', show: isManager },
  { key: 'reporttemplates', page: 'libraries', group: 'Reports & documents', icon: '📝', label: 'Report Templates', sub: 'Inspections, surveys, briefings', kw: 'inspection survey report template briefing', route: '/pm/admin/templates', show: isManager },
  { key: 'signtemplates', page: 'libraries', group: 'Reports & documents', icon: '✍️', label: 'Signing Templates', sub: 'RAMS signature boxes', kw: 'rams signature sign template docusign', route: null, show: isManager },
  { key: 'sowlibrary', page: 'libraries', group: 'Works & pricing', icon: '🧱', label: 'Schedule of Works Library', sub: 'Standard sections and tasks', kw: 'sow schedule works library', route: '/pm/admin/sowlibrary', show: isManager },
  { key: 'suppliers', page: 'libraries', group: 'Works & pricing', icon: '🏪', label: 'Suppliers', sub: 'Suppliers, order emails and branches', kw: 'supplier merchant branch address materials', route: '/pm/admin/suppliers', show: isFullManager },
  { key: 'maincontractor', page: 'libraries', group: 'Works & pricing', icon: '🏢', label: 'Main Contractor', sub: 'Inspection templates', kw: 'main contractor mc inspection', route: null, show: isManager },
  { key: 'hspolicy', page: 'libraries', group: 'Health & Safety', icon: '📕', label: 'H&S Policy', sub: 'Policy document and who has signed', kw: 'health safety policy', route: '/pm/admin/hspolicy', show: isFullManager },
  { key: 'havstools', page: 'libraries', group: 'Health & Safety', icon: '🛠️', label: 'HAVS Tools', sub: 'Vibration tool list', kw: 'havs vibration tools', route: '/pm/admin/havstools', show: isFullManager },
  { key: 'ramslibrary', page: 'libraries', group: 'Health & Safety', icon: '🦺', label: 'RAMS Library', sub: 'Hazards, method statements, templates', kw: 'rams risk assessment method statement hazard template', route: null, show: isFullManager },
  { key: 'coshhbuilder', page: 'libraries', group: 'Health & Safety', icon: '🧪', label: 'COSHH Library', sub: 'Data sheets → products → assessments in folders', kw: 'coshh substance product data sheet', route: null, show: isFullManager },
  { key: 'tbt', page: 'libraries', group: 'Health & Safety', icon: '🗣️', label: 'Toolbox Talk Templates', sub: 'All sites', kw: 'toolbox talk tbt', route: '/pm/admin/tbt', show: (me) => isFullManager(me) && admin(me) },
  { key: 'ppelog', page: 'libraries', group: 'Health & Safety', icon: '🦺', label: 'PPE Log', sub: 'Issued PPE and the register', kw: 'ppe register', route: '/pm/admin/ppelog', show: isFullManager },
  { key: 'branding', page: 'company', group: 'Branding', icon: '🖼️', label: 'Company Logo & Theme', sub: 'Logo and colours', kw: 'logo theme colour color brand', route: '/pm/admin/branding', show: admin },
  { key: 'expensesemail', page: 'company', group: 'Integrations', icon: '🧾', label: 'Expenses Email', sub: 'Where expense receipts go', kw: 'expenses receipts email', route: '/pm/admin/expensesemail', show: admin },
  { key: 'onedrive', page: 'company', group: 'Integrations', icon: '☁️', label: 'OneDrive', sub: 'Photo and export syncing, quick links', kw: 'onedrive sync folder sharepoint microsoft', route: null, show: admin },
  { key: 'finance', page: 'company', group: 'OpHUB Finance', icon: '💷', label: 'OpHUB Finance', sub: 'Jobs, client POs, job numbers, finance settings', kw: 'finance invoice application certificate retention', route: null, show: (me, org) => isFinanceUser(me, org) },
];

export const visibleItems = (me: Profile, org: Organization | null) => ADMIN_ITEMS.filter((i) => i.show(me, org) && ADMIN_PAGES[i.page].show(me));
export function searchItems(me: Profile, org: Organization | null, q: string) {
  const s = q.trim().toLowerCase();
  return s ? visibleItems(me, org).filter((i) => `${i.label} ${i.kw} ${i.group} ${ADMIN_PAGES[i.page].label}`.toLowerCase().includes(s)) : [];
}
