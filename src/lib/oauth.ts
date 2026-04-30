/**
 * OAuth Helpers — Native Google + Apple Sign-In
 *
 * Both providers use supabase.auth.signInWithIdToken() which verifies
 * the ID token's signature + audience + nonce server-side.
 *
 * Ported verbatim from onsite-timekeeper.
 */

import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';
import { logger } from './logger';
import { captureMessage } from './sentry';

// ─────────────────────────────────────────────────────────────
// GOOGLE
// ─────────────────────────────────────────────────────────────

let googleConfigured = false;

function configureGoogle() {
  if (googleConfigured) return;
  const webClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  if (!webClientId || webClientId.includes('REPLACE_WITH')) {
    logger.error('auth', 'Google webClientId missing or placeholder in expo config');
    throw new Error('Google Sign-In not configured');
  }

  if (Platform.OS === 'ios' && !iosClientId) {
    logger.error('auth', 'Google iosClientId missing — iOS sign-in will fail');
  }

  logger.info('auth', `Google configure: platform=${Platform.OS}, webClientId=${webClientId ? 'set' : 'MISSING'}, iosClientId=${iosClientId ? 'set' : 'MISSING'}`);

  GoogleSignin.configure({
    webClientId, // REQUIRED — matches Supabase aud claim
    iosClientId, // iOS-only; ignored on Android
    scopes: ['profile', 'email'],
    offlineAccess: false, // we don't need Google refresh tokens
  });
  googleConfigured = true;
}

export interface OAuthResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
}

// ─────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Nonce: random raw string → SHA-256 hashed version sent to provider
 * (Google/Apple) → provider embeds hashed nonce in ID token → we send
 * raw nonce to Supabase → GoTrue hashes raw nonce and compares.
 * Protects against replay attacks.
 *
 * Required for Google on iOS (lib v16+ injects an unhashable nonce
 * automatically if you don't pass one, then Supabase rejects).
 */
async function generateNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  return { raw, hashed };
}

/**
 * Web variant — OAuth redirect via Supabase. The native @react-native-google-signin
 * module isn't available in the browser, so we hand off to the OAuth flow
 * before touching it (mirrors what we do for Apple).
 */
async function signInWithGoogleWeb(): Promise<OAuthResult> {
  try {
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      logger.error('auth', 'Google OAuth (web) failed to start', { error: error.message });
      captureMessage('Auth: Google web sign-in failed to start', {
        level: 'warning',
        tags: { security: 'auth', provider: 'google', platform: 'web' },
        extra: { reason: error.message },
      });
      return { success: false, error: error.message };
    }

    // signInWithOAuth navigates the browser away on success — control
    // doesn't come back here. Return success so the caller doesn't show
    // an error spinner; the actual sign-in completes after the redirect.
    return { success: true };
  } catch (e: any) {
    logger.error('auth', 'Google sign-in (web) exception', { error: String(e) });
    return { success: false, error: e?.message || 'Google sign-in failed' };
  }
}

export async function signInWithGoogle(): Promise<OAuthResult> {
  // Web → OAuth redirect via Supabase. GoogleSignin is iOS/Android only;
  // calling it in the browser throws because the native module is missing.
  if (Platform.OS === 'web') {
    return signInWithGoogleWeb();
  }

  try {
    configureGoogle();
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    // Note: @react-native-google-signin v16 on iOS auto-injects a nonce
    // into the idToken via GIDSignIn iOS SDK, but doesn't expose a way
    // to pass it back to JS. Supabase's project config has
    // external_google_skip_nonce_check=true to side-step this — we still
    // verify the token's signature, audience, and expiry server-side.
    const response: any = await GoogleSignin.signIn();

    if (response?.type === 'cancelled') {
      return { success: false, cancelled: true };
    }

    const idToken: string | undefined = response?.data?.idToken ?? response?.idToken;
    if (!idToken) {
      logger.error('auth', 'Google sign-in: no idToken returned');
      return { success: false, error: 'No ID token received from Google' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      logger.error('auth', 'Supabase signInWithIdToken (google) failed', { error: error.message });
      captureMessage('Auth: Google sign-in failed', {
        level: 'warning',
        tags: { security: 'auth', provider: 'google', platform: Platform.OS },
        extra: { reason: error.message },
      });
      return { success: false, error: error.message };
    }

    logger.info('auth', '✅ Google sign-in success');
    return { success: true };
  } catch (e: any) {
    if (e?.code === statusCodes.SIGN_IN_CANCELLED) {
      return { success: false, cancelled: true };
    }
    if (e?.code === statusCodes.IN_PROGRESS) {
      return { success: false, error: 'Sign-in already in progress' };
    }
    if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { success: false, error: 'Google Play Services not available' };
    }
    logger.error('auth', 'Google sign-in exception', {
      code: e?.code,
      message: e?.message,
      platform: Platform.OS,
      error: String(e),
    });
    return { success: false, error: e?.message || 'Google sign-in failed' };
  }
}

