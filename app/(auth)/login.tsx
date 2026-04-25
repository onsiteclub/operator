/**
 * Login Screen — OnSite Operator 2
 *
 * Uses shared @onsite/auth-ui components.
 * No signup — operators are pre-registered by supervisors.
 */

import { Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthFlow } from '@onsite/auth-ui';

export default function Login() {
  return (
    <AuthFlow
      appName="Operator"
      logo={
        <Image
          source={require('../../assets/onsite-club-logo.png')}
          style={{ height: 56, width: 140 }}
          resizeMode="contain"
        />
      }
      showSignup={false}
      showForgotPassword={false}
      subtitle="Sign in with your operator account"
      footer="Account created by site supervisor"
      icons={{
        email: <Ionicons name="mail-outline" size={20} color="#9CA3AF" />,
        lock: <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" />,
        eyeOpen: <Ionicons name="eye-outline" size={20} color="#9CA3AF" />,
        eyeClosed: <Ionicons name="eye-off-outline" size={20} color="#9CA3AF" />,
      }}
    />
  );
}
