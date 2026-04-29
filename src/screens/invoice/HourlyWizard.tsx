/**
 * Hourly Invoice Wizard - OnSite Operator
 *
 * 3-step modal flow ported VERBATIM from onsite-timekeeper
 * (app/(tabs)/invoice.tsx — wizard JSX 1716-2106, styles 3049-3367,
 * handlers 679-996).
 *
 * Adaptation surface: timekeeper drives off `ComputedSession[]` (sessions
 * table). Operator has no sessions — only `daily_hours`. The wizard's
 * data layer is therefore swapped to read DailyHoursEntry[] for the
 * selected range. The UI, copy, layout, button colors, and step flow
 * are unchanged.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Dimensions,
  TextInput,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import { colors, withOpacity, shadows, spacing } from '@onsite/tokens';
import { Calendar, type RangePosition } from '../../components/Calendar';
import { PressableOpacity } from '../../components/ui/PressableOpacity';
import { getInitials } from '../../lib/format';
import { formatDuration } from '../../lib/database';
import { formatMonthYear } from '../home/helpers';
import {
  getDailyHoursByPeriod,
  type DailyHoursEntry,
} from '../../lib/database/daily';
import { toLocalDateString } from '../../lib/database/core';
import type { DailyHoursDB, InvoiceDB } from '../../lib/database/core';
import { useAuthStore } from '../../stores/authStore';
import { useBusinessProfileStore } from '../../stores/businessProfileStore';
import { useInvoiceStore } from '../../stores/invoiceStore';
import { useSnackbarStore } from '../../stores/snackbarStore';
import { logger } from '../../lib/logger';
import { shareInvoice } from '../../lib/invoiceShare';
import {
  InvoiceSummaryCard,
  type TimeTableDay,
} from './InvoiceSummaryCard';
import { ClientEditSheet, type ClientFormData } from './ClientEditSheet';

// ============================================
// HELPERS (verbatim from timekeeper)
// ============================================

const INITIALS_COLORS = ['#C58B1B', '#2E7D32', '#1565C0', '#6A1B9A', '#C62828', '#00838F', '#E65100', '#4527A0'];
function getInitialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length];
}

const { width: screenWidth } = Dimensions.get('window');

// ============================================
// COMPONENT
// ============================================

export interface HourlyWizardProps {
  visible: boolean;
  onClose: () => void;
  onInvoiceCreated?: (invoice: InvoiceDB) => void;
  /**
   * Called when the user taps "Edit logged hours" from inside Step 1.
   * Parent should close the wizard silently (no discard prompt) and
   * navigate to /hours. The wizard state resets on next open.
   */
  onEditHoursRequest?: () => void;
}

