/**
 * LoginForm — Web login form (email + password).
 */

'use client';

import { useState, type FormEvent } from 'react';

export interface LoginFormProps {
  showForgotPassword?: boolean;
  showSignup?: boolean;
  icons?: { eyeOpen?: React.ReactNode; eyeClosed?: React.ReactNode };
  onSignIn: (email: string, password: string) => Promise<void>;
  onForgotPassword?: () => void;
  onSwitchToSignup?: () => void;
  onSuccess?: () => void;
}

export function LoginForm({
  showForgotPassword = true,
  showSignup = false,
  icons,
  onSignIn,
  onForgotPassword,
  onSwitchToSignup,
  onSuccess,
}: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      setError('Email and password required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSignIn(trimmed, password);
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      if (msg.includes('Invalid login')) {
        setError('Incorrect email or password');
      } else if (msg.includes('Email not confirmed') || msg.includes('email_not_confirmed')) {
        setError('Please check your email and click the confirmation link before signing in.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-600 focus:border-transparent text-[#101828] bg-white"
          placeholder="Email"
          autoFocus
          autoComplete="email"
          disabled={loading}
        />
      </div>

      <div className="relative">
        <input
          type={showPw ? 'text' : 'password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-600 focus:border-transparent text-[#101828] bg-white"
          placeholder="Password"
          autoComplete="current-password"
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => setShowPw(!showPw)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#667085] hover:text-[#101828] text-sm"
        >
          {showPw ? (icons?.eyeClosed ?? 'Hide') : (icons?.eyeOpen ?? 'Show')}
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-[#0F766E] hover:bg-[#0d6d66] text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : null}
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      {(showForgotPassword || showSignup) && (
        <div className="flex items-center justify-between text-sm">
          {showForgotPassword && onForgotPassword ? (
            <button type="button" onClick={onForgotPassword} disabled={loading} className="text-[#0F766E] hover:underline">
              Forgot password?
            </button>
          ) : <span />}
          {showSignup && onSwitchToSignup ? (
            <button type="button" onClick={onSwitchToSignup} disabled={loading} className="text-[#0F766E] hover:underline">
              Create account
            </button>
          ) : null}
        </div>
      )}
    </form>
  );
}
