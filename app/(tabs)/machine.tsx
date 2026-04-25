/**
 * Machine Status Screen — Operator 2
 *
 * Online/Offline toggle + 3 quick alert buttons.
 * Persists to AsyncStorage + syncs to Supabase.
 */

import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ActionSheetIOS, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, withOpacity, spacing, borderRadius, typography } from '@onsite/tokens';
import { useOperatorStore } from '../../src/store/operator';
import { supabase } from '../../src/lib/supabase';
import { OperatorNumberCard } from '../../src/components/OperatorNumberCard';

const OFFLINE_REASONS = ['Broken', 'Low fuel', 'Maintenance', 'Shift end'];

export default function MachineScreen() {
  const store = useOperatorStore();
  const [busy, setBusy] = useState(false);

  const handleGoOffline = () => {
    const options = [...OFFLINE_REASONS, 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, title: 'Reason for going offline' },
        (idx) => { if (idx < OFFLINE_REASONS.length) store.setOffline(OFFLINE_REASONS[idx].toLowerCase()); },
      );
    } else {
      Alert.alert('Go Offline', 'Select reason', [
        ...OFFLINE_REASONS.map((r) => ({ text: r, onPress: () => store.setOffline(r.toLowerCase()) })),
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleGoOnline = () => {
    store.setOnline();
  };

  const handleAlert = async (type: 'low_fuel' | 'broken' | 'maintenance') => {
    if (busy) return;
    setBusy(true);

    try {
      // Broken → also go offline
      if (type === 'broken') {
        store.setOffline('broken');
      }

      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from('frm_alerts').insert({
        operator_id: user?.id,
        type,
        message: type === 'low_fuel'
          ? 'Low fuel — still working'
          : type === 'broken'
            ? 'Machine broken down — going offline'
            : 'Maintenance needed',
      });

      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      Alert.alert('Supervisor notified', `Alert sent at ${time}`);
    } catch {
      Alert.alert('Error', 'Could not send alert. Will retry when online.');
    } finally {
      setBusy(false);
    }
  };

  const onlineSince = store.availableSince
    ? new Date(store.availableSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerArea}>
        <Text style={styles.title}>Machine status</Text>
        <Text style={styles.subtitle}>Auto-replies depend on this</Text>
      </View>

      <View style={styles.content}>
        {/* Operator's receiving number */}
        <OperatorNumberCard />

        {/* Status Card */}
        <View style={[styles.statusCard, store.isOnline ? styles.statusOnline : styles.statusOffline]}>
          <View style={styles.statusLeft}>
            <View style={[styles.statusDot, { backgroundColor: store.isOnline ? colors.accent : colors.error }]} />
            <View>
              <Text style={styles.statusTitle}>{store.isOnline ? 'Online' : 'Offline'}</Text>
              <Text style={styles.statusSub}>
                {store.isOnline
                  ? `Accepting requests since ${onlineSince}`
                  : `Reason: ${store.machineDownReason || 'unknown'}`}
              </Text>
            </View>
          </View>
          <Pressable
            style={[styles.toggleBtn, store.isOnline ? styles.toggleBtnOffline : styles.toggleBtnOnline]}
            onPress={store.isOnline ? handleGoOffline : handleGoOnline}
            disabled={busy}
          >
            <Text style={[styles.toggleBtnText, store.isOnline ? styles.toggleTextOffline : styles.toggleTextOnline]}>
              {store.isOnline ? 'Go offline' : 'Go online'}
            </Text>
          </Pressable>
        </View>

        {/* Quick Alerts */}
        <Text style={styles.sectionLabel}>QUICK ALERTS TO SUPERVISOR</Text>

        <Pressable style={styles.alertCard} onPress={() => handleAlert('low_fuel')} disabled={busy}>
          <View style={[styles.alertIcon, { backgroundColor: withOpacity(colors.amber, 0.12) }]}>
            <Ionicons name="water-outline" size={20} color={colors.amber} />
          </View>
          <View style={styles.alertBody}>
            <Text style={styles.alertTitle}>Low fuel</Text>
            <Text style={styles.alertSub}>Supervisor gets text, I keep working</Text>
          </View>
        </Pressable>

        <Pressable style={styles.alertCard} onPress={() => handleAlert('broken')} disabled={busy}>
          <View style={[styles.alertIcon, { backgroundColor: withOpacity(colors.error, 0.12) }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
          </View>
          <View style={styles.alertBody}>
            <Text style={styles.alertTitle}>Broken down</Text>
            <Text style={styles.alertSub}>Goes offline, auto-replies crew</Text>
          </View>
        </Pressable>

        <Pressable style={styles.alertCard} onPress={() => handleAlert('maintenance')} disabled={busy}>
          <View style={[styles.alertIcon, { backgroundColor: withOpacity(colors.info, 0.12) }]}>
            <Ionicons name="build-outline" size={20} color={colors.info} />
          </View>
          <View style={styles.alertBody}>
            <Text style={styles.alertTitle}>Need maintenance</Text>
            <Text style={styles.alertSub}>Flags supervisor, I stay online</Text>
          </View>
        </Pressable>

        {/* Footer info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            <Text style={{ fontWeight: '700' }}>When offline:</Text> workers get "Machine is down
            ({store.machineDownReason || 'reason'}). Orders will resume shortly." automatically.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.screenTitle,
  },
  subtitle: {
    ...typography.meta,
    marginTop: spacing.xs,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statusOnline: { borderColor: colors.accent },
  statusOffline: { borderColor: colors.error },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  statusDot: { width: 16, height: 16, borderRadius: 8 },
  statusTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  statusSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  toggleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
  },
  toggleBtnOffline: { borderColor: colors.text, backgroundColor: colors.surface },
  toggleBtnOnline: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  toggleBtnText: { fontSize: 14, fontWeight: '600' },
  toggleTextOffline: { color: colors.text },
  toggleTextOnline: { color: colors.accent },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 64,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  alertBody: { flex: 1 },
  alertTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  alertSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  infoCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  infoText: { fontSize: 13, color: colors.text, lineHeight: 20 },
});
