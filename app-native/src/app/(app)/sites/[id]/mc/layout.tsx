// Site Rules & Layout (540): signed like COSHH — everyone assigned to the job signs to confirm they've read it.
// Managers build a Site Rules sheet (Andy, 20 Nov 2026: "a customisable (template style) sheet, where we can add in
// numbered items and it creates a pdf with the site rules etc. allow upload still"), or upload a PDF as before.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { HsDocList } from '@/components/HsDocList';
import { HsDocUpload } from '@/components/HsDocUpload';
import { useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { createSiteRules, useSiteRulesBuilds } from '@/data/siteRules';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius } from '@/theme/theme';

export default function SiteLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: site } = useSite(id);
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const mgr = !!me && isManager(me);
  const { data: builds = [] } = useSiteRulesBuilds(id, mgr);
  const [busy, setBusy] = useState(false);
  const open = (b: string) => router.push(`/sites/${id}/mc/rules/${b}` as never);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Site Rules & Layout' }} />
      {site && me && mgr && (
        <Card>
          <SectionTitle>Site Rules Sheet</SectionTitle>
          {builds.length ? builds.map((b) => (
            <Pressable key={b.id} onPress={() => open(b.id)} accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
              <Text style={{ fontSize: 20 }}>📏</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>{(b.data as { title?: string } | null)?.title || 'Site Rules'}</Text>
                <Muted>{b.status === 'issued' ? `Issued · version ${b.version}` : 'Draft'} · {((b.data as { rules?: string[] } | null)?.rules ?? []).length} rules</Muted>
              </View>
              <Text style={{ color: base.slate }}>›</Text>
            </Pressable>
          )) : <Muted style={{ marginBottom: 8 }}>Build the job&apos;s site rules from your company&apos;s numbered rules, with the site information and layout plan. It makes a PDF everyone signs here.</Muted>}
          <View style={{ alignItems: 'center', marginTop: 4 }}>
            <Button busy={busy} title={builds.length ? '+ Build Another Sheet' : '+ Build Site Rules'} onPress={async () => {
              setBusy(true); const b = await createSiteRules(me, site); setBusy(false);
              if (!b) { toast('Could not start the sheet - try again.'); return; }
              void qc.invalidateQueries({ queryKey: ['siteRulesBuilds', id] }); open(b);
            }} />
          </View>
        </Card>
      )}
      {site && me && mgr && <HsDocUpload kind="layout" site={site} />}
      {site ? <HsDocList kind="layout" site={site} /> : <Muted>Loading…</Muted>}
    </ScrollView>
  );
}
