// Weekly vehicle checklist. Ported from renderDriverVehicleChecklist (840):
// reg + mileage, 4 vehicle photos, 20 pass/fail items (a fail needs a note and a
// photo), saved as you go, submit checks, previous weeks. Failed items are sent to
// the managers on submit. (The old "Monday gate" was never switched on, so it's not ported.)
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Field, Muted, Row, SectionTitle } from '@/components/ui';
import { afterChecklistSubmit, loadChecklist, saveChecklist, uploadChecklistPhoto, type Checklist } from '@/data/driver';
import { useAuth } from '@/lib/auth';
import { pickPhotos } from '@/lib/photos';
import { VEHICLE_ITEMS, VEHICLE_PHOTOS, vehicleSubmitProblem } from '@/lib/rules/driver';
import { base, page, radius, space } from '@/theme/theme';

export default function Vehicle() {
  const { me } = useAuth();
  const toast = useToast();
  const [d, setD] = useState<Checklist | null>(null);
  const [history, setHistory] = useState<{ id: string; week_start: string; has_fails: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (!me) return;
    loadChecklist(me).then((r) => { setD(r.draft); setHistory(r.history); }).catch(() => toast('Could not load — check your signal.'));
  }, [me, toast]);

  // Saves are queued so they land in order.
  const persist = useCallback((next: Checklist) => {
    if (!me) return;
    saving.current = saving.current.then(async () => {
      const id = await saveChecklist(me, next);
      if (id && !next.id) setD((cur) => (cur ? { ...cur, id } : cur));
    }).catch(() => undefined);
  }, [me]);

  if (!me || !d) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const submitted = d.status === 'submitted';
  const answered = VEHICLE_ITEMS.filter((i) => d.items[i.key]?.result).length;
  const cats = [...new Set(VEHICLE_ITEMS.map((i) => i.cat))];
  const setItem = (key: string, patch: object, save = true) => {
    const next = { ...d, items: { ...d.items, [key]: { ...d.items[key], ...patch, key } } };
    setD(next); if (save) persist(next);
  };
  const photo = async (key: string) => {
    const p = await pickPhotos('camera', false);
    if ('error' in p) { showAlert(p.error); return; }
    if (!p[0]) return;
    setPhotoBusy(key);
    const path = await uploadChecklistPhoto(me, p[0]);
    setPhotoBusy(null);
    if (!path) { toast('Photo upload failed — check your connection and try again.'); return; }
    setItem(key, { photo_path: path });
  };
  const submit = async () => {
    const problem = vehicleSubmitProblem(d.vehicle_reg, d.mileage, d.items);
    if (problem) { toast(problem); return; }
    setBusy(true);
    await saving.current;
    const id = await saveChecklist(me, d, true);
    setBusy(false);
    if (!id) { toast('Could not save — try again.'); return; }
    const done = { ...d, id, status: 'submitted' };
    setD(done);
    toast('Checklist submitted');
    await afterChecklistSubmit(me, done, VEHICLE_ITEMS.filter((i) => d.items[i.key]?.result === 'fail').map((i) => i.label));
  };

  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Card>
        <Text style={{ fontWeight: '700', color: base.ink }}>Week commencing {new Date(`${d.week_start}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</Text>
        {submitted ? <Text style={{ color: base.ok }}>✓ Submitted</Text> : <Muted>{answered} of {VEHICLE_ITEMS.length} checked</Muted>}
        <View style={{ marginTop: 10 }}>
          <Field label="Vehicle registration" value={d.vehicle_reg} editable={!submitted} placeholder="e.g. AB12 CDE" autoCapitalize="characters"
            onChangeText={(v) => setD({ ...d, vehicle_reg: v })} onBlur={() => persist(d)} />
          <Field label="Current mileage" value={d.mileage} editable={!submitted} placeholder="e.g. 48250" keyboardType="number-pad"
            onChangeText={(v) => setD({ ...d, mileage: v })} onBlur={() => persist(d)} />
        </View>
      </Card>

      <SectionTitle>Vehicle photos{submitted ? '' : ' (all 4 required)'}</SectionTitle>
      <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {VEHICLE_PHOTOS.map((ph, i) => {
          const path = d.items[ph.key]?.photo_path;
          return (
            <View key={ph.key} style={{ width: '47%' }}>
              <Text style={{ fontWeight: '700', fontSize: 13, marginBottom: 6, color: base.ink }}>{i + 1}. {ph.label}</Text>
              {path ? <StorageImage bucket="site-photos" path={path} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 8 }} />
                : <View style={{ width: '100%', aspectRatio: 4 / 3, borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}><Muted>{submitted ? 'Not taken' : 'No photo yet'}</Muted></View>}
              {!submitted && <Button kind="ghost" title={photoBusy === ph.key ? 'Uploading…' : path ? '📷 Retake' : '📷 Take photo'} disabled={!!photoBusy} onPress={() => photo(ph.key)} />}
            </View>
          );
        })}
      </Card>

      {cats.map((cat) => (
        <View key={cat}>
          <SectionTitle>{cat}</SectionTitle>
          {VEHICLE_ITEMS.filter((i) => i.cat === cat).map((item) => {
            const ans = d.items[item.key] || { key: item.key };
            return (
              <Card key={item.key}>
                <Text style={{ color: base.ink, marginBottom: 8 }}>{item.label}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['pass', 'fail'] as const).map((r) => {
                    const on = ans.result === r;
                    const c = r === 'pass' ? { bg: base.okBg, fg: base.ok } : { bg: base.warnBg, fg: base.warn };
                    return (
                      <Pressable key={r} disabled={submitted} onPress={() => setItem(item.key, { result: r })}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: radius.button, borderWidth: 1, alignItems: 'center', borderColor: on ? c.fg : base.line, backgroundColor: on ? c.bg : base.card }}>
                        <Text style={{ fontWeight: '700', color: on ? c.fg : base.ink }}>{r === 'pass' ? '✓ Pass' : '✕ Fail'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {ans.result === 'fail' && (
                  <View style={{ marginTop: 8 }}>
                    <TextInput multiline editable={!submitted} value={ans.note || ''} placeholder="What's wrong? (required)"
                      onChangeText={(v) => setItem(item.key, { note: v }, false)} onBlur={() => persist(d)}
                      style={{ borderWidth: 1, borderColor: base.line, borderRadius: 8, padding: 10, minHeight: 60, color: base.ink }} />
                    {!!ans.photo_path && <StorageImage bucket="site-photos" path={ans.photo_path} style={{ width: 64, height: 64, borderRadius: 8, marginTop: 6 }} />}
                    {!submitted && <Button kind="ghost" disabled={!!photoBusy} title={photoBusy === item.key ? 'Uploading…' : ans.photo_path ? '📷 Retake Photo' : '📷 Add Photo (required)'} onPress={() => photo(item.key)} />}
                    {!ans.photo_path && !submitted && <Text style={{ color: base.warn, marginTop: 4 }}>Photo required for a failed item</Text>}
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      ))}

      {!submitted && <Button busy={busy} title={busy ? 'Submitting…' : 'Submit Checklist'} onPress={submit} />}
      <SectionTitle>Previous Weeks</SectionTitle>
      {history.length ? history.map((h) => (
        <Row key={h.id} title={`Week of ${new Date(`${h.week_start}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`} sub={h.has_fails ? '⚠ Had failed items' : 'All passed'} />
      )) : <Empty>No previous checklists yet.</Empty>}
    </ScrollView>
  );
}
