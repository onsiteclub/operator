/**
 * Snackbar — global toast with optional action button.
 *
 * Auto-dismiss + slide-up animation. Rendered once in app/_layout.tsx;
 * messages are pushed via useSnackbarStore.show(...). Action button uses
 * the operator accent color (teal) — matches the rest of the friendly
 * action palette across Requests / Machine / Invoice tabs.
 *
 * Ported from onsite-timekeeper.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PressableOpacity } from './PressableOpacity';
import { colors, spacing, borderRadius, shadows } from '@onsite/tokens';
import { useSnackbarStore, type SnackbarMessage } from '../../stores/snackbarStore';

export function Snackbar() {
  const current = useSnackbarStore((s) => s.current);
  return current ? <SnackbarItem key={current.id} item={current} /> : null;
}

function SnackbarItem({ item }: { item: SnackbarMessage }) {
  const dismiss = useSnackbarStore((s) => s.dismiss);
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 80, duration: 180, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => dismiss());
    }, item.durationMs);

    return () => clearTimeout(timer);
  }, [item.id]);

  const handleActionPress = () => {
    item.action?.onPress();
    dismiss();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']} pointerEvents="box-none">
      <Animated.View
        style={[styles.container, { transform: [{ translateY }], opacity }]}
        pointerEvents="auto"
      >
        <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
        {item.action && (
          <PressableOpacity style={styles.actionBtn} onPress={handleActionPress} activeOpacity={0.7}>
            <Text style={styles.actionText}>{item.action.label}</Text>
          </PressableOpacity>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'android' ? spacing.lg : 0,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    minHeight: 48,
    ...shadows.lg,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
  actionBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: 32,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentLight,
  },
});
