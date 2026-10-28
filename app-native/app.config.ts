// Test builds get their own app id and name, so they install alongside the live
// "OpHUB Site App" (com.ophub.app) instead of clashing with it.
// APP_VARIANT is set per build profile in eas.json.
import type { ConfigContext, ExpoConfig } from 'expo/config';

const VARIANTS: Record<string, { suffix: string; name: string }> = {
  development: { suffix: '.dev', name: 'OpHUB (dev)' },
  preview: { suffix: '.preview', name: 'OpHUB (test)' },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const v = VARIANTS[process.env.APP_VARIANT ?? ''];
  if (!v) return config as ExpoConfig;
  return {
    ...(config as ExpoConfig),
    name: v.name,
    ios: { ...config.ios, bundleIdentifier: `com.ophub.app${v.suffix}` },
    android: { ...config.android, package: `com.ophub.app${v.suffix}` },
  };
};
