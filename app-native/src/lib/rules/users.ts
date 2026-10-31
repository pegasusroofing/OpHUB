// Who can change whose role, or remove them (100 roleActionsFor). Pure.

export type Person = { id: string; role: string; is_estimator?: boolean | null };
export type RoleOption = { value: string; label: string };

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Company Admin', pm: 'Project Manager', estimator: 'Estimator (no notifications)', site_manager: 'Site Manager',
  operative: 'Operative', driver: 'Delivery Driver', client: 'Client',
};

export function roleActionsFor(me: Person, p: Person, all: Person[]): { options: RoleOption[] | null; canRemove: boolean } {
  const iAmAdmin = me.role === 'admin', iAmFull = iAmAdmin || me.role === 'pm';
  if (p.id === me.id) return { options: null, canRemove: false };
  const o = (...keys: string[]) => keys.map((value) => ({ value, label: ROLE_LABEL[value] }));
  // A company admin can set anyone to any role (Andy, 31 Oct 2026), so a sign-up off the wrong link can be put right. The last admin stays an admin.
  if (iAmAdmin) {
    if (p.role === 'admin' && all.filter((x) => x.role === 'admin').length <= 1) return { options: o('admin'), canRemove: true };
    return { options: o('admin', 'pm', 'estimator', 'site_manager', 'operative', 'driver', 'client'), canRemove: true };
  }
  if (p.role === 'admin') return { options: null, canRemove: false };
  if (p.role === 'pm') {
    if (!iAmFull) return { options: null, canRemove: false };
    return { options: o('pm', 'estimator', 'operative', 'site_manager'), canRemove: false };
  }
  if (p.role === 'site_manager') {
    if (!iAmFull) return { options: null, canRemove: false };
    return { options: o('site_manager', 'operative', 'pm', 'estimator'), canRemove: false };
  }
  if (p.role === 'operative') return { options: [...o('operative'), ...(iAmFull ? o('pm', 'estimator', 'site_manager', 'driver') : [])], canRemove: iAmFull };
  if (p.role === 'driver') return { options: [...o('driver'), ...(iAmFull ? o('operative') : [])], canRemove: iAmFull };
  if (p.role === 'client') return { options: null, canRemove: iAmFull };
  return { options: null, canRemove: false };
}

/** 'estimator' is a Project Manager with the no-notifications flag on. */
export const rolePatch = (role: string) => ({ role: role === 'estimator' ? 'pm' : role, is_estimator: role === 'estimator' });
/** Finance access follows finance_enabled, whatever the role, so anyone moved off admin / PM loses it. */
export const roleChangePatch = (role: string) => ({ ...rolePatch(role), ...(['admin', 'pm', 'estimator'].includes(role) ? {} : { finance_enabled: false, see_costs: false }) });
export const shownRole = (p: Person) => (p.role === 'pm' && p.is_estimator ? 'estimator' : p.role);
