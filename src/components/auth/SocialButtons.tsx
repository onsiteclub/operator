/**
 * SocialButtons - OnSite Operator
 * Ported VERBATIM from onsite-timekeeper.
 *
 * Google + Apple sign-in buttons. iOS uses the official native button
 * via expo-apple-authentication; web uses a custom-styled button that
 * triggers the Supabase OAuth redirect flow. Android has no Apple
 * Sign In option.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors } from '../../constants/colors';
import { useAuthStore } from '../../stores/authStore';

// PLACEHOLDER MODE: render the buttons but skip the actual OAuth flow.
// Flip to false once Apple Developer Portal capability + Google Cloud
// SHA-1 (Android release) are wired and the next build is ready to test.
const PLACEHOLDER_MODE = true;

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
      <Path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
      <Path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
      <Path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
    </Svg>
  );
}

function AppleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#FFFFFF"
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.1zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </Svg>
  );
}

interface Props {
  onSuccess?: () => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

export function SocialButtons({ onSuccess, onError, disabled }: Props) {
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const { signInWithGoogle, signInWithApple } = useAuthStore();

  const busy = loading !== null || disabled === true;

  const handleGoogle = async () => {
    if (busy) return;
    if (PLACEHOLDER_MODE) {
      Alert.alert('Coming soon', 'Sign in with Google will be available in the next build.');
      return;
    }
    setLoading('google');
    try {
      const res = await signInWithGoogle();
      if (res.success) onSuccess?.();
      else if (!res.cancelled && res.error) onError?.(res.error);
    } finally {
      setLoading(null);
    }
  };

  const handleApple = async () => {
    if (busy) return;
    if (PLACEHOLDER_MODE) {
      Alert.alert('Coming soon', 'Sign in with Apple will be available in the next build.');
      return;
    }
    setLoading('apple');
    try {
      const res = await signInWithApple();
      if (res.success) onSuccess?.();
      else if (!res.cancelled && res.error) onError?.(res.error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, busy && styles.disabled]}
        onPress={handleGoogle}
        disabled={busy}
        activeOpacity={0.8}
      >
        {loading === 'google' ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <>
            <GoogleLogo size={20} />
            <Text style={styles.buttonText}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={styles.appleButton}
          onPress={handleApple}
        />
      )}

      {Platform.OS === 'web' && (
        <TouchableOpacity
          style={[styles.appleButtonWeb, busy && styles.disabled]}
          onPress={handleApple}
          disabled={busy}
          activeOpacity={0.8}
        >
          {loading === 'apple' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <AppleLogo size={20} />
              <Text style={styles.appleButtonWebText}>Continue with Apple</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 10,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    minHeight: 50,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  appleButton: {
    width: '100%',
    height: 50,
  },
  appleButtonWeb: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#000000',
    minHeight: 50,
    width: '100%',
  },
  appleButtonWebText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.6,
  },
});
