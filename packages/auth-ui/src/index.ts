/**
 * @onsite/auth-ui — Shared auth screens for all OnSite apps.
 *
 * ROOT EXPORT = React Native components (Metro-safe, no subpath needed).
 * For web: import from '@onsite/auth-ui/web'
 */

// Types (platform-agnostic)
export type {
  AuthFlowConfig,
  AuthFlowCallbacks,
  AuthFlowProps,
  AuthScreenMode,
  SignupProfile,
} from './types';

// Native components
export {
  AuthFlow,
  LoginScreen,
  SignupScreen,
  ForgotScreen,
  AuthHeader,
  AuthInput,
  PasswordInput,
  AuthButton,
  ErrorBanner,
  SuccessBanner,
  SelectInput,
} from './native';
