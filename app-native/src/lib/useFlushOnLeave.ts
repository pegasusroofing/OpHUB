// Saves typed-but-unsaved work when you leave (660 havsLeaveFlush): moving to another
// screen, the app going into the background, or (web) the tab being hidden or closed.
// Pass a ref whose .current is the latest save function.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, type RefObject } from 'react';
import { AppState, Platform } from 'react-native';

export function useFlushOnLeave(flush: RefObject<(() => Promise<unknown>) | null>) {
  const run = useCallback(() => { void flush.current?.()?.catch(() => {}); }, [flush]);
  // Leaving the screen.
  useFocusEffect(useCallback(() => () => run(), [run]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') run(); });
    if (Platform.OS !== 'web' || typeof document === 'undefined') return () => sub.remove();
    const onHide = () => { if (document.visibilityState === 'hidden') run(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', run);
    return () => { sub.remove(); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', run); };
  }, [run]);
}
