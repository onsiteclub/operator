/**
 * Login flow — OnSite Operator
 *
 * Multi-step state machine adapted from the timekeeper auth flow:
 *
 *   signin → email + password
 *     ↑                     ↘
 *     ↑ (after reset done)    ↓ "Forgot password?"
 *     ↑                       ↓
 *     ↑                  forgot-phone (PhoneInputStep)
 *     ↑                       ↓ resetPasswordWithPhone
 *     ↑                  otp-reset (OTPVerifyStep, type=sms)
 *     ↑                       ↓ verifyResetOtp
 *     ↑                  new-password (SetNewPasswordStep)
 *     ↑                       ↓ updatePasswordAfterReset
 *     ↑                  ←————┘ (back to signin)
 *
 *   signup → email + password + first/last/phone
 *     ↓ signUp({ phone })
 *   otp-signup (OTPVerifyStep, type=phone_change)
 *     ↓ verifyPhoneOtp → session committed → /(tabs) via auth gate
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
import { validateCanadianPhone } from '../../src/lib/database/businessProfile';
import { formatPhoneDisplay, normalizePhoneE164 } from '../../src/lib/format';
import PhoneInputStep from '../../src/components/auth/PhoneInputStep';
import OTPVerifyStep from '../../src/components/auth/OTPVerifyStep';
import SetNewPasswordStep from '../../src/components/auth/SetNewPasswordStep';
import { SocialButtons } from '../../src/components/auth/SocialButtons';

const logoOnsite = require('../../assets/onsite-club-logo.png');

type Step = 'signin' | 'signup' | 'otp-signup' | 'forgot-phone' | 'otp-reset' | 'new-password';

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const verifyPhoneOtp = useAuthStore((s) => s.verifyPhoneOtp);
  const sendPhoneOtp = useAuthStore((s) => s.sendPhoneOtp);
  const resetPasswordWithPhone = useAuthStore((s) => s.resetPasswordWithPhone);
  const verifyResetOtp = useAuthStore((s) => s.verifyResetOtp);
  const updatePasswordAfterReset = useAuthStore((s) => s.updatePasswordAfterReset);
  const clearOtpState = useAuthStore((s) => s.clearOtpState);

  const [step, setStep] = useState<Step>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState(''); // 10-digit local
  const [phoneE164, setPhoneE164] = useState(''); // +1XXXXXXXXXX, set after submit

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // SIGN IN / SIGN UP
  // ============================================

  const isSignup = step === 'signup';

  const validateCredentials = useCallback((): string | null => {
    if (!email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Invalid email format';
    if (!password) return 'Password is required';
    if (isSignup) {
      if (password.length < 8) return 'Password must be at least 8 characters';
      if (!firstName.trim()) return 'First name is required';
      if (!lastName.trim()) return 'Last name is required';
      if (!phone) return 'Phone number is required';
      if (!validateCanadianPhone(phone)) return 'Enter a valid 10-digit Canadian phone number';
    }
    return null;
  }, [email, password, firstName, lastName, phone, isSignup]);

  const handleCredentialsSubmit = useCallback(async () => {
    setError(null);
    const validationError = validateCredentials();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      if (isSignup) {
        const e164 = normalizePhoneE164(phone);
        const result = await signUp(email, password, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: e164,
        });
        if (!result.success) {
          if (result.error === 'already_registered') {
            setError('An account with this email already exists. Sign in instead.');
            setStep('signin');
          } else {
            setError(result.error || 'Could not create account');
          }
          return;
        }
        if (result.needsPhoneVerification) {
          setPhoneE164(e164);
          setStep('otp-signup');
          return;
        }
        if (result.needsConfirmation) {
          Alert.alert(
            'Check your email',
            'We sent you a confirmation link. Confirm your email and then sign in.',
            [{ text: 'OK', onPress: () => setStep('signin') }],
          );
          return;
        }
        // Logged in — auth gate routes us forward.
      } else {
        const result = await signIn(email, password);
        if (!result.success) {
          setError(result.error || 'Could not sign in');
          return;
        }
        // Auth gate handles routing.
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [validateCredentials, isSignup, signUp, signIn, email, password, firstName, lastName, phone]);

  // ============================================
  // FORGOT PASSWORD
  // ============================================

  const handleForgotPhone = useCallback(async (e164: string): Promise<{ error: string | null }> => {
    const result = await resetPasswordWithPhone(e164);
    if (!result.error) {
      setPhoneE164(e164);
      setStep('otp-reset');
    }
    return result;
  }, [resetPasswordWithPhone]);

  const handleResetVerify = useCallback(async (token: string): Promise<{ error: string | null }> => {
    const result = await verifyResetOtp(phoneE164, token);
    if (!result.error) {
      setStep('new-password');
    }
    return result;
  }, [verifyResetOtp, phoneE164]);

  const handleResetResend = useCallback(async (): Promise<{ error: string | null }> => {
    return sendPhoneOtp(phoneE164);
  }, [sendPhoneOtp, phoneE164]);

  const handleSetNewPassword = useCallback(async (newPassword: string): Promise<{ error: string | null }> => {
    const result = await updatePasswordAfterReset(newPassword);
    if (!result.error) {
      Alert.alert(
        'Password updated',
        'Sign in with your new password.',
        [{ text: 'OK', onPress: () => {
          clearOtpState();
          setPassword('');
          setStep('signin');
        }}],
      );
    }
    return result;
  }, [updatePasswordAfterReset, clearOtpState]);

  // ============================================
  // SIGNUP OTP
  // ============================================

  const handleSignupOtpVerify = useCallback(async (token: string): Promise<{ error: string | null }> => {
    return verifyPhoneOtp(phoneE164, token);
  }, [verifyPhoneOtp, phoneE164]);

  const handleSignupOtpResend = useCallback(async (): Promise<{ error: string | null }> => {
    return sendPhoneOtp(phoneE164);
  }, [sendPhoneOtp, phoneE164]);

  const handleSignupOtpBack = useCallback(() => {
    clearOtpState();
    setStep('signup');
  }, [clearOtpState]);

  // ============================================
  // RENDER — STEP DELEGATION
  // ============================================

  if (step === 'forgot-phone') {
    return (
      <PhoneInputStep
        onSubmit={handleForgotPhone}
        onBack={() => setStep('signin')}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
      />
    );
  }

  if (step === 'otp-signup') {
    return (
      <OTPVerifyStep
        phone={phoneE164}
        title="Verify your phone"
        onVerify={handleSignupOtpVerify}
        onResend={handleSignupOtpResend}
        onBack={handleSignupOtpBack}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
      />
    );
  }

  if (step === 'otp-reset') {
    return (
      <OTPVerifyStep
        phone={phoneE164}
        title="Verify your phone"
        subtitle={undefined}
        onVerify={handleResetVerify}
        onResend={handleResetResend}
        onBack={() => {
          clearOtpState();
          setStep('forgot-phone');
        }}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
      />
    );
  }

  if (step === 'new-password') {
    return (
      <SetNewPasswordStep
        onSubmit={handleSetNewPassword}
        onBack={() => setStep('signin')}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
      />
    );
  }

  // ============================================
  // RENDER — SIGN IN / SIGN UP FORM
  // ============================================

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

          {isSignup ? (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Phone (Canada)</Text>
              <View style={styles.phoneContainer}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixText}>+1</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="(514) 555-1234"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  value={formatPhoneDisplay(phone)}
                  onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
                  editable={!isLoading}
                  maxLength={14}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder={isSignup ? 'Min. 8 characters' : 'Your password'}
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showPassword}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChangeText={setPassword}
                editable={!isLoading}
                onSubmitEditing={handleCredentialsSubmit}
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

          {!isSignup ? (
            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => {
                setError(null);
                setStep('forgot-phone');
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleCredentialsSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>{isSignup ? 'Create account' : 'Sign in'}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <SocialButtons
            disabled={isLoading}
            onError={(msg) => setError(msg)}
          />

          <View style={styles.toggleRow}>
            <Text style={styles.toggleText}>
              {isSignup ? 'Already have an account?' : "Don't have an account?"}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setError(null);
                setStep(isSignup ? 'signin' : 'signup');
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.toggleLink}>{isSignup ? 'Sign in' : 'Create one'}</Text>
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

  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.backgroundTertiary,
  },
  phonePrefix: { paddingLeft: 16, paddingVertical: 14 },
  phonePrefixText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  phoneInput: { flex: 1, paddingHorizontal: 8, paddingVertical: 14, fontSize: 16, color: colors.text },

  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.backgroundTertiary,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  eyeBtn: { paddingHorizontal: 16, paddingVertical: 14 },

  forgotBtn: { alignSelf: 'flex-end', marginTop: -8, marginBottom: 8 },
  forgotText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

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

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },

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
