/**
 * SignupForm — Web registration form with expanded profile fields.
 */

'use client';

import { useState, type FormEvent } from 'react';
import type { SignupProfile } from '../types';

export interface SignupFormProps {
  icons?: { eyeOpen?: React.ReactNode; eyeClosed?: React.ReactNode };
  legal?: { termsUrl: string; privacyUrl: string };
  trades?: Array<{ id: string; name: string }>;
  onSignUp: (
    email: string,
    password: string,
    profile: SignupProfile
  ) => Promise<{ needsConfirmation?: boolean }>;
  onSwitchToLogin?: () => void;
  onEmailSent?: () => void;
  onSuccess?: () => void;
}

export function SignupForm({
  icons,
  legal,
  trades,
  onSignUp,
  onSwitchToLogin,
  onEmailSent,
  onSuccess,
}: SignupFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [trade, setTrade] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'undeclared' | ''>('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimFirst = firstName.trim();
    const trimLast = lastName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimFirst) { setError('Please enter your first name'); return; }
    if (!trimLast) { setError('Please enter your last name'); return; }
    if (!trimmedEmail || !trimmedEmail.includes('@')) { setError('Please enter a valid email'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    setError(null);

    try {
      const profile: SignupProfile = {
        firstName: trimFirst,
        lastName: trimLast,
        name: `${trimFirst} ${trimLast}`,
        dateOfBirth: dateOfBirth || undefined,
        trade: trade || undefined,
        gender: gender || undefined,
      };
      const result = await onSignUp(trimmedEmail, password, profile);
      if (result?.needsConfirmation) {
        onEmailSent?.();
      } else {
        onSuccess?.();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign up failed';
      setError(msg.includes('already registered') ? 'This email is already registered. Please sign in.' : msg);
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-600 focus:border-transparent text-[#101828] bg-white";
  const selectClass = "w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-600 focus:border-transparent text-[#101828] bg-white appearance-none";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Name row */}
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className={inputClass}
          placeholder="First name"
          autoFocus
          autoComplete="given-name"
          disabled={loading}
        />
        <input
          type="text"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className={inputClass}
          placeholder="Last name"
          autoComplete="family-name"
          disabled={loading}
        />
      </div>

      {/* Email */}
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
        placeholder="Email"
        autoComplete="email"
        disabled={loading}
      />

      {/* Password */}
      <div className="relative">
        <input
          type={showPw ? 'text' : 'password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${inputClass} pr-12`}
          placeholder="Password (min 6 characters)"
          autoComplete="new-password"
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

      {/* Date of birth */}
      <div>
        <label className="block text-sm font-medium text-[#374151] mb-1 ml-1">Date of birth</label>
        <input
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          className={inputClass}
          disabled={loading}
        />
      </div>

      {/* Gender + Trade row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-[#374151] mb-1 ml-1">Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as typeof gender)}
            className={selectClass}
            disabled={loading}
          >
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="undeclared">Prefer not to say</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#374151] mb-1 ml-1">
            Trade <span className="text-[#9CA3AF] font-normal">(optional)</span>
          </label>
          {trades && trades.length > 0 ? (
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className={selectClass}
              disabled={loading}
            >
              <option value="">Select...</option>
              {trades.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className={inputClass}
              placeholder="e.g. Carpenter"
              disabled={loading}
            />
          )}
        </div>
      </div>

      {legal && (
        <p className="text-xs text-[#667085] text-center">
          By signing up, you agree to our{' '}
          <a href={legal.termsUrl} className="text-[#0F766E] hover:underline">Terms</a> and{' '}
          <a href={legal.privacyUrl} className="text-[#0F766E] hover:underline">Privacy Policy</a>.
        </p>
      )}

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
        {loading ? 'Creating account...' : 'Create Account'}
      </button>

      {onSwitchToLogin && (
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="w-full text-[#0F766E] hover:underline text-sm py-1"
        >
          Already have an account? Sign in
        </button>
      )}
    </form>
  );
}
