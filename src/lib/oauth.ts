/**
 * OAuth Helpers — Native Google + Apple Sign-In
 *
 * Both providers use supabase.auth.signInWithIdToken(). The Supabase
 * server validates the ID token's signature, audience, and nonce,
 * which is why we don't trust the client to forward the user's email.
 *
 * Ported from onsite-timekeeper.
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

  GoogleSignin.configure({
    webClientId, // REQUIRED — must match the Supabase aud claim
    iosClientId, // iOS-only, ignored on Android
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
 * Nonce: random raw → SHA-256 hashed → sent to provider; raw is sent
 * to Supabase, which hashes and compares. Protects against replay.
 */
async function generateNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return { raw, hashed };
}

// ─────────────────────────────────────────────────────────────
// GOOGLE — Web (OAuth redirect via Supabase)
// ─────────────────────────────────────────────────────────────

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

    return { success: true };
  } catch (e: unknown) {
    logger.error('auth', 'Google sign-in (web) exception', { error: String(e) });
    return { success: false, error: (e as Error)?.message || 'Google sign-in failed' };
  }
}

export async function signInWithGoogle(): Promise<OAuthResult> {
  if (Platform.OS === 'web') {
    return signInWithGoogleWeb();
  }

  try {
    configureGoogle();
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    // @react-native-google-signin v16 on iOS auto-injects a nonce into the
    // idToken via the GIDSignIn iOS SDK but doesn't expose it back to JS.
    // Set external_google_skip_nonce_check=true in the Supabase project's
    // Auth → Providers → Google config to side-step that constraint —
    // signature, audience, and expiry are still verified server-side.
    const response = (await GoogleSignin.signIn()) as {
      type?: string;
      data?: { idToken?: string };
      idToken?: string;
    };

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

    return { success: true };
  } catch (e: unknown) {
    const err = e as { code?: string | number; message?: string };
    if (err?.code === statusCodes.SIGN_IN_CANCELLED) {
      return { success: false, cancelled: true };
    }
    if (err?.code === statusCodes.IN_PROGRESS) {
      return { success: false, error: 'Sign-in already in progress' };
    }
    if (err?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { success: false, error: 'Google Play Services not available' };
    }
    logger.error('auth', 'Google sign-in exception', {
      code: err?.code,
      message: err?.message,
      platform: Platform.OS,
      error: String(e),
    });
    return { success: false, error: err?.message || 'Google sign-in failed' };
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
// APPLE
// ─────────────────────────────────────────────────────────────

export function isAppleAuthAvailable(): boolean {
  // iOS uses the native AppleAuthentication modal. Web falls back to
  // Supabase OAuth redirect. Android has no native Apple option.
  return Platform.OS === 'ios' || Platform.OS === 'web';
}

async function signInWithAppleWeb(): Promise<OAuthResult> {
  try {
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
    return { success: true };
  } catch (e: unknown) {
    logger.error('auth', 'Apple sign-in (web) exception', { error: String(e) });
    return { success: false, error: (e as Error)?.message || 'Apple sign-in failed' };
  }
}

export async function signInWithApple(): Promise<OAuthResult> {
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
      nonce: hashed,
    });

    if (!credential.identityToken) {
      logger.error('auth', 'Apple sign-in: no identityToken');
      return { success: false, error: 'No identity token from Apple' };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: raw,
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

    // Apple only returns fullName on the FIRST sign-in — persist it now.
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
          await supabase.from('profiles').upsert(
            {
              id: data.user.id,
              email: data.user.email,
              full_name: fullName,
            },
            { onConflict: 'id' },
          );
        } catch (e) {
          logger.warn('auth', 'Failed to persist Apple full name', { error: String(e) });
        }
      }
    }

    return { success: true };
  } catch (e: unknown) {
    const err = e as { code?: string | number; message?: string };
    if (err?.code === 'ERR_REQUEST_CANCELED') {
      return { success: false, cancelled: true };
    }
    logger.error('auth', 'Apple sign-in exception', { error: String(e) });
    return { success: false, error: 'Apple sign-in failed' };
  }
}
