// One operative's certificates, office side (320 operativeCertListHtml): summary
// counts, add a certificate for them, and per certificate open / rename / set
// expiry / delete. Feeds the company Training Matrix.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Field, Muted } from '@/components/ui';
import { deleteCert, renameCert, setCertExpiry, uploadCert, useMyCerts } from '@/data/certs';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { CERT_CATEGORIES_AZ, certCategoryLabel, certDisplayName, certStats, type Cert } from '@/lib/rules/certs';
import { readIsoDate } from '@/lib/rules/materials';
import { base } from '@/theme/theme';

export function CertsPanel({ userId }: { userId: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: certs = [], isLoading } = useMyCerts(userId);
  const [showMissing, setShowMissing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState('cscs_card');
  const [other, setOther] = useState('');
  const [expiry, setExpiry] = useState('');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const s = certStats(certs);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['myCerts', userId] }); void qc.invalidateQueries({ queryKey: ['operativeList'] }); };
  const stat = (v: number, label: string, colour: string, onPress?: () => void) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1, minWidth: 80, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 16, padding: 10, alignItems: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: v ? colour : base.ink }}>{v}</Text>
      <Text style={{ fontSize: 11, color: base.slate, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
  const upload = async () => {
    if (!file) { toast('Choose a file to upload.'); return; }
    const ex = readIsoDate(expiry); if (ex === 'bad') { toast('Expiry should look like 2027-03-31.'); return; }
    setBusy(true);
    const err = await uploadCert(me, { uri: file.uri, name: file.name || 'certificate', mimeType: file.mimeType, size: file.size }, cat, other.trim(), ex || null, userId);
    setBusy(false);
    if (err) { toast(err); return; }
    toast('Certificate uploaded'); setAdding(false); setFile(null); setOther(''); setExpiry(''); refresh();
  };
  const menu = async (c: Cert) => {
    const k = await chooseAction(certDisplayName(c), [{ key: 'open', label: 'Open' }, { key: 'rename', label: 'Rename' }, { key: 'expiry', label: 'Set expiry date' }, { key: 'delete', label: 'Delete' }]);
    if (k === 'open') { const u = await openDocLink('certifications', c.storage_path); if (u) void Linking.openURL(u); else toast('Could not open the file.'); }
    else if (k === 'rename') {
      const n = await promptText('Rename certificate', certDisplayName(c)); if (n === null) return;
      if (!n.trim()) { toast('Name cannot be blank.'); return; }
      toast((await renameCert(c.id, n.trim())) ? 'Renamed' : 'Could not save — try again.'); refresh();
    } else if (k === 'expiry') {
      const v = await promptText('Expiry date (YYYY-MM-DD) — leave blank for none', c.expiry_date || ''); if (v === null) return;
      const d = readIsoDate(v); if (d === 'bad') { toast('Enter the date as YYYY-MM-DD.'); return; }
      toast((await setCertExpiry(c.id, d || null)) ? 'Expiry saved' : 'Could not save — try again.'); refresh();
    } else if (k === 'delete') {
      if (!(await confirmAsk("Delete this certificate? This can't be undone.", 'Delete'))) return;
      toast((await deleteCert(c)) ? 'Certificate deleted' : 'Could not delete — try again.'); refresh();
    }
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {stat(s.total, s.total === 1 ? 'Certificate' : 'Certificates', base.ink)}
        {stat(s.expiringSoon, 'Expiring Soon', base.warn)}
        {stat(s.expired, 'Expired', base.red)}
        {stat(s.missing, 'Missing Types', base.warn, () => setShowMissing(!showMissing))}
      </View>
      {showMissing && <Muted style={{ marginBottom: 8 }}>{s.missingKeys.length ? `Missing: ${s.missingKeys.map(certCategoryLabel).join(', ')}` : 'All standard requirements are on file.'}</Muted>}
      <Pressable onPress={() => setAdding(!adding)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
        <Text style={{ fontWeight: '700', color: base.ink }}>Add a certificate</Text>
        <Text style={{ fontSize: 20, color: base.ink }}>{adding ? '−' : '+'}</Text>
      </Pressable>
      {adding && (
        <Card>
          <Muted style={{ fontWeight: '700', marginBottom: 6 }}>Type</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {CERT_CATEGORIES_AZ.map((c) => (
              <Pressable key={c.key} onPress={() => setCat(c.key)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: cat === c.key ? base.ink : base.line, backgroundColor: cat === c.key ? base.ink : base.card }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: cat === c.key ? '#fff' : base.ink }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          {cat === 'other' && <Field label="Describe the certificate type" value={other} onChangeText={setOther} />}
          <Field label="Expiry date (optional, YYYY-MM-DD)" value={expiry} onChangeText={setExpiry} autoCapitalize="none" />
          <Button kind="ghost" title={file ? `📎 ${file.name}` : 'Choose file…'} onPress={async () => {
            const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
            if (!r.canceled && r.assets[0]) setFile(r.assets[0]);
          }} />
          <Button busy={busy} title="Upload" onPress={upload} />
        </Card>
      )}
      {isLoading ? <Muted>Loading…</Muted> : !certs.length ? <Muted>No certificates yet.</Muted> : CERT_CATEGORIES_AZ.map((c) => {
        const list = certs.filter((x) => x.category === c.key);
        if (!list.length) return null;
        return (
          <View key={c.key}>
            <Muted style={{ fontWeight: '700', marginTop: 10, marginBottom: 4 }}>{c.label} ({list.length})</Muted>
            {list.map((f) => {
              const expired = !!f.expiry_date && f.expiry_date < new Date().toISOString().slice(0, 10);
              return (
                <Pressable key={f.id} onPress={() => void menu(f)}>
                  <Card style={{ paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: base.ink }} numberOfLines={1}>{certDisplayName(f)}</Text>
                      <Muted style={expired ? { color: base.red } : undefined}>{f.category === 'other' && f.other_type_description ? `${f.other_type_description} · ` : ''}{f.expiry_date ? `${expired ? 'Expired' : 'Expires'} ${new Date(`${f.expiry_date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'No expiry'}</Muted>
                    </View>
                    <Text style={{ color: base.slate }}>⋮</Text>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
