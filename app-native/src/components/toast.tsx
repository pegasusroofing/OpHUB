// Short message at the bottom of the screen (like the current app's toast()),
// plus a simple alert that works on phones and on the web.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
      <PromptHost />
      <MenuHost />
      {msg && (
        <View pointerEvents="none" style={s.wrap}>
          <Text style={s.toast}>{msg}</Text>
        </View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

// Ask for a line of text (rename etc.). Resolves null if cancelled.
export function promptText(message: string, initial = ''): Promise<string | null> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.prompt?.(message, initial) ?? null);
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      Alert.prompt('OpHUB', message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'OK', onPress: (v?: string) => resolve(v ?? '') },
      ], 'plain-text', initial);
    } else {
      promptListeners.forEach((l) => l({ message, initial, resolve }));
    }
  });
}
// Android has no built-in text prompt, so PromptHost (in the app shell) shows one.
type PromptReq = { message: string; initial: string; resolve: (v: string | null) => void };
const promptListeners = new Set<(r: PromptReq) => void>();
export function PromptHost() {
  const [req, setReq] = useState<PromptReq | null>(null);
  const [val, setVal] = useState('');
  useEffect(() => {
    const l = (r: PromptReq) => { setVal(r.initial); setReq(r); };
    promptListeners.add(l);
    return () => { promptListeners.delete(l); };
  }, []);
  if (!req) return null;
  const done = (v: string | null) => { req.resolve(v); setReq(null); };
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => done(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16 }}>
          <Text style={{ fontWeight: '700', marginBottom: 8 }}>{req.message}</Text>
          <TextInput value={val} onChangeText={setVal} autoFocus style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, padding: 10, marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
            <Pressable onPress={() => done(null)}><Text style={{ fontWeight: '700' }}>Cancel</Text></Pressable>
            <Pressable onPress={() => done(val)}><Text style={{ fontWeight: '700' }}>OK</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// A short list of actions (the old ▾ row menus). Resolves the chosen key, or null.
type MenuReq = { title: string; items: { key: string; label: string; danger?: boolean }[]; resolve: (k: string | null) => void };
const menuListeners = new Set<(r: MenuReq) => void>();
export function chooseAction(title: string, items: MenuReq['items']): Promise<string | null> {
  return new Promise((resolve) => { menuListeners.forEach((l) => l({ title, items, resolve })); });
}
export function MenuHost() {
  const [req, setReq] = useState<MenuReq | null>(null);
  useEffect(() => {
    const l = (r: MenuReq) => setReq(r);
    menuListeners.add(l);
    return () => { menuListeners.delete(l); };
  }, []);
  if (!req) return null;
  const done = (k: string | null) => { req.resolve(k); setReq(null); };
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => done(null)}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.35)', justifyContent: 'flex-end' }} onPress={() => done(null)}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 12, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
          <Text style={{ fontWeight: '800', padding: 10 }}>{req.title}</Text>
          {req.items.map((it) => (
            <Pressable key={it.key} onPress={() => done(it.key)} style={{ padding: 14, borderTopWidth: 1, borderTopColor: '#ECEEF2' }}>
              <Text style={{ fontSize: 15, color: it.danger ? '#C8102E' : '#1E2124' }}>{it.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

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
