/**
 * TimesheetSection — calendar + day-detail modal for the Invoice tab.
 *
 * Renders inside app/(tabs)/reports.tsx (now the Invoice tab). Tapping
 * any day in the calendar opens a modal that has two modes:
 *
 *   1. VIEW   — read-only summary (IN, OUT, Break, Note, Total) plus
 *               an "Edit this day" button. Or, if the day has no log
 *               yet, an empty state with "Log hours".
 *   2. EDIT   — manual entry form mirroring the timekeeper Log tab:
 *               IN/OUT time picker cards, Break pill (presets +
 *               custom), collapsible Notes input, hero Total, and
 *               Save / Clear buttons.
 *
 * Time pickers use @react-native-community/datetimepicker — iOS gets
 * an inline spinner shown above the form; Android opens the imperative
 * DateTimePickerAndroid dialog. Total minutes are computed live from
 * (exit − entry − break).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, Alert,
  KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { colors, spacing, borderRadius, withOpacity } from '@onsite/tokens';
import { Calendar } from '../../components/Calendar';
import { useDailyLogStore, type DailyLog } from '../../stores/dailyLogStore';
import { formatDuration } from '../../lib/database';
import { formatTimeHHMM } from '../../lib/database/daily';
import { splitTimeDisplay, BREAK_PRESETS } from '../../lib/format';
import { getDayKey } from '../home/helpers';

// ============================================
// HELPERS
// ============================================

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseHHMMToDate(dayDate: Date, hhmm: string | null): Date | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(dayDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function diffMinutes(entry: Date | null, exit: Date | null, breakMin: number): number {
  if (!entry || !exit) return 0;
  const elapsed = Math.round((exit.getTime() - entry.getTime()) / 60000);
  return Math.max(0, elapsed - breakMin);
}

// ============================================
// OUTER COMPONENT
// ============================================

export function TimesheetSection() {
  const { width: windowWidth } = useWindowDimensions();
  // Calendar lives inside reports.tsx (paddingHorizontal: spacing.lg = 24)
  // — 7 cells must fit window - 48.
  const calendarWidth = windowWidth - 48;

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [monthLogs, setMonthLogs] = useState<DailyLog[]>([]);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const dataVersion = useDailyLogStore((s) => s.dataVersion);
  const getMonthSummary = useDailyLogStore((s) => s.getMonthSummary);

  useEffect(() => {
    let alive = true;
    (async () => {
      const summary = await getMonthSummary(currentMonth.getFullYear(), currentMonth.getMonth());
      if (alive) setMonthLogs(summary.logs);
    })();
    return () => { alive = false; };
  }, [currentMonth, getMonthSummary, dataVersion]);

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
        containerWidth={calendarWidth}
        getDayMinutes={(date) => minutesByDay.get(getDayKey(date)) || 0}
        getDayHasNote={(date) => notesByDay.has(getDayKey(date))}
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
  const addManualHours = useDailyLogStore((s) => s.addManualHours);
  const updateDayLog = useDailyLogStore((s) => s.updateDayLog);
  const deleteDayLog = useDailyLogStore((s) => s.deleteDayLog);

  const [editing, setEditing] = useState(false);
  const [entryTime, setEntryTime] = useState<Date | null>(null);
  const [exitTime, setExitTime] = useState<Date | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [notesText, setNotesText] = useState('');
  const [showNotesInput, setShowNotesInput] = useState(false);
  const [showBreakPicker, setShowBreakPicker] = useState(false);
  const [showCustomBreak, setShowCustomBreak] = useState(false);
  const [customBreakText, setCustomBreakText] = useState('');
  const [activeTimePicker, setActiveTimePicker] = useState<'entry' | 'exit' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Re-seed form whenever the modal opens for a different day.
  useEffect(() => {
    if (!dayKey) {
      setEditing(false);
      return;
    }
    const dayDate = parseDayKey(dayKey);
    setEntryTime(parseHHMMToDate(dayDate, log?.firstEntry ?? null));
    setExitTime(parseHHMMToDate(dayDate, log?.lastExit ?? null));
    setBreakMinutes(log?.breakMinutes ?? 0);
    setNotesText(log?.notes ?? '');
    setShowNotesInput(!!log?.notes);
    setShowBreakPicker(false);
    setShowCustomBreak(false);
    setCustomBreakText('');
    setActiveTimePicker(null);
    setEditing(false);
  }, [dayKey, log]);

  if (!dayKey) return null;
  const dayDate = parseDayKey(dayKey);
  const dateLabel = dayDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const totalMinutes = diffMinutes(entryTime, exitTime, breakMinutes);

  const breakLabel = useMemo(() => {
    if (breakMinutes === 0) return 'No break';
    if (breakMinutes === 60) return '1 hour';
    if (breakMinutes > 60) {
      const h = Math.floor(breakMinutes / 60);
      const m = breakMinutes % 60;
      return m > 0 ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
    }
    return `${breakMinutes} min`;
  }, [breakMinutes]);

  // ---------- Time picker plumbing ----------

  const openTimePicker = (which: 'entry' | 'exit') => {
    if (Platform.OS === 'android') {
      const initial = (which === 'entry' ? entryTime : exitTime) || new Date();
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'time',
        is24Hour: false,
        onChange: (event: DateTimePickerEvent, picked?: Date) => {
          if (event.type !== 'set' || !picked) return;
          const next = new Date(dayDate);
          next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
          if (which === 'entry') setEntryTime(next);
          else setExitTime(next);
        },
      });
    } else {
      setActiveTimePicker(which);
    }
  };

  const onIosTimeChange = (_event: DateTimePickerEvent, picked?: Date) => {
    if (!picked || !activeTimePicker) return;
    const next = new Date(dayDate);
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    if (activeTimePicker === 'entry') setEntryTime(next);
    else setExitTime(next);
  };

  // ---------- Break picker handlers ----------

  const handleSelectBreak = (value: number) => {
    setBreakMinutes(value);
    setShowBreakPicker(false);
    setShowCustomBreak(false);
  };

  const handleCustomBreakSave = () => {
    const n = parseInt(customBreakText, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 480) {
      setBreakMinutes(n);
      setShowBreakPicker(false);
      setShowCustomBreak(false);
      setCustomBreakText('');
    }
  };

  // ---------- Save / delete ----------

  const handleSave = async () => {
    if (!entryTime || !exitTime) {
      Alert.alert('Times required', 'Set both IN and OUT times before saving.');
      return;
    }
    if (totalMinutes <= 0) {
      Alert.alert('Invalid range', 'OUT time must be after IN time (and longer than the break).');
      return;
    }

    setIsSaving(true);
    try {
      const firstEntry = formatTimeHHMM(entryTime);
      const lastExit = formatTimeHHMM(exitTime);
      const trimmedNotes = notesText.trim();

      if (log) {
        await updateDayLog(dayKey, {
          totalMinutes,
          breakMinutes,
          firstEntry,
          lastExit,
          // Empty string clears the column. undefined would leave it untouched.
          notes: trimmedNotes,
        });
      } else {
        await addManualHours({
          date: dayKey,
          totalMinutes,
          breakMinutes,
          firstEntry,
          lastExit,
          locationName: 'Operator',
          notes: trimmedNotes || undefined,
        });
      }

      setEditing(false);
      onClose();
    } finally {
      setIsSaving(false);
    }
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

  // ---------- Render ----------

  const hasEntry = !!entryTime;
  const hasExit = !!exitTime;

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
            <Text style={styles.sheetTitle}>{dateLabel}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {!editing ? (
              <ViewMode
                log={log}
                onEdit={() => setEditing(true)}
                onDelete={handleDelete}
              />
            ) : (
              <EditMode
                hasEntry={hasEntry}
                hasExit={hasExit}
                entryTime={entryTime}
                exitTime={exitTime}
                breakLabel={breakLabel}
                showNotesInput={showNotesInput}
                notesText={notesText}
                totalMinutes={totalMinutes}
                isSaving={isSaving}
                onOpenEntry={() => openTimePicker('entry')}
                onOpenExit={() => openTimePicker('exit')}
                onOpenBreak={() => setShowBreakPicker(true)}
                onShowNotes={() => setShowNotesInput(true)}
                onHideNotes={() => { setShowNotesInput(false); setNotesText(''); }}
                onChangeNotes={setNotesText}
                onSave={handleSave}
                onCancel={() => setEditing(false)}
                isExisting={!!log}
              />
            )}
          </ScrollView>

          {/* iOS inline time picker */}
          {Platform.OS === 'ios' && activeTimePicker !== null ? (
            <View style={styles.iosPickerWrap}>
              <View style={styles.iosPickerHeader}>
                <Pressable onPress={() => setActiveTimePicker(null)}>
                  <Text style={styles.iosPickerDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={(activeTimePicker === 'entry' ? entryTime : exitTime) || new Date()}
                mode="time"
                display="spinner"
                onChange={onIosTimeChange}
              />
            </View>
          ) : null}
        </View>

        <BreakPickerModal
          visible={showBreakPicker}
          breakMinutes={breakMinutes}
          showCustomBreak={showCustomBreak}
          customBreakText={customBreakText}
          onSelect={handleSelectBreak}
          onShowCustom={() => setShowCustomBreak(true)}
          onChangeCustom={(t) => setCustomBreakText(t.replace(/[^0-9]/g, '').slice(0, 3))}
          onSaveCustom={handleCustomBreakSave}
          onClose={() => { setShowBreakPicker(false); setShowCustomBreak(false); }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================
// VIEW MODE
// ============================================

function ViewMode({
  log,
  onEdit,
  onDelete,
}: {
  log: DailyLog | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!log) {
    return (
      <View>
        <Text style={styles.emptyText}>No hours logged for this day.</Text>
        <View style={styles.actionsRow}>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onEdit}>
            <Ionicons name="add" size={18} color={colors.background} />
            <Text style={styles.btnPrimaryText}>Log hours</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Row label="IN" value={log.firstEntry || '—'} />
      <Row label="OUT" value={log.lastExit || '—'} />
      <Row label="Break" value={log.breakMinutes ? `${log.breakMinutes} min` : '—'} />
      {log.notes ? (
        <View style={styles.noteBlock}>
          <Text style={styles.noteLabel}>Note</Text>
          <Text style={styles.noteValue}>{log.notes}</Text>
        </View>
      ) : null}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatDuration(log.totalMinutes)}</Text>
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={[styles.btn, styles.btnDanger]} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
          <Text style={styles.btnDangerText}>Delete</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onEdit}>
          <Ionicons name="pencil-outline" size={16} color={colors.background} />
          <Text style={styles.btnPrimaryText}>Edit this day</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ============================================
// EDIT MODE
// ============================================

function EditMode({
  hasEntry,
  hasExit,
  entryTime,
  exitTime,
  breakLabel,
  showNotesInput,
  notesText,
  totalMinutes,
  isSaving,
  onOpenEntry,
  onOpenExit,
  onOpenBreak,
  onShowNotes,
  onHideNotes,
  onChangeNotes,
  onSave,
  onCancel,
  isExisting,
}: {
  hasEntry: boolean;
  hasExit: boolean;
  entryTime: Date | null;
  exitTime: Date | null;
  breakLabel: string;
  showNotesInput: boolean;
  notesText: string;
  totalMinutes: number;
  isSaving: boolean;
  onOpenEntry: () => void;
  onOpenExit: () => void;
  onOpenBreak: () => void;
  onShowNotes: () => void;
  onHideNotes: () => void;
  onChangeNotes: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isExisting: boolean;
}) {
  return (
    <View>
      <Text style={styles.yourDayLabel}>YOUR DAY</Text>

      {/* Time cards */}
      <View style={styles.timeCardsRow}>
        <Pressable style={styles.timeCard} onPress={onOpenEntry}>
          <Text style={styles.timeLabel}>IN</Text>
          {hasEntry && entryTime ? (
            <>
              <Text style={styles.timeValue}>{splitTimeDisplay(entryTime).time}</Text>
              <Text style={styles.timePeriod}>{splitTimeDisplay(entryTime).period}</Text>
            </>
          ) : (
            <>
              <Text style={styles.timeValueMuted}>—</Text>
              <Text style={styles.timeSubtext}>tap to set</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.timeArrow}>→</Text>
        <Pressable style={styles.timeCard} onPress={onOpenExit}>
          <Text style={styles.timeLabel}>OUT</Text>
          {hasExit && exitTime ? (
            <>
              <Text style={styles.timeValue}>{splitTimeDisplay(exitTime).time}</Text>
              <Text style={styles.timePeriod}>{splitTimeDisplay(exitTime).period}</Text>
            </>
          ) : (
            <>
              <Text style={styles.timeValueMuted}>—</Text>
              <Text style={styles.timeSubtext}>tap to set</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Break pill */}
      <Pressable style={styles.breakPill} onPress={onOpenBreak}>
        <Text style={styles.breakLabelText}>Break</Text>
        <View style={styles.breakRight}>
          <Text style={styles.breakValue}>{breakLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </View>
      </Pressable>

      {/* Notes */}
      {showNotesInput ? (
        <View style={styles.notesPill}>
          <View style={styles.notesHeader}>
            <View style={styles.notesHeaderLeft}>
              <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.breakLabelText}>Note</Text>
            </View>
            <Pressable onPress={onHideNotes} hitSlop={6}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
          <TextInput
            style={styles.notesInput}
            value={notesText}
            onChangeText={onChangeNotes}
            placeholder="Rain delay, concrete pour..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={2}
            maxLength={200}
            textAlignVertical="top"
          />
        </View>
      ) : (
        <Pressable style={styles.notesLink} onPress={onShowNotes}>
          <Ionicons name="document-text-outline" size={14} color={colors.textMuted} />
          <Text style={styles.notesLinkText}>Add a note</Text>
        </Pressable>
      )}

      {/* Total hero */}
      <View style={styles.totalHero}>
        <Text style={styles.totalHeroValue}>
          {totalMinutes > 0 ? formatDuration(totalMinutes) : '0h'}
        </Text>
        <Text style={styles.totalHeroSub}>total</Text>
      </View>

      {/* Buttons */}
      <View style={styles.actionsRow}>
        <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onCancel}>
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnPrimary, isSaving && { opacity: 0.7 }]}
          onPress={onSave}
          disabled={isSaving}
        >
          <Text style={styles.btnPrimaryText}>
            {isSaving ? 'Saving...' : isExisting ? 'Update Hours' : 'Save Hours'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ============================================
// BREAK PICKER MODAL
// ============================================

function BreakPickerModal({
  visible,
  breakMinutes,
  showCustomBreak,
  customBreakText,
  onSelect,
  onShowCustom,
  onChangeCustom,
  onSaveCustom,
  onClose,
}: {
  visible: boolean;
  breakMinutes: number;
  showCustomBreak: boolean;
  customBreakText: string;
  onSelect: (value: number) => void;
  onShowCustom: () => void;
  onChangeCustom: (text: string) => void;
  onSaveCustom: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.pickerOverlay} onPress={onClose}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>Break Duration</Text>
            {BREAK_PRESETS.map((preset) => (
              <Pressable
                key={preset.value}
                style={[
                  styles.pickerOption,
                  breakMinutes === preset.value && styles.pickerOptionSelected,
                ]}
                onPress={() => onSelect(preset.value)}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    breakMinutes === preset.value && styles.pickerOptionTextSelected,
                  ]}
                >
                  {preset.label}
                </Text>
                {breakMinutes === preset.value ? (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                ) : null}
              </Pressable>
            ))}

            {!showCustomBreak ? (
              <Pressable style={styles.pickerOption} onPress={onShowCustom}>
                <Text style={styles.pickerOptionText}>Custom...</Text>
              </Pressable>
            ) : (
              <View style={styles.customBreakRow}>
                <TextInput
                  style={styles.customBreakInput}
                  value={customBreakText}
                  onChangeText={onChangeCustom}
                  keyboardType="number-pad"
                  placeholder="Minutes"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
                <Pressable style={styles.customBreakSave} onPress={onSaveCustom}>
                  <Text style={styles.customBreakSaveText}>Set</Text>
                </Pressable>
              </View>
            )}

            <Pressable style={styles.pickerCancel} onPress={onClose}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================
// SHARED ROW
// ============================================

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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary },

  // Modal shell
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
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sheetBody: { paddingTop: spacing.md, paddingBottom: spacing.lg },

  // View-mode rows
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 2,
    borderTopColor: colors.text,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  noteBlock: { paddingVertical: spacing.sm },
  noteLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 4, fontWeight: '600' },
  noteValue: { fontSize: 14, color: colors.text, lineHeight: 20 },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },

  // Edit mode — YOUR DAY label
  yourDayLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },

  // Time cards
  timeCardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  timeCard: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  timeArrow: {
    fontSize: 18,
    color: colors.textMuted,
    marginHorizontal: spacing.sm,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  timeValue: { fontSize: 24, fontWeight: '700', color: colors.text },
  timePeriod: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  timeValueMuted: { fontSize: 24, fontWeight: '700', color: colors.textMuted },
  timeSubtext: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  // Break pill
  breakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  breakRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  breakLabelText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  breakValue: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },

  // Notes
  notesPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  notesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notesInput: {
    fontSize: 14,
    color: colors.text,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  notesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: spacing.sm,
  },
  notesLinkText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },

  // Total hero
  totalHero: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  totalHeroValue: { fontSize: 40, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  totalHeroSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2, textTransform: 'lowercase' },

  // Buttons
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.background, fontWeight: '700', fontSize: 15 },
  btnSecondary: { backgroundColor: colors.surfaceMuted },
  btnSecondaryText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  btnDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.error },
  btnDangerText: { color: colors.error, fontWeight: '600', fontSize: 15 },

  // iOS time picker
  iosPickerWrap: {
    backgroundColor: colors.surfaceMuted,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iosPickerDone: { fontSize: 16, color: colors.primary, fontWeight: '600' },

  // Break picker modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: withOpacity('#000000', 0.45),
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  pickerOptionSelected: {
    backgroundColor: withOpacity(colors.primary, 0.1),
  },
  pickerOptionText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  pickerOptionTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  customBreakRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  customBreakInput: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  customBreakSave: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  customBreakSaveText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  pickerCancel: {
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  pickerCancelText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
  },
});
