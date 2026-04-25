/**
 * OperatorNumberCard
 *
 * Displays the operator's dedicated SMS receiving number.
 * If no number is provisioned yet, shows a "Get my number" action
 * that calls the provision-number Edge Function.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, withOpacity } from '@onsite/tokens';
import {
  fetchOperatorNumber,
  provisionOperatorNumber,
  formatPhoneUS,
  type OperatorNumber,
} from '../api/operatorNumber';

export function OperatorNumberCard() {
  const [number, setNumber] = useState<OperatorNumber | null>(null);
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchOperatorNumber();
    setNumber(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleProvision = async () => {
    if (provisioning) return;
    setProvisioning(true);
    try {
      const result = await provisionOperatorNumber();
      setNumber(result);
      Alert.alert(
        'Number ready',
        `Share ${formatPhoneUS(result.phone_e164)} with your crew. They'll SMS here to send requests.`,
      );
    } catch (err) {
      Alert.alert('Could not provision number', String(err));
    } finally {
      setProvisioning(false);
    }
  };

  const handleShare = async () => {
    if (!number) return;
    await Share.share({
      message: `Send your material requests by SMS to ${formatPhoneUS(number.phone_e164)}`,
    });
  };

  if (loading) {
    return (
      <View style={[styles.card, styles.loading]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!number) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>Your receiving number</Text>
        <Text style={styles.hint}>
          Get a dedicated SMS number that your crew will use to send material requests.
        </Text>
        <Pressable
          style={[styles.primaryBtn, provisioning && styles.btnDisabled]}
          onPress={handleProvision}
          disabled={provisioning}
        >
          {provisioning ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Ionicons name="call-outline" size={18} color={colors.background} />
              <Text style={styles.primaryBtnText}>Get my number</Text>
            </>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Your receiving number</Text>
      <Text style={styles.phone} selectable>
        {formatPhoneUS(number.phone_e164)}
      </Text>
      <Pressable style={styles.actionBtn} onPress={handleShare}>
        <Ionicons name="share-outline" size={16} color={colors.text} />
        <Text style={styles.actionText}>Share with crew</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: withOpacity(colors.accent, 0.08),
    borderWidth: 1,
    borderColor: withOpacity(colors.accent, 0.25),
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  phone: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  actionBtn: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.background,
  },
});
