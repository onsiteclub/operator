/**
 * HeaderRow — shared top bar across all tabs.
 *
 * Logo (left) · title (center) · settings avatar (right, → /settings).
 * Avatar shows the operator's initials. Mirrors timekeeper's HeaderRow
 * for cross-app consistency.
 */

import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing } from '@onsite/tokens';
import { useAuthStore } from '../../stores/authStore';
import { getUserInitials } from '../../lib/format';

interface HeaderRowProps {
  title: string;
}

export function HeaderRow({ title }: HeaderRowProps) {
  const router = useRouter();
  const userEmail = useAuthStore((s) => s.user?.email ?? null);
  const cachedFullName = useAuthStore((s) => s.cachedFullName);
  const initials = useMemo(
    () => getUserInitials(cachedFullName, userEmail),
    [cachedFullName, userEmail],
  );

  return (
    <View style={styles.row}>
      <Image
        source={require('../../../assets/onsite-club-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>{title}</Text>
      <Pressable
        onPress={() => router.push('/settings' as any)}
        style={styles.avatarBtn}
        accessibilityLabel="Settings"
      >
        <Text style={styles.avatarText}>{initials}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  logo: { width: 80, height: 28 },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.white },
});
