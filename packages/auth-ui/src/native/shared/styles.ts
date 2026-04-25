/**
 * Shared styles for auth-ui native components.
 * All values derive from @onsite/tokens — no hardcoded colors.
 */

import { StyleSheet } from 'react-native';
import { colors, spacing, borderRadius } from '@onsite/tokens';

export const authStyles = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  form: {
    gap: spacing.md,
  },

  // Header
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logoFallback: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.white,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Inputs
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginLeft: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
  },
  inputRowFocused: {
    borderColor: colors.inputFocus,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: colors.text,
  },
  eyeBtn: {
    padding: 4,
  },
  eyeText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },

  // Button
  button: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },

  // Error / Success banners
  errorBanner: {
    backgroundColor: colors.errorSoft,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    flex: 1,
  },
  successBanner: {
    backgroundColor: colors.successSoft,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  successText: {
    color: colors.success,
    fontSize: 14,
    flex: 1,
  },

  // Links
  link: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },

  // Footer
  footer: {
    textAlign: 'center',
    color: colors.iconMuted,
    fontSize: 13,
    marginTop: 32,
  },

  // Legal
  legalText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: {
    color: colors.accent,
    fontWeight: '500',
  },
});
