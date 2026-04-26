/**
 * Register — redirect to /login.
 *
 * Signup is unified into the login screen via a Sign-in / Create-account
 * toggle. This file exists so deep-links / external referrers that land
 * on /register still resolve cleanly.
 */

import { Redirect } from 'expo-router';

export default function RegisterScreen() {
  return <Redirect href="/(auth)/login" />;
}
