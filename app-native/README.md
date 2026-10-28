# OpHUB native app (`app-native/`)

The new OpHUB app: Expo (React Native + TypeScript strict), one codebase for iPhone, Android and the office laptop's browser. It uses the **same live Supabase** as the current web app. Plan: `../docs/claude-code/ROADMAP-native-app.md`.

The website never serves this folder (`../.vercelignore`).

## Run it
```
cd app-native
npm install
npm run web          # laptop browser, http://localhost:8081
npm run typecheck
```
Phones need a build (EAS, see below). Expo Go won't run it because it uses native modules.

## Where things are
- `src/app/`: screens (Expo Router, one file per screen). `login`, `reset` (link from the reset email: `?t=…&e=…`), `join/[invite]`, and the signed-in shell `(app)/` with `home` and `account`.
- `src/lib/supabase.ts`: the one Supabase client. The session is kept in the phone's keychain/keystore, or in localStorage on web.
- `src/lib/auth.tsx`: sign-in, join, sign-out, profile and company loading. Ported from 070, 140 and 150.
- `src/lib/deviceId.ts`, `deviceLock.ts`: the one-phone rule (`check_device_lock_v2`), with PMs and admins exempt. `checkinDeviceField()` gives the device id to send with check-ins.
- `src/lib/remember.ts`: "Remember my email and password".
- `src/lib/roles.ts`: role rules and which home each role gets.
- `src/lib/offlineCache.ts`: the last good data per query, kept on the device.
- `src/lib/uploadQueue.ts`: photos wait on the phone and upload when signal returns.
- `src/lib/privateFiles.ts`: signed links for private buckets (from 065).
- `src/lib/push.ts`: registers the phone's push token with `claim_push_token` (from 080).
- `src/theme/theme.tsx`: colours from `src/css/app.css`, plus each company's own colours.
- `src/lib/types.ts`: database types. Only the Phase 0 tables for now. For the full list, run `npx supabase login` once, then `npm run gen:types`.

## Builds (EAS)
`eas.json` has three profiles: `development`, `preview` (internal testing; Android gives an .apk) and `production`.
```
npx eas-cli@latest login
EAS_NO_VCS=1 npx eas-cli@latest build --profile preview --platform android
```
- **Expo account:** `ophub` (pegasus.roofing@mail.com). The project is `@ophub/ophub-site-app`.
- **Test builds get their own app id.** That's `com.ophub.app.preview` ("OpHUB (test)") or `.dev`, set in `app.config.ts`, so they install alongside the live app. Production keeps `com.ophub.app`.
- **`EAS_NO_VCS=1` is needed.** EAS normally copies the project with git, and git can't handle this folder's path (spaces plus the apostrophe in "Andy's Documents"). With it set, EAS uploads the folder directly and still skips everything in `.gitignore`. In PowerShell, run `$env:EAS_NO_VCS = '1'` first.

## Gotcha: OneDrive and moved folders
If you **move** a folder inside this project, OneDrive can tag it as a cloud "reparse point". Expo then can't see the screens in it and shows "Welcome to Expo". The fix is to copy the folder to a new one, delete the old one, and rename the new one back.
