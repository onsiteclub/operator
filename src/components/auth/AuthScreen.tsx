/**
 * AuthScreen - OnSite Operator
 *
 * Ported VERBATIM from onsite-timekeeper. Single-screen login + step
 * management for signup/OTP/reset.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '../../constants/colors';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import type { User } from '@supabase/supabase-js';

import SignupStep from './SignupStep';
import OTPVerifyStep from './OTPVerifyStep';
import PhoneInputStep from './PhoneInputStep';
import SetNewPasswordStep from './SetNewPasswordStep';
import { SocialButtons } from './SocialButtons';

// Logo
const logoOnsite = require('../../../assets/logo_onsite.png');

export interface AuthScreenProps {
  onSuccess?: (user: User, isNewUser: boolean) => void;
}

type AuthStep = 'login' | 'signup' | 'verify-phone' | 'phone-reset' | 'phone-reset-otp' | 'set-new-password';

type ErrorBannerType =
  | 'wrong-credentials'
  | 'network'
  | 'rate-limit'
  | 'suspended'
  | 'already-registered'
  | 'generic'
  | null;

export default function AuthScreen({ onSuccess }: AuthScreenProps) {
  const { signIn, signUp, verifyPhoneOtp, sendPhoneOtp, resetPasswordWithPhone, verifyResetOtp, updatePasswordAfterReset, clearOtpState } = useAuthStore();
  const pendingPhoneVerification = useAuthStore(s => s.pendingPhoneVerification);
  const pendingVerificationPhone = useAuthStore(s => s.pendingVerificationPhone);
  const { expired } = useLocalSearchParams<{ expired?: string }>();

  const [step, setStep] = useState<AuthStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<ErrorBannerType>(null);

  // Auto-restore OTP step if pendingPhoneVerification is true on mount
  // (e.g., user backgrounded app and returned during OTP verification)
  useEffect(() => {
    if (pendingPhoneVerification && pendingVerificationPhone && step !== 'verify-phone') {
      setPhone(pendingVerificationPhone);
      setStep('verify-phone');
    }
  }, [pendingPhoneVerification, pendingVerificationPhone]);

  // Slide transitions between auth steps
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const transitionTo = useCallback((newStep: AuthStep) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(newStep);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  // Dismiss error banner when user types
  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (errorBanner) setErrorBanner(null);
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (errorBanner) setErrorBanner(null);
  };

  // Classify Supabase errors into banner types
  const classifyError = useCallback((rawError: string | undefined): ErrorBannerType => {
    if (!rawError) return 'generic';
    const lower = rawError.toLowerCase();
    if (lower.includes('invalid login credentials')) return 'wrong-credentials';
    if (lower.includes('network') || lower.includes('fetch')) return 'network';
    if (lower.includes('rate limit') || lower.includes('too many')) return 'rate-limit';
    if (lower.includes('banned') || lower.includes('suspended') || lower.includes('disabled')) return 'suspended';
    return 'generic';
  }, []);

  // Map raw error to user-friendly message (for non-login contexts like signup)
  const mapAuthError = useCallback((rawError: string | undefined): string => {
    if (!rawError) return 'Something went wrong. Please try again.';
    const lower = rawError.toLowerCase();
    if (lower.includes('invalid login credentials')) return 'Incorrect email or password';
    if (lower.includes('email not confirmed')) return 'Please check your email to confirm your account';
    if (lower.includes('rate limit') || lower.includes('too many')) return 'Too many attempts. Please wait a moment and try again.';
    if (lower.includes('network') || lower.includes('fetch')) return 'No internet connection. Please check your network.';
    if (lower.includes('banned') || lower.includes('suspended') || lower.includes('disabled')) return 'Your account has been suspended. Please contact support at contact@onsiteclub.ca';
    return 'Something went wrong. Please try again.';
  }, []);

  // ============================================
  // LOGIN HANDLERS
  // ============================================

  const handleSignInSubmit = useCallback(async () => {
    if (!email.trim() || !password) return;

    setErrorBanner(null);
    setIsLoading(true);

    try {
      const result = await signIn(email.trim().toLowerCase(), password);

      if (!result.success) {
        setErrorBanner(classifyError(result.error));
      } else if (onSuccess) {
        const { user } = useAuthStore.getState();
        if (user) onSuccess(user, false);
      }
    } catch (err) {
      console.log('[AuthScreen] signIn error:', err);
      setErrorBanner('generic');
    } finally {
      setIsLoading(false);
    }
  }, [email, password, signIn, classifyError, onSuccess]);

  const handleForgotPassword = useCallback(() => {
    transitionTo('phone-reset');
  }, [transitionTo]);

  const handleNavigateToSignup = useCallback(() => {
    transitionTo('signup');
  }, [transitionTo]);

  // ============================================
  // SIGNUP HANDLER
  // ============================================

  const handleSignUp = useCallback(async (
    emailToUse: string,
    passwordToUse: string,
    profile: { firstName: string; lastName: string; phone: string },
  ): Promise<{ error: string | null; needsConfirmation?: boolean; needsPhoneVerification?: boolean }> => {
    if (!isSupabaseConfigured()) {
      return { error: 'Authentication is not available.' };
    }

    if (!emailToUse?.trim()) {
      return { error: 'Email is required. Please go back and enter your email.' };
    }

    try {
      const result = await signUp(emailToUse, passwordToUse, {
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
      });

      if (!result.success) {
        // Handle "already registered" — redirect to login with message
        if (result.error === 'already_registered' ||
            result.error?.toLowerCase().includes('already registered') ||
            result.error?.toLowerCase().includes('already been registered')) {
          console.log('[AuthScreen] Email already registered — redirect to login');
          setErrorBanner('already-registered');
          transitionTo('login');
          return { error: null };
        }
        return { error: mapAuthError(result.error) };
      }

      // Phone verification needed — transition to OTP step
      if (result.needsPhoneVerification) {
        setPhone(profile.phone);
        transitionTo('verify-phone');
        return { error: null, needsPhoneVerification: true };
      }

      // Logged in — navigation guard handles redirect
      if (onSuccess) {
        const { user } = useAuthStore.getState();
        if (user) onSuccess(user, true);
      }
      return { error: null };
    } catch (err) {
      console.log('[AuthScreen] signUp error:', err);
      return { error: 'Something went wrong. Please try again.' };
    }
  }, [signUp, onSuccess, mapAuthError, transitionTo]);

  // ============================================
  // OTP HANDLERS
  // ============================================

  const handleVerifyPhone = useCallback(async (code: string): Promise<{ error: string | null }> => {
    return verifyPhoneOtp(phone, code);
  }, [phone, verifyPhoneOtp]);

  const handleResendOtp = useCallback(async (): Promise<{ error: string | null }> => {
    return sendPhoneOtp(phone);
  }, [phone, sendPhoneOtp]);

  const handleOtpBack = useCallback(() => {
    clearOtpState();
    transitionTo('login');
  }, [clearOtpState, transitionTo]);

  // ============================================
  // PASSWORD RESET HANDLERS
  // ============================================

  const handlePhoneResetSubmit = useCallback(async (phoneNumber: string): Promise<{ error: string | null }> => {
    const result = await resetPasswordWithPhone(phoneNumber);
    if (!result.error) {
      setPhone(phoneNumber);
      transitionTo('phone-reset-otp');
    }
    return result;
  }, [resetPasswordWithPhone, transitionTo]);

  const handleVerifyResetOtp = useCallback(async (code: string): Promise<{ error: string | null }> => {
    const result = await verifyResetOtp(phone, code);
    if (!result.error) {
      transitionTo('set-new-password');
    }
    return result;
  }, [phone, verifyResetOtp, transitionTo]);

  const handleResendResetOtp = useCallback(async (): Promise<{ error: string | null }> => {
    return resetPasswordWithPhone(phone);
  }, [phone, resetPasswordWithPhone]);

  const handleSetNewPassword = useCallback(async (newPassword: string): Promise<{ error: string | null }> => {
    const result = await updatePasswordAfterReset(newPassword);
    if (!result.error) {
      transitionTo('login');
    }
    return result;
  }, [updatePasswordAfterReset, transitionTo]);

  const handleBackToLogin = useCallback(() => {
    clearOtpState();
    transitionTo('login');
  }, [clearOtpState, transitionTo]);

  // ============================================
  // ERROR BANNER (amber, friendly)
  // ============================================

  const renderErrorBanner = () => {
    if (!errorBanner) return null;

    let title = '';
    let body = '';
    let showCreateLink = false;
    let showMailtoLink = false;

    switch (errorBanner) {
      case 'wrong-credentials':
        // We can't tell here whether the user typed the wrong password
        // or whether the account is OAuth-only with no password set, so
        // we hint at both paths plus signup. The Apple/Google buttons
        // sit right below the banner, so the language nudges users to
        // try them if they signed up that way.
        title = "Couldn't sign in.";
        body = 'Check your password, or use Apple/Google below if you signed up that way. Or ';
        showCreateLink = true;
        break;
      case 'already-registered':
        title = 'This email is already registered.';
        body = 'Please sign in with your password.';
        break;
      case 'network':
        title = 'No internet connection.';
        body = 'Please check your network and try again.';
        break;
      case 'rate-limit':
        title = 'Too many attempts.';
        body = 'Please wait a moment and try again.';
        break;
      case 'suspended':
        title = 'Your account has been suspended.';
        body = 'Contact support at ';
        showMailtoLink = true;
        break;
      default:
        title = 'Something went wrong.';
        body = 'Please try again.';
    }

    return (
      <View style={styles.errorBanner}>
        <Text style={styles.errorBannerTitle}>{title}</Text>
        <Text style={styles.errorBannerBody}>
          {body}
          {showCreateLink && (
            <Text style={styles.errorBannerLink} onPress={handleNavigateToSignup}>
              create a new account.
            </Text>
          )}
          {showMailtoLink && (
            <Text
              style={styles.errorBannerLink}
              onPress={() => Linking.openURL('mailto:contact@onsiteclub.ca')}
            >
              contact@onsiteclub.ca
            </Text>
          )}
        </Text>
      </View>
    );
  };

  // ============================================
  // LOGIN SCREEN
  // ============================================

  const renderLoginScreen = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.loginContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Session expiry banner */}
      {expired === 'true' && (
        <View style={styles.expiredBanner}>
          <Ionicons name="time-outline" size={18} color="#854F0B" />
          <Text style={styles.expiredText}>
            Your session expired. Please sign in again.
          </Text>
        </View>
      )}

      {/* Logo + subtitle */}
      <View style={styles.logoContainer}>
        <Image source={logoOnsite} style={styles.logo} resizeMode="contain" />
        <Text style={styles.welcomeSubtitle}>Welcome back</Text>
      </View>

      {/* Email */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="your@email.com"
          placeholderTextColor={colors.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoFocus
          value={email}
          onChangeText={handleEmailChange}
          editable={!isLoading}
          returnKeyType="next"
        />
      </View>

      {/* Password */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Enter your password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            value={password}
            onChangeText={handlePasswordChange}
            editable={!isLoading}
            onSubmitEditing={handleSignInSubmit}
            returnKeyType="go"
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={22}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Error Banner (amber, between password and Sign In) */}
      {renderErrorBanner()}

      {/* Sign In Button */}
      <TouchableOpacity
        style={[
          styles.signInButton,
          (isLoading || !email.trim() || !password) && styles.buttonDisabled,
        ]}
        onPress={handleSignInSubmit}
        disabled={isLoading || !email.trim() || !password}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <>
            <ActivityIndicator size="small" color={colors.white} />
            <Text style={styles.signInButtonText}>Signing in...</Text>
          </>
        ) : (
          <Text style={styles.signInButtonText}>Sign In</Text>
        )}
      </TouchableOpacity>

      {/* Forgot Password */}
      <TouchableOpacity
        style={styles.forgotButton}
        onPress={handleForgotPassword}
        disabled={isLoading}
      >
        <Text style={styles.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Social Sign-In (Google always, Apple on iOS only) */}
      <SocialButtons
        disabled={isLoading}
        onError={(msg) => {
          console.log('[AuthScreen] OAuth error:', msg);
          setErrorBanner(classifyError(msg));
        }}
        onSuccess={() => {
          // Navigation guard will redirect once session is committed by onAuthStateChange
          if (onSuccess) {
            const { user } = useAuthStore.getState();
            if (user) onSuccess(user, false);
          }
        }}
      />

      {/* Sign Up Link */}
      <View style={styles.signUpRow}>
        <Text style={styles.signUpText}>Don't have an account? </Text>
        <TouchableOpacity onPress={handleNavigateToSignup} disabled={isLoading}>
          <Text style={styles.signUpLink}>Sign up</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
          {step === 'login' && renderLoginScreen()}

          {step === 'signup' && (
            <SignupStep
              email={email}
              onSignUp={handleSignUp}
              onBack={handleBackToLogin}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          )}

          {step === 'verify-phone' && (
            <OTPVerifyStep
              phone={phone}
              title="Verify your phone number"
              onVerify={handleVerifyPhone}
              onResend={handleResendOtp}
              onBack={handleOtpBack}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          )}

          {step === 'phone-reset' && (
            <PhoneInputStep
              onSubmit={handlePhoneResetSubmit}
              onBack={handleBackToLogin}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          )}

          {step === 'phone-reset-otp' && (
            <OTPVerifyStep
              phone={phone}
              title="Enter Reset Code"
              subtitle="We sent a 6-digit code to your phone"
              onVerify={handleVerifyResetOtp}
              onResend={handleResendResetOtp}
              onBack={() => transitionTo('phone-reset')}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          )}

          {step === 'set-new-password' && (
            <SetNewPasswordStep
              onSubmit={handleSetNewPassword}
              onBack={() => transitionTo('login')}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loginContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 40,
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 160,
    height: 55,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Inputs
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
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
  eyeButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  // Sign In Button
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },

  // Forgot password
  forgotButton: {
    alignItems: 'center',
    marginTop: 12,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginHorizontal: 16,
  },

  // Sign up link
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  signUpText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  signUpLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },

  // Error banner (amber, friendly)
  errorBanner: {
    backgroundColor: '#FFF8E7',
    borderWidth: 0.5,
    borderColor: '#EAD5A0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  errorBannerTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#854F0B',
  },
  errorBannerBody: {
    fontSize: 12,
    color: '#854F0B',
    marginTop: 2,
  },
  errorBannerLink: {
    textDecorationLine: 'underline',
    fontWeight: '500',
  },

  // Session expiry banner
  expiredBanner: {
    backgroundColor: colors.amberSoftWarm,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expiredText: {
    fontSize: 13,
    color: '#854F0B',
    flex: 1,
  },
});
