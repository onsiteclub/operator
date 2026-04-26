/**
 * Login + Signup screen — OnSite Operator
 *
 * Single screen with a Sign-in / Create-account toggle. Email + password
 * only (Onda A) — phone OTP and social login come in later waves.
 *
 * Adapted from the timekeeper auth flow but flattened into a single
 * component since email/password is the only mode this wave ships.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@onsite/tokens';
import { useAuthStore } from '../../src/stores/authStore';

const logoOnsite = require('../../assets/onsite-club-logo.png');

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  const validate = useCallback((): string | null => {
    if (!email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Invalid email format';
    if (!password) return 'Password is required';
    if (isSignup) {
      if (password.length < 6) return 'Password must be at least 6 characters';
      if (!firstName.trim()) return 'First name is required';
      if (!lastName.trim()) return 'Last name is required';
    }
    return null;
  }, [email, password, firstName, lastName, isSignup]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      if (isSignup) {
        const result = await signUp(email, password, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
        if (!result.success) {
          if (result.error === 'already_registered') {
            setError('An account with this email already exists. Sign in instead.');
            setMode('signin');
          } else {
            setError(result.error || 'Could not create account');
          }
          return;
        }
        if (result.needsConfirmation) {
          Alert.alert(
            'Check your email',
            'We sent you a confirmation link. Confirm your email and then sign in.',
            [{ text: 'OK', onPress: () => setMode('signin') }],
          );
          return;
        }
        // Signed up + signed in. The auth gate routes us forward.
      } else {
        const result = await signIn(email, password);
        if (!result.success) {
          setError(result.error || 'Could not sign in');
          return;
        }
        // Signed in. Auth gate handles routing.
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [validate, isSignup, signUp, signIn, email, password, firstName, lastName]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Image source={logoOnsite} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>{isSignup ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={styles.subtitle}>
            {isSignup
              ? 'Set up your operator account to start logging hours.'
              : 'Sign in with your operator account.'}
          </Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {isSignup ? (
            <View style={styles.nameRow}>
              <View style={[styles.inputContainer, styles.nameInput]}>
                <Text style={styles.label}>First name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="First name"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                  autoComplete="given-name"
                  value={firstName}
                  onChangeText={setFirstName}
                  editable={!isLoading}
                />
              </View>
              <View style={[styles.inputContainer, styles.nameInput]}>
                <Text style={styles.label}>Last name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Last name"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                  autoComplete="family-name"
                  value={lastName}
                  onChangeText={setLastName}
                  editable={!isLoading}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={isSignup ? 'Min. 6 characters' : 'Your password'}
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showPassword}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChangeText={setPassword}
                editable={!isLoading}
                onSubmitEditing={handleSubmit}
                returnKeyType={isSignup ? 'next' : 'go'}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>
                {isSignup ? 'Create account' : 'Sign in'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleText}>
              {isSignup ? 'Already have an account?' : "Don't have an account?"}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setError(null);
                setMode(isSignup ? 'signin' : 'signup');
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.toggleLink}>
                {isSignup ? 'Sign in' : 'Create one'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 200, height: 60, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  form: { width: '100%' },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.errorSoft,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.error + '30',
  },
  errorText: { flex: 1, color: colors.error, fontSize: 14 },

  nameRow: { flexDirection: 'row', gap: 12 },
  nameInput: { flex: 1 },

  inputContainer: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.backgroundTertiary,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 8 },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.white },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  toggleText: { fontSize: 14, color: colors.textSecondary },
  toggleLink: { fontSize: 14, color: colors.primary, fontWeight: '700' },
});
