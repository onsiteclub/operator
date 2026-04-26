/**
 * ErrorBox - Shared error display component
 * Used by auth steps (PhoneInputStep, OTPVerifyStep, SetNewPasswordStep).
 * Ported from onsite-timekeeper.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '@onsite/tokens';

interface ErrorBoxProps {
  message: string | null | undefined;
}

export function ErrorBox({ message }: ErrorBoxProps) {
  if (!message) return null;

  return (
    <View style={s.container}>
      <Ionicons name="alert-circle" size={18} color={colors.error} />
      <Text style={s.text}>{message}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorSoft,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.19)',
  },
  text: {
    flex: 1,
    color: colors.error,
    fontSize: 14,
  },
});
