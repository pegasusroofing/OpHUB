// Admin Centre › Finance › Templates (Andy, 18 Nov 2026: "more tab style please and sub tabs"): Finance's own
// Templates page, shown under the Admin Centre's tabs instead of Finance's.
import { FinBare } from '@/components/FinNav';
import FinTemplates from '@/app/(app)/fin/templates';

export default function AdminFinTemplates() {
  return <FinBare.Provider value><FinTemplates /></FinBare.Provider>;
}
