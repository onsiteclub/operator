/**
 * AuthModal — Modal overlay wrapper for web auth (Calculator-style popup).
 *
 * Wraps LoginForm/SignupForm in a modal overlay. Closes on backdrop click or Escape.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import type { AuthFlowCallbacks, AuthScreenMode } from '../types';

export interface AuthModalProps extends AuthFlowCallbacks {
  appName?: string;
  logo?: React.ReactNode;
  subtitle?: string;
  message?: string;
  showSignup?: boolean;
  legal?: { termsUrl: string; privacyUrl: string };
  trades?: Array<{ id: string; name: string }>;
  icons?: { eyeOpen?: React.ReactNode; eyeClosed?: React.ReactNode };
  onClose: () => void;
}

export function AuthModal({
  appName: _appName = 'Club',
  logo,
  subtitle,
  message,
  showSignup = true,
  legal,
  trades,
  icons,
  onClose,
  onSignIn,
  onSignUp,
  onForgotPassword,
  onSuccess,
}: AuthModalProps) {
  const [screen, setScreen] = useState<AuthScreenMode>('login');

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  if (!onSignIn) return null;

  const modeSubtitle =
    screen === 'login' ? (subtitle ?? 'Sign in to your account') :
    screen === 'signup' ? 'Create your account' :
    'Check your email';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 mx-4 relative max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#667085] hover:text-[#101828] text-xl leading-none"
        >
          &times;
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          {logo && <div className="flex justify-center mb-3">{logo}</div>}
          <h2 className="text-xl font-bold text-[#101828]">
            {screen === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
          {message && <p className="text-[#667085] text-sm mt-1">{message}</p>}
          {!message && <p className="text-[#667085] text-sm mt-1">{modeSubtitle}</p>}
        </div>

        {screen === 'login' && (
          <LoginForm
            showForgotPassword={!!onForgotPassword}
            showSignup={showSignup && !!onSignUp}
            icons={icons}
            onSignIn={onSignIn}
            onForgotPassword={onForgotPassword ? () => {
              // Inline forgot password for modal (no separate screen)
            } : undefined}
            onSwitchToSignup={() => setScreen('signup')}
            onSuccess={onSuccess}
          />
        )}

        {screen === 'signup' && onSignUp && (
          <SignupForm
            icons={icons}
            legal={legal}
            trades={trades}
            onSignUp={onSignUp}
            onSwitchToLogin={() => setScreen('login')}
            onEmailSent={() => setScreen('email-sent')}
            onSuccess={onSuccess}
          />
        )}

        {screen === 'email-sent' && (
          <div className="text-center space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
              Account created! Check your email to verify, then sign in below.
            </div>
            <LoginForm
              showForgotPassword={false}
              showSignup={false}
              icons={icons}
              onSignIn={onSignIn}
              onSuccess={onSuccess}
            />
          </div>
        )}
      </div>
    </div>
  );
}
