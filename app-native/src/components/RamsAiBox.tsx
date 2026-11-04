// "Write With AI" for the RAMS builder (Andy, 4 Nov 2026): describe the job and its tasks in your own words, and the
// AI drafts the hazards, safe systems of work and method statements into this RAMS for you to check and edit.
import { useState } from 'react';
import { Text, TextInput } from 'react-native';

import { Popup, PopupButtons } from '@/components/Popup';
import { confirmAsk } from '@/components/toast';
import { base, radius } from '@/theme/theme';

export const AI_PLACEHOLDER = 'e.g. Strip and re-felt a 40m² flat roof on a single-storey extension using torch-on felt. Access by scaffold from the garden. Replace the lead flashing to the main wall and fit two new outlets.';

/** Each AI build is charged for (Andy, 4 Nov 2026): asked every time, in the middle of the screen. */
export const askAiCharge = () => confirmAsk('✨ The AI RAMS writer is an additional feature, charged per build.\n\nEach time it writes a RAMS counts as one build, and your OpHUB account is charged for it.\n\nWrite this RAMS with AI?', 'Yes, Write It', 'No', true);

/** The describe-the-work box on its own, for the Create RAMS screen. */
export function AiTasksInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <TextInput value={value} onChangeText={onChange} multiline accessibilityLabel="Describe the work for the AI" placeholder={AI_PLACEHOLDER} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, minHeight: 96, textAlignVertical: 'top' }} />;
}

/** Pop-up from inside the builder: adds to what's there, never replaces it. */
export function RamsAiPopup({ busy, onClose, onWrite }: { busy: boolean; onClose: () => void; onWrite: (tasks: string) => void }) {
  const [t, setT] = useState('');
  return (
    <Popup center title="✨ Write With AI" onClose={onClose} width={520} footer={<PopupButtons yes={busy ? 'Writing…' : 'Write It'} no="Cancel" onNo={onClose} onYes={() => { if (!busy && t.trim().length >= 5) onWrite(t.trim()); }} />}>
      <Text style={{ color: base.slate, fontSize: 13, marginBottom: 8 }}>Describe the work and its tasks in your own words. The AI adds hazards, safe systems of work and a method statement for each task to this RAMS. Nothing you already have is changed. Check every line before you issue it. This is an additional feature, charged per build.</Text>
      <AiTasksInput value={t} onChange={setT} />
    </Popup>
  );
}
