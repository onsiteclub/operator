/**
 * Machine Status Screen — OnSite Operator
 *
 * Operator number card on top + 4 big square alert cards (2x2 grid)
 * filling the bottom two-thirds of the screen. Cards are sized for
 * gloved fingers — wide tap zones, large icons.
 *
 * Alerts:
 *   - Low fuel       → supervisor SMS, operator stays online
 *   - Broken         → supervisor SMS + flips operator offline
 *   - Maintenance    → supervisor SMS, operator stays online
 *   - Going home     → fans out a friendly heads-up to every worker who
 *                      texted today, asking them to send any pending
 *                      requests now (uses send-to-worker per request).
 *
 * The shift toggle (Online/Offline) lives at the top of the Requests
 * tab — the operator manages their shift from there.
 */

import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, withOpacity, spacing, borderRadius, typography } from '@onsite/tokens';
import { useRouter } from 'expo-router';
import { useOperatorStore } from '../../src/store/operator';
import { supabase } from '../../src/lib/supabase';
import { OperatorNumberCard } from '../../src/components/OperatorNumberCard';
import { useSupervisorPhone } from '../../src/hooks/useSupervisorPhone';
import { HeaderRow } from '../../src/components/ui/HeaderRow';

const GOING_HOME_TEXT =
  "Heads up — I'm heading home in about an hour. If you'll need any material, please send your request now so I can get it out before I leave. Thanks!";

type AlertType = 'low_fuel' | 'broken' | 'maintenance' | 'going_home';

export default function MachineScreen() {
  const router = useRouter();
  const store = useOperatorStore();
  const [busy, setBusy] = useState(false);
  const { phone: supervisorPhone, loaded: supervisorLoaded } = useSupervisorPhone();
  const supervisorRequired = supervisorLoaded && !supervisorPhone;

  const sendGoingHomeFanOut = async (operatorId: string) => {
    // Find the LATEST open or recent request per worker today, so the
    // heads-up message threads with their existing convo.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: rows, error } = await supabase
      .from('frm_material_requests')
      .select('id, worker_phone, created_at')
      .gte('created_at', todayStart.toISOString())
      .not('worker_phone', 'is', null)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const latestByPhone = new Map<string, string>(); // phone → request_id
    for (const row of rows || []) {
      const phone = row.worker_phone as string | null;
      if (!phone) continue;
      if (!latestByPhone.has(phone)) latestByPhone.set(phone, row.id as string);
    }

    if (latestByPhone.size === 0) return 0;

    const sends = Array.from(latestByPhone.values()).map((requestId) =>
      supabase.functions.invoke('send-to-worker', {
        body: { request_id: requestId, text: GOING_HOME_TEXT },
      }),
    );
    const results = await Promise.allSettled(sends);
    const sent = results.filter((r) => r.status === 'fulfilled').length;

    // Record the alert for supervisor visibility
    await supabase.from('frm_alerts').insert({
      operator_id: operatorId,
      type: 'going_home',
      message: `Heads-up sent to ${sent} worker${sent === 1 ? '' : 's'}`,
    });

    return sent;
  };

  const handleAlert = async (type: AlertType) => {
    if (busy) return;

    if (type === 'going_home') {
      Alert.alert(
        'Send heads-up to workers?',
        'A friendly note will go to every worker who texted you today, asking them to send any pending requests before you leave.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send',
            onPress: async () => {
              setBusy(true);
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error('Not signed in');
                const sent = await sendGoingHomeFanOut(user.id);
                if (sent === 0) {
                  Alert.alert('No workers to notify', 'Nobody texted you today.');
                } else {
                  Alert.alert('Heads-up sent', `Notified ${sent} worker${sent === 1 ? '' : 's'}.`);
                }
              } catch {
                Alert.alert('Error', 'Could not send heads-up. Try again.');
              } finally {
                setBusy(false);
              }
            },
          },
        ],
      );
      return;
    }

    if (!supervisorPhone) {
      Alert.alert(
        'Add supervisor number',
        'Add a supervisor phone number in Settings to send alerts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => router.push('/settings' as any) },
        ],
      );
      return;
    }

    setBusy(true);
    try {
      // Broken → also flip offline so the request-ingest auto-reply fires
      // for incoming SMS until the operator (or supervisor) sorts it out.
      if (type === 'broken') {
        store.setOffline('broken');
      }

      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from('frm_alerts').insert({
        operator_id: user?.id,
        type,
        supervisor_phone: supervisorPhone,
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderRow title="Machine" />

      <View style={styles.topSection}>
        <OperatorNumberCard />

        {supervisorRequired && (
          <Pressable style={styles.supervisorBanner} onPress={() => router.push('/settings' as any)}>
            <Ionicons name="warning-outline" size={18} color={colors.warningDark} />
            <Text style={styles.supervisorBannerText}>
              Add supervisor number in Settings
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.warningDark} />
          </Pressable>
        )}

        <Text style={styles.sectionLabel}>QUICK ALERTS</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <AlertSquare
            title="Low fuel"
            subtitle="Supervisor gets text"
            icon="water-outline"
            tint={colors.amber}
            onPress={() => handleAlert('low_fuel')}
            disabled={busy}
          />
          <AlertSquare
            title="Broken"
            subtitle="Goes offline"
            icon="alert-circle-outline"
            tint={colors.error}
            onPress={() => handleAlert('broken')}
            disabled={busy}
          />
        </View>
        <View style={styles.gridRow}>
          <AlertSquare
            title="Maintenance"
            subtitle="Flags supervisor"
            icon="build-outline"
            tint={colors.info}
            onPress={() => handleAlert('maintenance')}
            disabled={busy}
          />
          <AlertSquare
            title="Going home"
            subtitle="Heads-up to crew"
            icon="walk-outline"
            tint={colors.accent}
            onPress={() => handleAlert('going_home')}
            disabled={busy}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function AlertSquare({
  title, subtitle, icon, tint, onPress, disabled,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.square,
        { borderColor: withOpacity(tint, 0.4) },
        pressed && { backgroundColor: withOpacity(tint, 0.08) },
        disabled && { opacity: 0.5 },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={[styles.squareIcon, { backgroundColor: withOpacity(tint, 0.12) }]}>
        <Ionicons name={icon} size={36} color={tint} />
      </View>
      <Text style={styles.squareTitle}>{title}</Text>
      <Text style={styles.squareSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Top third: number card + section label
  topSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginTop: spacing.lg,
  },
  supervisorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  supervisorBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.warningDark,
  },

  // Bottom two-thirds: 2x2 grid
  grid: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  square: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  squareIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  squareTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
    textAlign: 'center',
  },
  squareSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
