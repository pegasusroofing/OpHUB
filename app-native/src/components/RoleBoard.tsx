// What Each Role Can Do (Admin › Roles). Andy, 17 Nov 2026: first a board with every office role as a column; then
// "change it to a vertical drop down ... make the role drop down choose so only one role visible at a time to amend
// ... remove options from the left hand side ... they already have in the right hand side". So: choose one role from
// the Role ▾ drop-down. On the left, Options: the parts it hasn't got; on the right, In This Role: the parts it has.
// Tap a part to move it across (→ adds it, ← takes it out); on a computer it can be dragged across too. Each change
// saves straight away. Rules: lib/rules/rolePerms.
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { SelectBox } from '@/components/SelectBox';
import { showAlert } from '@/components/toast';
import { Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { legacyExtra } from '@/lib/homeTiles';
import { ACCESS_LABEL, type OrgRole } from '@/lib/rules/orgRoles';
import { ALL_PARTS, BOARD_LEVELS, partLabel, partsOf, withPart, type Part } from '@/lib/rules/rolePerms';
import { base, radius, useDesk } from '@/theme/theme';

type Side = 'options' | 'role';
type Drag = { part: Part; from: Side };
let dragging: Drag | null = null; // the web drag in progress (dataTransfer can't be read until the drop)
const web = Platform.OS === 'web';

/** On the web: makes a part draggable, and a list a place to drop it. Nothing on a phone app. */
function useWebDnD(opts: { drag?: Drag; drop?: (d: Drag) => void; onHot?: (on: boolean) => void }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const o = useRef(opts);
  useEffect(() => { o.current = opts; });
  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!web || !el?.addEventListener) return;
    const offs: (() => void)[] = [];
    const on = <K extends keyof HTMLElementEventMap>(k: K, f: (e: HTMLElementEventMap[K]) => void) => { el.addEventListener(k, f); offs.push(() => el.removeEventListener(k, f)); };
    if (o.current.drag) {
      el.setAttribute('draggable', 'true');
      on('dragstart', (e) => { dragging = o.current.drag ?? null; e.dataTransfer?.setData('text/plain', dragging?.part ?? ''); });
      on('dragend', () => { dragging = null; });
    }
    if (o.current.drop) {
      on('dragover', (e) => { if (dragging) { e.preventDefault(); o.current.onHot?.(true); } });
      on('dragleave', () => o.current.onHot?.(false));
      on('drop', (e) => { e.preventDefault(); o.current.onHot?.(false); if (dragging) o.current.drop?.(dragging); dragging = null; });
    }
    return () => offs.forEach((f) => f());
  }, []);
  return ref;
}

const arrow = { fontSize: 15, color: base.slate, fontWeight: '600' as const };

