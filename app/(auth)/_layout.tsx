/**
 * Auth Layout — Stack navigator for authentication screens.
 * Ported from onsite-timekeeper.
 */

import { Stack } from 'expo-router';
import { colors } from '@onsite/tokens';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="complete-profile" />
    </Stack>
  );
}
