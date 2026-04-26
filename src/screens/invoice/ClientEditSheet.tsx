/**
 * ClientEditSheet — bottom sheet for editing client/recipient info
 *
 * Used by the wizard step 2 ("Send to") to capture or edit the
 * recipient client. Construction-worker-friendly: large inputs (56px
 * minimum), big buttons, autocomplete from saved clients.
 *
 * Ported from onsite-timekeeper. Only change: imports from @onsite/tokens
 * instead of the timekeeper-local constants/colors module.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ModalOverlay } from '../../components/ui/ModalOverlay';
import { PressableOpacity } from '../../components/ui/PressableOpacity';
import { colors } from '@onsite/tokens';
import type { ClientDB } from '../../lib/database/core';

// ============================================
// TYPES
// ============================================

export interface ClientFormData {
  name: string;
  phone: string;
  email: string;
  addressStreet: string;
  addressCity: string;
  addressProvince: string;
  addressPostalCode: string;
}

export interface ClientEditSheetProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: ClientFormData) => void;
  initialData?: Partial<ClientFormData>;
  savedClients?: ClientDB[];
}

// ============================================
// COMPONENT
// ============================================

export function ClientEditSheet({
  visible,
  onClose,
  onSave,
  initialData,
  savedClients,
}: ClientEditSheetProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialData?.name || '');
      setPhone(initialData?.phone || '');
      setEmail(initialData?.email || '');
      setAddressStreet(initialData?.addressStreet || '');
      setAddressCity(initialData?.addressCity || '');
      setAddressProvince(initialData?.addressProvince || '');
      setAddressPostalCode(initialData?.addressPostalCode || '');
      setShowSuggestions(false);
    }
  }, [visible, initialData]);

  const suggestions = useMemo(() => {
    if (!savedClients || !name || name.length < 2) return [];
    const lower = name.toLowerCase();
    return savedClients
      .filter(c => c.client_name.toLowerCase().includes(lower))
      .slice(0, 3);
  }, [name, savedClients]);

  const selectSuggestion = (client: ClientDB) => {
    setName(client.client_name);
    setPhone(client.phone || '');
    setEmail(client.email || '');
    setAddressStreet(client.address_street || '');
    setAddressCity(client.address_city || '');
    setAddressProvince(client.address_province || '');
    setAddressPostalCode(client.address_postal_code || '');
    setShowSuggestions(false);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      addressStreet: addressStreet.trim(),
      addressCity: addressCity.trim(),
      addressProvince: addressProvince.trim().toUpperCase(),
      addressPostalCode: addressPostalCode.trim().toUpperCase(),
    });
  };

  const canSave = name.trim().length > 0;

  return (
    <ModalOverlay visible={visible} position="bottom" onClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ maxHeight: Dimensions.get('window').height * 0.85 }}
      >
        <View style={s.handle} />

        <View style={s.header}>
          <Text style={s.title}>Send to</Text>
          <PressableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.6}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressableOpacity>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.label}>TO *</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setShowSuggestions(v.length >= 2);
            }}
            placeholder="Send to..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            autoFocus
          />

          {showSuggestions && suggestions.length > 0 && (
            <View style={s.suggestionsBox}>
              {suggestions.map((c) => (
                <PressableOpacity
                  key={c.id}
                  style={s.suggestionRow}
                  onPress={() => selectSuggestion(c)}
                  activeOpacity={0.6}
                >
                  <View style={s.suggestionAvatar}>
                    <Text style={s.suggestionAvatarText}>
                      {c.client_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.suggestionName}>{c.client_name}</Text>
                    {c.address_city ? (
                      <Text style={s.suggestionSub}>{c.address_city}</Text>
                    ) : null}
                  </View>
                </PressableOpacity>
              ))}
            </View>
          )}

          <Text style={s.label}>PHONE</Text>
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 123-4567"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
          />

          <Text style={s.label}>EMAIL</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="client@email.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={s.label}>STREET</Text>
          <TextInput
            style={s.input}
            value={addressStreet}
            onChangeText={setAddressStreet}
            placeholder="123 Main Street"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={s.label}>CITY</Text>
          <TextInput
            style={s.input}
            value={addressCity}
            onChangeText={setAddressCity}
            placeholder="Toronto"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>PROVINCE</Text>
              <TextInput
                style={s.input}
                value={addressProvince}
                onChangeText={setAddressProvince}
                placeholder="ON"
                placeholderTextColor={colors.textMuted}
                maxLength={2}
                autoCapitalize="characters"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>POSTAL CODE</Text>
              <TextInput
                style={s.input}
                value={addressPostalCode}
                onChangeText={setAddressPostalCode}
                placeholder="A1A 1A1"
                placeholderTextColor={colors.textMuted}
                maxLength={7}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <View style={s.buttons}>
            <PressableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </PressableOpacity>
            <PressableOpacity
              style={[s.saveBtn, !canSave && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={20} color={colors.white} />
              <Text style={s.saveBtnText}>Save</Text>
            </PressableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ModalOverlay>
  );
}

// ============================================
// STYLES
// ============================================

const s = StyleSheet.create({
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.borderLight,
    alignSelf: 'center', marginBottom: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18, fontWeight: '700', color: colors.text,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center', alignItems: 'center',
  },
  scroll: {
    maxHeight: Dimensions.get('window').height * 0.65,
  },
  scrollContent: {
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
  },
  label: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 0.5, marginBottom: 6, marginTop: 14,
  },
  input: {
    backgroundColor: colors.white, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    fontSize: 16, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
    minHeight: 52,
  },
  row: {
    flexDirection: 'row', gap: 12,
  },
  suggestionsBox: {
    backgroundColor: colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    marginTop: 4, overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    minHeight: 56,
  },
  suggestionAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center', alignItems: 'center',
  },
  suggestionAvatarText: {
    fontSize: 16, fontWeight: '700', color: colors.primary,
  },
  suggestionName: {
    fontSize: 15, fontWeight: '600', color: colors.text,
  },
  suggestionSub: {
    fontSize: 12, color: colors.textSecondary, marginTop: 1,
  },
  buttons: {
    flexDirection: 'row', gap: 12, marginTop: 24,
  },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    minHeight: 56,
  },
  cancelBtnText: {
    fontSize: 16, fontWeight: '500', color: colors.textSecondary,
  },
  saveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 14,
    backgroundColor: colors.primary,
    minHeight: 56,
  },
  saveBtnText: {
    fontSize: 16, fontWeight: '700', color: colors.white,
  },
});
