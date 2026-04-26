/**
 * Login screen — thin route wrapper around <AuthScreen />.
 *
 * The full multi-step state machine (login → signup → OTP → reset)
 * lives in src/components/auth/AuthScreen.tsx, ported verbatim from
 * onsite-timekeeper. This file exists just to register the route so
 * expo-router can resolve `/(auth)/login`.
 */

import AuthScreen from '../../src/components/auth/AuthScreen';

export default function LoginRoute() {
  return <AuthScreen />;
}
