/**
 * SignupScreen — Registration with expanded profile fields (native).
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { AuthHeader } from './shared/AuthHeader';
import { AuthInput } from './shared/AuthInput';
import { PasswordInput } from './shared/PasswordInput';
import { AuthButton } from './shared/AuthButton';
import { ErrorBanner } from './shared/ErrorBanner';
import { SelectInput } from './shared/SelectInput';
import { authStyles as s } from './shared/styles';
import type { SignupProfile } from '../types';

export interface SignupScreenProps {
  appName: string;
  icon?: React.ReactNode;
  logo?: React.ReactNode;
  icons?: {
    email?: React.ReactNode;
    lock?: React.ReactNode;
    eyeOpen?: React.ReactNode;
    eyeClosed?: React.ReactNode;
  };
  legal?: { termsUrl: string; privacyUrl: string };
  trades?: Array<{ id: string; name: string }>;
  onSignUp: (
    email: string,
    password: string,
    profile: SignupProfile
  ) => Promise<{ needsConfirmation?: boolean }>;
  onSwitchToLogin?: () => void;
  onEmailSent?: () => void;
  onSuccess?: () => void;
}

const GENDER_OPTIONS = [
  { id: '', name: 'Select...' },
  { id: 'male', name: 'Male' },
  { id: 'female', name: 'Female' },
  { id: 'undeclared', name: 'Prefer not to say' },
];

export function SignupScreen({
  appName,
  icon,
  logo,
  icons,
  legal,
  trades,
  onSignUp,
  onSwitchToLogin,
  onEmailSent,
  onSuccess,
}: SignupScreenProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [trade, setTrade] = useState('');
  const [gender, setGender] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup() {
    const trimFirst = firstName.trim();
    const trimLast = lastName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimFirst) { setError('Please enter your first name'); return; }
    if (!trimLast) { setError('Please enter your last name'); return; }
    if (!trimmedEmail || !trimmedEmail.includes('@')) { setError('Please enter a valid email'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    setError(null);

    try {
      const profile: SignupProfile = {
        firstName: trimFirst,
        lastName: trimLast,
        name: `${trimFirst} ${trimLast}`,
        dateOfBirth: dateOfBirth || undefined,
        trade: trade || undefined,
        gender: (gender as SignupProfile['gender']) || undefined,
      };
      const result = await onSignUp(trimmedEmail, password, profile);
      if (result?.needsConfirmation) {
        onEmailSent?.();
      } else {
        onSuccess?.();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign up failed';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setError('This email is already registered. Please sign in.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AuthHeader appName={appName} icon={icon} logo={logo} subtitle="Create your account" />

      <View style={s.form}>
        <ErrorBanner message={error} />

        {/* Name row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <AuthInput
              label="First name"
              placeholder="John"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoComplete="given-name"
              editable={!loading}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AuthInput
              label="Last name"
              placeholder="Doe"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoComplete="family-name"
              editable={!loading}
            />
          </View>
        </View>

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
          label="Password (min 6 characters)"
          icon={icons?.lock}
          eyeOpen={icons?.eyeOpen}
          eyeClosed={icons?.eyeClosed}
          placeholder="Create a password"
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          editable={!loading}
          onSubmitEditing={handleSignup}
          returnKeyType="go"
        />

        {/* Date of birth */}
        <AuthInput
          label="Date of birth"
          placeholder="YYYY-MM-DD"
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          keyboardType="numeric"
          editable={!loading}
        />

        {/* Gender + Trade row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <SelectInput
              label="Gender"
              options={GENDER_OPTIONS}
              value={gender}
              onValueChange={setGender}
              disabled={loading}
            />
          </View>
          <View style={{ flex: 1 }}>
            {trades && trades.length > 0 ? (
              <SelectInput
                label="Trade (optional)"
                options={[{ id: '', name: 'Select...' }, ...trades]}
                value={trade}
                onValueChange={setTrade}
                disabled={loading}
              />
            ) : (
              <AuthInput
                label="Trade (optional)"
                placeholder="e.g. Carpenter"
                value={trade}
                onChangeText={setTrade}
                autoCapitalize="words"
                editable={!loading}
              />
            )}
          </View>
        </View>

        {legal ? (
          <Text style={s.legalText}>
            By signing up, you agree to our{' '}
            <Text style={s.legalLink} onPress={() => Linking.openURL(legal.termsUrl)}>
              Terms
            </Text>{' '}
            and{' '}
            <Text style={s.legalLink} onPress={() => Linking.openURL(legal.privacyUrl)}>
              Privacy Policy
            </Text>.
          </Text>
        ) : null}

        <AuthButton title="Create Account" onPress={handleSignup} loading={loading} />

        {onSwitchToLogin ? (
          <TouchableOpacity onPress={onSwitchToLogin} disabled={loading} style={{ alignItems: 'center', marginTop: 8 }}>
            <Text style={s.link}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </>
  );
}
