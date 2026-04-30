/**
 * Auth Layout
 * Stack navigator para telas de autenticação
 * Ported VERBATIM from onsite-timekeeper.
 */

import { Stack } from 'expo-router';
import { colors } from '../../src/constants/colors';

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
