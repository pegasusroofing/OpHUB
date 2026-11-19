// Features tried on the beta link first (Andy, 19 Nov 2026: "can we just do on beta for now?"). The beta link and
// app.operativehub.co.uk run the same build, so these check the address they're opened on. Since later that evening
// both of them are on the live address too (Andy: "i want it on the app.operativehub as well please" for company
// switching, then "the cpp builder can go to the app as well please"), so the list is the beta link, the live address
// and the test copy on this laptop. Still web only: the phone apps get them when they're rebuilt from the new app.
import { Platform } from 'react-native';

const BETA_HOSTS = ['ophub-beta.vercel.app', 'app.operativehub.co.uk', 'localhost', '127.0.0.1'];
export const isBetaSite = (): boolean => Platform.OS === 'web' && typeof window !== 'undefined' && BETA_HOSTS.includes(window.location?.hostname || '');

/** Company switching (one login, several companies): Switch Company, My Companies, adding a company from its invite
 *  while signed in, and Admin › People › Also Has Access. The same addresses as the rest. */
export const isSwitchSite = isBetaSite;
