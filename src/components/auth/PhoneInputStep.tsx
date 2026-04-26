/**
 * PhoneInputStep - Phone number input for password reset flow.
 * User enters their phone number to receive a reset OTP.
 *
 * Ported from onsite-timekeeper.
 */

import React, { useState, useCallback } from 'react';
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
import { colors } from '@onsite/tokens';
import { ErrorBox } from '../ui/ErrorBox';
import { validateCanadianPhone } from '../../lib/database/businessProfile';
import { formatPhoneDisplay, normalizePhoneE164 } from '../../lib/format';

const logoOnsite = require('../../../assets/onsite-club-logo.png');

interface PhoneInputStepProps {
  onSubmit: (phone: string) => Promise<{ error: string | null }>;
  onBack: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function PhoneInputStep({
  onSubmit,
  onBack,
  isLoading,
  setIsLoading,
}: PhoneInputStepProps) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handlePhoneChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
  };

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (!phone) {
      setError('Phone number is required');
      return;
    }
    if (!validateCanadianPhone(phone)) {
      setError('Enter a valid 10-digit Canadian phone number');
      return;
    }

    setIsLoading(true);
    try {
      const result = await onSubmit(normalizePhoneE164(phone));
      if (result.error) setError(result.error);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [phone, onSubmit, setIsLoading]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={onBack}
        disabled={isLoading}
      >
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.header}>
        <Image source={logoOnsite} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>
          Enter the phone number linked to your account. We{'’'}ll send you a code to reset your password.
        </Text>
      </View>

      <View style={styles.form}>
        <ErrorBox message={error} />

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Phone number</Text>
          <View style={styles.phoneContainer}>
            <View style={styles.phonePrefix}>
              <Text style={styles.phonePrefixText}>+1</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              placeholder="(514) 555-1234"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              value={formatPhoneDisplay(phone)}
              onChangeText={handlePhoneChange}
              editable={!isLoading}
              maxLength={14}
              autoFocus
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, (isLoading || !phone) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading || !phone}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color={colors.white} />
              <Text style={styles.buttonText}>Sending code...</Text>
            </>
          ) : (
            <Text style={styles.buttonText}>Send reset code</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 40 },

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

  header: { alignItems: 'center', marginBottom: 40 },
  logo: { width: 180, height: 62, marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  form: { width: '100%' },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },

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
});
