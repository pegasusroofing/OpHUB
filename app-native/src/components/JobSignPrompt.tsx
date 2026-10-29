// An operative opening a job with RAMS / COSHH / Toolbox Talks still to sign gets a pop-up listing them,
// with a button straight to each (330 maybeShowSignNag). Shown each time they come to the job's home
// page until everything is signed.
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Button, Muted } from '@/components/ui';
import { useOutstanding } from '@/data/inbox';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { base } from '@/theme/theme';

const ICON: Record<string, string> = { rams: '📋', coshh: '🧪', tbt: '🗣️' };
export function JobSignPrompt({ siteId }: { siteId: string }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data: sites } = useSites();
  const on = me?.role === 'operative';
  const { data: rows, isFetching } = useOutstanding(on ? sites : undefined);
  const [visit, setVisit] = useState(0), [closedOn, setClosedOn] = useState(-1);
  // Each visit to the job's home page counts afresh (so after signing the RAMS, what's left shows).
  useFocusEffect(useCallback(() => {
    if (!on) return;
    void qc.invalidateQueries({ queryKey: ['outstanding'] });
    setVisit((v) => v + 1);
  }, [on, qc]));
  const items = on && rows && !isFetching && visit > 0 && closedOn !== visit ? rows.find((r) => r.site.id === siteId)?.items || [] : [];
  if (!items.length) return null;
  const close = () => setClosedOn(visit);
  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: base.card, borderRadius: 14, padding: 16, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
            <Text style={{ flex: 1, fontWeight: '800', fontSize: 17, color: base.ink,  }}>✍️ Needs your signature</Text>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={{ paddingLeft: 10 }}><Text style={{ fontSize: 18, color: base.slate, fontWeight: '700' }}>✕</Text></Pressable>
          </View>
          <Muted style={{ marginBottom: 12 }}>Please read and sign before starting work on this job.</Muted>
          {items.map((i) => (
            <Pressable key={i.href} onPress={() => { close(); router.push(i.href as never); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.line, borderRadius: 10, marginBottom: 8 }}>
              <Text>{ICON[i.type] || '•'}</Text>
              <Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{i.label.replace(/ to sign \((\d+)\)$/, (_m, n: string) => (n === '1' ? '' : ` ×${n}`))}</Text>
              <Text style={{ color: base.blue, fontWeight: '700' }}>Sign now ›</Text>
            </Pressable>
          ))}
          <View style={{ marginTop: 4 }}><Button kind="ghost" title="Not now" onPress={close} /></View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
