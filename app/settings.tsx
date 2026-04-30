/**
 * Settings Screen — OnSite Operator
 *
 * Minimal settings hub reachable from the avatar circle in the Invoice
 * tab header. Currently just shows account info and a Sign out action.
 * Will grow as operator adds more app-level preferences.
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@onsite/tokens';
import { useAuthStore } from '../src/stores/authStore';
import { useSupervisorPhone } from '../src/hooks/useSupervisorPhone';
import { useForwardNumber } from '../src/hooks/useForwardNumber';
import { formatPhoneDisplay } from '../src/lib/format';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const cachedFullName = useAuthStore((s) => s.cachedFullName);
  const signOut = useAuthStore((s) => s.signOut);
  const [signingOut, setSigningOut] = useState(false);

  const { phone: supervisorPhone, save: saveSupervisorPhone } = useSupervisorPhone();
  const [supervisorInput, setSupervisorInput] = useState('');
  const [savingSupervisor, setSavingSupervisor] = useState(false);

  const { phone: forwardPhone, authPhone, loaded: forwardLoaded, saving: savingForward, save: saveForwardPhone } = useForwardNumber();
  const [forwardInput, setForwardInput] = useState('');

  useEffect(() => {
    // Re-seed input from saved value (digits only, formatted for display)
    if (supervisorPhone) {
      const digits = supervisorPhone.replace(/\D/g, '').slice(-10);
      setSupervisorInput(formatPhoneDisplay(digits));
    } else {
      setSupervisorInput('');
    }
  }, [supervisorPhone]);

  useEffect(() => {
    if (!forwardLoaded) return;
    // Saved value wins; otherwise pre-fill from the verified phone on
    // auth.users (populated by the OTP signup flow). Lets the operator
    // hit Save without retyping their own number.
    const seed = forwardPhone || authPhone;
    if (seed) {
      const digits = seed.replace(/\D/g, '').slice(-10);
      setForwardInput(formatPhoneDisplay(digits));
    } else {
      setForwardInput('');
    }
  }, [forwardPhone, authPhone, forwardLoaded]);

  const handleForwardChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setForwardInput(formatPhoneDisplay(digits));
  };

  const handleForwardSave = async () => {
    const digits = forwardInput.replace(/\D/g, '');
    if (digits.length > 0 && digits.length !== 10) {
      Alert.alert('Invalid number', 'Enter a 10-digit phone number, or leave blank to disable calls.');
      return;
    }
    try {
      await saveForwardPhone(digits);
      if (digits.length === 10) {
        Alert.alert(
          'Calls forwarded',
          `Incoming calls to your work line will ring ${formatPhoneDisplay(digits)}.`,
        );
      } else {
        Alert.alert('Calls disabled', 'No forwarding number set — callers will hear an unavailable message.');
      }
    } catch (err) {
      Alert.alert('Could not save', String((err as Error)?.message ?? err));
    }
  };

  const forwardInputDigits = forwardInput.replace(/\D/g, '');
  const canSaveForward =
    !savingForward &&
    (forwardInputDigits.length === 10 ||
      (forwardInputDigits.length === 0 && !!forwardPhone));

  const handleSupervisorChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setSupervisorInput(formatPhoneDisplay(digits));
  };

  const handleSupervisorSave = async () => {
    const digits = supervisorInput.replace(/\D/g, '');
    if (digits.length > 0 && digits.length !== 10) {
      Alert.alert('Invalid number', 'Enter a 10-digit phone number, or leave blank to remove.');
      return;
    }
    setSavingSupervisor(true);
    try {
      await saveSupervisorPhone(digits);
      if (digits.length === 10) {
        Alert.alert(
          'Supervisor saved',
          `Alerts from the Machine tab will go to ${formatPhoneDisplay(digits)}.`,
        );
      } else {
        Alert.alert('Supervisor cleared', 'No supervisor number is set — alerts are disabled.');
      }
    } finally {
      setSavingSupervisor(false);
    }
  };

  const supervisorInputDigits = supervisorInput.replace(/\D/g, '');
  const canSaveSupervisor =
    !savingSupervisor &&
    (supervisorInputDigits.length === 10 ||
      (supervisorInputDigits.length === 0 && !!supervisorPhone));

  const initials = (() => {
    const name = (cachedFullName || '').trim();
    if (name) {
      const parts = name.split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    const email = user?.email || '';
    return email ? email.slice(0, 2).toUpperCase() : '?';
  })();

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You will need to sign in again to use the app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
            router.replace('/(auth)/login' as any);
          } catch {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.profileBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          {!!cachedFullName && <Text style={styles.profileName}>{cachedFullName}</Text>}
          {!!user?.email && <Text style={styles.profileEmail}>{user.email}</Text>}
        </View>

        <Text style={styles.sectionLabel}>SUPERVISOR</Text>
        <View style={styles.card}>
          <View style={[styles.row, { paddingBottom: spacing.xs }]}>
            <Ionicons name="call-outline" size={20} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Phone number</Text>
              <Text style={styles.helpText}>
                Receives Low fuel / Broken / Maintenance alerts.
              </Text>
            </View>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={supervisorInput}
              onChangeText={handleSupervisorChange}
              placeholder="(555) 123-4567"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={14}
            />
            <Pressable
              style={[styles.saveBtn, !canSaveSupervisor && styles.saveBtnDisabled]}
              onPress={handleSupervisorSave}
              disabled={!canSaveSupervisor}
            >
              <Text style={styles.saveBtnText}>{savingSupervisor ? '…' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionLabel}>PHONE CALLS</Text>
        <View style={styles.card}>
          <View style={[styles.row, { paddingBottom: spacing.xs }]}>
            <Ionicons name="phone-portrait-outline" size={20} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Forward to my cell</Text>
              <Text style={styles.helpText}>
                When a worker calls your work line, the call rings here.
              </Text>
            </View>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={forwardInput}
              onChangeText={handleForwardChange}
              placeholder="(555) 123-4567"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={14}
              editable={forwardLoaded}
            />
            <Pressable
              style={[styles.saveBtn, !canSaveForward && styles.saveBtnDisabled]}
              onPress={handleForwardSave}
              disabled={!canSaveForward}
            >
              <Text style={styles.saveBtnText}>{savingForward ? '…' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionLabel}>BUSINESS</Text>
        <Pressable
          style={styles.card}
          onPress={() => router.push('/business-profile')}
        >
          <View style={styles.row}>
            <Ionicons name="briefcase-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.rowValue, { flex: 1 }]}>Business profile</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Pressable>

        <Pressable
          style={[styles.signOutBtn, signingOut && { opacity: 0.5 }]}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.signOutText}>{signingOut ? 'Signing out...' : 'Sign out'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  body: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl },

  profileBlock: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  profileEmail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  rowValue: { fontSize: 15, color: colors.text, fontWeight: '500' },
  divider: { height: 1, backgroundColor: colors.borderLight, marginHorizontal: spacing.md },

  helpText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: 4,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 64,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: colors.background, fontWeight: '700', fontSize: 14 },

  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 16,
    marginTop: spacing.xl,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.error,
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: colors.error },
});
