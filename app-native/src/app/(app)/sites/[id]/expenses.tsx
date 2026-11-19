// Expenses has its own page from the menu since 19 Nov 2026 (Andy: "remove it from anywhere else in the app"). An old
// link to a job's expenses opens that page with the job already chosen.
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function JobExpenses() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/expenses?site=${id}` as never} />;
}
