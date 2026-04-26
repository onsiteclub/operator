# Onda C — External setup for Google + Apple sign-in

The code for native Google + Apple sign-in is in place, but the providers
won't actually authenticate until the credentials below exist in three
external systems. This file is the checklist.

Without this setup, tapping "Continue with Google" / "Continue with Apple"
shows a clear error in the login screen — nothing crashes.

## 1. Google Cloud Console — OAuth client IDs

1. Go to https://console.cloud.google.com → APIs & Services → Credentials.
2. Create three OAuth 2.0 Client IDs under the same project:
   - **Web application** — used as `webClientId`. This is what Supabase
     verifies the `aud` claim against.
   - **iOS** — bundle id `ca.onsiteclub.operator2`.
   - **Android** — package `ca.onsiteclub.operator2`. SHA-1 fingerprint:
     run `keytool -list -v -keystore <keystore>.jks -alias <alias>` for
     your release keystore (or the debug one for dev builds).
3. Note the three client IDs. You'll paste them in steps 3 and 4 below.

## 2. Apple Developer Portal — Sign In with Apple

1. https://developer.apple.com/account → Certificates, Identifiers &
   Profiles → Identifiers.
2. Find or create the App ID for `ca.onsiteclub.operator2`. Edit it →
   enable **Sign In with Apple** capability → save.
3. Create a **Services ID** (e.g. `ca.onsiteclub.operator2.web`) →
   enable Sign In with Apple → configure with primary App ID + return
   URL set to `https://dbasazrdbtigrdntaehb.supabase.co/auth/v1/callback`.
4. Create a **Key** with Sign In with Apple enabled → download the `.p8`
   file. You won't be able to download it again. Note the Key ID and
   your Team ID (top-right of the page).

## 3. Supabase Auth Providers

Supabase dashboard → Project `dbasazrdbtigrdntaehb` → Authentication →
Providers.

### Google

- Enable.
- **Client ID (for OAuth)** = the **Web** client ID from step 1.
- **Client secret** = the web client's secret.
- Toggle on "Skip nonce check" (needed because the iOS Google SDK auto-
  injects a hashed nonce we can't pass back to JS — the token's
  signature, audience, and expiry are still validated by Supabase).
- Authorized redirect URL is the default `<project-ref>.supabase.co/auth/v1/callback`.

### Apple

- Enable.
- **Services ID** = the Services ID from step 2.
- **Secret Key** = the contents of the `.p8` file (paste the whole text,
  including BEGIN/END lines).
- **Key ID** + **Team ID** from step 2.
- Authorized redirect URL is again the default Supabase callback.

### Phone (already done in Onda B)

Twilio credentials must be configured here for OTP delivery. If you
skipped it in Onda B, do it now.

## 4. Operator app config

`app.json` already wires the plugins:

```json
"plugins": [
  ...,
  "expo-apple-authentication",
  ["@react-native-google-signin/google-signin", {
    "iosUrlScheme": "com.googleusercontent.apps.REPLACE_WITH_REVERSED_IOS_CLIENT_ID"
  }]
]
```

Two things to fill in:

1. Replace the placeholder in `iosUrlScheme`. Take your **iOS** OAuth
   client ID from step 1 (looks like
   `1234567890-abc...apps.googleusercontent.com`) and write it in
   reverse-DNS form: `com.googleusercontent.apps.1234567890-abc...`.
2. Set the two values under `app.json` → `expo.extra`:

```json
"extra": {
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "<web client id from step 1>",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "<ios client id from step 1>"
}
```

These are read at runtime by `src/lib/oauth.ts` via
`Constants.expoConfig?.extra`. They can also be provided via
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
environment variables (e.g. in `.env`) — `process.env.*` wins over
`expoConfig.extra` if both are set.

## 5. Rebuild

The new native modules require a real build, not just a JS reload.

```bash
npx expo prebuild --clean
npm run android   # or npm run ios
```

Codemagic builds will pick this up automatically because the same
`expo prebuild --platform ios --clean` step runs there.

## 6. Verify

1. Open the rebuilt app → login screen.
2. Tap **Continue with Google** → account picker → after pick, app
   should land on `/(tabs)` (or `/(auth)/complete-profile` if it's the
   first sign-in for that user and `full_name` isn't on the profile yet).
3. iOS only: tap **Continue with Apple** → native sheet → same outcome.

If a step fails, check the device logs (`adb logcat | grep auth` for
Android) — the auth store logs every error path with category `auth`.
