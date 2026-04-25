/**
 * ForgotForm — Web forgot password form.
 */

'use client';

import { useState, type FormEvent } from 'react';

export interface ForgotFormProps {
  email?: string;
  onSubmit: (email: string) => Promise<void>;
  onBack?: () => void;
}

export function ForgotForm({ email: initialEmail = '', onSubmit, onBack }: ForgotFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSubmit(trimmed);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {sent ? (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm text-center">
          Password reset email sent! Check your inbox.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#0F766E] hover:bg-[#0d6d66] text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      )}

      {onBack && (
        <button onClick={onBack} className="w-full text-[#0F766E] hover:underline text-sm py-1">
          Back to sign in
        </button>
      )}
    </div>
  );
}
