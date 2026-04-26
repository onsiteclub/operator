/**
 * Invoice tab — OnSite Operator
 *
 * Single tab that combines what used to be the Reports + Invoice tabs:
 *   - Calendar with hours per day (TimesheetSection — tap a day to edit)
 *   - "Generate Invoice" button → 3-step wizard (range → client → review → PDF)
 *   - Recent invoices list (tap to re-share PDF)
 *
 * The previous Reports queue stats (delivered/pending/alerts) and the
 * frm_daily_reports archive are gone — they belong to the request flow
 * which lives in the Requests tab.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Modal, Alert,
  ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, typography, withOpacity } from '@onsite/tokens';

import { Calendar, type RangePosition } from '../../src/components/Calendar';
import { ClientEditSheet, type ClientFormData } from '../../src/screens/invoice/ClientEditSheet';
import { TimesheetSection } from '../../src/screens/timesheet/TimesheetSection';
import { useAuthStore } from '../../src/stores/authStore';
import { useBusinessProfileStore } from '../../src/stores/businessProfileStore';
import { useInvoiceStore, type ClientAddress } from '../../src/stores/invoiceStore';
import { getDailyHoursByPeriod } from '../../src/lib/database/daily';
import type { DailyHoursDB, InvoiceDB } from '../../src/lib/database/core';
import { formatMoney } from '../../src/lib/format';
import { formatDuration } from '../../src/lib/database';
import { shareInvoice } from '../../src/lib/invoiceShare';
import {
  isSameDay,
  formatDateRange,
} from '../../src/screens/home/helpers';

// ============================================
// HELPERS
// ============================================

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isWithinRange(date: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const t = date.getTime();
  return t >= Math.min(start.getTime(), end.getTime())
      && t <= Math.max(start.getTime(), end.getTime());
}

// ============================================
// SCREEN
// ============================================

export default function InvoiceScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const businessProfile = useBusinessProfileStore((s) => s.profile);
  const loadProfile = useBusinessProfileStore((s) => s.loadProfile);

  const invoiceStore = useInvoiceStore();
  const recentInvoices = useInvoiceStore((s) => s.recentInvoices);
  const thisMonthTotal = useInvoiceStore((s) => s.thisMonthTotal);
  const thisMonthCount = useInvoiceStore((s) => s.thisMonthCount);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceDB | null>(null);

  useEffect(() => {
    if (!userId) return;
    invoiceStore.loadDashboard(userId);
    loadProfile(userId);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openWizard = () => {
    if (!businessProfile) {
      Alert.alert(
        'Business profile needed',
        'Set up your business profile before creating invoices.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Set up', onPress: () => router.push('/business-profile') },
        ],
      );
      return;
    }
    setWizardOpen(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Invoice</Text>
          <Text style={styles.subtitle}>
            {thisMonthCount === 0
              ? 'No invoices this month'
              : `${thisMonthCount} this month · ${formatMoney(thisMonthTotal)}`}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/business-profile')}
          hitSlop={10}
          style={styles.settingsBtn}
          accessibilityLabel="Business profile"
        >
          <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          style={styles.generateBtn}
          onPress={openWizard}
          accessibilityLabel="Generate invoice"
        >
          <Ionicons name="add" size={20} color={colors.background} />
          <Text style={styles.generateBtnText}>Generate</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <TimesheetSection />

        <Text style={styles.sectionLabel}>Recent invoices</Text>
        {recentInvoices.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No invoices yet</Text>
            <Text style={styles.emptyHint}>
              Tap Generate to create an invoice from your logged hours.
            </Text>
          </View>
        ) : (
          recentInvoices.map((inv) => (
            <Pressable
              key={inv.id}
              style={styles.invoiceRow}
              onPress={() => setDetail(inv)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.invoiceNumber}>{inv.invoice_number}</Text>
                <Text style={styles.invoiceMeta} numberOfLines={1}>
                  {inv.client_name || 'No client'}
                  {inv.period_start && inv.period_end
                    ? ` · ${formatDateRange(new Date(inv.period_start + 'T12:00'), new Date(inv.period_end + 'T12:00'))}`
                    : ''}
                </Text>
              </View>
              <Text style={styles.invoiceTotal}>{formatMoney(inv.total)}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      <HourlyWizard
        visible={wizardOpen}
        onClose={() => setWizardOpen(false)}
      />

      <InvoiceDetailModal
        invoice={detail}
        onClose={() => setDetail(null)}
      />
    </SafeAreaView>
  );
}

// ============================================
// HOURLY WIZARD
// ============================================

type WizardStep = 1 | 2 | 3;

function HourlyWizard({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const businessProfile = useBusinessProfileStore((s) => s.profile);
  const invoiceStore = useInvoiceStore();
  const savedClients = useInvoiceStore((s) => s.clients);

  const [step, setStep] = useState<WizardStep>(1);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [days, setDays] = useState<DailyHoursDB[]>([]);

  const [clientSheetOpen, setClientSheetOpen] = useState(false);
  const [clientForm, setClientForm] = useState<ClientFormData | null>(null);

  const [hourlyRate, setHourlyRate] = useState<string>('');
  const [taxRate, setTaxRate] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep(1);
    setCalendarMonth(new Date());
    setRangeStart(null);
    setRangeEnd(null);
    setDays([]);
    setClientForm(null);
    setHourlyRate(businessProfile?.default_hourly_rate?.toString() || '');
    setTaxRate(businessProfile?.tax_rate?.toString() || '');
    setNotes('');
    setSubmitting(false);
  }, [visible, businessProfile]);

  useEffect(() => {
    if (!userId || !rangeStart || !rangeEnd) {
      setDays([]);
      return;
    }
    const start = rangeStart < rangeEnd ? rangeStart : rangeEnd;
    const end = rangeStart < rangeEnd ? rangeEnd : rangeStart;
    const fetched = getDailyHoursByPeriod(userId, ymd(start), ymd(end)) as unknown as DailyHoursDB[];
    setDays(fetched);
  }, [userId, rangeStart, rangeEnd]);

  const onRangeSelect = (date: Date) => {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(date);
      setRangeEnd(null);
      return;
    }
    if (date < rangeStart) {
      setRangeEnd(rangeStart);
      setRangeStart(date);
    } else {
      setRangeEnd(date);
    }
  };

  const getRangePosition = (date: Date): RangePosition => {
    if (!rangeStart) return null;
    if (rangeStart && !rangeEnd && isSameDay(date, rangeStart)) return 'single';
    if (rangeStart && rangeEnd) {
      const start = rangeStart < rangeEnd ? rangeStart : rangeEnd;
      const end = rangeStart < rangeEnd ? rangeEnd : rangeStart;
      if (isSameDay(date, start)) return 'start';
      if (isSameDay(date, end)) return 'end';
      if (isWithinRange(date, start, end)) return 'middle';
    }
    return null;
  };

  const totalMinutes = useMemo(
    () => days.reduce((sum, d) => sum + (d.total_minutes || 0), 0),
    [days],
  );
  const totalHours = totalMinutes / 60;

  const rateNum = parseFloat(hourlyRate) || 0;
  const taxNum = parseFloat(taxRate) || 0;
  const subtotal = Math.round(totalHours * rateNum * 100) / 100;
  const taxAmount = Math.round(subtotal * (taxNum / 100) * 100) / 100;
  const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;

  const canStep2 = !!rangeStart && !!rangeEnd && days.length > 0;
  const canStep3 = !!clientForm?.name;
  const canSubmit = canStep2 && canStep3 && rateNum > 0 && !submitting;

  const handleClientSave = (data: ClientFormData) => {
    setClientForm(data);
    setClientSheetOpen(false);
    setStep(3);
  };

  const handleGenerate = async () => {
    if (!userId || !clientForm || !rangeStart || !rangeEnd) return;
    setSubmitting(true);

    const start = rangeStart < rangeEnd ? rangeStart : rangeEnd;
    const end = rangeStart < rangeEnd ? rangeEnd : rangeStart;

    invoiceStore.saveClient({
      userId,
      clientName: clientForm.name,
      addressStreet: clientForm.addressStreet,
      addressCity: clientForm.addressCity,
      addressProvince: clientForm.addressProvince,
      addressPostalCode: clientForm.addressPostalCode,
      email: clientForm.email || null,
      phone: clientForm.phone || null,
    });

    const clientAddress: ClientAddress = {
      street: clientForm.addressStreet,
      city: clientForm.addressCity,
      province: clientForm.addressProvince,
      postalCode: clientForm.addressPostalCode,
      email: clientForm.email || null,
      phone: clientForm.phone || null,
    };

    const invoice = await invoiceStore.createHourlyInvoice({
      userId,
      clientName: clientForm.name,
      clientAddress,
      days,
      hourlyRate: rateNum,
      taxRate: taxNum,
      periodStart: ymd(start),
      periodEnd: ymd(end),
      notes: notes.trim() || undefined,
    });

    setSubmitting(false);
    if (!invoice) {
      Alert.alert('Error', 'Could not create invoice. Try again.');
      return;
    }

    if (invoice.pdf_uri) {
      await shareInvoice(userId, invoice);
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.wizardRoot} edges={['top']}>
        <View style={styles.wizardHeader}>
          <Pressable
            onPress={() => (step === 1 ? onClose() : setStep((step - 1) as WizardStep))}
            hitSlop={10}
            style={styles.wizardBack}
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.wizardTitle}>
            {step === 1 ? 'Pick dates' : step === 2 ? 'Send to' : 'Review'}
          </Text>
          <Text style={styles.wizardStep}>{step}/3</Text>
        </View>

        {step === 1 ? (
          <ScrollView contentContainerStyle={styles.wizardBody}>
            <Calendar
              currentMonth={calendarMonth}
              onMonthChange={setCalendarMonth}
              mode="range"
              getRangePosition={getRangePosition}
              onRangeSelect={onRangeSelect}
              getDayMinutes={() => 0}
              disableFutureDates
            />
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Range</Text>
              <Text style={styles.summaryValue}>
                {rangeStart && rangeEnd
                  ? formatDateRange(
                      rangeStart < rangeEnd ? rangeStart : rangeEnd,
                      rangeStart < rangeEnd ? rangeEnd : rangeStart,
                    )
                  : rangeStart
                    ? `${rangeStart.toDateString()} (pick end)`
                    : 'Tap two days'}
              </Text>
              <Text style={styles.summarySub}>
                {days.length} day{days.length === 1 ? '' : 's'} · {formatDuration(totalMinutes)}
              </Text>
            </View>
          </ScrollView>
        ) : null}

        {step === 2 ? (
          <ScrollView contentContainerStyle={styles.wizardBody}>
            {savedClients.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Saved clients</Text>
                {savedClients.map((c) => (
                  <Pressable
                    key={c.id}
                    style={styles.clientRow}
                    onPress={() => {
                      setClientForm({
                        name: c.client_name,
                        phone: c.phone || '',
                        email: c.email || '',
                        addressStreet: c.address_street || '',
                        addressCity: c.address_city || '',
                        addressProvince: c.address_province || '',
                        addressPostalCode: c.address_postal_code || '',
                      });
                      setStep(3);
                    }}
                  >
                    <View style={styles.clientAvatar}>
                      <Text style={styles.clientAvatarText}>
                        {c.client_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.clientName}>{c.client_name}</Text>
                      {c.address_city ? (
                        <Text style={styles.clientSub}>{c.address_city}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  </Pressable>
                ))}
              </>
            ) : null}

            <Pressable style={styles.newClientBtn} onPress={() => setClientSheetOpen(true)}>
              <Ionicons name="person-add" size={18} color={colors.accent} />
              <Text style={styles.newClientBtnText}>New client</Text>
            </Pressable>
          </ScrollView>
        ) : null}

        {step === 3 ? (
          <ScrollView contentContainerStyle={styles.wizardBody}>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Send to</Text>
              <Text style={styles.reviewValue}>{clientForm?.name}</Text>
              {clientForm?.addressCity ? (
                <Text style={styles.reviewSub}>
                  {[clientForm.addressCity, clientForm.addressProvince].filter(Boolean).join(', ')}
                </Text>
              ) : null}
            </View>

            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Period</Text>
              <Text style={styles.reviewValue}>
                {rangeStart && rangeEnd
                  ? formatDateRange(
                      rangeStart < rangeEnd ? rangeStart : rangeEnd,
                      rangeStart < rangeEnd ? rangeEnd : rangeStart,
                    )
                  : '—'}
              </Text>
              <Text style={styles.reviewSub}>
                {days.length} days · {formatDuration(totalMinutes)}
              </Text>
            </View>

            <View style={styles.fieldRow}>
              <Field
                label="Hourly rate"
                value={hourlyRate}
                onChangeText={setHourlyRate}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
              <Field
                label="Tax rate (%)"
                value={taxRate}
                onChangeText={setTaxRate}
                placeholder="0"
                keyboardType="decimal-pad"
              />
            </View>

            <Field
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything else"
              multiline
            />

            <View style={styles.totalsCard}>
              <TotalsRow label="Subtotal" value={formatMoney(subtotal)} />
              {taxNum > 0 ? <TotalsRow label={`Tax (${taxNum}%)`} value={formatMoney(taxAmount)} /> : null}
              <View style={styles.totalsDivider} />
              <TotalsRow label="Total" value={formatMoney(grandTotal)} bold />
            </View>
          </ScrollView>
        ) : null}

        <View style={styles.wizardFooter}>
          {step === 1 ? (
            <Pressable
              style={[styles.primaryBtn, !canStep2 && styles.primaryBtnDisabled]}
              onPress={() => setStep(2)}
              disabled={!canStep2}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
            </Pressable>
          ) : step === 2 ? null : (
            <Pressable
              style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
              onPress={handleGenerate}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.primaryBtnText}>Generate &amp; share</Text>
              )}
            </Pressable>
          )}
        </View>

        <ClientEditSheet
          visible={clientSheetOpen}
          onClose={() => setClientSheetOpen(false)}
          onSave={handleClientSave}
          initialData={clientForm || undefined}
          savedClients={savedClients}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ============================================
// INVOICE DETAIL MODAL
// ============================================

function InvoiceDetailModal({ invoice, onClose }: { invoice: InvoiceDB | null; onClose: () => void }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [sharing, setSharing] = useState(false);

  if (!invoice) return null;

  const handleShare = async () => {
    if (!userId) return;
    setSharing(true);
    await shareInvoice(userId, invoice);
    setSharing(false);
  };

  const periodLabel = invoice.period_start && invoice.period_end
    ? formatDateRange(
        new Date(invoice.period_start + 'T12:00'),
        new Date(invoice.period_end + 'T12:00'),
      )
    : null;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.wizardRoot} edges={['top']}>
        <View style={styles.wizardHeader}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.wizardBack}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.wizardTitle}>{invoice.invoice_number}</Text>
          <View style={styles.wizardBack} />
        </View>

        <ScrollView contentContainerStyle={styles.wizardBody}>
          <View style={styles.reviewCard}>
            <Text style={styles.reviewLabel}>Send to</Text>
            <Text style={styles.reviewValue}>{invoice.client_name || '—'}</Text>
          </View>

          {periodLabel ? (
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Period</Text>
              <Text style={styles.reviewValue}>{periodLabel}</Text>
            </View>
          ) : null}

          <View style={styles.totalsCard}>
            <TotalsRow label="Subtotal" value={formatMoney(invoice.subtotal)} />
            {invoice.tax_rate > 0 ? (
              <TotalsRow label={`Tax (${invoice.tax_rate}%)`} value={formatMoney(invoice.tax_amount)} />
            ) : null}
            <View style={styles.totalsDivider} />
            <TotalsRow label="Total" value={formatMoney(invoice.total)} bold />
          </View>

          {invoice.notes ? (
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Notes</Text>
              <Text style={styles.reviewSub}>{invoice.notes}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.wizardFooter}>
          <Pressable
            style={[styles.primaryBtn, !invoice.pdf_uri && styles.primaryBtnDisabled]}
            onPress={handleShare}
            disabled={!invoice.pdf_uri || sharing}
          >
            {sharing ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.primaryBtnText}>Share PDF</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ============================================
// SHARED PRIMITIVES
// ============================================

function Field({
  label, multiline, ...input
}: {
  label: string;
  multiline?: boolean;
} & Omit<React.ComponentProps<typeof TextInput>, 'style'>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        {...input}
      />
    </View>
  );
}

function TotalsRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.totalsRow}>
      <Text style={[styles.totalsLabel, bold && styles.totalsLabelBold]}>{label}</Text>
      <Text style={[styles.totalsValue, bold && styles.totalsValueBold]}>{value}</Text>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  title: { ...typography.screenTitle },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  settingsBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  generateBtnText: { color: colors.background, fontWeight: '700', fontSize: 14 },

  body: { paddingBottom: spacing.xxl },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  invoiceNumber: { fontSize: 15, fontWeight: '700', color: colors.text },
  invoiceMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  invoiceTotal: { fontSize: 15, fontWeight: '700', color: colors.accent },

  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptyHint: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },

  // Wizard / Detail shared
  wizardRoot: { flex: 1, backgroundColor: colors.background },
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  wizardBack: { width: 40, height: 40, justifyContent: 'center' },
  wizardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  wizardStep: { fontSize: 14, color: colors.textSecondary, fontWeight: '600', width: 40, textAlign: 'right' },

  wizardBody: { padding: spacing.lg, paddingBottom: spacing.xxl },
  wizardFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.background,
  },

  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: colors.background, fontWeight: '700', fontSize: 15 },

  summaryBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
  },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5 },
  summaryValue: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 4 },
  summarySub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  clientAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center', alignItems: 'center',
  },
  clientAvatarText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  clientName: { fontSize: 15, fontWeight: '600', color: colors.text },
  clientSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  newClientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: withOpacity(colors.accent, 0.06),
  },
  newClientBtnText: { color: colors.accent, fontWeight: '700', fontSize: 14 },

  reviewCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  reviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  reviewValue: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 4 },
  reviewSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },

  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  field: { marginBottom: spacing.md, flex: 1 },
  fieldLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },

  totalsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  totalsLabel: { fontSize: 14, color: colors.textSecondary },
  totalsValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  totalsLabelBold: { color: colors.text, fontWeight: '700', fontSize: 16 },
  totalsValueBold: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  totalsDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: 6 },
});
