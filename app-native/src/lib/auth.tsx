// Who is signed in, their profile and company. Ported from 070-auth.js, 140-login.js
// and 150-join-invite-only-account-creation.js.
//
// Order on sign-in (same as the current app): password -> profile -> company check ->
// device lock -> in. If the device lock says no, the person is signed straight back out.
// supabase-js saves the session as soon as the password works, so the lock is checked
// again every time the app starts: a phone that was refused can never stay signed in.
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { checkDeviceLock, deviceLockMessage, isLockRefusal } from './deviceLock';
import { cachedQuery, clearOfflineCache, orThrow } from './offlineCache';
import { clearSignedCache } from './privateFiles';
import { registerPush, unregisterPush } from './push';
import { forgetRemembered, forgetRememberedPassword, saveRemembered } from './remember';
import { deviceLockApplies } from './roles';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';
import type { InviteInfo, Organization, Profile } from './types';

type Status = 'loading' | 'signedOut' | 'ready';

type AuthState = {
  status: Status;
  session: Session | null;
  me: Profile | null;
  org: Organization | null;
  notice: { kind: 'error' | 'info'; text: string } | null;
  setNotice: (n: AuthState['notice']) => void;
  signIn: (email: string, password: string, remember: boolean, onStage?: (label: string) => void) => Promise<string | null>;
  join: (inviteId: string, name: string, email: string, password: string, onStage?: (label: string) => void) => Promise<{ error?: string; done?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);
const NOT_LINKED = "Your account isn't linked to a company yet. Contact your Project Manager for an invite.";
const NO_SIGNAL = 'Could not reach the server — check your connection and try again.';

export const normaliseEmail = (e: string) => String(e || '').trim().toLowerCase();

async function loadProfile(uid: string): Promise<Profile | null> {
  const p = await cachedQuery(`profile:${uid}`, async () =>
    orThrow(await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()) as Profile | null);
  return supportMe(p);
}
// Support mode (100-state): the platform owner viewing a company is that company's admin until they exit.
const supportMe = (p: Profile | null): Profile | null => (p && p.role === 'superadmin' && p.view_as_org_id ? { ...p, role: 'admin', org_id: p.view_as_org_id, _support: true, _realOrgId: p.org_id } : p);
async function loadOrg(orgId: string | null): Promise<Organization | null> {
  if (!orgId) return null;
  return cachedQuery(`org:${orgId}`, async () =>
    orThrow(await supabase.from('organizations').select('*').eq('id', orgId).maybeSingle()) as Organization | null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [notice, setNotice] = useState<AuthState['notice']>(null);
  const busy = useRef(false); // a sign-in/join is running: it sets the state itself
  const qc = useQueryClient();
  const awayAt = useRef(0), lastCheck = useRef(0);

  const clearLocal = useCallback(async () => {
    await unregisterPush();
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* already gone */ }
    await clearOfflineCache();
    await clearSignedCache();
    setSession(null); setMe(null); setOrg(null); setStatus('signedOut');
  }, []);

  const signOut = useCallback(async () => {
    try { await supabase.auth.signOut(); } catch { /* offline: local sign-out below still happens */ }
    await clearLocal();
  }, [clearLocal]);

  // Loads profile + company for a session and applies the company and device rules.
  // Returns an error message if the person can't be let in.
  const enter = useCallback(async (s: Session, strictLock: boolean, onStage?: (l: string) => void): Promise<string | null> => {
    onStage?.('Loading your account…');
    const p = await loadProfile(s.user.id);
    if (!p || (!p.org_id && p.role !== 'superadmin')) return NOT_LINKED;
    if (deviceLockApplies(p)) {
      onStage?.('Checking this device…');
      const lock = await checkDeviceLock();
      // At sign-in any failure blocks (as today). At app start only a definite "no"
      // does, so someone with no signal on site still gets in.
      if (strictLock ? !lock.ok : isLockRefusal(lock)) return deviceLockMessage(lock);
    }
    onStage?.('Getting your company…');
    const o = await loadOrg(p.org_id);
    setSession(s); setMe(p); setOrg(o); setStatus('ready');
    void registerPush(p);
    return null;
  }, []);

  // App start: pick up a saved session.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) { setStatus('signedOut'); return; }
      try {
        const err = await enter(data.session, false);
        if (err) { setNotice({ kind: 'error', text: err }); await clearLocal(); }
      } catch {
        // No signal and nothing cached: back to the sign-in page rather than a blank screen.
        setNotice({ kind: 'error', text: NO_SIGNAL });
        setStatus('signedOut');
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (busy.current) return;
      if (event === 'SIGNED_OUT') { setSession(null); setMe(null); setOrg(null); setStatus('signedOut'); }
      else if (event === 'TOKEN_REFRESHED' && s) setSession(s);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [enter, clearLocal]);

  const signIn = useCallback<AuthState['signIn']>(async (rawEmail, password, remember, onStage) => {
    const email = normaliseEmail(rawEmail);
    if (!email || !password) return 'Enter your email and password.';
    if (busy.current) return null; // Enter key + button tap at the same time
    busy.current = true;
    setNotice(null);
    try {
      if (!remember) await forgetRemembered();
      onStage?.('Signing in…');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        return error?.message === 'Failed to fetch' || error?.name === 'AuthRetryableFetchError' ? NO_SIGNAL : (error?.message || 'Sign in failed');
      }
      if (remember) await saveRemembered(email, password); // only a login that worked is remembered
      const err = await enter(data.session, true, onStage);
      if (err) { await clearLocal(); return err; }
      return null;
    } catch {
      await clearLocal();
      return 'Something went wrong signing you in — check your connection and try again.';
    } finally {
      busy.current = false;
    }
  }, [enter, clearLocal]);

  const join = useCallback<AuthState['join']>(async (inviteId, name, rawEmail, password, onStage) => {
    const email = normaliseEmail(rawEmail);
    if (!email || !password || !name.trim()) return { error: 'Fill in every field.' };
    if (password.length < 6) return { error: 'Password needs to be at least 6 characters.' };
    if (busy.current) return {};
    busy.current = true;
    try {
      onStage?.('Creating your account…');
      // Only invite_id matters server-side: handle_new_user() takes the company and role from the invite.
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name: name.trim(), invite_id: inviteId } } });
      if (error) return { error: error.message || 'Sign up failed' };
      if (!data.session) return { done: 'Check your email and tap the link to confirm your account, then come back here and log in.' };
      // Best effort; awaited before any sign-out so it still carries the new account's login.
      const notifyAdmins = () => supabase.functions.invoke('notify-admin-signup', { body: {} }).catch(() => undefined);
      onStage?.('Loading your account…');
      const p = await loadProfile(data.session.user.id);
      if (!p || !p.org_id) {
        await clearLocal();
        return { error: "That invite couldn't be applied to your account — it may have just been used by someone else. Contact your Project Manager." };
      }
      if (deviceLockApplies(p)) {
        onStage?.('Checking this device…');
        const lock = await checkDeviceLock();
        if (isLockRefusal(lock)) {
          await notifyAdmins();
          await clearLocal();
          return { done: 'Your account has been created. ' + deviceLockMessage(lock) };
        }
      }
      const err = await enter(data.session, false, onStage);
      if (err) { await clearLocal(); return { error: err }; }
      void notifyAdmins();
      return {};
    } catch {
      return { error: 'Something went wrong creating your account — check your connection and try again.' };
    } finally {
      busy.current = false;
    }
  }, [enter, clearLocal]);

  // Back from the background (120 refreshOnReturn): after a minute away, or five since the last check,
  // your account is read again — a changed role, the Finance switch or a new company setting shows, and
  // someone removed from the company is signed out — and the lists are fetched again.
  useEffect(() => {
    if (!lastCheck.current) lastCheck.current = Date.now();
    const back = async () => {
      const away = awayAt.current ? Date.now() - awayAt.current : 0; awayAt.current = 0;
      if (!session || busy.current || (away < 60000 && Date.now() - lastCheck.current < 5 * 60000)) return;
      lastCheck.current = Date.now();
      const r = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (r.error) return; // no signal: keep what we have
      if (!r.data) { setNotice({ kind: 'error', text: 'Your account is no longer part of the company. Ask your admin if this is a mistake.' }); await clearLocal(); return; }
      const p = supportMe(r.data as Profile);
      setMe(p); setOrg(await loadOrg(p?.org_id ?? null).catch(() => null));
      void qc.invalidateQueries();
    };
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void back(); else if (!awayAt.current) awayAt.current = Date.now(); });
    if (Platform.OS !== 'web' || typeof document === 'undefined') return () => sub.remove();
    const vis = () => { if (document.visibilityState === 'hidden') { if (!awayAt.current) awayAt.current = Date.now(); } else void back(); };
    document.addEventListener('visibilitychange', vis);
    return () => { sub.remove(); document.removeEventListener('visibilitychange', vis); };
  }, [session, clearLocal, qc]);

  const refresh = useCallback(async () => {
    if (!session) return;
    const p = await loadProfile(session.user.id);
    setMe(p);
    setOrg(await loadOrg(p?.org_id ?? null));
  }, [session]);

  const value = useMemo<AuthState>(() => ({ status, session, me, org, notice, setNotice, signIn, join, signOut, refresh }),
    [status, session, me, org, notice, signIn, join, signOut, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/* ---------- things that don't need a signed-in user ---------- */
async function anonFetch(path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    return await fetch(SUPABASE_URL + path, {
      ...init,
      signal: ctl.signal,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${init.token || SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    });
  } finally { clearTimeout(t); }
}

// Emails a one-time link (send-password-reset). Always says the same thing, so nobody
// can use it to find out which emails have accounts.
export async function sendPasswordReset(rawEmail: string): Promise<string | null> {
  const e = normaliseEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Enter a valid email address.';
  try { await anonFetch('/functions/v1/send-password-reset', { method: 'POST', body: JSON.stringify({ email: e }) }); }
  catch { return NO_SIGNAL; }
  return null;
}

// The reset link carries t (token hash) and e (email). Uses its own short-lived
// session so it never touches whoever is signed in on this device.
export async function resetPassword(tokenHash: string, pw1: string, pw2: string): Promise<{ error?: string; email?: string }> {
  if (pw1.length < 8) return { error: 'Use at least 8 characters.' };
  if (pw1 !== pw2) return { error: "The two passwords don't match." };
  try {
    const vr = await anonFetch('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'recovery', token_hash: tokenHash }) });
    const vd = (await vr.json().catch(() => ({}))) as { access_token?: string; user?: { email?: string } };
    if (!vr.ok || !vd.access_token) return { error: 'This link has expired or has already been used. Go back to log in and tap "Forgot password?" for a new one.' };
    const ur = await anonFetch('/auth/v1/user', { method: 'PUT', token: vd.access_token, body: JSON.stringify({ password: pw1 }) });
    const ud = (await ur.json().catch(() => ({}))) as { msg?: string; error_description?: string; message?: string };
    if (!ur.ok) return { error: ud.msg || ud.error_description || ud.message || 'Could not save the new password — try again.' };
    void anonFetch('/auth/v1/logout', { method: 'POST', token: vd.access_token }).catch(() => undefined);
    await forgetRememberedPassword(); // new password: forget the old saved one
    return { email: vd.user?.email };
  } catch {
    return { error: NO_SIGNAL };
  }
}

export async function getInviteInfo(inviteId: string): Promise<InviteInfo | null> {
  const { data, error } = await supabase.rpc('get_invite_info', { p_invite_id: inviteId });
  if (error || !data) return null;
  return data[0] ?? null;
}
