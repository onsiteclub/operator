/**
 * @onsite/auth-ui/web — Web auth components for Next.js and Vite apps.
 */

// Types (platform-agnostic)
export type {
  AuthFlowConfig,
  AuthFlowCallbacks,
  AuthFlowProps,
  AuthScreenMode,
  SignupProfile,
} from './types';

// Web components
export {
  AuthFlow,
  LoginForm,
  SignupForm,
  ForgotForm,
  AuthModal,
} from './web/index';
