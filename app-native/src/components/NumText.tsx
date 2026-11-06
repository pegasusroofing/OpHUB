// A number box that keeps exactly what you type while you're in it (overnight review, 7 Nov 2026): "12.50" had been
// turned into a number on every key, losing the "." and "0", so £12.50 saved as £1,250. Shows the value again on leaving.
import { useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

export function NumText({ value, onChangeText, onFocus, onBlur, ...rest }: TextInputProps & { value: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <TextInput {...rest} value={txt ?? value}
      onFocus={(e) => { setTxt(value); onFocus?.(e); }}
      onChangeText={(t) => { setTxt(t); onChangeText?.(t); }}
      onBlur={(e) => { setTxt(null); onBlur?.(e); }} />
  );
}
