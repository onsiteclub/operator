/**
 * OTPVerifyStep - OnSite Operator
 * Ported VERBATIM from onsite-timekeeper.
 *
 * 6-digit OTP verification using a SINGLE visible TextInput with letter-spacing.
 * Most reliable approach across all devices — no focus management, no hidden inputs.
 *
 * Supports:
 * - iOS SMS autofill (textContentType="oneTimeCode")
 * - Android autofill framework (autoComplete="sms-otp")
 * - Manual typing on all devices
 * - Auto-submit when 6 digits entered
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { ErrorBox } from '../ui/ErrorBox';
import { maskPhone } from '../../lib/format';

// Logo
const logoOnsite = require('../../../assets/logo_onsite.png');

const OTP_LENGTH = 6;

interface OTPVerifyStepProps {
  phone: string;
  title?: string;
  subtitle?: string;
  onVerify: (code: string) => Promise<{ error: string | null }>;
  onResend: () => Promise<{ error: string | null }>;
  onBack: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  maxResends?: number;
}

export default function OTPVerifyStep({
  phone,
  title = 'Verify your phone number',
  subtitle,
  onVerify,
  onResend,
  onBack,
  isLoading,
  setIsLoading,
  maxResends = 3,
}: OTPVerifyStepProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendCount, setResendCount] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(60);
  const inputRef = useRef<TextInput | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyingRef = useRef(false);

  const isCodeComplete = code.length === OTP_LENGTH;

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      return;
    }

    cooldownRef.current = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [cooldownSeconds > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net: auto-reset if verification hangs for >20s
  useEffect(() => {
    if (!isLoading) return;
    const timeout = setTimeout(() => {
      setIsLoading(false);
      verifyingRef.current = false;
      setError('Verification timed out. Please try again.');
    }, 20_000);
    return () => clearTimeout(timeout);
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCodeChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    // Auto-submit when all 6 digits entered
    if (digits.length === OTP_LENGTH) {
      doVerify(digits);
    }
  };

  const doVerify = useCallback(async (verifyCode?: string) => {
    if (verifyingRef.current) return; // Prevent double-submit from autofill
    const codeToVerify = verifyCode || code;
    if (codeToVerify.length !== OTP_LENGTH) return;

    verifyingRef.current = true;
    setError(null);
    setIsLoading(true);

    try {
      const result = await onVerify(codeToVerify);
      if (result.error) {
        setError(result.error);
        setCode('');
        inputRef.current?.focus();
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
      verifyingRef.current = false;
    }
  }, [code, onVerify, setIsLoading]);

  const handleResend = useCallback(async () => {
    if (resendCount >= maxResends || cooldownSeconds > 0 || isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      const result = await onResend();
      if (result.error) {
        setError(result.error);
      } else {
        setResendCount(prev => prev + 1);
        setCooldownSeconds(60);
        setCode('');
        inputRef.current?.focus();
      }
    } catch {
      setError('Failed to resend code.');
    } finally {
      setIsLoading(false);
    }
  }, [resendCount, maxResends, cooldownSeconds, isLoading, onResend, setIsLoading]);

  // Masked phone: +1 (613) •••-0839
  const maskedDisplay = `+1 ${maskPhone(phone).replace(/\*/g, '•')}`;
  const displaySubtitle = subtitle || `We sent a 6-digit code to\n${maskedDisplay}`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <Image source={logoOnsite} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{displaySubtitle}</Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <ErrorBox message={error} />

        {/* Single OTP TextInput with letter-spacing */}
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={handleCodeChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={OTP_LENGTH}
          autoFocus
          style={styles.otpInput}
        />

        {/* Dot indicators */}
        <View style={styles.dotRow}>
          {Array.from({ length: OTP_LENGTH }, (_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                code.length > i ? styles.dotFilled : styles.dotEmpty,
              ]}
            />
          ))}
        </View>

        {/* Verify Button */}
        <TouchableOpacity
          style={[styles.button, (!isCodeComplete || isLoading) && styles.buttonDisabled]}
          onPress={() => doVerify()}
          disabled={!isCodeComplete || isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color={colors.white} />
              <Text style={styles.buttonText}>Verifying...</Text>
            </>
          ) : (
            <Text style={styles.buttonText}>Verify</Text>
          )}
        </TouchableOpacity>

        {/* Resend */}
        <View style={styles.resendContainer}>
          {resendCount >= maxResends ? (
            <Text style={styles.maxAttemptsText}>
              Too many attempts. Contact support at contact@onsiteclub.ca
            </Text>
          ) : (
            <>
              <Text style={styles.didntReceiveText}>Didn't receive it?</Text>
              {cooldownSeconds > 0 ? (
                <Text style={styles.cooldownText}>Resend code ({cooldownSeconds}s)</Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={isLoading}>
                  <Text style={styles.resendLink}>Resend code</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 40,
  },

  // Back Button
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 10,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 160,
    height: 55,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Form
  form: {
    width: '100%',
    alignItems: 'center',
  },

  // Single OTP input with letter-spacing
  otpInput: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 24,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: '100%',
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
  },

  // Dot indicators
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotFilled: {
    backgroundColor: colors.primary,
  },
  dotEmpty: {
    backgroundColor: colors.border,
  },

  // Button
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },

  // Resend
  resendContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  didntReceiveText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  cooldownText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  maxAttemptsText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
