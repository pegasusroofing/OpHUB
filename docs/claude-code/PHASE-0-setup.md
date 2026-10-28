# Phase 0: set-up and foundations (the first job)

Aim: an Expo app in `app-native/` that signs in to the live Supabase, respects roles and the device lock, and shows an empty home per role, on iPhone, Android and the laptop browser. No feature screens yet.

## Before starting (check with Andy, once)
- Is there an Expo account? If not, he creates one (company name) and runs `npx expo login` himself.
- Apple/Google developer accounts exist already (the current OpHUB Site App). He signs in to them himself when EAS asks.

## Steps
1. **Protect the live site:** check the root `.vercelignore` (added 28 Oct) still lists `app-native/`.
2. **Create the project:** `npx create-expo-app@latest app-native --template tabs`. Turn on TypeScript strict. Set the app name to "OpHUB Site App", bundle id and package `com.ophub.app`, scheme `ophub` (OneDrive uses `ophub://onedrive-callback`).
3. **Install:** `@supabase/supabase-js`, `@tanstack/react-query`, `expo-secure-store`, `expo-location`, `expo-image-picker`, `expo-notifications`, `expo-file-system`, `expo-device`, `expo-application`.
4. **Supabase client** (`src/lib/supabase.ts`):
   - Use the URL and anon key from `src/js/020-supabase-config.js` (public, fine to copy).
   - Store the session with a secure-store adapter on phones and localStorage on web.
5. **Types:** generate `src/lib/types.ts` with Supabase's TypeScript type generator (the Supabase connector's `generate_typescript_types`, or `npx supabase gen types typescript --project-id dtrfupmcazoioubhwdml`).
6. **Sign-in:** port it from `140-login.js` and `070-auth.js`:
   - "Remember my email and password" goes in secure storage, and is forgotten after a password reset.
   - Port password reset, and the invite-only join (`150-join…`).
7. **Profile and role:** load the profile and the company (`organizations`), then route by role. Finance access comes from `finance_enabled` / `finance_hidden`, plus the company's `has_pm` / `has_finance`.
8. **Device lock:**
   - Port the `check_device_lock_v2` call and its pop-ups from the old app, including the PM/admin exemption.
   - Use a stable device id: `expo-application`'s ID on Android, the vendor id on iOS, and a stored UUID on web.
   - Send the same id with check-ins.
9. **Look:** a design system that matches today's app (colours from `src/css/app.css`, the company colours from branding), plus the shell: bottom tabs on a phone and a left menu on a laptop (see `125-desktop.js`).
10. **Shared services:**
    - **Offline read cache:** last good data per query, kept on the device.
    - **Upload queue:** retries photos when signal returns.
    - **Signed-link file helper:** port the logic from `065-private-files.js`.
    - **Push:** register the push token into the same table and columns the old app uses; read `080-push-notifications.js` first.
11. **Builds:** set up EAS (`eas.json`) with development, preview (internal testing) and production profiles. Make a preview build for Andy's phone.
12. **Commit:** commit with the trailers in CLAUDE.md, then tell Andy to Push origin.

## Done when
- [ ] Andy can sign in on his phone (preview build) and on the laptop web build, and the saved login works.
- [ ] Each role lands on its own empty home: operative, driver, PM, admin, finance-only.
- [ ] A second phone on the same login is blocked by the device lock (unless PM or admin).
- [ ] The current website and phone apps are unchanged (`python tools/build.py --check` passes; nothing under `app-native/` is served by Vercel).
