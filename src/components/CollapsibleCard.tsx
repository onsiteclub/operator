/**
 * CollapsibleCard — animated accordion card.
 *
 * Ported from onsite-timekeeper but rewritten to use React Native's
 * built-in Animated API (operator doesn't ship react-native-reanimated,
 * so a rebuild would be needed to match the original implementation).
 * Visual behavior is the same: expand/collapse with a smooth height
 * + opacity animation, chevron rotates 180°.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius } from '@onsite/tokens';

interface CollapsibleCardProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function CollapsibleCard({
  title,
  subtitle,
  icon,
  defaultExpanded = false,
  children,
}: CollapsibleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [contentHeight, setContentHeight] = useState(0);
  const [measured, setMeasured] = useState(false);

  const animValue = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: expanded ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expanded, animValue]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const onContentLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0 && !measured) {
        setContentHeight(h);
        setMeasured(true);
      }
    },
    [measured],
  );

  const heightStyle = measured
    ? { height: animValue.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] }) }
    : undefined;
  const opacityStyle = { opacity: animValue };
  const chevronRotate = animValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={s.card}>
      <TouchableOpacity style={s.header} onPress={toggle} activeOpacity={0.7}>
        <View style={s.headerLeft}>
          {icon && (
            <Ionicons name={icon} size={20} color={colors.primary} style={s.icon} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{title}</Text>
            {!expanded && subtitle ? (
              <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
        </View>
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <Ionicons name="chevron-up" size={18} color={colors.textSecondary} />
        </Animated.View>
      </TouchableOpacity>

      {/* Off-screen measure pass for collapsed defaults */}
      {!measured && !defaultExpanded ? (
        <View style={s.measureWrapper} onLayout={onContentLayout}>
          {children}
        </View>
      ) : null}

      <Animated.View style={[{ overflow: 'hidden' }, heightStyle, opacityStyle]}>
        <View onLayout={!measured ? onContentLayout : undefined}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  icon: {
    marginRight: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  measureWrapper: {
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none' as any,
  },
});
