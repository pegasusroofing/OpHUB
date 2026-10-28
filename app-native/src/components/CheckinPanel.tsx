// Status + Check In/Out button + Recent, for a job or one address of a multi-site job.
// Ported from renderCheckin / renderCheckinSubAddress (operative parts). The PM parts
// (geofence set-up, team live status, history, exports) come with the PM screens in phase 2.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Notice, Pill, SectionTitle, Toggle } from '@/components/ui';
import { doCheck } from '@/data/checkinAction';
import { useMyCheckins } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { statusFromLatest, timeHM } from '@/lib/rules/checkin';
import { isManager } from '@/lib/roles';
import type { Site, SubAddress } from '@/lib/types';
import { base } from '@/theme/theme';

export function CheckinPanel({ site, sub }: { site: Site; sub?: SubAddress }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: mine = [], isLoading } = useMyCheckins(site.id, sub?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentOpen, setRecentOpen] = useState(true);
  if (!me) return null;

  const status = statusFromLatest(mine);
  const last = mine[0];
  const closed = !!sub?.closed;
  const gps = !isManager(me);

  const act = async () => {
    setError(null); setBusy(true);
    const r = await doCheck(me, site, status === 'in' ? 'out' : 'in', sub);
    setBusy(false);
    if (r.ok) toast(r.toast);
    else if (r.alert) showAlert(r.alert);
    else if (r.toast) toast(r.toast);
    else if (r.error) setError(r.error);
    qc.invalidateQueries({ queryKey: ['myCheckins', site.id] });
  };

  return (
    <View>
      <Card>
        <SectionTitle>{sub ? `Status — ${sub.name}` : 'Status'}</SectionTitle>
        {closed && <Text style={{ color: base.warn, marginBottom: 8 }}>This address is closed — checked-in operatives should check out elsewhere; new check-ins are switched off.</Text>}
        {isLoading ? <Text style={{ color: base.slate }}>Loading…</Text>
          : status === 'in' && last?.ts ? <Pill on text={`On site since ${timeHM(last.ts)}`} />
          : <Pill on={false} text="Not checked in" />}
      </Card>
      {error && <Notice kind="error" text={error} />}
      {(!closed || status === 'in') && (
        <Button busy={busy} title={busy ? (gps ? 'Getting GPS lock…' : 'Please wait…') : status === 'in' ? 'Check Out' : 'Check In'} onPress={act} />
      )}
      {me.role === 'operative' && (
        <>
          <Toggle title="Recent" open={recentOpen} onPress={() => setRecentOpen(!recentOpen)} />
          {recentOpen && (mine.length ? mine.slice(0, 4).map((c) => (
            <Card key={c.id} style={{ paddingVertical: 10 }}>
              <Text style={{ fontSize: 12.5, color: base.ink }}>
                <Text style={{ fontWeight: '700' }}>{c.type === 'in' ? 'Checked in' : 'Checked out'}</Text>
                {c.ts ? ` · ${new Date(c.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
              </Text>
            </Card>
          )) : <Empty>No check-ins yet.</Empty>)}
        </>
      )}
    </View>
  );
}
