// Features still being tried on the beta link only (Andy, 19 Nov 2026: "can we just do on beta for now?"). The beta
// link and app.operativehub.co.uk run the same build, so a beta-only feature checks the address it's opened on:
// ophub-beta.vercel.app, and the test copy on this laptop. Everywhere else (the live address, phones) it's hidden.
import { Platform } from 'react-native';

const BETA_HOSTS = ['ophub-beta.vercel.app', 'localhost', '127.0.0.1'];
export const isBetaSite = (): boolean => Platform.OS === 'web' && typeof window !== 'undefined' && BETA_HOSTS.includes(window.location?.hostname || '');
