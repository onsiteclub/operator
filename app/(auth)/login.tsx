/**
 * Login Screen - OnSite Operator
 * Ported VERBATIM from onsite-timekeeper.
 *
 * Multi-step authentication flow:
 * 1. Email input - checks if user exists
 * 2a. Password (existing user) - login
 * 2b. Signup (new user) - register
 */

import { AuthScreen } from '../../src/components/auth';

export default function LoginScreen() {
  return <AuthScreen />;
}