export function HourlyWizard({ visible, onClose, onInvoiceCreated, onEditHoursRequest }: HourlyWizardProps) {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const businessProfile = useBusinessProfileStore((s) => s.profile);
  const invoiceStore = useInvoiceStore();
  const showSnackbar = useSnackbarStore((s) => s.show);

  // ===== HOURLY WIZARD STATE =====
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardRateOverride, setWizardRateOverride] = useState<number | null>(null);

  // ===== CALENDAR STATE =====
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const goToPreviousMonth = () => {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(d);
  };
  const goToNextMonth = () => {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(d);
  };
  const goToCurrentMonth = () => {
    const d = new Date();
    d.setDate(1);
    setCurrentMonth(d);
  };

  // ===== DAILY HOURS DATA (replaces session-based getTotalMinutesForDay) =====
  // Cached map of date(YYYY-MM-DD) → total_minutes for the visible window.
  const [monthHoursMap, setMonthHoursMap] = useState<Record<string, number>>({});
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    if (!userId || !visible) return;
    // Fetch a wide window covering the current month and one month either side
    // so range picks across month boundaries still resolve hours.
    const start = new Date(currentMonth);
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    const end = new Date(currentMonth);
    end.setMonth(end.getMonth() + 2);
    end.setDate(0);
    const entries = getDailyHoursByPeriod(
      userId,
      toLocalDateString(start),
      toLocalDateString(end),
    );
    const map: Record<string, number> = {};
    for (const e of entries) map[e.date] = e.total_minutes || 0;
    setMonthHoursMap(map);
  }, [userId, visible, currentMonth, dataVersion]);

  const getTotalMinutesForDay = useCallback(
    (date: Date) => monthHoursMap[toLocalDateString(date)] || 0,
    [monthHoursMap],
  );

  // ===== DATE RANGE STATE =====
  const [dateRangeMode] = useState(true); // wizard is always range mode
  const [rangeStartDate, setRangeStartDate] = useState<Date | null>(null);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [rangeDays, setRangeDays] = useState<DailyHoursEntry[]>([]);

  // ===== HOURLY CLIENT =====
  const [hourlyClientName, setHourlyClientName] = useState('');
  const [hourlyClientStreet, setHourlyClientStreet] = useState('');
  const [hourlyClientCity, setHourlyClientCity] = useState('');
  const [hourlyClientProvince, setHourlyClientProvince] = useState('');
  const [hourlyClientPostal, setHourlyClientPostal] = useState('');
  const [hourlyClientPhone, setHourlyClientPhone] = useState('');
  const [showNewClientInput, setShowNewClientInput] = useState(false);
  const [showWizardClientEdit, setShowWizardClientEdit] = useState(false);

  // ===== MANUAL HOURS FALLBACK =====
  const [manualHoursText, setManualHoursText] = useState('');
  const [manualHoursConfirmed, setManualHoursConfirmed] = useState(false);

  // ===== ZERO HOURS SNACKBAR =====
  const [showZeroSnackbar, setShowZeroSnackbar] = useState(false);

  // ===== DUE DATE =====
  const [hourlyDueDateObj, setHourlyDueDateObj] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  });
  const [showHourlyDuePicker, setShowHourlyDuePicker] = useState(false);

  // ===== EXPORTING / SUCCESS =====
  const [isExporting, setIsExporting] = useState(false);
  const [pendingSuccessModal, setPendingSuccessModal] = useState(false);
  const [pendingSuccessInvoice, setPendingSuccessInvoice] = useState<InvoiceDB | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (!visible) return;
    setWizardStep(1);
    setWizardRateOverride(null);
    setRangeStartDate(null);
    setRangeEndDate(null);
    setRangeDays([]);
    setHourlyClientName('');
    setHourlyClientStreet('');
    setHourlyClientCity('');
    setHourlyClientProvince('');
    setHourlyClientPostal('');
    setHourlyClientPhone('');
    setShowNewClientInput(false);
    setManualHoursText('');
    setManualHoursConfirmed(false);
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setHourlyDueDateObj(d);
  }, [visible]);

  // Last invoice date per client name
  const lastInvoiceByClient = useMemo(() => {
    const map: Record<string, string> = {};
    for (const inv of invoiceStore.recentInvoices) {
      if (inv.client_name && !map[inv.client_name]) {
        map[inv.client_name] = new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    }
    return map;
  }, [invoiceStore.recentInvoices]);

  // ===== HANDLERS (verbatim from timekeeper) =====

  const handleDateRangeSelect = async (date: Date) => {
    if (!dateRangeMode || !userId) return;
    if (!rangeStartDate || (rangeStartDate && rangeEndDate)) {
      // If range is complete, restart selection on tap
      setRangeStartDate(date);
      setRangeEndDate(null);
      setRangeDays([]);
      setManualHoursText('');
      setManualHoursConfirmed(false);
    } else {
      let startDate = rangeStartDate;
      let endDate = date;
      if (date < rangeStartDate) { startDate = date; endDate = rangeStartDate; }
      setRangeStartDate(startDate);
      setRangeEndDate(endDate);
      try {
        const entries = getDailyHoursByPeriod(
          userId,
          toLocalDateString(startDate),
          toLocalDateString(endDate),
        );
        setRangeDays(entries.filter((e) => e.total_minutes > 0));
      } catch (err) {
        logger.error('ui', 'Error fetching date range daily hours', { error: String(err) });
      }
    }
  };

  const isInDateRange = (date: Date): RangePosition => {
    if (!rangeStartDate) return null;
    const dateTime = new Date(date).setHours(0, 0, 0, 0);
    const startTime = new Date(rangeStartDate).setHours(0, 0, 0, 0);
    if (!rangeEndDate) {
      if (dateTime === startTime) return 'single';
      return null;
    }
    const endTime = new Date(rangeEndDate).setHours(0, 0, 0, 0);
    if (dateTime === startTime && dateTime === endTime) return 'single';
    if (dateTime === startTime) return 'start';
    if (dateTime === endTime) return 'end';
    if (dateTime > startTime && dateTime < endTime) return 'middle';
    return null;
  };

  const rangeTotalMinutes = useMemo(() => {
    return rangeDays.reduce((total, d) => total + Math.max(0, d.total_minutes || 0), 0);
  }, [rangeDays]);

  const rangeDaysWorked = useMemo(() => {
    return rangeDays.filter((d) => (d.total_minutes || 0) > 0).length;
  }, [rangeDays]);

  const manualTotalMinutes = manualHoursConfirmed
    ? Math.round((parseFloat(manualHoursText.replace(',', '.')) || 0) * 60)
    : 0;

  // Build TimeTableDay[] for wizard Step 3
  const wizardDays: TimeTableDay[] = useMemo(() => {
    if (manualHoursConfirmed) return [];
    return rangeDays.map((d) => {
      const dateObj = new Date(d.date + 'T12:00:00');
      return {
        id: d.id,
        date: d.date,
        dateLabel: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        inLabel: d.first_entry || '—',
        outLabel: d.last_exit || '—',
        breakLabel: d.break_minutes > 0 ? `${d.break_minutes}m` : '—',
        totalLabel: formatDuration(d.total_minutes || 0),
        totalMinutes: d.total_minutes || 0,
        rawEntry: d,
      };
    });
  }, [rangeDays, manualHoursConfirmed]);

  const cancelDateRange = () => {
    setRangeStartDate(null);
    setRangeEndDate(null);
    setRangeDays([]);
    setHourlyClientName('');
    setHourlyClientStreet('');
    setHourlyClientCity('');
    setHourlyClientProvince('');
    setHourlyClientPostal('');
    setHourlyClientPhone('');
    setShowNewClientInput(false);
    setManualHoursText('');
    setManualHoursConfirmed(false);
  };

  interface RecipientOption {
    type: 'saved' | 'contact';
    name: string;
    subtitle: string;
    phone: string;
    clientData?: typeof invoiceStore.clients[0];
  }

  const handleSelectRecipient = (recipient: RecipientOption) => {
    setHourlyClientName(recipient.name);
    setHourlyClientPhone(recipient.phone);
    if (recipient.type === 'saved' && recipient.clientData) {
      setHourlyClientStreet(recipient.clientData.address_street || '');
      setHourlyClientCity(recipient.clientData.address_city || '');
      setHourlyClientProvince(recipient.clientData.address_province || '');
      setHourlyClientPostal(recipient.clientData.address_postal_code || '');
    } else {
      setHourlyClientStreet('');
      setHourlyClientCity('');
      setHourlyClientProvince('');
      setHourlyClientPostal('');
    }
  };

  const handleRecipientNext = () => {
    if (!hourlyClientName.trim()) {
      Alert.alert('Missing Recipient', 'Please enter or select a recipient name.');
      return;
    }
    setWizardStep(3);
  };

  const handleWizardBack = () => {
    if (wizardStep === 1) handleWizardClose();
    else setWizardStep((wizardStep - 1) as 1 | 2 | 3);
  };

  const handleWizardClose = () => {
    if (rangeStartDate || hourlyClientName) {
      Alert.alert('Discard this invoice?', 'Your progress will be lost.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            cancelDateRange();
            setWizardStep(1);
            setWizardRateOverride(null);
            onClose();
          },
        },
      ]);
    } else {
      cancelDateRange();
      setWizardStep(1);
      setWizardRateOverride(null);
      onClose();
    }
  };

  // Shared core: saves client + creates hourly invoice
  const generateHourlyInvoiceCore = useCallback(async () => {
    if (!userId || !rangeStartDate || !rangeEndDate) return null;

    if (hourlyClientName.trim()) {
      invoiceStore.saveClient({
        userId,
        clientName: hourlyClientName.trim(),
        addressStreet: hourlyClientStreet,
        addressCity: hourlyClientCity,
        addressProvince: hourlyClientProvince,
        addressPostalCode: hourlyClientPostal,
        phone: hourlyClientPhone || null,
      });
    }

    const startStr = toLocalDateString(rangeStartDate);
    const endStr = toLocalDateString(rangeEndDate);
    const days = getDailyHoursByPeriod(userId, startStr, endStr);

    return invoiceStore.createHourlyInvoice({
      userId,
      clientName: hourlyClientName.trim() || 'Client',
      clientAddress: {
        street: hourlyClientStreet,
        city: hourlyClientCity,
        province: hourlyClientProvince,
        postalCode: hourlyClientPostal,
        phone: hourlyClientPhone || null,
      },
      days: days as unknown as DailyHoursDB[],
      hourlyRate: wizardRateOverride ?? (businessProfile?.default_hourly_rate || 0),
      taxRate: businessProfile?.tax_rate || 0,
      periodStart: startStr,
      periodEnd: endStr,
      dueDate: toLocalDateString(hourlyDueDateObj),
    });
  }, [userId, rangeStartDate, rangeEndDate, hourlyClientName, hourlyClientStreet, hourlyClientCity, hourlyClientProvince, hourlyClientPostal, hourlyClientPhone, wizardRateOverride, businessProfile, hourlyDueDateObj, invoiceStore]);

  const handleGenerateHourlyInvoice = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const result = await generateHourlyInvoiceCore();
      if (result) {
        setWizardStep(1);
        setWizardRateOverride(null);
        cancelDateRange();
        if (Platform.OS === 'ios') {
          // iOS: defer share/notify until wizard's onDismiss fires
          setPendingSuccessInvoice(result);
          setPendingSuccessModal(true);
          onClose();
        } else {
          // Android: onDismiss is iOS-only, so delay via setTimeout
          onClose();
          setTimeout(async () => {
            if (userId && result.pdf_uri) await shareInvoice(userId, result);
            onInvoiceCreated?.(result);
          }, 350);
        }
      } else {
        Alert.alert('Error', 'Failed to create invoice.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate invoice');
    } finally {
      setIsExporting(false);
    }
  };

  // Wizard Step 3: edit TO card → generate invoice, close wizard, navigate to /client-edit
  const handleEditClientFromWizard = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const result = await generateHourlyInvoiceCore();
      if (!result) { Alert.alert('Error', 'Failed to create invoice.'); return; }

      setWizardStep(1);
      setWizardRateOverride(null);
      cancelDateRange();
      onClose();

      setTimeout(() => {
        showSnackbar(`Invoice ${result.invoice_number} saved`);
        router.push({
          pathname: '/client-edit',
          params: {
            invoiceId: result.id,
            invoiceNumber: result.invoice_number,
            clientName: result.client_name || '',
          },
        } as any);
      }, Platform.OS === 'ios' ? 100 : 350);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate invoice');
    } finally {
      setIsExporting(false);
    }
  }, [generateHourlyInvoiceCore, isExporting, showSnackbar, router, onClose]);

  // Wizard Step 3: edit FROM card → generate invoice, close wizard, navigate to /business-profile
  const handleEditFromFromWizard = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const result = await generateHourlyInvoiceCore();
      if (!result) { Alert.alert('Error', 'Failed to create invoice.'); return; }

      setWizardStep(1);
      setWizardRateOverride(null);
      cancelDateRange();
      onClose();

      setTimeout(() => {
        showSnackbar(`Invoice ${result.invoice_number} saved`);
        router.push({
          pathname: '/business-profile',
          params: {
            invoiceId: result.id,
            invoiceNumber: result.invoice_number,
          },
        } as any);
      }, Platform.OS === 'ios' ? 100 : 350);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate invoice');
    } finally {
      setIsExporting(false);
    }
  }, [generateHourlyInvoiceCore, isExporting, showSnackbar, router, onClose]);

  // ============================================
  // WIZARD COMPUTED VALUES
  // ============================================
  const rangeStep = !rangeStartDate ? 'start' : !rangeEndDate ? 'end' : 'complete';
  const canGenerate = rangeStartDate && rangeEndDate;
  const hasZeroHours = rangeDays.length === 0 && !manualHoursConfirmed;

  const emptyDaysInRange = useMemo(() => {
    if (!rangeStartDate || !rangeEndDate) return 0;
    let count = 0;
    const d = new Date(rangeStartDate);
    const end = new Date(rangeEndDate);
    d.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    while (d <= end) {
      if (getTotalMinutesForDay(d) === 0) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }, [rangeStartDate, rangeEndDate, getTotalMinutesForDay]);

  // Show zero-hours snackbar for 3s when range is complete with no daily hours
  useEffect(() => {
    if (rangeStep === 'complete' && rangeDays.length === 0 && !manualHoursConfirmed) {
      setShowZeroSnackbar(true);
      const timer = setTimeout(() => setShowZeroSnackbar(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowZeroSnackbar(false);
    }
  }, [rangeStep, rangeDays.length, manualHoursConfirmed]);

  const formatDueDateDisplay = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const openHourlyDueDatePicker = useCallback(() => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: hourlyDueDateObj,
        mode: 'date',
        display: 'calendar',
        onChange: (_e: DateTimePickerEvent, date?: Date) => {
          if (date) setHourlyDueDateObj(date);
        },
      });
    } else {
      setShowHourlyDuePicker(true);
    }
  }, [hourlyDueDateObj]);

  // ============================================
  // RENDER
  // ============================================
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleWizardClose}
      onDismiss={() => {
        if (pendingSuccessModal && pendingSuccessInvoice) {
          const invoice = pendingSuccessInvoice;
          setPendingSuccessModal(false);
          setPendingSuccessInvoice(null);
          (async () => {
            if (userId && invoice.pdf_uri) await shareInvoice(userId, invoice);
            onInvoiceCreated?.(invoice);
          })();
        }
      }}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={wizardStyles.overlay}>
          <View style={wizardStyles.sheet}>

            {/* Shared header: back + title + dots */}
            <View style={wizardStyles.header}>
              <PressableOpacity style={wizardStyles.backBtn} onPress={handleWizardBack}>
                <Ionicons name="arrow-back" size={20} color={colors.text} />
              </PressableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={wizardStyles.headerTitle}>
                  {wizardStep === 1 ? 'Timesheet Invoice' : wizardStep === 2 ? 'Send To' : 'Invoice Summary'}
                </Text>
              </View>
              <View style={wizardStyles.dotsRow}>
                {[1, 2, 3].map(i => (
                  <View key={i} style={[wizardStyles.dot, i <= wizardStep && wizardStyles.dotActive]} />
                ))}
              </View>
              <PressableOpacity onPress={handleWizardClose} hitSlop={8} style={{ marginLeft: spacing.md }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </PressableOpacity>
            </View>

            {/* ===== STEP 1: Calendar ===== */}
            {wizardStep === 1 && (
              <>
                <View style={wizardStyles.calendarNav}>
                  <PressableOpacity style={historyStyles.navBtn} onPress={goToPreviousMonth}>
                    <Ionicons name="chevron-back" size={22} color={colors.primary} />
                  </PressableOpacity>
                  <PressableOpacity onPress={goToCurrentMonth} style={historyStyles.calendarCenter}>
                    <Text style={historyStyles.calendarTitle}>{formatMonthYear(currentMonth)}</Text>
                  </PressableOpacity>
                  <PressableOpacity style={historyStyles.navBtn} onPress={goToNextMonth}>
                    <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                  </PressableOpacity>
                </View>

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Instruction + DATE SELECTION CARDS (above calendar) */}
                  <Text style={datePickerStyles.sectionTitle}>
                    {rangeStep === 'complete'
                      ? 'Date range selected'
                      : 'Select the date range for this invoice'}
                  </Text>

                  <View style={datePickerStyles.dateCardsRow}>
                    <PressableOpacity
                      style={[
                        datePickerStyles.dateCard,
                        rangeStep === 'start' && datePickerStyles.dateCardActive,
                        rangeStartDate && datePickerStyles.dateCardFilled,
                      ]}
                      onPress={() => { setRangeStartDate(null); setRangeEndDate(null); setRangeDays([]); }}
                    >
                      <Text style={datePickerStyles.dateCardLabel}>START</Text>
                      {rangeStartDate ? (
                        <Text style={[datePickerStyles.dateCardValue, datePickerStyles.dateCardValueFilled]}>
                          {rangeStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                      ) : (
                        <Text style={datePickerStyles.dateCardPlaceholder}>Tap a day</Text>
                      )}
                    </PressableOpacity>

                    <View style={datePickerStyles.dateCardsArrow}>
                      <Ionicons name="arrow-forward" size={18} color={rangeStep === 'complete' ? colors.primary : colors.textMuted} />
                    </View>

                    <View
                      style={[
                        datePickerStyles.dateCard,
                        rangeStep === 'end' && datePickerStyles.dateCardActive,
                        rangeEndDate && datePickerStyles.dateCardFilled,
                      ]}
                    >
                      <Text style={datePickerStyles.dateCardLabel}>END</Text>
                      {rangeEndDate ? (
                        <Text style={[datePickerStyles.dateCardValue, datePickerStyles.dateCardValueFilled]}>
                          {rangeEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                      ) : (
                        <Text style={datePickerStyles.dateCardPlaceholder}>
                          {rangeStartDate ? 'Tap end date' : '—'}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Instruction hint */}
                  {rangeStep !== 'complete' && (
                    <View style={datePickerStyles.hintRow}>
                      <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                      <Text style={datePickerStyles.hintText}>
                        {rangeStep === 'start' ? 'Tap a day on the calendar below' : 'Now tap a day to set the end date'}
                      </Text>
                    </View>
                  )}

                  {/* Calendar */}
                  <Calendar
                    currentMonth={currentMonth}
                    onMonthChange={() => {}}
                    mode="range"
                    showHeader={false}
                    getRangePosition={isInDateRange}
                    onRangeSelect={handleDateRangeSelect}
                    getDayMinutes={(date) => getTotalMinutesForDay(date)}
                    containerWidth={screenWidth - 20}
                  />

                  {/* Warning pill for SOME empty days (mix of filled and empty) */}
                  {rangeStep === 'complete' && emptyDaysInRange > 0 && rangeDays.length > 0 && (
                    <View style={datePickerStyles.warningPill}>
                      <Ionicons name="alert-circle" size={16} color="#854F0B" />
                      <Text style={datePickerStyles.warningPillText}>
                        {emptyDaysInRange} day{emptyDaysInRange > 1 ? 's' : ''} with no hours — tap to add
                      </Text>
                    </View>
                  )}

                  {/* ====== ZERO HOURS SNACKBAR — auto-dismiss 3s ====== */}
                  {showZeroSnackbar && (
                    <View style={datePickerStyles.snackbar}>
                      <Ionicons name="information-circle-outline" size={16} color="#fff" />
                      <Text style={datePickerStyles.snackbarText}>
                        0 hours logged — invoice will be $0
                      </Text>
                    </View>
                  )}

                  {/* Edit logged hours — exit wizard to /hours and come back */}
                  {onEditHoursRequest && (
                    <PressableOpacity
                      style={datePickerStyles.editHoursBtn}
                      onPress={onEditHoursRequest}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
                      <Text style={datePickerStyles.editHoursBtnText}>Edit logged hours</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </PressableOpacity>
                  )}
                </ScrollView>

                {/* Step 1 Footer */}
                <View style={wizardStyles.footer}>
                  <PressableOpacity
                    style={[wizardStyles.btnCharcoal, !canGenerate && wizardStyles.btnDisabled]}
                    activeOpacity={0.7}
                    onPress={() => setWizardStep(2)}
                    disabled={!canGenerate}
                  >
                    <Text style={[wizardStyles.btnCharcoalText, !canGenerate && wizardStyles.btnDisabledText]}>
                      {!rangeStartDate
                        ? 'Select dates first'
                        : !rangeEndDate
                          ? 'Select end date'
                          : hasZeroHours
                            ? 'Next (0 hours) →'
                            : 'Next →'
                      }
                    </Text>
                  </PressableOpacity>
                </View>
              </>
            )}

            {/* ===== STEP 2: Send To ===== */}
            {wizardStep === 2 && (
              <View style={{ flex: 1 }}>
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
                  <View style={recipientStyles.card}>
                    <View style={recipientStyles.cardHeader}>
                      <View style={recipientStyles.stepCircle}>
                        <Text style={recipientStyles.stepCircleText}>1</Text>
                      </View>
                      <Text style={recipientStyles.cardTitle}>To</Text>
                    </View>

                    {invoiceStore.clients.slice(0, 2).map((c) => (
                      <PressableOpacity
                        key={c.id}
                        style={[recipientStyles.clientRow, hourlyClientName === c.client_name && recipientStyles.clientRowSelected]}
                        onPress={() => {
                          handleSelectRecipient({
                            type: 'saved', name: c.client_name,
                            subtitle: c.address_city || '', phone: c.phone || '',
                            clientData: c,
                          });
                        }}
                      >
                        <View style={[recipientStyles.avatar, { backgroundColor: withOpacity(getInitialsColor(c.client_name), 0.15) }]}>
                          <Text style={[recipientStyles.avatarText, { color: getInitialsColor(c.client_name) }]}>{getInitials(c.client_name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={recipientStyles.clientName}>{c.client_name}</Text>
                          <Text style={recipientStyles.clientSub}>
                            {lastInvoiceByClient[c.client_name]
                              ? `Last invoice: ${lastInvoiceByClient[c.client_name]}`
                              : c.address_city || 'No invoices yet'}
                          </Text>
                        </View>
                        {hourlyClientName === c.client_name
                          ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                          : (
                            <PressableOpacity
                              onPress={() => userId && invoiceStore.removeClient(userId, c.id)}
                              style={recipientStyles.deleteClientBtn}
                              hitSlop={8}
                            >
                              <Ionicons name="close" size={16} color={colors.textMuted} />
                            </PressableOpacity>
                          )
                        }
                      </PressableOpacity>
                    ))}

                    {!showNewClientInput ? (
                      <PressableOpacity style={recipientStyles.newClientBtn} onPress={() => setShowNewClientInput(true)}>
                        <Ionicons name="add" size={20} color={colors.textSecondary} />
                        <Text style={recipientStyles.newClientBtnText}>New client</Text>
                      </PressableOpacity>
                    ) : (
                      <View style={recipientStyles.newClientInputRow}>
                        <TextInput
                          style={recipientStyles.newClientInput}
                          placeholder="Send to..."
                          placeholderTextColor={colors.textMuted}
                          value={hourlyClientName}
                          onChangeText={setHourlyClientName}
                          autoFocus
                        />
                        <PressableOpacity
                          style={recipientStyles.fullFormBtn}
                          onPress={() => setShowWizardClientEdit(true)}
                          activeOpacity={0.7}
                          accessibilityLabel="Open full client form"
                        >
                          <Ionicons name="person-add-outline" size={20} color={colors.text} />
                        </PressableOpacity>
                      </View>
                    )}
                  </View>

                  {/* Due Date Card */}
                  <View style={[recipientStyles.card, { marginTop: 12 }]}>
                    <View style={recipientStyles.cardHeader}>
                      <View style={recipientStyles.stepCircle}>
                        <Text style={recipientStyles.stepCircleText}>2</Text>
                      </View>
                      <Text style={recipientStyles.cardTitle}>Due Date</Text>
                    </View>

                    <PressableOpacity
                      style={dueDateStyles.chip}
                      onPress={openHourlyDueDatePicker}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      <Text style={dueDateStyles.chipText}>{formatDueDateDisplay(hourlyDueDateObj)}</Text>
                      <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                    </PressableOpacity>

                    {/* iOS inline date picker */}
                    {Platform.OS === 'ios' && showHourlyDuePicker && (
                      <View style={dueDateStyles.iosPicker}>
                        <View style={dueDateStyles.iosPickerHeader}>
                          <Text style={dueDateStyles.iosPickerTitle}>Due Date</Text>
                          <PressableOpacity onPress={() => setShowHourlyDuePicker(false)}>
                            <Text style={dueDateStyles.iosPickerDone}>Done</Text>
                          </PressableOpacity>
                        </View>
                        <DateTimePicker
                          value={hourlyDueDateObj}
                          mode="date"
                          display="inline"
                          themeVariant="light"
                          onChange={(_e: DateTimePickerEvent, date?: Date) => { if (date) setHourlyDueDateObj(date); }}
                          style={{ height: 320 }}
                        />
                      </View>
                    )}
                  </View>
                </ScrollView>

                <View style={wizardStyles.footer}>
                  <PressableOpacity
                    style={[wizardStyles.btnCharcoal, !hourlyClientName.trim() && wizardStyles.btnDisabled]}
                    onPress={handleRecipientNext}
                    disabled={!hourlyClientName.trim()}
                  >
                    <Text style={[wizardStyles.btnCharcoalText, !hourlyClientName.trim() && wizardStyles.btnDisabledText]}>
                      {hourlyClientName.trim() ? 'Continue →' : 'Select or type a name'}
                    </Text>
                  </PressableOpacity>
                </View>
              </View>
            )}

            {/* ===== STEP 3: Invoice Summary ===== */}
            {wizardStep === 3 && (
              <>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 20 }} showsVerticalScrollIndicator={false}>
                  <InvoiceSummaryCard
                    clientName={hourlyClientName}
                    clientPhone={hourlyClientPhone}
                    clientAddress={[hourlyClientStreet, hourlyClientCity, hourlyClientProvince, hourlyClientPostal].filter(Boolean).join(', ') || undefined}
                    onEditClient={handleEditClientFromWizard}
                    dueDate={formatDueDateDisplay(hourlyDueDateObj)}
                    days={wizardDays}
                    totalDays={rangeDaysWorked}
                    totalMinutes={rangeTotalMinutes}
                    totalLabel={formatDuration(rangeTotalMinutes)}
                    onDayPress={() => {
                      // Day-edit modal not surfaced from wizard in operator
                      // (reachable from TimesheetSection on the main screen).
                    }}
                    manualRow={manualHoursConfirmed ? { totalLabel: formatDuration(manualTotalMinutes) } : undefined}
                    rate={wizardRateOverride ?? (businessProfile?.default_hourly_rate || 0)}
                    onRateChange={(newRate) => setWizardRateOverride(newRate)}
                    taxRate={businessProfile?.tax_rate || 0}
                    taxLabel={businessProfile?.gst_hst_number ? 'HST' : 'Tax'}
                    showZeroWarning={hasZeroHours}
                    fromName={businessProfile?.business_name || undefined}
                    fromPhone={businessProfile?.phone || undefined}
                    fromAddress={[businessProfile?.address_street, businessProfile?.address_city, businessProfile?.address_province, businessProfile?.address_postal_code].filter(Boolean).join(', ') || undefined}
                    fromEmail={businessProfile?.email || undefined}
                    onEditFrom={handleEditFromFromWizard}
                  />
                </ScrollView>

                <View style={wizardStyles.footer}>
                  <PressableOpacity
                    style={[wizardStyles.btnAmber, isExporting && { opacity: 0.6 }]}
                    onPress={handleGenerateHourlyInvoice}
                    disabled={isExporting}
                  >
                    <Ionicons name={isExporting ? 'hourglass-outline' : 'document-text-outline'} size={20} color={colors.white} />
                    <Text style={wizardStyles.btnAmberText}>
                      {isExporting ? 'Generating...' : 'Generate invoice'}
                    </Text>
                  </PressableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Client Edit Sheet (wizard) */}
      <ClientEditSheet
        visible={showWizardClientEdit}
        onClose={() => setShowWizardClientEdit(false)}
        onSave={(data: ClientFormData) => {
          setHourlyClientName(data.name);
          setHourlyClientPhone(data.phone);
          setHourlyClientStreet(data.addressStreet);
          setHourlyClientCity(data.addressCity);
          setHourlyClientProvince(data.addressProvince);
          setHourlyClientPostal(data.addressPostalCode);
          setShowWizardClientEdit(false);
        }}
        initialData={{
          name: hourlyClientName,
          phone: hourlyClientPhone,
          addressStreet: hourlyClientStreet,
          addressCity: hourlyClientCity,
          addressProvince: hourlyClientProvince,
          addressPostalCode: hourlyClientPostal,
        }}
        savedClients={invoiceStore.clients}
      />
    </Modal>
  );
}

// ============================================
// WIZARD MODAL STYLES (verbatim from timekeeper)
// ============================================
const wizardStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: colors.overlay,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 10, paddingTop: 50, paddingBottom: 30,
  },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: 20,
    flex: 1, width: '100%',
    overflow: 'hidden',
    ...shadows.lg,
  },
  handle: {
    width: 36, height: 4, backgroundColor: colors.borderWarm,
    borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18, fontWeight: '700', color: colors.text,
  },
  dotsRow: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  calendarNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  footer: {
    paddingHorizontal: 20, paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  // Charcoal button (Step 1→2, 2→3)
  btnCharcoal: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
    backgroundColor: colors.charcoal, minHeight: 56,
  },
  btnCharcoalText: {
    fontSize: 16, fontWeight: '700', color: colors.white,
  },
  // Disabled button
  btnDisabled: {
    backgroundColor: colors.borderLight,
  },
  btnDisabledText: {
    color: colors.iconMuted,
  },
  // Final action button — teal accent (matches operator's primary action color)
  btnAmber: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
    backgroundColor: colors.accent, minHeight: 56,
  },
  btnAmberText: {
    fontSize: 16, fontWeight: '700', color: colors.white,
  },
});

