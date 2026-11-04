// Plant on this job (Materials › Plant; 740, reworked by Andy 4 Nov 2026): what's here and what people have signed out
// for this job, plus what's free in the yard. Operatives request it and sign for it, and hand it back with a photo;
// PMs allocate, approve, confirm returns and return items themselves. The company-wide list is Projects › Yard & Plant.
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { PlantRegister } from '@/components/PlantRegister';
import { Muted } from '@/components/ui';
import { page } from '@/theme/theme';

export default function Plant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ScrollView contentContainerStyle={page(760)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Plant' }} />
      <Muted style={{ marginBottom: 10 }}>Every item is signed for. A PM allocates it or approves a request, then the person signs for it. Handing it back needs a signature and a photo, and a PM or the yard confirms it.</Muted>
      <PlantRegister siteId={id} />
    </ScrollView>
  );
}