/** One part. In Options it reads "Part →" (tap to add it); in the role, "← Part" (tap to take it out). */
function Tile({ part, side, roleName, onMove }: { part: Part; side: Side; roleName: string; onMove: () => void }) {
  const ref = useWebDnD({ drag: { part, from: side } });
  const label = partLabel(part);
  const adding = side === 'options';
  return (
    <View ref={ref}>
      <Pressable onPress={onMove} accessibilityRole="button" accessibilityLabel={adding ? `Add ${label} to ${roleName}` : `Take ${label} out of ${roleName}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.input,
          borderWidth: 1, borderColor: base.line, backgroundColor: pressed ? '#F0F1F4' : base.card, ...(web ? { cursor: 'pointer' } as object : {}) })}>
        {!adding && <Text style={arrow}>←</Text>}
        <Text numberOfLines={2} style={{ flex: 1, fontSize: 12.5, color: base.ink }}>{label}</Text>
        {adding && <Text style={arrow}>→</Text>}
      </Pressable>
    </View>
  );
}

// onMove: a tap on one of its parts sends it to the other list; onTake: a part dragged in from the other list comes here.
function List({ side, title, parts, roleName, empty, onMove, onTake }: { side: Side; title: string; parts: Part[]; roleName: string; empty: string; onMove: (p: Part) => void; onTake: (p: Part) => void }) {
  const [hot, setHot] = useState(false);
  const ref = useWebDnD({ drop: (d) => { if (d.from !== side) onTake(d.part); }, onHot: setHot });
  return (
    <View ref={ref} style={{ flex: 1, minWidth: 0, borderWidth: hot ? 1.5 : 1, borderColor: hot ? base.blue : base.cardLine, borderRadius: 12, backgroundColor: '#F7F8FA', padding: 8, gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 1 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: base.ink }}>{title}</Text>
        <Text style={{ fontSize: 12, color: base.slate }}>{parts.length}</Text>
      </View>
      {parts.length ? parts.map((p) => <Tile key={p} part={p} side={side} roleName={roleName} onMove={() => onMove(p)} />)
        : <Muted style={{ fontSize: 12, paddingVertical: 4 }}>{empty}</Muted>}
    </View>
  );
}

// pick / onPick: the role on show, when the screen keeps it (Admin › Roles shares it with Your Roles).
export function RoleBoard({ roles, onSave, pick: shared, onPick }: { roles: OrgRole[]; onSave: (role: OrgRole, perms: Part[]) => Promise<string | null>; pick?: string | null; onPick?: (id: string) => void }) {
  const board = roles.filter((r) => BOARD_LEVELS.includes(r.access));
  const [own, setOwn] = useState<string | null>(null);
  const pick = shared !== undefined ? shared : own;
  const setPick = onPick ?? setOwn;
  const [mine, setMine] = useState<Record<string, Part[]>>({}); // changes not read back yet
  const desk = useDesk();
  const { org } = useAuth();
  const role = board.find((r) => r.id === pick) ?? board[0];
  if (!role) return <Muted>No office roles yet. Add one above.</Muted>;
  // Money On Home and See Material Costs not set on a role yet: what the old settings gave it (18 Nov 2026).
  const partsFor = (r: OrgRole) => mine[r.id] ?? partsOf(r.perms, r.perms_extra, legacyExtra(r.access, org));
  const save = async (r: OrgRole, next: Part[]) => {
    const before = partsFor(r);
    setMine((m) => ({ ...m, [r.id]: next }));
    const err = await onSave(r, next);
    if (err) { setMine((m) => ({ ...m, [r.id]: before })); showAlert(err); }
  };
  const has = partsFor(role);
  const options = ALL_PARTS.filter((p) => !has.includes(p));
  const move = (on: boolean) => (p: Part) => void save(role, withPart(has, p, on));
  return (
    <View style={{ maxWidth: desk ? 640 : undefined }}>
      <Muted style={{ marginBottom: 8 }}>Choose A Role, Then Tap A Part To Move It Across{web && desk ? ' (Or Drag It)' : ''}. → Adds It To The Role, ← Takes It Out. Admins Can Do Everything.</Muted>
      <SelectBox label="Role" title="Choose A Role" value={role.id} options={board.map((r) => [r.id, r.name] as [string, string])} onChange={setPick} style={{ marginBottom: 4 }} />
      <Muted style={{ marginBottom: 10 }}>Uses The App As {ACCESS_LABEL[role.access as keyof typeof ACCESS_LABEL] ?? role.access}</Muted>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <List side="options" title="Options" parts={options} roleName={role.name} empty="It Has Everything" onMove={move(true)} onTake={move(false)} />
        <List side="role" title="In This Role" parts={has} roleName={role.name} empty="Nothing Yet" onMove={move(false)} onTake={move(true)} />
      </View>
      {/* What a level can't do whatever the lists say (the database's rules for it). */}
      {role.access === 'site_manager' && <Muted style={{ fontSize: 12, marginTop: 8 }}>Site Managers only see the jobs they&apos;re put on and can&apos;t make projects. For more, use a role that uses the app as Project Manager.</Muted>}
    </View>
  );
}
