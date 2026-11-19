// The email signature, filled in for you (Andy, 19 Nov 2026: "autopopulate the email signatures please like you did for
// rtb roofing"). Shown on Finance › Settings › Templates, in each template and on the quote chaser wording, exactly as
// it goes under the emails (send-finance-email v12, quote-tracker v10): your name, your phone and your email for this
// company, the company, its address and phone, and on Finance emails its company and VAT numbers, with the logo.
// What's missing can be filled in from here: the company's address and phone (admins; the same details the RAMS
// Builder prints) and your phone and email (My Settings).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Pop } from '@/components/Pop';
import { StorageImage } from '@/components/StorageImage';
import { Button, Muted } from '@/components/ui';
import { useMyCompanies } from '@/data/companies';
import { useFinSettings } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { signatureGaps, signatureParts, type SigIn } from '@/lib/rules/emailSignature';
import { supabase } from '@/lib/supabase';
import { base, radius } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Rams = { address?: string; phone?: string } & Record<string, unknown>;

/** My email for the company I'm in: the one set for it in My Settings, or my sign-in email. Replies go here. */
export function useMyEmailHere(): string {
  const { me, org } = useAuth();
  const { data: companies = [] } = useMyCompanies(!!me, me ? `${me.id}:${me.org_id}` : null);
  const here = companies.find((c) => c.org_id === org?.id) || companies.find((c) => c.is_current);
  return String(here?.work_email || me?.email || '').trim();
}

function useCompanyContact(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['orgContact', orgId], enabled: !!orgId,
    queryFn: async () => (((await db.from('organizations').select('rams_settings').eq('id', orgId as string).maybeSingle()).data as { rams_settings: Rams | null } | null)?.rams_settings) || {},
  });
}

/** Everything the signature is made from. */
export function useSignature(finance: boolean): SigIn {
  const { me, org } = useAuth();
  const email = useMyEmailHere();
  const { data: rams } = useCompanyContact(org?.id);
  const { data: fin } = useFinSettings(finance ? org?.id : null);
  return {
    name: me?.name, phone: (me as { phone?: string | null } | null)?.phone, email, company: org?.name,
    address: String(rams?.address || '').trim() || String((fin as Record<string, unknown> | undefined)?.company_address || ''),
    tel: rams?.phone, regNo: String((fin as Record<string, unknown> | undefined)?.company_reg_no || ''), vatNo: String((fin as Record<string, unknown> | undefined)?.company_vat_no || ''),
  };
}

/** The signature as it shows under the email. */
export function SignaturePreview({ finance = false, showLogo = true }: { finance?: boolean; showLogo?: boolean }) {
  const { org } = useAuth();
  const p = signatureParts(useSignature(finance), finance);
  const line = (t: string, bold = false) => (t ? <Text style={{ fontSize: bold ? 14 : 13, fontWeight: bold ? '700' : '400', color: bold ? base.ink : '#3B4048', lineHeight: 19 }}>{t}</Text> : null);
  return (
    <View accessibilityLabel="Email signature" style={{ flexDirection: 'row', gap: 14, borderTopWidth: 1, borderTopColor: base.line, paddingTop: 12 }}>
      {showLogo && org?.logo_path ? <StorageImage bucket="org-logos" path={org.logo_path} style={{ width: 90, height: 52, resizeMode: 'contain' }} /> : null}
      <View style={{ flex: 1 }}>
        {line(p.name, true)}{line(p.contact)}
        <View style={{ height: 4 }} />
        {line(p.company, true)}{line(p.address)}{line(p.tel)}{line(p.numbers)}
      </View>
    </View>
  );
}

/** The signature with a word on where it comes from, and buttons to fill in what's missing. */
export function SignatureCard({ finance = false }: { finance?: boolean }) {
  const { me, org } = useAuth();
  const sig = useSignature(finance);
  const gaps = signatureGaps(sig);
  const [editing, setEditing] = useState(false);
  const isAdmin = me?.role === 'admin';
  return (
    <View style={{ borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.card, backgroundColor: base.card, padding: 14, marginBottom: 12 }}>
      <Text style={{ fontWeight: '600', color: base.ink, marginBottom: 4 }}>Email Signature</Text>
      <Muted style={{ marginBottom: 10 }}>Goes under every {finance ? 'Finance email' : 'chaser and quote email'}, filled in for you from your details and {org?.name || 'the company'}’s. Replies go to your email for {org?.name || 'this company'}.</Muted>
      <SignaturePreview finance={finance} />
      {gaps.length ? <Muted style={{ marginTop: 10 }}>Not filled in yet: {gaps.join(', ')}.</Muted> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {isAdmin && <Button small kind="ghost" title="✎ Company Address And Phone" onPress={() => setEditing(true)} />}
        <Button small kind="ghost" title="✎ My Phone And Email" onPress={() => router.push('/account' as never)} />
      </View>
      {editing && org && <CompanyContactPop orgId={org.id} onClose={() => setEditing(false)} />}
    </View>
  );
}

function CompanyContactPop({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useCompanyContact(orgId);
  const [address, setAddress] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 10 };
  const save = async () => {
    setBusy(true); setErr('');
    try {
      // The RAMS numbers live in the same settings and move on as RAMS are made: read them fresh and change only these two.
      const live = (((await db.from('organizations').select('rams_settings').eq('id', orgId).maybeSingle()).data as { rams_settings: Rams | null } | null)?.rams_settings) || {};
      const next = { ...live, address: (address ?? String(data?.address || '')).trim(), phone: (phone ?? String(data?.phone || '')).trim() };
      const r = await db.from('organizations').update({ rams_settings: next } as never).eq('id', orgId).select('id');
      if (r.error || !(r.data as unknown[] | null)?.length) { setErr('Could not save — only a company admin can change these.'); return; }
      await qc.invalidateQueries({ queryKey: ['orgContact', orgId] });
      void qc.invalidateQueries({ queryKey: ['ramsSettings', orgId] });
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <Pop title="Company Address And Phone" onClose={onClose}>
      <Muted style={{ marginBottom: 8 }}>Used in email signatures and printed at the top of RAMS.</Muted>
      <Muted style={{ fontWeight: '500' }}>Address (One Line Per Row)</Muted>
      <TextInput accessibilityLabel="Company address" value={address ?? String(data?.address || '')} onChangeText={setAddress} multiline style={[box, { minHeight: 90, textAlignVertical: 'top' }]} />
      <Muted style={{ fontWeight: '500' }}>Telephone</Muted>
      <TextInput accessibilityLabel="Company telephone" value={phone ?? String(data?.phone || '')} onChangeText={setPhone} keyboardType="phone-pad" style={box} />
      {err ? <Text style={{ color: '#C0392B', fontWeight: '500', marginBottom: 8 }}>{err}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        <View style={{ flex: 2, maxWidth: 220 }}><Button busy={busy} title="Save" onPress={() => void save()} /></View>
        <View style={{ flex: 1, maxWidth: 140 }}><Button kind="ghost" title="Cancel" onPress={onClose} /></View>
      </View>
    </Pop>
  );
}
