// Short message at the bottom of the screen (like the current app's toast()),
// plus a simple alert that works on phones and on the web.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

const Ctx = createContext<(msg: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3000);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg && (
        <View pointerEvents="none" style={s.wrap}>
          <Text style={s.toast}>{msg}</Text>
        </View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

// Yes/No question. Resolves true for the confirm button.
export function confirmAsk(message: string, yes = 'Yes', no = 'Cancel'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(!!globalThis.confirm?.(message));
  return new Promise((resolve) => {
    Alert.alert('OpHUB', message, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function showAlert(message: string, title = 'OpHUB') {
  if (Platform.OS === 'web') globalThis.alert?.(message);
  else Alert.alert(title, message);
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 90, alignItems: 'center' },
  toast: { backgroundColor: '#1E2124', color: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, fontWeight: '600', overflow: 'hidden', maxWidth: 480 },
});
