// Messages, Yes / No questions, prompts and menus. They all open in a tidy pop-up next to where you
// tapped (components/Popup), with an ✕ to close. "Saved" / "Added" style messages aren't shown —
// only the ones you need to act on (could not…, enter…, choose…).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DocViewerHost } from '@/components/DocViewer';
import { EmailPromptHost } from '@/components/EmailPrompt';
import { noteTap, Popup, PopupButtons } from '@/components/Popup';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const Ctx = createContext<(msg: string) => void>(() => undefined);

// A message that only says something worked: not shown (Andy: the black pop-ups aren't needed).
const DONE = /\b(saved|added|created|updated|sent|done|filled in|removed|deleted|copied|marked|hidden|shown|uploaded|approved|rejected|booked|assigned|linked|moved|renamed|signed|submitted|closed|reopened|ordered|imported|exported|downloaded|cleared|changed|archived|restored|emailed|queued|requested|completed|finished|ready|thanks|thank you|recorded|logged|checked (in|out)|started|stopped|refreshed|synced|applied|set to|turned (on|off)|switched (on|off)|on its way|opened|posted|allocated|split|matched|ignored|cancelled|paid|certified|issued)\b/i;
const ACT = /could ?n['’]?o?t|failed|error|try again|\bnot\b|n['’]t\b|cannot|invalid|\benter\b|\bchoose\b|\bpick\b|\bfirst\b|\bmust\b|\bneeds?\b|trial|\bno\b|nothing|\bonly\b|too (big|large|long|many)|missing|already|blocked|\bfull\b|offline|limit/i;
export const isJustDone = (m: string) => DONE.test(m) && !ACT.test(m);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    if (!m || isJustDone(m)) return;
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 4500);
  }, []);
  return (
    <Ctx.Provider value={show}>
      <View style={{ flex: 1 }} onTouchStart={Platform.OS === 'web' ? undefined : (e) => noteTap(e.nativeEvent.pageX, e.nativeEvent.pageY)}>
        {children}
      </View>
      <DocViewerHost />
      <PromptHost />
      <MenuHost />
      <ConfirmHost />
      <EmailPromptHost />
      {msg && (
        <View style={s.wrap} pointerEvents="box-none">
          <Pressable onPress={() => setMsg(null)} style={s.toast} accessibilityRole="alert">
            <Text style={s.toastText}>{msg}</Text>
            <Text style={s.toastX}>✕</Text>
          </Pressable>
        </View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const box = { borderWidth: 1, borderColor: '#D5D9DF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 15, color: '#1E2124', backgroundColor: '#fff' };

// Ask for a line of text (rename etc.). Resolves null if closed.
type PromptOpts = { placeholder?: string; ok?: string };
type PromptReq = { message: string; initial: string; opts: PromptOpts; resolve: (v: string | null) => void };
const promptListeners = new Set<(r: PromptReq) => void>();
export function promptText(message: string, initial = '', opts: PromptOpts = {}): Promise<string | null> {
  return new Promise((resolve) => { promptListeners.forEach((l) => l({ message, initial, opts, resolve })); });
}
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
    <Popup title={req.message} onClose={() => done(null)} footer={<PopupButtons yes={req.opts.ok || 'OK'} onYes={() => done(val)} />}>
      <TextInput value={val} onChangeText={setVal} autoFocus onSubmitEditing={() => done(val)} placeholder={req.opts.placeholder} placeholderTextColor="#9AA1AB" style={box} />
    </Popup>
  );
}

// A short list of choices (the old ▾ menus). Resolves the chosen key, or null. Long lists get a search box.
type MenuReq = { title: string; items: { key: string; label: string; danger?: boolean }[]; resolve: (k: string | null) => void };
const menuListeners = new Set<(r: MenuReq) => void>();
export function chooseAction(title: string, items: MenuReq['items']): Promise<string | null> {
  return new Promise((resolve) => { menuListeners.forEach((l) => l({ title, items, resolve })); });
}
export function MenuHost() {
  const [req, setReq] = useState<MenuReq | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const l = (r: MenuReq) => { setQ(''); setReq(r); };
    menuListeners.add(l);
    return () => { menuListeners.delete(l); };
  }, []);
  if (!req) return null;
  const done = (k: string | null) => { req.resolve(k); setReq(null); };
  const shown = q.trim() ? req.items.filter((it) => it.label.toLowerCase().includes(q.trim().toLowerCase())) : req.items;
  return (
    <Popup title={req.title} onClose={() => done(null)} width={340}>
      {req.items.length > 8 && <TextInput value={q} onChangeText={setQ} placeholder="Type to search…" autoFocus={Platform.OS === 'web'} style={[box, { marginBottom: 6 }]} />}
      {shown.map((it, i) => (
        <Pressable key={it.key} onPress={() => done(it.key)} style={({ pressed }) => [{ paddingVertical: 11, paddingHorizontal: 4, borderTopWidth: i ? 1 : 0, borderTopColor: '#ECEEF2' }, pressed && { backgroundColor: '#F3F5F8' }]}>
          <Text style={{ fontSize: 15, color: it.danger ? '#C8102E' : '#1E2124' }}>{it.label}</Text>
        </Pressable>
      ))}
      {!shown.length && <Text style={{ color: '#6B7280', paddingVertical: 8 }}>Nothing matches.</Text>}
    </Popup>
  );
}

// Yes / No question. Resolves true for Yes (or the yes label given).
type ConfirmReq = { message: string; yes: string; no: string; ok?: boolean; resolve: (v: boolean) => void };
const confirmListeners = new Set<(r: ConfirmReq) => void>();
export function confirmAsk(message: string, yes = 'Yes', no = 'No'): Promise<boolean> {
  return new Promise((resolve) => { confirmListeners.forEach((l) => l({ message, yes, no: no === 'Cancel' ? 'No' : no, resolve })); });
}
export function showAlert(message: string, title = 'OpHUB') {
  confirmListeners.forEach((l) => l({ message: title === 'OpHUB' ? message : `${title}\n\n${message}`, yes: 'OK', no: '', ok: true, resolve: () => undefined }));
}
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  useEffect(() => {
    const l = (r: ConfirmReq) => setReq(r);
    confirmListeners.add(l);
    return () => { confirmListeners.delete(l); };
  }, []);
  if (!req) return null;
  const done = (v: boolean) => { req.resolve(v); setReq(null); };
  const danger = /delete|remove|cancel|reject|void|close/i.test(req.yes) && req.yes !== 'Yes';
  return (
    <Popup onClose={() => done(false)} width={360} footer={<PopupButtons yes={req.yes} no={req.ok ? undefined : req.no} danger={danger} onYes={() => done(true)} onNo={() => done(false)} />}>
      <Text style={{ fontSize: 15, color: '#1E2124', lineHeight: 21 }}>{req.message}</Text>
    </Popup>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, top: 70, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFF7F7', borderWidth: 1, borderColor: '#E9B4B4', borderLeftWidth: 4, borderLeftColor: '#C8102E', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, maxWidth: 480, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  toastText: { flexShrink: 1, color: '#1E2124', fontWeight: '600', fontSize: 14 },
  toastX: { color: '#6B7280', fontWeight: '700' },
});
