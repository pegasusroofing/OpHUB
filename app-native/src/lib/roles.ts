// Role rules, ported from the current web app (100-state.js, 185-pm-home.js, 900-finance.js).
import type { Organization, Profile } from './types';

export const isManager = (u: Profile | null) => !!u && ['pm', 'admin', 'site_manager'].includes(u.role);
export const isFullManager = (u: Profile | null) => !!u && (u.role === 'pm' || u.role === 'admin');
export const isEstimator = (u: Profile | null) => !!u && u.role === 'pm' && !!u.is_estimator;

// One-phone rule applies to everyone except PMs, admins and the super admin.
export const deviceLockApplies = (u: Profile | null) => !!u && !['pm', 'admin', 'superadmin'].includes(u.role);

export function finHasAccess(u: Profile | null, org: Organization | null): boolean {
  return !!u && u.finance_enabled === true && !(org && org.has_pm === false && org.has_finance === false);
}
export const isFinanceUser = (u: Profile | null, org: Organization | null) => finHasAccess(u, org) && u?.finance_hidden !== true;
export const isFinanceOnlyOrg = (org: Organization | null) => !!org && org.has_pm === false;

export type HomeKind = 'superadmin' | 'finance' | 'manager' | 'operative' | 'driver' | 'client' | 'subcontractor' | 'other';

export function homeKind(u: Profile | null, org: Organization | null): HomeKind {
  if (!u) return 'other';
  if (u.role === 'superadmin') return 'superadmin';
  if (isFinanceOnlyOrg(org)) return 'finance';
  if (isManager(u)) return 'manager';
  if (u.role === 'operative') return 'operative';
  if (u.role === 'driver') return 'driver';
  if (u.role === 'client') return 'client';
  if (u.role.startsWith('subcontractor_company')) return 'subcontractor';
  return 'other';
}

export function roleLabel(u: Profile | null): string {
  if (!u) return '';
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
