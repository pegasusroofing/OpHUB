// The one Supabase client for the app: same live project as the current web app.
// The URL and anon key are public (copied from src/js/020-supabase-config.js).
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { secureDelete, secureGet, secureSet } from './kv';
import type { Database } from './types';

export const SUPABASE_URL = 'https://dtrfupmcazoioubhwdml.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0cmZ1cG1jYXpvaW91Ymh3ZG1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4ODI2MTEsImV4cCI6MjEwMjQ1ODYxMX0.RpPi02zvyPCrw9CxfkK0hNvmEEnILlXQ5qoMwxYsSKc';

// Session lives in the keychain/keystore on phones, localStorage on web.
const sessionStorage = {
  getItem: (key: string) => secureGet(key),
  setItem: (key: string, value: string) => secureSet(key, value),
  removeItem: (key: string) => secureDelete(key),
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: sessionStorage,
    storageKey: 'ophub-native-session',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Phones: only refresh the token while the app is open (Supabase's advice for React Native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
