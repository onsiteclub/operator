/**
 * TimesheetSection — calendar + day detail modal for the Reports tab.
 *
 * Embedded inside app/(tabs)/reports.tsx below the existing queue stats.
 * Shows a month calendar with hours per day; tapping a day opens a
 * modal where the machinist can view, edit, add, or delete entries
 * for that date.
 *
 * Data layer is the SQLite-backed dailyLogStore (Phase 1).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, withOpacity } from '@onsite/tokens';
import { Calendar } from '../../components/Calendar';
import { useDailyLogStore, type DailyLog } from '../../stores/dailyLogStore';
import { formatDuration } from '../../lib/database';
import { getDayKey } from '../home/helpers';

// ============================================
// HELPERS
// ============================================

function dayKeyFromDate(date: Date): string {
  return getDayKey(date);
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function minutesToHM(total: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.floor(total));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

function hmToMinutes(hours: string, minutes: string): number {
  const h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// ============================================
// COMPONENT
// ============================================

export function TimesheetSection() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [monthLogs, setMonthLogs] = useState<DailyLog[]>([]);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const dataVersion = useDailyLogStore((s) => s.dataVersion);
  const getMonthSummary = useDailyLogStore((s) => s.getMonthSummary);

  const reload = useCallback(async () => {
    const summary = await getMonthSummary(currentMonth.getFullYear(), currentMonth.getMonth());
    setMonthLogs(summary.logs);
  }, [currentMonth, getMonthSummary]);

  useEffect(() => {
    reload();
  }, [reload, dataVersion]);

  const minutesByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of monthLogs) map.set(log.date, log.totalMinutes);
    return map;
  }, [monthLogs]);

  const notesByDay = useMemo(() => {
    const set = new Set<string>();
    for (const log of monthLogs) if (log.notes) set.add(log.date);
    return set;
  }, [monthLogs]);

  const totalMonthMinutes = useMemo(
    () => monthLogs.reduce((sum, log) => sum + log.totalMinutes, 0),
    [monthLogs],
  );

  const handleDayPress = (key: string) => setSelectedDayKey(key);
  const handleClose = () => setSelectedDayKey(null);

  const selectedLog = selectedDayKey
    ? monthLogs.find((log) => log.date === selectedDayKey) || null
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Hours</Text>
        <Text style={styles.subtitle}>{formatDuration(totalMonthMinutes)} this month</Text>
      </View>

      <Calendar
        currentMonth={currentMonth}
        onMonthChange={setCurrentMonth}
        mode="single"
        getDayMinutes={(date) => minutesByDay.get(dayKeyFromDate(date)) || 0}
        getDayHasNote={(date) => notesByDay.has(dayKeyFromDate(date))}
        disableFutureDates
        showTodayButton
        onTodayPress={() => setCurrentMonth(new Date())}
        onDayPress={handleDayPress}
      />

      <DayDetailModal
        dayKey={selectedDayKey}
        log={selectedLog}
        onClose={handleClose}
      />
    </View>
  );
}

// ============================================
// DAY DETAIL MODAL
// ============================================

function DayDetailModal({
  dayKey,
  log,
  onClose,
}: {
  dayKey: string | null;
  log: DailyLog | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('0');
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [notes, setNotes] = useState('');

  const addManualHours = useDailyLogStore((s) => s.addManualHours);
  const updateDayLog = useDailyLogStore((s) => s.updateDayLog);
  const deleteDayLog = useDailyLogStore((s) => s.deleteDayLog);

  // Re-seed form whenever the modal opens for a different day.
  useEffect(() => {
    if (!dayKey) {
      setEditing(false);
      return;
    }
    const initial = log ? minutesToHM(log.totalMinutes) : { hours: 0, minutes: 0 };
    setHours(String(initial.hours));
    setMinutes(String(initial.minutes));
    setBreakMinutes(String(log?.breakMinutes || 0));
    setNotes(log?.notes || '');
  }, [dayKey, log]);

  if (!dayKey) return null;
  const date = parseDayKey(dayKey);

  const handleSave = async () => {
    const totalMinutes = hmToMinutes(hours, minutes);
    const breakMin = parseInt(breakMinutes, 10) || 0;

    if (totalMinutes <= 0) {
      Alert.alert('Hours required', 'Enter how many hours and minutes you worked.');
      return;
    }

    if (log) {
      await updateDayLog(dayKey, {
        totalMinutes,
        breakMinutes: breakMin,
        notes: notes.trim() || undefined,
      });
    } else {
      await addManualHours({
        date: dayKey,
        totalMinutes,
        breakMinutes: breakMin,
        locationName: 'Operator',
        type: 'work',
        notes: notes.trim() || undefined,
      });
    }
    setEditing(false);
    onClose();
  };

  const handleDelete = () => {
    if (!log) return;
    Alert.alert(
      'Delete this day?',
      'This removes the hours logged for this date.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDayLog(dayKey);
            onClose();
          },
        },
      ],
    );
  };

  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalRoot}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{dateLabel}</Text>
              {log ? (
                <Text style={styles.sheetSubtitle}>
                  {log.source === 'gps' ? 'Auto-logged' : log.source === 'edited' ? 'Edited' : 'Manual'}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {!editing && log ? (
              <View>
                <Row label="Total" value={formatDuration(log.totalMinutes)} />
                <Row label="First in" value={log.firstEntry || '—'} />
                <Row label="Last out" value={log.lastExit || '—'} />
                <Row label="Break" value={log.breakMinutes ? `${log.breakMinutes} min` : '—'} />
                {log.notes ? (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesLabel}>Notes</Text>
                    <Text style={styles.notesText}>{log.notes}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {!editing && !log ? (
              <Text style={styles.emptyText}>No hours logged for this day.</Text>
            ) : null}

            {editing ? (
              <View>
                <Text style={styles.fieldLabel}>Total worked</Text>
                <View style={styles.hmRow}>
                  <View style={styles.hmField}>
                    <TextInput
                      style={styles.input}
                      keyboardType="number-pad"
                      value={hours}
                      onChangeText={setHours}
                      maxLength={2}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                    />
                    <Text style={styles.hmSuffix}>h</Text>
                  </View>
                  <View style={styles.hmField}>
                    <TextInput
                      style={styles.input}
                      keyboardType="number-pad"
                      value={minutes}
                      onChangeText={setMinutes}
                      maxLength={2}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                    />
                    <Text style={styles.hmSuffix}>min</Text>
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Break (minutes)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={breakMinutes}
                  onChangeText={setBreakMinutes}
                  maxLength={3}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  maxLength={500}
                  placeholder="Optional"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actionsRow}>
            {editing ? (
              <>
                <Pressable
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={() => setEditing(false)}
                >
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={handleSave}>
                  <Text style={styles.btnPrimaryText}>Save</Text>
                </Pressable>
              </>
            ) : (
              <>
                {log ? (
                  <Pressable
                    style={[styles.btn, styles.btnDanger]}
                    onPress={handleDelete}
                  >
                    <Text style={styles.btnDangerText}>Delete</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => setEditing(true)}
                >
                  <Text style={styles.btnPrimaryText}>{log ? 'Edit' : 'Log hours'}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Modal
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withOpacity('#000000', 0.45),
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sheetSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  sheetBody: { paddingTop: spacing.md, paddingBottom: spacing.lg },

  // Read-only rows
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowLabel: { fontSize: 14, color: colors.textSecondary },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  notesBox: { marginTop: spacing.md },
  notesLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  notesText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },

  // Edit form
  fieldLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hmRow: { flexDirection: 'row', gap: spacing.sm },
  hmField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
  },
  hmSuffix: { fontSize: 14, color: colors.textSecondary, paddingHorizontal: 4 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },

  // Buttons
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.background, fontWeight: '700', fontSize: 15 },
  btnSecondary: { backgroundColor: colors.surfaceMuted },
  btnSecondaryText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  btnDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.error },
  btnDangerText: { color: colors.error, fontWeight: '600', fontSize: 15 },
});
