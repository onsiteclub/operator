/**
 * CompleteProfile — Mandatory profile completion screen.
 *
 * Shown after login if the user has no `full_name` in profiles or in
 * Supabase `user_metadata`. Cannot be skipped — the auth gate routes
 * here whenever profileComplete is false.
 *
 * Ported from onsite-timekeeper.
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@onsite/tokens';
import { useAuthStore } from '../../src/stores/authStore';

const logoOnsite = require('../../assets/onsite-club-logo.png');

export default function CompleteProfileScreen() {
  const router = useRouter();
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const userEmail = useAuthStore((s) => s.user?.email);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (!firstName.trim()) {
      setError('First name is required');
      return;
    }
    if (!lastName.trim()) {
      setError('Last name is required');
      return;
    }

    setIsLoading(true);
    try {
      const result = await updateProfile(firstName.trim(), lastName.trim());
      if (result.success) {
        router.replace('/(tabs)');
      } else {
        setError(result.error || 'Something went wrong');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [firstName, lastName, updateProfile, router]);

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
          <Text style={styles.title}>Complete your profile</Text>
          <Text style={styles.subtitle}>
            We need your name so your time reports and invoices show the right info.
          </Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {userEmail ? (
            <View style={styles.emailDisplay}>
              <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.emailValue}>{userEmail}</Text>
            </View>
          ) : null}

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
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={styles.buttonText}>Saving...</Text>
              </>
            ) : (
              <Text style={styles.buttonText}>Save & Continue</Text>
            )}
          </TouchableOpacity>
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
  emailDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emailValue: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
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
