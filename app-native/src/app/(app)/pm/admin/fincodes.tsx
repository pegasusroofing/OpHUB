// Admin Centre › Finance › Cost Codes (Andy, 18 Nov 2026: "more tab style please and sub tabs"): Finance's own Cost
// Codes page, shown under the Admin Centre's tabs instead of Finance's.
import { Stack } from 'expo-router';

import { FinBare } from '@/components/FinNav';
import FinDirectory from '@/app/(app)/fin/directory';

export default function AdminFinCodes() {
  return <FinBare.Provider value><Stack.Screen options={{ title: 'Cost Codes' }} /><FinDirectory /></FinBare.Provider>;
}
