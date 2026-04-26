/**
 * PressableOpacity — Pressable with opacity feedback. Drop-in replacement
 * for the legacy TouchableOpacity. Ported from onsite-timekeeper.
 */

import React from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

export function PressableOpacity({
  style,
  activeOpacity = 0.2,
  children,
  ...props
}: React.ComponentProps<typeof Pressable> & { activeOpacity?: number }) {
  return (
    <Pressable
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && { opacity: activeOpacity },
      ] as StyleProp<ViewStyle>}
      {...props}
    >
      {children}
    </Pressable>
  );
}
