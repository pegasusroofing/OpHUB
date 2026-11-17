// What Each Role Can Do (Admin › Roles; Andy, 17 Nov 2026: "I also want this board built into the app ... make it a
// little more compact but I like it"). One column per office role holding the parts it can use, and the parts along
// the top. Tap a part then tap a role to add it, ✕ to take it out; on a computer a part can also be dragged into a
// role, or from one role to another. Each change saves straight away. Rules: lib/rules/rolePerms.
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { showAlert } from '@/components/toast';
import { Muted } from '@/components/ui';
import { BOARD_LEVELS, PARTS, partsOf, withPart, type Part } from '@/lib/rules/rolePerms';
import type { OrgRole } from '@/lib/rules/orgRoles';
import { base, radius, useDesk } from '@/theme/theme';

type Drag = { part: Part; from: string | null };
let dragging: Drag | null = null; // the web drag in progress (dataTransfer can't be read until the drop)

/** On the web: makes a part draggable, and a role column a place to drop it. Nothing on a phone app. */
function useWebDnD(opts: { drag?: Drag; drop?: (d: Drag) => void; onHot?: (on: boolean) => void }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const o = useRef(opts);
  useEffect(() => { o.current = opts; });
  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !el?.addEventListener) return;
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

function Chip({ part, label, from, picked, onPress, onRemove }: { part: Part; label: string; from: string | null; picked?: boolean; onPress?: () => void; onRemove?: () => void }) {
  const ref = useWebDnD({ drag: { part, from } });
  const look = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingVertical: 3, paddingHorizontal: 7, borderRadius: radius.input, backgroundColor: base.card,
    borderWidth: picked ? 1.5 : 1, borderStyle: from ? 'solid' as const : 'dashed' as const, borderColor: picked ? base.blue : base.line, ...(Platform.OS === 'web' ? { cursor: 'grab' } as object : {}) };
  const inner = (
    <>
      <Text numberOfLines={2} style={{ flexShrink: 1, fontSize: 12, color: picked ? base.blue : base.ink, fontWeight: picked ? '600' : '400' }}>{label}</Text>
      {!!onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Take ${label} out`} style={{ marginLeft: 'auto' }}>
          <Text style={{ fontSize: 12, color: base.slate }}>✕</Text>
        </Pressable>
      )}
    </>
  );
  // A part in a role isn't a button itself (✕ is), so a tap on it reaches the role (adding the picked part).
  return (
    <View ref={ref}>
      {onPress ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${picked ? 'Unpick' : 'Pick'} ${label}`} style={look}>{inner}</Pressable> : <View style={look}>{inner}</View>}
    </View>
  );
}

function Column({ role, parts, picked, width, onAdd, onRemove, onMoveIn }: { role: OrgRole; parts: Part[]; picked: Part | null; width: string; onAdd: () => void; onRemove: (p: Part) => void; onMoveIn: (d: Drag) => void }) {
  const [hot, setHot] = useState(false);
  const ref = useWebDnD({ drop: onMoveIn, onHot: setHot });
  const wants = !!picked && !parts.includes(picked);
  return (
    <View ref={ref} style={{ width: width as never }}>
      {/* Not a button itself (it holds the ✕ buttons): a tap anywhere on it, other than a ✕, adds the picked part. */}
      <View onStartShouldSetResponder={() => wants} onResponderRelease={() => { if (wants) onAdd(); }} accessibilityLabel={wants ? `Add to ${role.name}` : undefined}
        style={{ flex: 1, borderWidth: wants || hot ? 1.5 : 1, borderColor: wants || hot ? base.blue : base.cardLine, borderRadius: 12, backgroundColor: '#F7F8FA', padding: 8, gap: 4, ...(wants && Platform.OS === 'web' ? { cursor: 'pointer' } as object : {}) }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 2 }}>
          <Text numberOfLines={2} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: base.ink }}>{role.name}</Text>
          <Text style={{ fontSize: 12, color: wants ? base.blue : base.slate, fontWeight: wants ? '600' : '400' }}>{wants ? '+ Add Here' : parts.length}</Text>
        </View>
        {parts.length ? parts.map((p) => <Chip key={p} part={p} from={role.id} label={PARTS.find(([k]) => k === p)?.[1] ?? p} onRemove={() => onRemove(p)} />)
          : <Muted style={{ fontSize: 12 }}>Nothing Yet</Muted>}
      </View>
    </View>
  );
}

export function RoleBoard({ roles, onSave }: { roles: OrgRole[]; onSave: (role: OrgRole, perms: Part[]) => Promise<string | null> }) {
  const board = roles.filter((r) => BOARD_LEVELS.includes(r.access));
  const [mine, setMine] = useState<Record<string, Part[]>>({}); // changes not read back yet
  const [picked, setPicked] = useState<Part | null>(null);
  const desk = useDesk();
  const partsFor = (r: OrgRole) => mine[r.id] ?? partsOf(r.perms);
  const save = async (r: OrgRole, next: Part[]) => {
    const before = partsFor(r);
    setMine((m) => ({ ...m, [r.id]: next }));
    const err = await onSave(r, next);
    if (err) { setMine((m) => ({ ...m, [r.id]: before })); showAlert(err); }
  };
  const moveIn = (to: OrgRole) => (d: Drag) => {
    if (d.from === to.id) return;
    void save(to, withPart(partsFor(to), d.part, true));
    const from = board.find((r) => r.id === d.from);
    if (from) void save(from, withPart(partsFor(from), d.part, false));
  };
  return (
    <View>
      <Muted style={{ marginBottom: 6 }}>Tap A Box, Then Tap A Role To Add It{Platform.OS === 'web' && desk ? ', Or Drag It In' : ''}. Tap ✕ To Take It Out. Admins Can Do Everything.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {PARTS.map(([k, l]) => <Chip key={k} part={k} label={l} from={null} picked={picked === k} onPress={() => setPicked(picked === k ? null : k)} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {board.map((r) => (
          <Column key={r.id} role={r} parts={partsFor(r)} picked={picked} width={desk ? '23.8%' : '48.5%'}
            onAdd={() => { if (picked) void save(r, withPart(partsFor(r), picked, true)); }}
            onRemove={(p) => void save(r, withPart(partsFor(r), p, false))}
            onMoveIn={moveIn(r)} />
        ))}
      </View>
    </View>
  );
}
