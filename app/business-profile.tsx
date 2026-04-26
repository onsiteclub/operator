/**
 * Business Profile Screen — OnSite Operator
 *
 * Setup form for the data that ends up in invoice headers and PDFs:
 * business name, address, tax and billing info. Single source of truth
 * is SQLite (business_profile table); the form mirrors it via the
 * businessProfileStore.
 *
 * Adapted from onsite-timekeeper but simplified — no firstName/lastName
 * split (operator app doesn't update auth metadata here), no
 * accordion (no react-native-reanimated dependency), no snackbar.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable, Alert, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@onsite/tokens';
import { useBusinessProfileStore } from '../src/stores/businessProfileStore';
import { useAuthStore } from '../src/stores/authStore';

const PROVINCES = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
] as const;

export default function BusinessProfileScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const userEmail = useAuthStore((s) => s.user?.email ?? null);
  const userMeta = useAuthStore((s) => s.user?.user_metadata ?? null);
  const cachedFullName = useAuthStore((s) => s.cachedFullName);
  const { profile, loadProfile, saveProfile, deleteProfile } = useBusinessProfileStore();

  // Form state
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [gstHstNumber, setGstHstNumber] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('1');

  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (userId) loadProfile(userId);
  }, [userId, loadProfile]);

  useEffect(() => {
    if (profile) {
      // Existing profile — load saved values.
      setBusinessName(profile.business_name || '');
      setEmail(profile.email || '');
      setPhone(profile.phone || '');
      setAddressStreet(profile.address_street || '');
      setAddressCity(profile.address_city || '');
      setAddressProvince(profile.address_province || '');
      setAddressPostalCode(profile.address_postal_code || '');
      setBusinessNumber(profile.business_number || '');
      setGstHstNumber(profile.gst_hst_number || '');
      setHourlyRate(profile.default_hourly_rate?.toString() || '');
      setTaxRate(profile.tax_rate?.toString() || '');
      setNextInvoiceNumber(profile.next_invoice_number?.toString() || '1');
      setHasChanges(false);
      return;
    }

    // No saved profile yet — prefill from the authenticated user so the
    // first invoice already has the right "From" info.
    const metaName = (userMeta?.full_name as string | undefined)
      || (cachedFullName ?? '')
      || [userMeta?.first_name, userMeta?.last_name].filter(Boolean).join(' ');
    if (metaName) setBusinessName(metaName);
    if (userEmail) setEmail(userEmail);
  }, [profile, userMeta, userEmail, cachedFullName]);

  const markChanged = <T extends string>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setHasChanges(true);
  };

  const canSave = useMemo(
    () => businessName.trim().length > 0,
    [businessName],
  );

  const handleSave = () => {
    if (!userId) return;
    const ok = saveProfile(userId, {
      businessName: businessName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      addressStreet: addressStreet.trim() || null,
      addressCity: addressCity.trim() || null,
      addressProvince: addressProvince.trim() || null,
      addressPostalCode: addressPostalCode.trim() || null,
      businessNumber: businessNumber.trim() || null,
      gstHstNumber: gstHstNumber.trim() || null,
      defaultHourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
      taxRate: taxRate ? parseFloat(taxRate) : null,
      nextInvoiceNumber: nextInvoiceNumber ? parseInt(nextInvoiceNumber, 10) : null,
    });
    if (ok) {
      setHasChanges(false);
      Alert.alert('Saved', 'Business profile updated.');
    }
  };

  const handleDelete = () => {
    if (!userId || !profile) return;
    Alert.alert(
      'Delete profile?',
      'This removes your business info. Invoices already generated will keep the saved values.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteProfile(userId);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Business profile</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Section title="Business">
            <Field
              label="Business name"
              required
              value={businessName}
              onChangeText={markChanged(setBusinessName)}
              autoCapitalize="words"
            />
            <Field
              label="Email"
              value={email}
              onChangeText={markChanged(setEmail)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="Phone"
              value={phone}
              onChangeText={markChanged(setPhone)}
              keyboardType="phone-pad"
              placeholder="(514) 555-1234"
            />
          </Section>

          <Section title="Address">
            <Field
              label="Street"
              value={addressStreet}
              onChangeText={markChanged(setAddressStreet)}
              autoCapitalize="words"
            />
            <View style={styles.row}>
              <View style={{ flex: 2 }}>
                <Field
                  label="City"
                  value={addressCity}
                  onChangeText={markChanged(setAddressCity)}
                  autoCapitalize="words"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Province"
                  value={addressProvince}
                  onChangeText={(v) => markChanged(setAddressProvince)(v.toUpperCase().slice(0, 2))}
                  autoCapitalize="characters"
                  placeholder={PROVINCES.join(' ')}
                  maxLength={2}
                />
              </View>
            </View>
            <Field
              label="Postal code"
              value={addressPostalCode}
              onChangeText={markChanged(setAddressPostalCode)}
              autoCapitalize="characters"
              placeholder="A1A 1A1"
              maxLength={7}
            />
          </Section>

          <Section title="Tax & billing">
            <Field
              label="Business number"
              value={businessNumber}
              onChangeText={markChanged(setBusinessNumber)}
            />
            <Field
              label="GST / HST number"
              value={gstHstNumber}
              onChangeText={markChanged(setGstHstNumber)}
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Default hourly rate"
                  value={hourlyRate}
                  onChangeText={markChanged(setHourlyRate)}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Tax rate (%)"
                  value={taxRate}
                  onChangeText={markChanged(setTaxRate)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
              </View>
            </View>
            <Field
              label="Next invoice number"
              value={nextInvoiceNumber}
              onChangeText={markChanged(setNextInvoiceNumber)}
              keyboardType="number-pad"
            />
          </Section>

          <Pressable
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>

          {profile ? (
            <Pressable style={styles.deleteBtn} onPress={handleDelete}>
              <Text style={styles.deleteBtnText}>Delete profile</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label, required, ...input
}: { label: string; required?: boolean } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        {...input}
      />
    </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    ...typography.cardTitle,
    fontSize: 17,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  field: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  required: {
    color: colors.error,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  deleteBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  deleteBtnText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
});
