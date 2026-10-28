// Drivers: Book Stock Into The Yard (9219zq) — deliveries and leftovers. Book in only.
import { ScrollView } from 'react-native';

import { YardBookIn } from '@/components/YardBookIn';
import { space } from '@/theme/theme';

export default function DriverYard() {
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <YardBookIn canAddItems={false} />
    </ScrollView>
  );
}