// ============================================
// DUE DATE STYLES
// ============================================
const dueDateStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceMuted, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 0.5, borderColor: colors.border,
  },
  chipText: {
    fontSize: 15, fontWeight: '600', color: colors.text, flex: 1,
  },
  iosPicker: {
    backgroundColor: colors.white, borderRadius: 12,
    borderWidth: 0.5, borderColor: colors.border,
    marginTop: 8, overflow: 'hidden',
  },
  iosPickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  iosPickerTitle: {
    fontSize: 14, fontWeight: '600', color: colors.text,
  },
  iosPickerDone: {
    fontSize: 14, fontWeight: '600', color: colors.primary,
  },
});

// ============================================
// RECIPIENT MODAL STYLES (card-based)
// ============================================
const recipientStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 12,
  },
  stepCircle: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.surfaceMuted, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepCircleText: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
  },
  cardTitle: {
    fontSize: 16, fontWeight: '700', color: colors.text,
  },
  clientRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: 12, marginBottom: 4,
  },
  clientRowSelected: {
    backgroundColor: withOpacity(colors.primary, 0.08),
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14, fontWeight: '700',
  },
  clientName: {
    fontSize: 15, fontWeight: '600', color: colors.text,
  },
  clientSub: {
    fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginTop: 2,
  },
  deleteClientBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  newClientBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, marginTop: 4,
    borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: colors.border,
  },
  newClientBtnText: {
    fontSize: 14, fontWeight: '600', color: colors.textSecondary,
  },
  newClientInputRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newClientInput: {
    flex: 1,
    fontSize: 15, fontWeight: '500', color: colors.text,
    backgroundColor: colors.surfaceMuted, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.primary,
  },
  fullFormBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ============================================
