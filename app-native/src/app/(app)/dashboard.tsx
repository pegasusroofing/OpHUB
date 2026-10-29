// My dashboard (operatives). Ported from renderOperativeDashboard (670, operative view):
// Outstanding Items, certificate summary, my certificates (view, add), My Tools.
// Export or email all my certificates as one PDF.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MyToolsList } from '@/components/MyToolsList';
import { promptText, useToast } from '@/components/toast';
import { Button, Card, Field, Muted, Screen, SectionTitle, Toggle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { uploadCert, useMyCerts } from '@/data/certs';
import { buildCertBundlePdf } from '@/lib/certBundlePdf';
import { deliverPdf, emailPdf } from '@/lib/pdf';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { CERT_CATEGORIES_AZ, certCategoryLabel, certDisplayName, certStats } from '@/lib/rules/certs';
import { base, space } from '@/theme/theme';

export default function Dashboard() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: certs = [], isLoading } = useMyCerts();
  const [showMissing, setShowMissing] = useState(false);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState('cscs_card');
  const [other, setOther] = useState('');
  const [expiry, setExpiry] = useState('');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState<'pdf' | 'email' | null>(null);
  if (!me) return null;
  const bundle = async (k: 'pdf' | 'email') => {
    let to = me.email || '';
    if (k === 'email') { to = ((await promptText('Email my certificates to', me.email || '')) || '').trim(); if (!to) return; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast('Enter a valid email address.'); return; } }
    setBulk(k);
    try {
      const b = await buildCertBundlePdf(certs);
      if (k === 'pdf') { if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); }
      else toast((await emailPdf(b.bytes, b.filename, `cert-exports/${me.org_id}`, { general_label: 'Certificates', recipient_email: to, doc_title: `${me.name} — certificates` })) || `Certificates emailed to ${to}`);
    } catch { toast('Could not build the combined PDF.'); } finally { setBulk(null); }
  };
  const s = certStats(certs);

  const stat = (v: number, label: string, colour: string, onPress?: () => void) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1, minWidth: 80, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 16, padding: 10, alignItems: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: v ? colour : base.ink }}>{v}</Text>
      <Text style={{ fontSize: 11, color: base.slate, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
  const upload = async () => {
    if (!file) { toast('Choose a file to upload.'); return; }
    if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry.trim())) { toast('Expiry should look like 2027-03-31.'); return; }
    setBusy(true);
    const err = await uploadCert(me, { uri: file.uri, name: file.name || 'certificate', mimeType: file.mimeType, size: file.size }, cat, other.trim(), expiry.trim() || null);
    setBusy(false);
    if (err) { toast(err); return; }
    toast('Certificate uploaded'); setAdding(false); setFile(null); setOther(''); setExpiry('');
    void qc.invalidateQueries({ queryKey: ['myCerts'] });
  };

  return (
    <Screen>
      <Pressable onPress={() => router.push('/inbox?tab=todo')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: base.ink }}>Outstanding Items</Text>
            <Muted>RAMS, COSHH and Toolbox Talks awaiting your signature</Muted>
          </View>
          <Text style={{ fontSize: 20, color: base.slate }}>›</Text>
        </Card>
      </Pressable>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {stat(s.total, s.total === 1 ? 'Certificate' : 'Certificates', base.ink)}
        {stat(s.expiringSoon, 'Expiring Soon', base.warn)}
        {stat(s.expired, 'Expired', base.red)}
        {stat(s.missing, 'Missing Types', base.warn, () => setShowMissing(!showMissing))}
      </View>
      {showMissing && <Muted style={{ marginBottom: 8 }}>{s.missingKeys.length ? `Missing: ${s.missingKeys.map(certCategoryLabel).join(', ')}` : 'All standard requirements are on file.'}</Muted>}
      <Muted style={{ marginBottom: 10 }}>These feed the company Training Matrix automatically — your PM/admin sees this exact record under Operatives.</Muted>

      <Toggle title={`Certifications (${certs.length})`} open={open} onPress={() => setOpen(!open)} />
      {open && (
        <View style={{ marginTop: 8 }}>
          {certs.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
              <View style={{ flex: 1 }}><Button kind="ghost" busy={bulk === 'pdf'} title="📄 Export all (PDF)" onPress={() => void bundle('pdf')} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" busy={bulk === 'email'} title="✉️ Email all" onPress={() => void bundle('email')} /></View>
            </View>
          )}
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
                {list.map((f) => (
                  <Pressable key={f.id} onPress={async () => { const u = await openDocLink('certifications', f.storage_path); if (u) viewDoc(u); else toast('Could not open the file.'); }}>
                    <Card style={{ paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '600', color: base.ink }} numberOfLines={1}>{certDisplayName(f)}</Text>
                        <Muted>{f.category === 'other' && f.other_type_description ? `${f.other_type_description} · ` : ''}{f.expiry_date ? `Expires ${new Date(`${f.expiry_date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'No expiry'}</Muted>
                      </View>
                      <Text>👁</Text>
                    </Card>
                  </Pressable>
                ))}
              </View>
            );
          })}
        </View>
      )}

      <SectionTitle>My Tools</SectionTitle>
      <MyToolsList />
      <View style={{ height: space.xl }} />
    </Screen>
  );
}
