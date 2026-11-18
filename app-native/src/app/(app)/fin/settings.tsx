// Finance › Settings (900 renderFinanceSettings / saveFinanceSettings). The parts themselves are in FinSettingsBody, so
// the Admin Centre's Finance tab can open each one on its own page (Andy, 18 Nov 2026: "keep tab style but add into the
// main admin tabs for finance settings").
import { FinPage, finSettingsGo } from '@/components/FinNav';
import { FinSettingsBody } from '@/components/FinSettingsBody';

export default function FinSettings() {
  return (
    <FinPage title="Finance settings" section="settings" sub="general" onSub={(k) => { if (k !== 'general') finSettingsGo(k); }}>
      <FinSettingsBody />
    </FinPage>
  );
}
