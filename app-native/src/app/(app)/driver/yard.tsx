// Book Stock Into The Yard (9219zq) — deliveries and leftovers. Drivers (home tile), managers
// (Projects › Materials "⬇ Book into yard") and Finance (Yard stock "Book stock in") all use this form.
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { YardBookIn } from '@/components/YardBookIn';
import { yardCanEdit } from '@/data/materials';
import { useAuth } from '@/lib/auth';
import { isFinanceUser } from '@/lib/roles';
import { page } from '@/theme/theme';

export default function DriverYard() {
  const { me, org } = useAuth();
  const { stock } = useLocalSearchParams<{ stock?: string }>();
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <YardBookIn canAddItems={yardCanEdit(me, isFinanceUser(me, org))} stockId={stock || null} />
    </ScrollView>
  );
}
