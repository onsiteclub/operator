/**
 * Hours Screen — OnSite Operator
 *
 * Full-screen calendar for editing logged hours. Reachable from:
 *   - "Edit logged hours" link on the Invoice tab footer
 *   - "Edit logged hours" button below the calendar in Step 1 of the
 *     hourly wizard (passes ?from=wizard so the close button reads
 *     "Back to wizard" and reopens the wizard on the Invoice tab).
 *
 * Closing always shows the today-confirm modal so the operator can
 * verify today's IN/OUT/break before leaving.
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@onsite/tokens';
import { TimesheetSection, DayDetailModal } from '../src/screens/timesheet/TimesheetSection';
import { useDailyLogStore, type DailyLog } from '../src/stores/dailyLogStore';
import { useAuthStore } from '../src/stores/authStore';
import { getDailyHours } from '../src/lib/database/daily';
import { getToday } from '../src/lib/database';

export default function HoursScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromWizard = params.from === 'wizard';
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const dataVersion = useDailyLogStore((s) => s.dataVersion);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [todayKey, setTodayKey] = useState<string | null>(null);
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null);

  // Refresh today's log whenever the section saves/deletes
  useEffect(() => {
    if (!userId || !confirmOpen) return;
    const today = getToday();
    setTodayKey(today);
    const entry = getDailyHours(userId, today);
    setTodayLog(
      entry
        ? {
            date: entry.date,
            totalMinutes: entry.total_minutes,
            breakMinutes: entry.break_minutes,
            locationName: entry.location_name,
            locationId: entry.location_id,
            verified: entry.verified,
            source: entry.source,
            type: entry.type || 'work',
            firstEntry: entry.first_entry,
            lastExit: entry.last_exit,
            notes: entry.notes,
          }
        : null,
    );
  }, [userId, confirmOpen, dataVersion]);

  const handleCloseRequest = () => {
    setConfirmOpen(true);
  };

  const handleConfirmClose = () => {
    setConfirmOpen(false);
    setTodayKey(null);
    if (fromWizard) {
      // Round-trip back to the Invoice tab and signal it to reopen
      // the wizard. The wizard resets to a clean Step 1 (per spec —
      // operator re-picks range with the corrected hours visible).
      router.replace('/(tabs)/reports?openWizard=1' as any);
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={handleCloseRequest} hitSlop={10} style={styles.closeBtn}>
          <Ionicons
            name={fromWizard ? 'arrow-back' : 'close'}
            size={26}
            color={colors.text}
          />
        </Pressable>
        <Text style={styles.title}>{fromWizard ? 'Back to wizard' : 'Edit hours'}</Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <TimesheetSection />
      </ScrollView>

      {/* Confirm-on-close: opens today's day modal so operator can verify */}
      <DayDetailModal
        dayKey={confirmOpen ? todayKey : null}
        log={todayLog}
        onClose={handleConfirmClose}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  closeBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { ...typography.screenTitle, fontSize: 17 },
  body: { paddingBottom: spacing.xxl },
});
