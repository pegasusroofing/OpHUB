// Admin Centre › OneDrive: load the job pack rules from the Excel, say where new jobs go, and switch it on.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { saveJobPackSettings, useJobPackSettings } from '@/data/jobPack';
import { useAuth } from '@/lib/auth';
import { parseJobPack } from '@/lib/rules/jobPack';
import { readXlsx } from '@/lib/rules/xlsxRead';
import { base, radius } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8, fontSize: 16 } as const;

export function JobPackCard() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useJobPackSettings(me?.org_id);
  const [parent, setParent] = useState('');
  const [template, setTemplate] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data?.config) { setParent(data.config.parent_path); setTemplate(data.config.template_path); } }, [data?.config]);
  if (!me?.org_id) return null;
  const orgId = me.org_id;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['jobPackSettings', orgId] });
  const cfg = data?.config;
  const load = async () => {
    if (!parent.trim() || !template.trim()) { toast('Say where new jobs go and where the template is first.'); return; }
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    setBusy(true);
    try {
      const sheets = await readXlsx(new Uint8Array(await (await fetch(r.assets[0].uri)).arrayBuffer()));
      const out = parseJobPack(sheets, { parent_path: parent.trim(), template_path: template.trim() });
      if ('error' in out) { showAlert(out.error); return; }
      toast((await saveJobPackSettings(orgId, me.id, { enabled: !!data?.enabled, config: out.config })) ? `Rules loaded: ${out.config.folders.length} folders, ${out.config.files.length} documents` : 'Could not save — try again.');
      refresh();
    } catch { toast('Could not read that file: is it the .xlsx?'); } finally { setBusy(false); }
  };
  return (
    <Card>
      <SectionTitle>New job pack</SectionTitle>
      <Muted style={{ marginBottom: 8 }}>A new job gets its own OneDrive folder from your rules, and the app files things where the rules say. Change the rules in the Excel, then load it here.</Muted>
      <Muted style={{ fontWeight: '700', marginBottom: 4 }}>New job folders go in</Muted>
      <TextInput value={parent} onChangeText={setParent} placeholder="e.g. RTB Roofing Ltd/Live Projects" style={box} />
      <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Template folder</Muted>
      <TextInput value={template} onChangeText={setTemplate} placeholder="e.g. RTB Roofing Ltd/Live Projects/- New Job Pack - Template" style={box} />
      {!!cfg && <Text style={{ color: base.ink, marginBottom: 8 }}>{cfg.folders.length} folders, {cfg.files.length} documents, {Object.values(cfg.rules).filter((x) => x.on).length} sync rules on. {data?.enabled ? 'Switched on.' : 'Switched off.'}</Text>}
      <View style={{ gap: 8 }}>
        <Button kind="ghost" busy={busy} title="📊 Load the rules from Excel" onPress={() => void load()} />
        {!!cfg && <Button title={data?.enabled ? 'Switch off' : 'Switch on for new jobs'} kind={data?.enabled ? 'ghost' : undefined} onPress={async () => {
          if (!data?.enabled && !(await confirmAsk('Every new job will get a OneDrive folder from these rules. Existing jobs aren’t touched. Switch on?', 'Switch on'))) return;
          toast((await saveJobPackSettings(orgId, me.id, { enabled: !data?.enabled, config: cfg })) ? (data?.enabled ? 'Switched off' : 'Switched on') : 'Could not save — try again.');
          refresh();
        }} />}
      </View>
    </Card>
  );
}
