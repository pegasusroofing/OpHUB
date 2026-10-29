// Driver Check In / Out with breaks. Ported from renderDriverCheckin (840).
// No GPS for drivers: the time of each check in/out and break is recorded.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, Row, SectionTitle } from '@/components/ui';
import { driverBreak, driverCheck, useDriverStatus } from '@/data/driver';
import { useAuth } from '@/lib/auth';
import { dayTotals, localISODate, minsLabel } from '@/lib/rules/driver';
import { base, page, space } from '@/theme/theme';

const t = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dt = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function DriverCheckin() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useDriverStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;

  const run = async (fn: () => Promise<boolean>, okMsg: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    const ok = await fn();
    setBusy(false);
    if (ok) toast(`${okMsg} · ${t(new Date().toISOString())}`); else setError('Could not save — check your connection and try again.');
    await qc.invalidateQueries({ queryKey: ['driverStatus'] });
  };

  const last = data?.history[0];
  const onDuty = !!data?.onDuty, openBreak = data?.openBreak;
  const today = data ? dayTotals(data.history, data.breaks, localISODate(new Date())) : null;
  const events = data ? [
    ...data.history.map((c) => ({ ts: c.ts, label: c.type === 'in' ? 'Checked In' : 'Checked Out', sub: dt(c.ts) })),
    ...data.breaks.map((b) => ({ ts: b.started_at, label: '☕ Break', sub: `${dt(b.started_at)} – ${b.ended_at ? `${t(b.ended_at)} · ${minsLabel((new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()) / 60000)}` : 'still on break'}` })),
  ].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 30) : [];

  return (
    <ScrollView contentContainerStyle={page(620)}>
      {isLoading ? <Muted>Loading…</Muted> : (
        <>
          <Card style={{ alignItems: 'stretch', paddingVertical: 24 }}>
            <Muted style={{ textAlign: 'center', marginBottom: 14 }}>
              {openBreak ? `☕ On a break since ${t(openBreak.started_at)}` : last ? `${onDuty ? 'Checked in' : 'Checked out'} ${dt(last.ts)}` : 'You are not currently checked in.'}
            </Muted>
            {error && <Text style={{ color: base.warn, textAlign: 'center', marginBottom: 14 }}>{error}</Text>}
            {onDuty && (
              <Button kind={openBreak ? 'primary' : 'ghost'} busy={busy} title={busy ? 'Saving…' : openBreak ? '▶ End Break' : '☕ Start Break'}
                onPress={() => run(() => driverBreak(me, openBreak ? 'end' : 'start'), openBreak ? 'Break ended' : 'Break started')} />
            )}
            <Button kind={openBreak ? 'ghost' : 'primary'} busy={busy} title={busy ? 'Saving…' : onDuty ? 'Check Out' : 'Check In'}
              onPress={() => run(() => driverCheck(me, onDuty ? 'out' : 'in'), onDuty ? 'Checked out' : 'Checked in')} />
            {!!today?.duty && (
              <Muted style={{ textAlign: 'center', marginTop: 12 }}>Today: {minsLabel(today.worked)} worked{today.brk ? ` · ${minsLabel(today.brk)} on breaks` : ''}</Muted>
            )}
            <Muted style={{ textAlign: 'center', marginTop: 10 }}>The time of each check in/out and break is recorded for the office. Your location is not needed.</Muted>
          </Card>
          <SectionTitle>Recent</SectionTitle>
          {events.length ? events.map((e, i) => <Row key={`${e.ts}-${i}`} title={e.label} sub={e.sub} />) : <Empty>No check-ins yet.</Empty>}
        </>
      )}
    </ScrollView>
  );
}
