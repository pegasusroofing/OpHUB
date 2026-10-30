// One operative's certificates, office side (320 operativeCertListHtml): summary
// counts, add a certificate for them, and per certificate open / rename / set
// expiry / delete; Select to export the ticked ones as one PDF or email them.
// Feeds the company Training Matrix.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { pickRecipient } from '@/components/pickRecipient';
import { useTeam } from '@/data/admin';
import { Button, Card, Field, Muted } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { askDate, DateField } from '@/components/DateField';
import { deleteCert, renameCert, setCertCategory, setCertExpiry, uploadCert, useMyCerts } from '@/data/certs';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { buildCertBundlePdf } from '@/lib/certBundlePdf';
import { deliverPdf, emailPdf } from '@/lib/pdf';
import { CERT_CATEGORIES_AZ, certCategoryLabel, certDisplayName, certStats, type Cert } from '@/lib/rules/certs';
import { readIsoDate } from '@/lib/rules/materials';
import { base } from '@/theme/theme';

export function CertsPanel({ userId, manual = false }: { userId: string; manual?: boolean }) {
  const { me } = useAuth();
  const { data: team } = useTeam(me?.org_id);
  const toast = useToast();
  const qc = useQueryClient();
  const { data: certs = [], isLoading } = useMyCerts(userId, manual);
  const [showMissing, setShowMissing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState('cscs_card');
  const [other, setOther] = useState('');
  const [expiry, setExpiry] = useState('');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string> | null>(null); // ticked certificates (Select mode)
  const [bulk, setBulk] = useState<'pdf' | 'email' | null>(null);
  if (!me) return null;
  const picked = certs.filter((c) => sel?.has(c.id));
  // Ticked certificates as one PDF — saved, or emailed (to you, a PM / admin, or an address you type).
  const bundle = async (k: 'pdf' | 'email') => {
    let to: string | null = me.email || '', cc: string | undefined;
    if (k === 'email') { const r = await pickRecipient('Email the certificates to', team ?? [], me.email); if (!r) return; if (r === 'bad') { toast('Enter a valid email address.'); return; } to = r.to; cc = r.cc; }
    setBulk(k);
    try {
      const b = await buildCertBundlePdf(picked);
      if (k === 'pdf') { if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); else setSel(null); }
      else { const err = await emailPdf(b.bytes, b.filename, `cert-exports/${me.org_id}`, { general_label: 'Certificates', recipient_email: (to as string).trim(), cc_email: cc, doc_title: `Certificates (${picked.length})` }); toast(err || `Certificates emailed to ${(to as string).trim()}`); if (!err) setSel(null); }
    } catch { toast('Could not build the combined PDF.'); } finally { setBulk(null); }
  };
  const s = certStats(certs);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['myCerts', userId] }); void qc.invalidateQueries({ queryKey: ['operativeList'] }); void qc.invalidateQueries({ queryKey: ['manualPeople'] }); };
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
    const err = await uploadCert(me, { uri: file.uri, name: file.name || 'certificate', mimeType: file.mimeType, size: file.size }, cat, other.trim(), ex || null, userId, manual);
    setBusy(false);
    if (err) { toast(err); return; }
    toast('Certificate uploaded'); setAdding(false); setFile(null); setOther(''); setExpiry(''); refresh();
  };
  const menu = async (c: Cert) => {
    const k = await chooseAction(certDisplayName(c), [{ key: 'open', label: 'Open' }, { key: 'rename', label: 'Rename' }, { key: 'type', label: 'Change type' }, { key: 'expiry', label: 'Set expiry date' }, { key: 'delete', label: 'Delete' }]);
    if (k === 'open') { const u = await openDocLink('certifications', c.storage_path); if (u) viewDoc(u); else toast('Could not open the file.'); }
    else if (k === 'rename') {
      const n = await promptText('Rename certificate', certDisplayName(c)); if (n === null) return;
      if (!n.trim()) { toast('Name cannot be blank.'); return; }
      toast((await renameCert(c.id, n.trim())) ? 'Renamed' : 'Could not save — try again.'); refresh();
    } else if (k === 'type') {
      const t = await chooseAction('Type of card / certificate', CERT_CATEGORIES_AZ.map((x) => ({ key: x.key, label: x.label }))); if (!t) return;
      let desc: string | null = null;
      if (t === 'other') { const d = await promptText('What type of card / certificate is it?', c.other_type_description || ''); if (d === null) return; desc = d.trim() || null; }
      toast((await setCertCategory(c.id, t, desc)) ? `Moved to ${t === 'other' && desc ? desc : certCategoryLabel(t)}` : 'Could not save — try again.'); refresh();
    } else if (k === 'expiry') {
      const v = await askDate('Expiry date (Clear for none)'); if (v === null) return;
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
          <DateField label="Expiry date (optional)" value={expiry} onChange={setExpiry} />
          <Button kind="ghost" title={file ? `📎 ${file.name}` : 'Choose file…'} onPress={async () => {
            const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
            if (!r.canceled && r.assets[0]) setFile(r.assets[0]);
          }} />
          <Button busy={busy} title="Upload" onPress={upload} />
        </Card>
      )}
      {certs.length > 0 && (sel ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <View style={{ flex: 1 }}><Button busy={bulk === 'pdf'} disabled={!picked.length} title={`Export ${picked.length} (PDF)`} onPress={() => void bundle('pdf')} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" busy={bulk === 'email'} disabled={!picked.length} title={`Email ${picked.length}`} onPress={() => void bundle('email')} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setSel(null)} /></View>
        </View>
      ) : <Button kind="ghost" title="☑ Select to export or email" onPress={() => setSel(new Set())} />)}
      {isLoading ? <Muted>Loading…</Muted> : !certs.length ? <Muted>No certificates yet.</Muted> : CERT_CATEGORIES_AZ.map((c) => {
        const list = certs.filter((x) => x.category === c.key);
        if (!list.length) return null;
        return (
          <View key={c.key}>
            <Muted style={{ fontWeight: '700', marginTop: 10, marginBottom: 4 }}>{c.label} ({list.length})</Muted>
            {list.map((f) => {
              const expired = !!f.expiry_date && f.expiry_date < new Date().toISOString().slice(0, 10);
              return (
                <Pressable key={f.id} onPress={() => { if (!sel) { void menu(f); return; } const n = new Set(sel); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); setSel(n); }}>
                  <Card style={{ paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {sel && <Text style={{ fontSize: 17, color: base.ink }}>{sel.has(f.id) ? '☑' : '☐'}</Text>}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: base.ink }} numberOfLines={1}>{(f as { source?: string; pushed_to_onedrive_at?: string | null }).source === 'onedrive' || (f as { pushed_to_onedrive_at?: string | null }).pushed_to_onedrive_at ? '☁️ ' : '📱 '}{certDisplayName(f)}</Text>
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
