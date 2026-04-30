/**
 * SignupStep - OnSite Operator
 * Ported VERBATIM from onsite-timekeeper.
 * Step 2B: Registration form for new accounts.
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
  Linking,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { ErrorBox } from '../ui/ErrorBox';
import { validateCanadianPhone } from '../../lib/database/businessProfile';
import { formatPhoneDisplay, normalizePhoneE164 } from '../../lib/format';

// Logo
const logoOnsite = require('../../../assets/logo_onsite.png');

interface SignupStepProps {
  email: string;
  onSignUp: (
    email: string,
    password: string,
    profile: {
      firstName: string;
      lastName: string;
      phone: string;
    }
  ) => Promise<{ error: string | null; needsConfirmation?: boolean; needsPhoneVerification?: boolean }>;
  onBack: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function SignupStep({
  email,
  onSignUp,
  onBack,
  isLoading,
  setIsLoading,
}: SignupStepProps) {
  const [localEmail, setLocalEmail] = useState(email || '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhoneChange = (text: string) => {
    // Strip to digits only, limit to 10
    const digits = text.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
  };

  const validateForm = (): string | null => {
    if (!localEmail.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(localEmail.trim())) return 'Enter a valid email address';
    if (!firstName.trim()) return 'First name is required';
    if (!lastName.trim()) return 'Last name is required';
    if (!phone) return 'Phone number is required';
    if (!validateCanadianPhone(phone)) return 'Enter a valid 10-digit Canadian phone number';
    if (!password) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    return null;
  };

  const handleSubmit = useCallback(async () => {
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const result = await onSignUp(localEmail.trim(), password, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: normalizePhoneE164(phone),
      });

      if (result.error) {
        setError(result.error);
      }
      // Phone verification is handled via needsPhoneVerification in AuthScreen
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.log('[SignupStep] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [localEmail, firstName, lastName, phone, password, onSignUp, setIsLoading]);

  const openTerms = () => {
    Linking.openURL('https://www.onsiteclub.ca/legal/operator-terms');
  };

  const openPrivacy = () => {
    Linking.openURL('https://www.onsiteclub.ca/legal/operator-privacy');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Back Button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={onBack}
        disabled={isLoading}
      >
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <Image
          source={logoOnsite}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>Create your account</Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <ErrorBox message={error} />

        {/* Name Row */}
        <View style={styles.nameRow}>
          <View style={[styles.inputContainer, styles.nameInput]}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="words"
              autoComplete="given-name"
              autoFocus
              value={firstName}
              onChangeText={setFirstName}
              editable={!isLoading}
            />
          </View>

          <View style={[styles.inputContainer, styles.nameInput]}>
            <Text style={styles.label}>Last Name</Text>
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

        {/* Email Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={localEmail}
            onChangeText={setLocalEmail}
            editable={!isLoading}
          />
        </View>

        {/* Phone Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Phone Number</Text>
          <View style={styles.phoneContainer}>
            <View style={styles.phonePrefix}>
              <Text style={styles.phonePrefixText}>+1</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              placeholder="(613) 555-0123"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              value={formatPhoneDisplay(phone)}
              onChangeText={handlePhoneChange}
              editable={!isLoading}
              maxLength={14}
            />
          </View>
          <Text style={styles.phoneHint}>Used for verification and password reset. Canadian numbers only.</Text>
        </View>

        {/* Password Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Min. 8 characters"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
              editable={!isLoading}
              onSubmitEditing={handleSubmit}
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

        {/* UX3: Submit Button ABOVE terms */}
        <TouchableOpacity
          style={[
            styles.button,
            isLoading && styles.buttonDisabled
          ]}
          onPress={handleSubmit}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color={colors.white} />
              <Text style={styles.buttonText}>Creating account...</Text>
            </>
          ) : (
            <Text style={styles.buttonText}>Register</Text>
          )}
        </TouchableOpacity>

        {/* Terms (below button, smaller) */}
        <Text style={styles.terms}>
          By registering, you agree to our{' '}
          <Text style={styles.termsLink} onPress={openTerms}>Terms</Text>
          {' '}and{' '}
          <Text style={styles.termsLink} onPress={openPrivacy}>Privacy Policy</Text>.
        </Text>
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
    paddingTop: 60,
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
    marginBottom: 32,
  },
  logo: {
    width: 160,
    height: 55,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Form
  form: {
    width: '100%',
  },
  // Name Row
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameInput: {
    flex: 1,
  },

  // Input
  inputContainer: {
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
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.backgroundTertiary,
  },
  phonePrefix: {
    paddingLeft: 16,
    paddingVertical: 14,
  },
  phonePrefixText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  phoneHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
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

  // Terms (UX3: below button, smaller)
  terms: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 12,
  },
  termsLink: {
    color: colors.primary,
    fontWeight: '600',
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
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },

});
