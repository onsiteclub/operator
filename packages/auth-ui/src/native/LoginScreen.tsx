/**
 * LoginScreen — Email + password login.
 *
 * Used standalone or composed by AuthFlow.
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { AuthHeader } from './shared/AuthHeader';
import { AuthInput } from './shared/AuthInput';
import { PasswordInput } from './shared/PasswordInput';
import { AuthButton } from './shared/AuthButton';
import { ErrorBanner } from './shared/ErrorBanner';
import { authStyles as s } from './shared/styles';

export interface LoginScreenProps {
  appName: string;
  icon?: React.ReactNode;
  logo?: React.ReactNode;
  subtitle?: string;
  footer?: string;
  showForgotPassword?: boolean;
  showSignup?: boolean;
  icons?: {
    email?: React.ReactNode;
    lock?: React.ReactNode;
    eyeOpen?: React.ReactNode;
    eyeClosed?: React.ReactNode;
  };
  onSignIn: (email: string, password: string) => Promise<void>;
  onForgotPassword?: () => void;
  onSwitchToSignup?: () => void;
  onSuccess?: () => void;
}

export function LoginScreen({
  appName,
  icon,
  logo,
  subtitle = 'Sign in to continue',
  footer = 'OnSite Club — Built for the trades',
  showForgotPassword = true,
  showSignup = false,
  icons,
  onSignIn,
  onForgotPassword,
  onSwitchToSignup,
  onSuccess,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      setError('Email and password required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSignIn(trimmed, password);
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      if (msg.includes('Invalid login')) {
        setError('Incorrect email or password');
      } else if (msg.includes('Email not confirmed') || msg.includes('email_not_confirmed')) {
        setError('Please check your email and click the confirmation link before signing in.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AuthHeader appName={appName} icon={icon} logo={logo} subtitle={subtitle} />

      <View style={s.form}>
        <ErrorBanner message={error} />

        <AuthInput
          label="Email"
          icon={icons?.email}
          placeholder="your@email.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          editable={!loading}
        />

        <PasswordInput
          icon={icons?.lock}
          eyeOpen={icons?.eyeOpen}
          eyeClosed={icons?.eyeClosed}
          placeholder="Your password"
          value={password}
          onChangeText={setPassword}
          editable={!loading}
          onSubmitEditing={handleLogin}
          returnKeyType="go"
        />

        <AuthButton title="Sign In" onPress={handleLogin} loading={loading} />

        {(showForgotPassword || showSignup) && (
          <View style={s.linkRow}>
            {showForgotPassword && onForgotPassword ? (
              <TouchableOpacity onPress={onForgotPassword} disabled={loading}>
                <Text style={s.link}>Forgot password?</Text>
              </TouchableOpacity>
            ) : <View />}

            {showSignup && onSwitchToSignup ? (
              <TouchableOpacity onPress={onSwitchToSignup} disabled={loading}>
                <Text style={s.link}>Create account</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>

      {footer ? <Text style={s.footer}>{footer}</Text> : null}
    </>
  );
}