export async function signOutFromGoogle() {
  try {
    if (googleConfigured) await GoogleSignin.signOut();
  } catch {
    // non-fatal
  }
}

// ─────────────────────────────────────────────────────────────
// APPLE (iOS only)
// ─────────────────────────────────────────────────────────────

export function isAppleAuthAvailable(): boolean {
  // Web uses the OAuth redirect flow (signInWithAppleWeb), iOS uses
  // expo-apple-authentication's native modal. Android still has no
  // Apple Sign In option.
  return Platform.OS === 'ios' || Platform.OS === 'web';
}

// ─────────────────────────────────────────────────────────────
// APPLE — WEB (OAuth redirect flow via Supabase)
// ─────────────────────────────────────────────────────────────

async function signInWithAppleWeb(): Promise<OAuthResult> {
  try {
    // After Apple → Supabase callback, the browser comes back to our
    // origin with auth tokens in the URL hash. detectSessionInUrl=true
    // (in supabase.ts) handles the parsing and signs the user in.
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo },
    });

    if (error) {
      logger.error('auth', 'Apple OAuth (web) failed to start', { error: error.message });
      captureMessage('Auth: Apple web sign-in failed to start', {
        level: 'warning',
        tags: { security: 'auth', provider: 'apple', platform: 'web' },
        extra: { reason: error.message },
      });
      return { success: false, error: error.message };
    }

    // signInWithOAuth navigates the browser away — control doesn't come
    // back here on success. Return success so callers don't show an
    // error spinner; the actual sign-in completes after the redirect.
    return { success: true };
  } catch (e: any) {
    logger.error('auth', 'Apple sign-in (web) exception', { error: String(e) });
    return { success: false, error: e?.message || 'Apple sign-in failed' };
  }
}

export async function signInWithApple(): Promise<OAuthResult> {
  // Web → OAuth redirect via Supabase. The native expo-apple-authentication
  // module isn't available in the browser, so we hand off there before
  // touching it.
  if (Platform.OS === 'web') {
    return signInWithAppleWeb();
  }

  if (!isAppleAuthAvailable()) {
    return { success: false, error: 'Apple Sign-In is only available on iOS' };
  }

  try {
    const { raw, hashed } = await generateNonce();

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed, // send HASHED nonce to Apple
    });

    if (!credential.identityToken) {
      logger.error('auth', 'Apple sign-in: no identityToken');
      return { success: false, error: 'No identity token from Apple' };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: raw, // send RAW nonce to Supabase
    });

    if (error) {
      logger.error('auth', 'Supabase signInWithIdToken (apple) failed', { error: error.message });
      captureMessage('Auth: Apple sign-in failed', {
        level: 'warning',
        tags: { security: 'auth', provider: 'apple' },
        extra: { reason: error.message },
      });
      return { success: false, error: error.message };
    }

    // Apple only returns fullName on FIRST sign-in — persist it immediately.
    if (credential.fullName && data.user) {
      const parts = [
        credential.fullName.givenName,
        credential.fullName.middleName,
        credential.fullName.familyName,
      ].filter(Boolean) as string[];

      if (parts.length > 0) {
        const fullName = parts.join(' ');
        try {
          await supabase.auth.updateUser({
            data: {
              full_name: fullName,
              first_name: credential.fullName.givenName || null,
              last_name: credential.fullName.familyName || null,
            },
          });
          // Also upsert profiles row (trigger only creates id/email)
          await supabase.from('profiles').upsert(
            {
              id: data.user.id,
              email: data.user.email,
              full_name: fullName,
            },
            { onConflict: 'id' }
          );
        } catch (e) {
          logger.warn('auth', 'Failed to persist Apple full name', { error: String(e) });
        }
      }
    }

    logger.info('auth', '✅ Apple sign-in success');
    return { success: true };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') {
      return { success: false, cancelled: true };
    }
    logger.error('auth', 'Apple sign-in exception', { error: String(e) });
    return { success: false, error: 'Apple sign-in failed' };
  }
}