// HISTORY/CALENDAR NAV STYLES (verbatim from timekeeper)
// ============================================
const historyStyles = StyleSheet.create({
  navBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center', alignItems: 'center',
  },
  calendarTitle: {
    fontSize: 18, fontWeight: '600', color: colors.text, textAlign: 'center',
  },
  calendarCenter: {
    alignItems: 'center', flex: 1,
  },
});

// ============================================
// DATE PICKER STYLES (Airbnb-style range picker)
// ============================================
const datePickerStyles = StyleSheet.create({
  sectionTitle: {
    fontSize: 15, fontWeight: '600', color: colors.text,
    marginBottom: 12, marginTop: 4,
  },
  dateCardsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  dateCard: {
    flex: 1, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1.5,
    borderColor: colors.border, borderStyle: 'dashed',
    backgroundColor: colors.surfaceMuted,
  },
  dateCardActive: {
    borderColor: colors.primary, borderStyle: 'solid',
    backgroundColor: withOpacity(colors.primary, 0.06),
  },
  dateCardFilled: {
    borderColor: colors.primary, borderStyle: 'solid',
    backgroundColor: withOpacity(colors.primary, 0.1),
  },
  dateCardLabel: {
    fontSize: 12, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
  },
  dateCardValue: {
    fontSize: 18, fontWeight: '700', color: colors.text,
  },
  dateCardValueFilled: {
    color: colors.primary,
  },
  dateCardPlaceholder: {
    fontSize: 15, fontWeight: '500', color: colors.textMuted,
  },
  dateCardsArrow: {
    paddingHorizontal: 2, paddingTop: 12,
  },
  hintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  hintText: {
    fontSize: 13, fontWeight: '500', color: colors.primary,
  },
  warningPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 20, backgroundColor: '#FFF8E7',
    marginTop: 4, alignSelf: 'flex-start',
  },
  warningPillText: {
    fontSize: 13, fontWeight: '500', color: '#854F0B',
  },
  snackbar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 6,
    backgroundColor: '#333', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  snackbarText: {
    fontSize: 13, fontWeight: '500', color: '#fff', flex: 1,
  },
  editHoursBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, marginTop: 12,
    borderRadius: 12,
    borderWidth: 1, borderStyle: 'dashed',
    borderColor: colors.border,
  },
  editHoursBtnText: {
    fontSize: 14, fontWeight: '500', color: colors.textSecondary,
  },
});

export default HourlyWizard;
