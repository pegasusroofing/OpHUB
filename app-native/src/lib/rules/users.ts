// Who can change whose role, or remove them (100 roleActionsFor). Pure.

export type Person = { id: string; role: string; is_estimator?: boolean | null };
export type RoleOption = { value: string; label: string };

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Company Admin', pm: 'Project Manager', estimator: 'Estimator (no notifications)', site_manager: 'Site Manager',
  operative: 'Operative', driver: 'Delivery Driver', client: 'Client',
};

export function roleActionsFor(me: Person, p: Person, all: Person[]): { options: RoleOption[] | null; canRemove: boolean } {
  const iAmAdmin = me.role === 'admin', iAmFull = me.role === 'admin' || me.role === 'pm';
  if (p.id === me.id) return { options: null, canRemove: false };
  const o = (...keys: string[]) => keys.map((value) => ({ value, label: ROLE_LABEL[value] }));
  if (p.role === 'admin') {
    if (!iAmAdmin) return { options: null, canRemove: false };
    return { options: all.filter((x) => x.role === 'admin').length > 1 ? o('admin', 'pm', 'operative') : o('admin'), canRemove: true };
  }
  if (p.role === 'pm') {
    if (!iAmFull) return { options: null, canRemove: false };
    return { options: [...o('pm', 'estimator', 'operative', 'site_manager'), ...(iAmAdmin ? o('admin') : [])], canRemove: iAmAdmin };
  }
  if (p.role === 'site_manager') {
    if (!iAmFull) return { options: null, canRemove: false };
    return { options: [...o('site_manager', 'operative', 'pm', 'estimator'), ...(iAmAdmin ? o('admin') : [])], canRemove: iAmAdmin };
  }
  if (p.role === 'operative') return { options: [...o('operative'), ...(iAmFull ? o('pm', 'estimator', 'site_manager', 'driver') : []), ...(iAmAdmin ? o('admin') : [])], canRemove: iAmFull };
  if (p.role === 'driver') return { options: [...o('driver'), ...(iAmFull ? o('operative') : [])], canRemove: iAmFull };
  if (p.role === 'client') return { options: null, canRemove: iAmFull };
  return { options: null, canRemove: false };
}

/** 'estimator' is a Project Manager with the no-notifications flag on. */
export const rolePatch = (role: string) => ({ role: role === 'estimator' ? 'pm' : role, is_estimator: role === 'estimator' });
export const shownRole = (p: Person) => (p.role === 'pm' && p.is_estimator ? 'estimator' : p.role);
