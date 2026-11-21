// A multi-line box that grows with its text, so a long question or rule isn't cut off (Andy, 21 Nov 2026: the
// induction form's questions were clipped on a phone).
import { useState } from 'react';
import { Platform, TextInput, type TextInputProps } from 'react-native';

export function GrowInput({ style, minHeight = 40, ...p }: TextInputProps & { minHeight?: number }) {
  const [h, setH] = useState(0);
  return (
    <TextInput {...p} multiline textAlignVertical="top"
      onContentSizeChange={(e) => { const n = Math.ceil(e.nativeEvent.contentSize.height) + (Platform.OS === 'web' ? 2 : 20); setH((o) => (o === n ? o : n)); }}
      style={[style, { height: Math.max(minHeight, h) }]} />
  );
}
