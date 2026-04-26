/**
 * ModalOverlay - Shared modal overlay with center/bottom positioning
 * Ported from onsite-timekeeper. Operator tokens don't have an
 * `overlayHeavy` shade — `heavy` falls back to the same overlay.
 */

import React from 'react';
import { View, Modal, Pressable, StyleSheet, Platform } from 'react-native';
import { colors, spacing, borderRadius } from '@onsite/tokens';

interface ModalOverlayProps {
  visible: boolean;
  position?: 'center' | 'bottom';
  heavy?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}

export function ModalOverlay({
  visible,
  position = 'center',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  heavy: _heavy = false,
  onClose,
  children,
}: ModalOverlayProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[
          s.overlay,
          position === 'center' ? s.center : s.bottom,
        ]}
        onPress={onClose}
      >
        <Pressable
          style={[
            position === 'center' ? s.centerContent : s.bottomContent,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ViewType = View;

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  bottom: {
    justifyContent: 'flex-end',
  },
  centerContent: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 400,
  },
  bottomContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.xl,
  },
});
