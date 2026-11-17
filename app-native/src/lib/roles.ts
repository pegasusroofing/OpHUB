// Role rules, ported from the current web app (100-state.js, 185-pm-home.js, 900-finance.js).
import { can } from './rules/rolePerms';
import type { Organization, Profile } from './types';

export const isManager = (u: Profile | null) => !!u && ['pm', 'admin', 'site_manager'].includes(u.role);
export const isFullManager = (u: Profile | null) => !!u && (u.role === 'pm' || u.role === 'admin');
/** Things that cost money per use, such as the AI RAMS writer (Andy, 4 Nov 2026): company admins (and the platform admin) only. */
export const isCompanyAdmin = (u: Profile | null) => !!u && (u.role === 'admin' || u.role === 'superadmin');
export const isEstimator = (u: Profile | null) => !!u && u.role === 'pm' && !!u.is_estimator && !u.finance_only;
/** A Finance Controller: a PM login with Finance on, kept to Finance. Like an estimator, left out of PM lists and notifications. */
export const isFinanceController = (u: Profile | null) => !!u && u.role === 'pm' && u.finance_only === true;

// One-phone rule applies to everyone except PMs, admins and the super admin.
export const deviceLockApplies = (u: Profile | null) => !!u && !['pm', 'admin', 'superadmin'].includes(u.role);

export function finHasAccess(u: Profile | null, org: Organization | null): boolean {
  return !!u && u.finance_enabled === true && !(org && org.has_pm === false && org.has_finance === false);
}
export const isFinanceUser = (u: Profile | null, org: Organization | null) => finHasAccess(u, org) && u?.finance_hidden !== true && can(u, 'fin_view');
/** + New Project (Projects, Finance, the phone's Add): PMs and admins whose role has Create Projects (Admin › Roles). */
export const canCreateProjects = (u: Profile | null) => isFullManager(u) && can(u, 'create_projects');
/** Sign Off H&S (Admin › Roles): a manager who may publish, issue and sign off H&S paperwork (RAMS, COSHH, permits,
 *  toolbox talks, briefings, inspections, incidents). Without it a manager still sees H&S, read-only. */
export const canSignOffHs = (u: Profile | null) => isManager(u) && can(u, 'hs_signoff');
/** Finance – Edit (Admin › Roles): without it Finance is look-only (no new, edit, delete, send or approve). */
export const canEditFinance = (u: Profile | null) => can(u, 'fin_edit');
/** Raise Orders (Admin › Roles): material orders, purchase orders and subcontract orders. */
export const canRaiseOrders = (u: Profile | null) => isManager(u) && can(u, 'orders');
export const isFinanceOnlyOrg = (org: Organization | null) => !!org && org.has_pm === false;

export type HomeKind = 'superadmin' | 'finance' | 'manager' | 'operative' | 'driver' | 'client' | 'subcontractor' | 'other';

export function homeKind(u: Profile | null, org: Organization | null): HomeKind {
  if (!u) return 'other';
  if (u.role === 'superadmin') return 'superadmin';
  if (isFinanceOnlyOrg(org) || isFinanceController(u)) return 'finance';
  if (isManager(u)) return 'manager';
  if (u.role === 'operative') return 'operative';
  if (u.role === 'driver') return 'driver';
  if (u.role === 'client') return 'client';
  if (u.role.startsWith('subcontractor_company')) return 'subcontractor';
  return 'other';
}

export function roleLabel(u: Profile | null): string {
  if (!u) return '';
  if (isFinanceController(u)) return 'Finance Controller';
  if (isEstimator(u)) return 'Estimator';
  switch (u.role) {
    case 'admin': return 'Company Admin';
    case 'pm': return 'Project Manager';
    case 'site_manager': return 'Site Manager';
    case 'superadmin': return 'Super Admin';
    case 'client': return 'Client';
    case 'driver': return 'Delivery Driver';
    default: return u.role.startsWith('subcontractor_company') ? 'Subcontractor' : 'Operative';
  }
}
