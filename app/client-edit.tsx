/**
 * Client Edit Screen — OnSite Operator
 *
 * Ported verbatim from onsite-timekeeper. Full-screen form to edit the
 * invoice recipient (client). Reached from the wizard Step 3 "TO" card
 * via "Edit" — never rendered as a modal.
 *
 * Validation: only `name` is required to save. Address / phone / email
 * are optional. Saving with `invoiceId` + `invoiceNumber` params
 * surfaces a snackbar with a "View Invoice" action that re-opens the
 * saved invoice's Detail modal.
 *
 * Params:
 *   invoiceId      — optional. When present, post-save snackbar shows
 *                    a "View Invoice" action that re-opens Detail.
 *   invoiceNumber  — optional. Shown in snackbar text.
 *   clientName     — optional. Used to prefill the form for an
 *                    existing saved client (looked up by name).
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors, spacing, borderRadius } from '@onsite/tokens';
import { useAuthStore } from '../src/stores/authStore';
import { useInvoiceStore } from '../src/stores/invoiceStore';
import { useSnackbarStore } from '../src/stores/snackbarStore';
import { getClientByName } from '../src/lib/database/clients';
import { logger } from '../src/lib/logger';

export default function ClientEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    invoiceId?: string;
    invoiceNumber?: string;
    clientName?: string;
  }>();

  const userId = useAuthStore((s) => s.user?.id ?? null);
  const invoiceStore = useInvoiceStore();
  const showSnackbar = useSnackbarStore((s) => s.show);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const initialName = params.clientName || '';

  useEffect(() => {
    if (!userId || !initialName) {
      setName(initialName);
      return;
    }
    const existing = getClientByName(userId, initialName);
    setName(existing?.client_name ?? initialName);
    setPhone(existing?.phone ?? '');
    setEmail(existing?.email ?? '');
    setAddressStreet(existing?.address_street ?? '');
    setAddressCity(existing?.address_city ?? '');
    setAddressProvince(existing?.address_province ?? '');
    setAddressPostalCode(existing?.address_postal_code ?? '');
    setHasChanges(false);
  }, [userId, initialName]);

  const markChanged = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setHasChanges(true);
  };

  const canSave = name.trim().length > 0;

  const handleBack = () => {
    if (hasChanges && !isSaving) {
      Alert.alert(
        'Unsaved Changes',
        'Discard your changes?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  const handleSave = async () => {
    if (!userId || !canSave || isSaving) return;

    setIsSaving(true);
    try {
      invoiceStore.saveClient({
        userId,
        clientName: name.trim(),
        addressStreet: addressStreet.trim(),
        addressCity: addressCity.trim(),
        addressProvince: addressProvince.trim().toUpperCase(),
        addressPostalCode: addressPostalCode.trim().toUpperCase(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      });

      // If client name changed on a linked invoice, also update the invoice record
      if (params.invoiceId && name.trim() !== initialName) {
        await invoiceStore.updateInvoice(userId, params.invoiceId, {
          clientName: name.trim(),
        });
      }

      const invoiceNumber = params.invoiceNumber;
      if (params.invoiceId && invoiceNumber) {
        const invoiceId = params.invoiceId;
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
      } else {
        showSnackbar('Client saved');
      }

      setHasChanges(false);
      router.back();
    } catch (error) {
      logger.error('invoice', 'Client edit save failed', { error: String(error) });
      Alert.alert('Error', 'Could not save client. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send To</Text>
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
          <Field label="Name" required value={name} onChangeText={markChanged(setName)}
            placeholder="Client name" autoCapitalize="words" autoFocus={!initialName} />

          <Field label="Phone" value={phone} onChangeText={markChanged(setPhone)}
            placeholder="(416) 555-1234" keyboardType="phone-pad" />

          <Field label="Email" value={email} onChangeText={markChanged(setEmail)}
            placeholder="client@email.com" keyboardType="email-address" autoCapitalize="none" />

          <Field label="Street" value={addressStreet} onChangeText={markChanged(setAddressStreet)}
            placeholder="123 Main Street" autoCapitalize="words" />

          <Field label="City" value={addressCity} onChangeText={markChanged(setAddressCity)}
            placeholder="Toronto" autoCapitalize="words" />

          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <Field label="Province" value={addressProvince} onChangeText={markChanged(setAddressProvince)}
                placeholder="ON" autoCapitalize="characters" maxLength={2} />
            </View>
            <View style={styles.rowHalf}>
              <Field label="Postal Code" value={addressPostalCode} onChangeText={markChanged(setAddressPostalCode)}
                placeholder="A1A 1A1" autoCapitalize="characters" maxLength={7} />
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (!canSave || isSaving) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave || isSaving}
            >
              <Ionicons name="checkmark" size={18} color={canSave && !isSaving ? colors.white : colors.textTertiary} />
              <Text style={[styles.saveBtnText, (!canSave || isSaving) && styles.saveBtnTextDisabled]}>
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

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  autoFocus?: boolean;
}

function Field({
  label, value, onChangeText, placeholder, required,
  keyboardType = 'default', autoCapitalize = 'sentences', maxLength, autoFocus,
}: FieldProps) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>
        {label}{required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        autoFocus={autoFocus}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg },
  fieldContainer: { paddingVertical: spacing.sm },
  fieldLabel: {
    fontSize: 13, fontWeight: '700',
    color: colors.text, marginBottom: 6,
  },
  required: { color: colors.error },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 52,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  rowHalf: { flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, minHeight: 52,
  },
  cancelBtnText: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
  saveBtn: {
    flex: 2, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: borderRadius.md,
    backgroundColor: colors.accent, minHeight: 52,
  },
  saveBtnDisabled: { backgroundColor: colors.border },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },
  saveBtnTextDisabled: { color: colors.textTertiary },
});
