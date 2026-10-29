// Drivers: Book Stock Into The Yard (9219zq) — deliveries and leftovers. Book in only.
import { ScrollView } from 'react-native';

import { YardBookIn } from '@/components/YardBookIn';
import { page, space } from '@/theme/theme';

export default function DriverYard() {
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <YardBookIn canAddItems={false} />
    </ScrollView>
  );
}
