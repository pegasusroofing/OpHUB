// Visitor sign-in for a main contractor job (Andy, 21 Nov 2026: "a visitor button / qr code for each site that can sign
// and the visitors sign in giving their name number email company and then sign out"). The job's QR code opens this page:
// no account needed. They give their name, phone, email and company, agree to follow the site rules, and sign in; the same
// page on their phone then signs them out. Signed in or out of OpHUB, it works the same.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { keepVisit, savedVisit, visitInfo, visitorSignIn, visitorSignOut, visitStatus, type Visit, type VisitInfo } from '@/data/visitors';
import { supabase } from '@/lib/supabase';
import { base, radius } from '@/theme/theme';

type Status = { name: string; signed_in_at: string; signed_out_at: string | null };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 12, fontSize: 16, color: base.ink, backgroundColor: '#fff', marginBottom: 12 } as const;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function VisitorSignIn() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const [info, setInfo] = useState<VisitInfo | null | undefined>(undefined);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [f, setF] = useState({ name: '', phone: '', email: '', company: '' });
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!key) return;
    void visitInfo(key).then(setInfo);
    const v = savedVisit(key);
    if (v) void visitStatus(v).then((s) => { if (s && !s.signed_out_at) { setVisit(v); setStatus(s); } else keepVisit(key, null); });
  }, [key]);
  const colour = info?.colour || base.red;
  const logo = info?.logo ? supabase.storage.from('org-logos').getPublicUrl(info.logo).data.publicUrl : null;
  const btn = (title: string, onPress: () => void, ghost = false) => (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => [{ backgroundColor: ghost ? '#E6E8EC' : colour, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: busy ? 0.6 : 1 }, pressed && { opacity: 0.85 }]}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: ghost ? base.ink : '#fff' }}>{busy ? 'Please wait…' : title}</Text>
    </Pressable>
  );
  const signIn = async () => {
    setErr('');
    if (f.name.trim().length < 2) { setErr('Enter your name.'); return; }
    if (f.phone.replace(/[^0-9]/g, '').length < 10) { setErr('Enter your phone number.'); return; }
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { setErr('Check your email address.'); return; }
    if (!agree) { setErr('Tick to say you’ll follow the site rules.'); return; }
    setBusy(true); const r = await visitorSignIn(key as string, f); setBusy(false);
    if (typeof r === 'string') { setErr(r); return; }
    keepVisit(key as string, r); setVisit(r); setStatus({ name: f.name.trim(), signed_in_at: new Date().toISOString(), signed_out_at: null });
  };
  const signOut = async () => {
    if (!visit) return;
    setBusy(true); const ok = await visitorSignOut(visit); setBusy(false);
    if (!ok) { setErr('Could not sign you out — check your signal and try again, or tell the site team.'); return; }
    keepVisit(key as string, null); setStatus((s) => (s ? { ...s, signed_out_at: new Date().toISOString() } : s)); setVisit(null);
  };
  const field = (k: keyof typeof f, label: string, o: { ph?: string; kb?: 'phone-pad' | 'email-address'; auto?: 'name' | 'tel' | 'email' | 'organization' } = {}) => (
    <View key={k}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink, marginBottom: 5 }}>{label}</Text>
      <TextInput value={f[k]} onChangeText={(v) => setF((x) => ({ ...x, [k]: v }))} accessibilityLabel={label} placeholder={o.ph} placeholderTextColor={base.slateLight}
        keyboardType={o.kb} autoCapitalize={k === 'email' ? 'none' : 'words'} autoComplete={o.auto} style={box} />
    </View>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#EEF0F3' }} contentContainerStyle={{ padding: 18, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Visitor Sign-In' }} />
      <View style={{ width: '100%', maxWidth: 480 }}>
        <View style={{ alignItems: 'center', marginVertical: 14 }}>
          {logo ? <Image source={{ uri: logo }} style={{ width: 160, height: 60, resizeMode: 'contain', marginBottom: 8 }} accessibilityLabel={info?.company || 'Logo'} /> : null}
          <Text style={{ fontSize: 22, fontWeight: '700', color: base.ink, textAlign: 'center' }}>Visitor Sign-In</Text>
          {info ? <Text style={{ fontSize: 15, color: base.slate, textAlign: 'center', marginTop: 2 }}>{info.site} · {info.company}</Text> : null}
        </View>
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: base.cardLine, borderRadius: 16, padding: 18 }}>
          {info === undefined ? <Text style={{ color: base.slate }}>Loading…</Text>
            : info === null ? <Text style={{ fontSize: 15, color: base.ink }}>This sign-in link isn&apos;t working. Ask the site team.</Text>
              : status && !status.signed_out_at ? (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: base.ink }}>You&apos;re Signed In</Text>
                  <Text style={{ fontSize: 15, color: base.slate, marginTop: 4, marginBottom: 16 }}>{status.name} · since {time(status.signed_in_at)}. Sign out here when you leave the site.</Text>
                  {!!err && <Text style={{ color: base.red, marginBottom: 10 }}>{err}</Text>}
                  {btn('Sign Out', () => void signOut())}
                </>
              ) : status?.signed_out_at ? (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: base.ink }}>Signed Out</Text>
                  <Text style={{ fontSize: 15, color: base.slate, marginTop: 4, marginBottom: 16 }}>At {time(status.signed_out_at)}. Thank you, {status.name}.</Text>
                  {btn('Sign In Again', () => { setStatus(null); setErr(''); }, true)}
                </>
              ) : (
                <>
                  {field('name', 'Your Name *', { auto: 'name' })}
                  {field('phone', 'Phone Number *', { kb: 'phone-pad', auto: 'tel', ph: 'e.g. 07123 456789' })}
                  {field('email', 'Email', { kb: 'email-address', auto: 'email' })}
                  {field('company', 'Company', { auto: 'organization', ph: 'Who you’re with' })}
                  <Pressable onPress={() => setAgree(!agree)} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
                    <Text style={{ fontSize: 20 }}>{agree ? '☑' : '☐'}</Text>
                    <Text style={{ flex: 1, fontSize: 14.5, color: base.ink }}>I&apos;ll follow the site rules, wear the PPE I&apos;m given and do as the site team asks.</Text>
                  </Pressable>
                  {!!err && <Text style={{ color: base.red, marginBottom: 10 }}>{err}</Text>}
                  {btn('Sign In', () => void signIn())}
                  <Text style={{ fontSize: 12, color: base.slate, marginTop: 12 }}>Your details are kept by {info.company} for site safety (who is on site, for a fire roll call) and aren&apos;t used for anything else.</Text>
                </>
              )}
        </View>
      </View>
    </ScrollView>
  );
}
