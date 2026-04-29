/**
 * Business Profile Screen — OnSite Operator
 *
 * Ported verbatim from onsite-timekeeper. Form to manage personal +
 * business details (name, address, tax info). Used for invoice headers
 * and PDF exports. Organized into collapsible accordion cards.
 *
 * Validation: only `firstName` is required to save. All other fields
 * are optional — name + a client name (in /client-edit) are enough to
 * generate a valid invoice. Saving with `invoiceId` + `invoiceNumber`
 * params surfaces a snackbar with a "View Invoice" action that
 * re-opens the saved invoice's Detail modal.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, spacing, borderRadius } from '@onsite/tokens';
import { useBusinessProfileStore } from '../src/stores/businessProfileStore';
import { useAuthStore } from '../src/stores/authStore';
import { useSnackbarStore } from '../src/stores/snackbarStore';
import { CollapsibleCard } from '../src/components/CollapsibleCard';
import { logger } from '../src/lib/logger';

// ============================================
// COMPONENT
// ============================================

export default function BusinessProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ invoiceId?: string; invoiceNumber?: string }>();
  const user = useAuthStore((s) => s.user);
  const updateAuthProfile = useAuthStore((s) => s.updateProfile);
  const { profile, loadProfile, saveProfile, deleteProfile } = useBusinessProfileStore();
  const showSnackbar = useSnackbarStore((s) => s.show);

  // Form state — Card 1 (Personal Info)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Form state — Card 2 (Address)
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');

  // Form state — Card 3 (Tax & Billing)
  const [businessNumber, setBusinessNumber] = useState('');
  const [gstHstNumber, setGstHstNumber] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('1');

  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load profile on mount
  useEffect(() => {
    if (user?.id) {
      loadProfile(user.id);
    }
  }, [user?.id]);

  // Pre-fill from auth (name + email) when no profile yet
  useEffect(() => {
    if (user && !profile) {
      const meta: any = user.user_metadata;
      if (meta?.first_name) setFirstName(meta.first_name);
      if (meta?.last_name) setLastName(meta.last_name);
      if (user.email) setEmail(user.email);
    }
  }, [user?.id]);

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      // Name: prefer auth metadata, fallback to splitting business_name
      const meta: any = user?.user_metadata;
      if (meta?.first_name || meta?.last_name) {
        setFirstName(meta.first_name || '');
        setLastName(meta.last_name || '');
      } else if (profile.business_name) {
        const parts = profile.business_name.split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
      }

      setEmail(profile.email || user?.email || '');
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
    }
  }, [profile]);

  const markChanged = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!user?.id) return;

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

    if (!fullName) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }

    setIsSaving(true);

    // Step 1: Save to SQLite (business_name = fullName for backward compat)
    const success = saveProfile(user.id, {
      businessName: fullName,
      addressStreet: addressStreet.trim() || null,
      addressCity: addressCity.trim() || null,
      addressProvince: addressProvince.trim().toUpperCase() || null,
      addressPostalCode: addressPostalCode.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      businessNumber: businessNumber.trim() || null,
      gstHstNumber: gstHstNumber.trim() || null,
      defaultHourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
      taxRate: taxRate ? parseFloat(taxRate) : null,
      nextInvoiceNumber: nextInvoiceNumber ? parseInt(nextInvoiceNumber, 10) : 1,
    });

    if (success) {
      // Step 2: Sync name to auth (non-blocking, tolerates offline)
      try {
        const authResult = await updateAuthProfile(firstName.trim(), lastName.trim());
        if (!authResult.success) {
          logger.warn('ui', 'Auth profile sync failed after save', { error: authResult.error });
        }
      } catch {
        logger.warn('ui', 'Auth profile sync error (saved locally)');
      }

      setHasChanges(false);

      // When this screen was opened from an Invoice Detail "From" card,
      // show the snackbar with a "View Invoice" action that re-opens it.
      // Otherwise just show a plain confirmation.
      if (params.invoiceId && params.invoiceNumber) {
        const invoiceId = params.invoiceId;
        const invoiceNumber = params.invoiceNumber;
        showSnackbar(`Invoice ${invoiceNumber} updated successfully`, {
          action: {
            label: 'View Invoice',
            onPress: () => router.replace({
              pathname: '/(tabs)/reports',
              params: { openInvoiceId: invoiceId },
            } as any),
          },
          durationMs: 6000,
        });
        router.back();
      } else {
        showSnackbar('Profile updated');
      }
    }

    setIsSaving(false);
  };

  const handleDelete = () => {
    if (!user?.id) return;
    Alert.alert(
      'Delete Profile',
      'This will clear all profile information. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteProfile(user.id);
            setFirstName('');
            setLastName('');
            setAddressStreet('');
            setAddressCity('');
            setAddressProvince('');
            setAddressPostalCode('');
            setPhone('');
            setEmail('');
            setBusinessNumber('');
            setGstHstNumber('');
            setHourlyRate('');
            setTaxRate('');
            setNextInvoiceNumber('1');
            setHasChanges(false);
            Alert.alert('Deleted', 'Profile cleared.');
          },
        },
      ]
    );
  };

  const handleBack = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  // Subtitles for collapsed cards
  const personalSubtitle = firstName || lastName
    ? `${firstName} ${lastName}`.trim()
    : 'Not set';

  const addressSubtitle = addressCity && addressProvince
    ? `${addressCity}, ${addressProvince}`
    : addressCity || addressProvince || 'Not set';

  const billingSubtitle = hourlyRate || taxRate
    ? [hourlyRate && `$${hourlyRate}/hr`, taxRate && `${taxRate}% tax`].filter(Boolean).join(', ')
    : 'Not set';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Card 1: Personal Info */}
          <CollapsibleCard
            title="Personal Info"
            subtitle={personalSubtitle}
            icon="person-outline"
            defaultExpanded
          >
            <View style={styles.cardContent}>
              <FormField
                label="First Name"
                value={firstName}
                onChangeText={markChanged(setFirstName)}
                placeholder="John"
                autoCapitalize="words"
                required
              />
              <Divider />
              <FormField
                label="Last Name"
                value={lastName}
                onChangeText={markChanged(setLastName)}
                placeholder="Doe"
                autoCapitalize="words"
              />
              <Divider />
              <FormField
                label="Email"
                value={email}
                onChangeText={markChanged(setEmail)}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Divider />
              <FormField
                label="Phone"
                value={phone}
                onChangeText={markChanged(setPhone)}
                placeholder="(416) 555-1234"
                keyboardType="phone-pad"
              />
              <Divider />
              <View style={styles.rateHighlight}>
                <FormField
                  label="Hourly Rate"
                  value={hourlyRate}
                  onChangeText={markChanged(setHourlyRate)}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  prefix="$"
                  suffix="/hr"
                />
              </View>
            </View>
          </CollapsibleCard>

          {/* Card 2: Address */}
          <CollapsibleCard
            title="Address"
            subtitle={addressSubtitle}
            icon="location-outline"
          >
            <View style={styles.cardContent}>
              <FormField
                label="Street"
                value={addressStreet}
                onChangeText={markChanged(setAddressStreet)}
                placeholder="123 Main Street"
              />
              <Divider />
              <FormField
                label="City"
                value={addressCity}
                onChangeText={markChanged(setAddressCity)}
                placeholder="Toronto"
              />
              <Divider />
              <View style={styles.row}>
                <View style={styles.rowHalf}>
                  <FormField
                    label="Province"
                    value={addressProvince}
                    onChangeText={markChanged(setAddressProvince)}
                    placeholder="ON"
                    autoCapitalize="characters"
                    maxLength={2}
                  />
                </View>
                <View style={styles.rowHalf}>
                  <FormField
                    label="Postal Code"
                    value={addressPostalCode}
                    onChangeText={markChanged(setAddressPostalCode)}
                    placeholder="M5V 2T6"
                    autoCapitalize="characters"
                    maxLength={7}
                  />
                </View>
              </View>
            </View>
          </CollapsibleCard>

          {/* Card 3: Tax & Billing */}
          <CollapsibleCard
            title="Tax & Billing"
            subtitle={billingSubtitle}
            icon="receipt-outline"
          >
            <View style={styles.cardContent}>
              <FormField
                label="Business Number (BN)"
                value={businessNumber}
                onChangeText={markChanged(setBusinessNumber)}
                placeholder="123456789"
                hint="CRA Business Number"
              />
              <Divider />
              <FormField
                label="GST/HST Number"
                value={gstHstNumber}
                onChangeText={markChanged(setGstHstNumber)}
                placeholder="123456789 RT0001"
                hint="Leave blank if not registered"
              />
              <Divider />
              <FormField
                label="Default Hourly Rate"
                value={hourlyRate}
                onChangeText={markChanged(setHourlyRate)}
                placeholder="0.00"
                keyboardType="decimal-pad"
                prefix="$"
                hint="Used in report exports"
              />
              <Divider />
              <FormField
                label="Tax Rate"
                value={taxRate}
                onChangeText={markChanged(setTaxRate)}
                placeholder="13"
                keyboardType="decimal-pad"
                suffix="%"
                hint="e.g. 13 for Ontario HST, 5 for GST only"
              />
              <Divider />
              <FormField
                label="Next Invoice #"
                value={nextInvoiceNumber}
                onChangeText={markChanged(setNextInvoiceNumber)}
                placeholder="1"
                keyboardType="number-pad"
                prefix="#"
                hint="Auto-increments after each invoice"
              />
            </View>
          </CollapsibleCard>

          {/* Info note */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.info} />
            <Text style={styles.infoText}>
              This information appears on your exported time reports and invoices. It stays on your device and syncs securely to your account.
            </Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButtonBottom, (!hasChanges || isSaving) && styles.saveButtonBottomDisabled]}
              onPress={handleSave}
              disabled={!hasChanges || isSaving}
            >
              <Ionicons name="checkmark" size={18} color={hasChanges && !isSaving ? colors.white : colors.textTertiary} />
              <Text style={[styles.saveButtonBottomText, (!hasChanges || isSaving) && styles.saveButtonBottomTextDisabled]}>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'decimal-pad' | 'numeric' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  prefix?: string;
  suffix?: string;
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  required,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  maxLength,
  prefix,
  suffix,
}: FormFieldProps) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={styles.inputRow}>
        {prefix && <Text style={styles.inputAffix}>{prefix}</Text>}
        <TextInput
          style={[styles.input, prefix && styles.inputWithPrefix, suffix && styles.inputWithSuffix]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
        />
        {suffix && <Text style={styles.inputAffix}>{suffix}</Text>}
      </View>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },

  // Card content (inside CollapsibleCard)
  cardContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  rateHighlight: {
    backgroundColor: colors.primarySoft,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: -12,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },

  // Form fields
  fieldContainer: {
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  required: {
    color: colors.error,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  inputWithPrefix: {
    paddingLeft: 4,
  },
  inputWithSuffix: {
    paddingRight: 4,
  },
  inputAffix: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
  },

  // Layout
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  rowHalf: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.surface,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.error,
  },
  saveButtonBottom: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accent,
  },
  saveButtonBottomDisabled: {
    backgroundColor: colors.border,
  },
  saveButtonBottomText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  saveButtonBottomTextDisabled: {
    color: colors.textTertiary,
  },

  // Info box
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
