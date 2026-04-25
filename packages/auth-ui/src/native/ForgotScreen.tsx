/**
 * ForgotScreen — Email input to request password reset.
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AuthHeader } from './shared/AuthHeader';
import { AuthInput } from './shared/AuthInput';
import { AuthButton } from './shared/AuthButton';
import { ErrorBanner, SuccessBanner } from './shared/ErrorBanner';
import { authStyles as s } from './shared/styles';

export interface ForgotScreenProps {
  appName: string;
  icon?: React.ReactNode;
  logo?: React.ReactNode;
  icons?: { email?: React.ReactNode };
  email?: string;
  onSubmit: (email: string) => Promise<void>;
  onBack?: () => void;
}

export function ForgotScreen({
  appName,
  icon,
  logo,
  icons,
  email: initialEmail = '',
  onSubmit,
  onBack,
}: ForgotScreenProps) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSubmit(trimmed);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AuthHeader
        appName={appName}
        icon={icon}
        logo={logo}
        subtitle={sent ? 'Check your email for a reset link' : 'Enter your email to reset your password'}
      />

      <View style={s.form}>
        <ErrorBanner message={error} />
        {sent ? <SuccessBanner message="Password reset email sent! Check your inbox." /> : null}

        {!sent && (
          <>
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
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
            />

            <AuthButton title="Send Reset Link" onPress={handleSubmit} loading={loading} />
          </>
        )}

        {onBack ? (
          <TouchableOpacity onPress={onBack} style={{ alignItems: 'center', marginTop: 8 }}>
            <Text style={s.link}>Back to sign in</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </>
  );
}
