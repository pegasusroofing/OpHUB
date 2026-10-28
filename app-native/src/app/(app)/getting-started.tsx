// Getting Started: a step-by-step checklist for new operatives. Ported from
// renderOnboardingChecklist (210). The "add to home screen" steps only make sense for
// the website, so they're shown on the web version only (the phone app is already installed).
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Field, Muted, Screen } from '@/components/ui';
import { savePhone, useOnboarding } from '@/data/onboarding';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { base, useTheme } from '@/theme/theme';

type Step = { key: string; title: string; done: boolean; body: string; href?: string; phone?: boolean };

export default function GettingStarted() {
  const { me, refresh } = useAuth();
  const t = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites } = useSites();
  const { data, isLoading } = useOnboarding(sites);
  const [idx, setIdx] = useState(0);
  const [phone, setPhone] = useState((me as { phone?: string | null } | null)?.phone || '');
  if (!me) return null;
  if (isLoading) return <Screen><Muted>Loading…</Muted></Screen>;
  if (!data) return <Screen><Muted>Nothing to do here right now.</Muted></Screen>;

  const steps: Step[] = [
    { key: 'welcome', title: 'Welcome to OpHUB', done: true, body: "Let's get you fully set up — a few quick steps and you're ready to go." },
    ...data.items.map((it) => ({ key: it.key, title: it.label, done: it.done, body: it.desc, href: it.done ? undefined : it.href || undefined, phone: it.key === 'phone' })),
    ...(Platform.OS === 'web' ? [
      { key: 'android-home', title: 'Add to Home Screen — Android', done: false, body: 'In Chrome: tap the ⋮ menu (top-right), tap Add to Home Screen (or Install app), then tap Add / Install.' },
      { key: 'iphone-home', title: 'Add to Home Screen — iPhone', done: false, body: 'In Safari: tap Share (the square with an arrow), scroll down, tap Add to Home Screen, then Add. This only works from Safari.' },
    ] : []),
    { key: 'finish', title: "You're all set", done: true, body: "That's everything — head back to your projects whenever you're ready." },
  ];
  const i = Math.max(0, Math.min(idx, steps.length - 1));
  const step = steps[i];

  return (
    <Screen>
      <Muted>Step {i + 1} of {steps.length}</Muted>
      <View style={{ flexDirection: 'row', gap: 4, marginVertical: 12 }}>
        {steps.map((s, k) => <Pressable key={s.key} onPress={() => setIdx(k)} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: k <= i ? t.brand1 : base.line }} />)}
      </View>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: step.done ? base.okBg : base.warnBg }}>
            <Text style={{ fontWeight: '800', color: step.done ? base.ok : base.warn }}>{step.done ? '✓' : i + 1}</Text>
          </View>
          <Text style={{ fontWeight: '800', fontSize: 15, color: base.ink, flex: 1 }}>{step.title}</Text>
        </View>
        <Muted style={{ marginBottom: 12, fontSize: 13.5 }}>{step.body}</Muted>
        {step.phone && (
          <>
            <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="e.g. 07123 456789" />
            <Button title={step.done ? 'Update number' : 'Save number'} onPress={async () => {
              const err = await savePhone(me, phone.trim());
              if (err) { toast(err); return; }
              toast('Phone number saved'); await refresh(); void qc.invalidateQueries({ queryKey: ['onboarding'] }); setIdx(i + 1);
            }} />
          </>
        )}
        {step.href && <Button title="Go do this now" onPress={() => router.push(step.href as never)} />}
      </Card>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        <View style={{ flex: 1 }}><Button kind="ghost" disabled={i === 0} title="‹ Back" onPress={() => setIdx(i - 1)} /></View>
        <View style={{ flex: 1 }}>{i < steps.length - 1
          ? <Button title="Next ›" onPress={() => setIdx(i + 1)} />
          : <Button title="Finish" onPress={() => router.replace('/home')} />}</View>
      </View>
    </Screen>
  );
}
