// Find the guarantees, warranties and data sheets in the job's OneDrive folder (Andy, 8 Nov 2026) and bring the ticked ones
// into the handover, where they feed the O&M manual. Used on Handover and in the manual itself, and run by itself before a new
// manual is built.
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Popup } from '@/components/Popup';
import { useToast } from '@/components/toast';
import { Button, Check, Muted } from '@/components/ui';
import { findInOneDrive, importHoFromOneDrive, type HoFound } from '@/data/handover';
import type { Profile, Site } from '@/lib/types';
import { base } from '@/theme/theme';

export const siteHasOneDrive = (site: Site | null | undefined) => !!(site as (Site & { onedrive_folder_id?: string | null }) | null | undefined)?.onedrive_folder_id;

/** The pop-up: searches as it opens. onDone(added) runs when it closes, whether or not anything was added. */
export function OneDriveFindPopup({ me, site, have, title = 'Find In OneDrive', skipLabel = 'Cancel', silentIfNone, onDone }: {
  me: Profile; site: Site; have: string[]; title?: string; skipLabel?: string; silentIfNone?: boolean; onDone: (added: number) => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<{ found: HoFound[]; tick: Record<string, boolean> } | { error: string } | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let live = true;
    void findInOneDrive(site, have).then((r) => {
      if (!live) return;
      if ('error' in r) { setState(r); return; }
      if (!r.found.length && silentIfNone) { onDone(0); return; }
      setState({ found: r.found, tick: Object.fromEntries(r.found.map((f) => [f.id, true])) });
    });
    return () => { live = false; };
    // Searches once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const res = state && 'found' in state ? state : null;
  const n = res ? res.found.filter((f) => res.tick[f.id]).length : 0;
  const add = async () => {
    if (!res) return;
    const pick = res.found.filter((f) => res.tick[f.id]);
    const r = await importHoFromOneDrive(me, site, pick, (i) => setBusy(`Adding ${i} of ${pick.length}…`));
    setBusy('');
    if (r.failed) toast(`${r.failed} couldn’t be copied from OneDrive — try again.`);
    onDone(r.added);
  };
  const group = (kind: HoFound['kind'], label: string) => {
    const fs = res?.found.filter((f) => f.kind === kind) || []; if (!fs.length) return null;
    return (
      <View key={kind}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: base.slate, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 2 }}>{label} ({fs.length})</Text>
        {fs.map((f) => (
          <View key={f.id} style={{ borderBottomWidth: 1, borderBottomColor: '#EEF0F2', paddingVertical: 3 }}>
            <Check label={f.name} value={!!res?.tick[f.id]} onChange={(v) => res && setState({ ...res, tick: { ...res.tick, [f.id]: v } })} />
            <Muted style={{ fontSize: 11.5, marginLeft: 30 }}>{f.where}</Muted>
          </View>
        ))}
      </View>
    );
  };
  if (!state && silentIfNone) return null;
  return (
    <Popup title={title} onClose={() => onDone(0)} width={480}
      footer={res?.found.length ? <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}><Button busy={!!busy} disabled={!n} title={busy || `Add ${n} Ticked`} onPress={() => void add()} /><Button kind="ghost" title={skipLabel} onPress={() => onDone(0)} /></View>
        : state ? <View style={{ alignItems: 'center' }}><Button kind="ghost" title={skipLabel === 'Cancel' ? 'Close' : skipLabel} onPress={() => onDone(0)} /></View> : undefined}>
      {!state ? <Muted>Searching the job’s OneDrive folder for guarantees, warranties and data sheets…</Muted>
        : 'error' in state ? <Muted>{state.error}</Muted>
        : !state.found.length ? <Muted>Nothing new found. It looks for guarantees, warranties, data sheets, DoPs and BBA certificates in the job’s folder and the folders inside it.</Muted>
        : (
          <>
            <Muted>Found in the job’s OneDrive folder. The ticked ones are copied into the handover and go into the O&amp;M manual.</Muted>
            <ScrollView style={{ maxHeight: 380 }}>{group('guarantee', 'Guarantees & Warranties')}{group('datasheet', 'Data Sheets')}</ScrollView>
          </>
        )}
    </Popup>
  );
}
