/**
 * Invoice tab — OnSite Operator
 *
 * Hub layout copied from onsite-timekeeper for cross-app consistency:
 *   - HeaderRow: logo + "Invoice" title + avatar (CB) → /settings
 *   - "My Profile" amber pill → /business-profile
 *   - One full-width "Timesheet Invoice" card → opens HourlyWizard
 *   - Recent invoices list (or empty state)
 *
 * Editing logged hours lives inside the wizard's Step 1 (a button
 * below the calendar). Single entry point for the /hours screen.
 *
 * Differences from timekeeper: only one invoice type (Timesheet),
 * so the two-card grid collapses to one full-width card. Calendar
 * (TimesheetSection) is no longer on the hub — it lives in /hours.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Modal,
  ActivityIndicator, Platform, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, shadows, withOpacity } from '@onsite/tokens';

import { HourlyWizard } from '../../src/screens/invoice/HourlyWizard';
import ServicesWizard from '../../src/screens/invoice/ServicesWizard';
import { InvoiceSummaryCard, type TimeTableDay, type InvoiceSummaryChanges } from '../../src/screens/invoice/InvoiceSummaryCard';
import { PressableOpacity } from '../../src/components/ui/PressableOpacity';
import { HeaderRow } from '../../src/components/ui/HeaderRow';
import { useAuthStore } from '../../src/stores/authStore';
import { useBusinessProfileStore } from '../../src/stores/businessProfileStore';
import { useInvoiceStore } from '../../src/stores/invoiceStore';
import type { InvoiceDB, InvoiceItemDB, ClientDB } from '../../src/lib/database/core';
import { formatDuration } from '../../src/lib/database/core';
import { getInvoiceItems, updateInvoiceStatus } from '../../src/lib/database/invoices';
import { getClientByName } from '../../src/lib/database/clients';
import { getDailyHoursByPeriod, updateDailyHours, type DailyHoursEntry } from '../../src/lib/database/daily';
import { formatMoney } from '../../src/lib/format';
import { shareInvoice } from '../../src/lib/invoiceShare';
import { formatDateRange } from '../../src/screens/home/helpers';

// ============================================
// SCREEN
// ============================================

export default function InvoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openWizard?: string; openInvoiceId?: string }>();
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const businessProfile = useBusinessProfileStore((s) => s.profile);
  const loadProfile = useBusinessProfileStore((s) => s.loadProfile);

  const invoiceStore = useInvoiceStore();
  const recentInvoices = useInvoiceStore((s) => s.recentInvoices);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);

  // Detail modal state (mirrors timekeeper's invoice.tsx)
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDB | null>(null);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<InvoiceItemDB[]>([]);
  const [selectedInvoiceDays, setSelectedInvoiceDays] = useState<DailyHoursEntry[]>([]);
  const [detailClientData, setDetailClientData] = useState<ClientDB | null>(null);
  const [isRegeneratingPdf, setIsRegeneratingPdf] = useState(false);

  useEffect(() => {
    if (!userId) return;
    invoiceStore.loadDashboard(userId);
    loadProfile(userId);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reopen wizard when returning from /hours via "Back to wizard"
  useEffect(() => {
    if (params.openWizard === '1' && businessProfile) {
      setWizardOpen(true);
      router.setParams({ openWizard: undefined as any });
    }
  }, [params.openWizard, businessProfile, router]);

  // Open the detail modal and pre-load every dependent piece of data
  // the InvoiceSummaryCard needs to render in dual read/edit mode:
  // line items for products invoices, daily hours for hourly invoices,
  // and the full client record for the TO card.
  const openInvoiceDetail = useCallback((inv: InvoiceDB) => {
    setSelectedInvoice(inv);
    if (inv.type === 'products_services') {
      setSelectedInvoiceItems(getInvoiceItems(inv.id));
      setSelectedInvoiceDays([]);
    } else {
      setSelectedInvoiceItems([]);
      if (userId && inv.period_start && inv.period_end) {
        setSelectedInvoiceDays(getDailyHoursByPeriod(userId, inv.period_start, inv.period_end));
      } else {
        setSelectedInvoiceDays([]);
      }
    }
    if (userId && inv.client_name) {
      setDetailClientData(getClientByName(userId, inv.client_name));
    } else {
      setDetailClientData(null);
    }
  }, [userId]);

  // Auto-open Detail modal when arriving with ?openInvoiceId=X (after a
  // successful save in /client-edit or /business-profile via the
  // "View Invoice" snackbar action).
  useEffect(() => {
    if (!params.openInvoiceId) return;
    const target = recentInvoices.find((i) => i.id === params.openInvoiceId);
    if (target) {
      openInvoiceDetail(target);
      router.setParams({ openInvoiceId: undefined as any });
    }
  }, [params.openInvoiceId, recentInvoices, router, openInvoiceDetail]);

  const handleEditHoursFromWizard = () => {
    setWizardOpen(false);
    router.push('/hours?from=wizard' as any);
  };

  // Detail modal: edit client (TO card) → close modal and route to
  // /client-edit. The InvoiceSummaryCard has already persisted any
  // pending draft via onSave before invoking this.
  const handleEditClientFromDetail = useCallback(() => {
    if (!selectedInvoice) return;
    const invoice = selectedInvoice;
    setSelectedInvoice(null);
    router.push({
      pathname: '/client-edit',
      params: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        clientName: invoice.client_name || '',
      },
    } as any);
  }, [selectedInvoice, router]);

  // Detail modal: edit business profile (FROM card)
  const handleEditFromDetail = useCallback(() => {
    if (!selectedInvoice) return;
    const invoice = selectedInvoice;
    setSelectedInvoice(null);
    router.push({
      pathname: '/business-profile',
      params: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
      },
    } as any);
  }, [selectedInvoice, router]);

  // Build TimeTableDay[] from raw daily_hours rows for the SummaryCard.
  const detailDays: TimeTableDay[] = useMemo(() => {
    return selectedInvoiceDays.map((day) => ({
      id: day.id,
      date: day.date,
      dateLabel: new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      inLabel: day.first_entry || '—',
      outLabel: day.last_exit || '—',
      breakLabel: day.break_minutes > 0 ? `${day.break_minutes}m` : '—',
      totalLabel: formatDuration(day.total_minutes),
      totalMinutes: day.total_minutes,
      rawEntry: day,
    }));
  }, [selectedInvoiceDays]);

  // Detail modal: persist edits batched by InvoiceSummaryCard's edit
  // mode (rate / tax / notes / due date / day rows / line items). The
  // store's updateInvoice() already triggers PDF regeneration.
  const handleSaveDetail = useCallback(async (changes: InvoiceSummaryChanges) => {
    if (!userId || !selectedInvoice) return;

    if (changes.dayUpdates) {
      for (const du of changes.dayUpdates) {
        updateDailyHours(userId, du.date, {
          firstEntry: du.firstEntry || undefined,
          lastExit: du.lastExit || undefined,
          breakMinutes: du.breakMinutes,
          totalMinutes: du.totalMinutes,
        });
      }
    }

    const newRate = changes.rate ?? selectedInvoice.hourly_rate ?? 0;
    const taxRateVal = changes.taxRate ?? selectedInvoice.tax_rate;
    let subtotalVal: number;
    let newItems: { description: string; quantity: number; unitPrice: number; total: number }[] | undefined;

    if (changes.lineItems) {
      newItems = changes.lineItems;
      subtotalVal = newItems.reduce((sum, i) => sum + i.total, 0);
    } else if (selectedInvoice.type === 'hourly' && (changes.dayUpdates || changes.rate !== undefined)) {
      const updatedDays = selectedInvoice.period_start && selectedInvoice.period_end
        ? getDailyHoursByPeriod(userId, selectedInvoice.period_start, selectedInvoice.period_end)
        : [];
      setSelectedInvoiceDays(updatedDays);
      const totalMins = updatedDays.reduce((sum, d) => sum + d.total_minutes, 0);
      subtotalVal = Math.round((totalMins / 60) * newRate * 100) / 100;
    } else {
      subtotalVal = selectedInvoice.subtotal;
    }

    const taxAmountVal = Math.round(subtotalVal * (taxRateVal / 100) * 100) / 100;
    const totalVal = Math.round((subtotalVal + taxAmountVal) * 100) / 100;

    const updated = await invoiceStore.updateInvoice(userId, selectedInvoice.id, {
      ...(changes.rate !== undefined && { hourlyRate: changes.rate }),
      ...(changes.taxRate !== undefined && { taxRate: changes.taxRate }),
      ...(changes.notes !== undefined && { notes: changes.notes || null }),
      ...(changes.dueDate !== undefined && { dueDate: changes.dueDate }),
      subtotal: subtotalVal,
      taxAmount: taxAmountVal,
      total: totalVal,
    }, newItems);

    if (updated) {
      setSelectedInvoice(updated);
      if (updated.type === 'hourly' && updated.period_start && updated.period_end) {
        setSelectedInvoiceDays(getDailyHoursByPeriod(userId, updated.period_start, updated.period_end));
      }
      if (updated.type === 'products_services') {
        setSelectedInvoiceItems(getInvoiceItems(updated.id));
      }
    }
  }, [userId, selectedInvoice, invoiceStore]);

  const handleShareDetail = useCallback(async () => {
    if (!userId || !selectedInvoice) return;
    setIsRegeneratingPdf(true);
    let pdfUri: string | null = null;
    try {
      pdfUri = await invoiceStore.regeneratePdf(userId, selectedInvoice);
    } finally {
      setIsRegeneratingPdf(false);
    }
    if (pdfUri) {
      await shareInvoice(userId, { ...selectedInvoice, pdf_uri: pdfUri });
    } else {
      Alert.alert('Error', 'Could not generate PDF. Please try again.');
    }
  }, [userId, selectedInvoice, invoiceStore]);

  const handleTogglePaid = useCallback(() => {
    if (!userId || !selectedInvoice) return;
    const nextStatus = selectedInvoice.status === 'paid' ? 'pending' : 'paid';
    const ok = updateInvoiceStatus(userId, selectedInvoice.id, nextStatus);
    if (!ok) {
      Alert.alert('Error', 'Could not update invoice status.');
      return;
    }
    // Optimistic local update + refresh recent list so the row reflects.
    setSelectedInvoice({ ...selectedInvoice, status: nextStatus });
    invoiceStore.loadRecentInvoices(userId);
  }, [userId, selectedInvoice, invoiceStore]);

  const handleDeleteDetail = useCallback(() => {
    if (!userId || !selectedInvoice) return;
    const invoice = selectedInvoice;
    Alert.alert(
      'Delete invoice?',
      `Delete ${invoice.invoice_number}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            invoiceStore.deleteInvoice(userId, invoice.id);
            setSelectedInvoice(null);
          },
        },
      ],
    );
  }, [userId, selectedInvoice, invoiceStore]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderRow title="Invoice" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* MY PROFILE PILL */}
        <Pressable
          style={styles.profileBtn}
          onPress={() => router.push('/business-profile')}
        >
          <Ionicons name="person-circle-outline" size={44} color={colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.profileBtnTitle}>My Profile</Text>
            <Text style={styles.profileBtnSub}>
              {businessProfile?.business_name || 'Set up your profile'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={withOpacity(colors.white, 0.6)} />
        </Pressable>

        {/* INVOICE TYPE CARDS (2-up grid, mirrors timekeeper) */}
        <View style={styles.cardsRow}>
          <Pressable
            style={styles.typeCard}
            onPress={() => setWizardOpen(true)}
          >
            <View style={styles.typeCardIcon}>
              <Ionicons name="time-outline" size={28} color={colors.accent} />
            </View>
            <Text style={styles.typeCardTitle}>Timesheet</Text>
            <Text style={styles.typeCardSubtitle}>From logged hours</Text>
          </Pressable>

          <Pressable
            style={styles.typeCard}
            onPress={() => setServicesOpen(true)}
          >
            <View style={[styles.typeCardIcon, styles.typeCardIconAmber]}>
              <Ionicons name="list-outline" size={28} color={colors.warningDark} />
            </View>
            <Text style={styles.typeCardTitle}>Services</Text>
            <Text style={styles.typeCardSubtitle}>Custom line items</Text>
          </Pressable>
        </View>

        {/* RECENT INVOICES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECENT INVOICES</Text>
          {recentInvoices.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={20} color={colors.iconMuted} />
              <Text style={styles.emptyText}>Your invoices will appear here</Text>
            </View>
          ) : (
            recentInvoices.slice(0, 10).map((inv) => (
              <Pressable
                key={inv.id}
                style={styles.invoiceRow}
                onPress={() => openInvoiceDetail(inv)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoiceNumber}>{inv.invoice_number}</Text>
                  <Text style={styles.invoiceClient} numberOfLines={1}>
                    {inv.client_name || 'No client'}
                    {inv.period_start && inv.period_end
                      ? ` · ${formatDateRange(new Date(inv.period_start + 'T12:00'), new Date(inv.period_end + 'T12:00'))}`
                      : ''}
                  </Text>
                </View>
                <Text style={styles.invoiceTotal}>{formatMoney(inv.total)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.iconMuted} style={{ marginLeft: 6 }} />
              </Pressable>
            ))
          )}
        </View>

      </ScrollView>

      <HourlyWizard
        visible={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onEditHoursRequest={handleEditHoursFromWizard}
      />

      <Modal
        visible={servicesOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setServicesOpen(false)}
      >
        <ServicesWizard onBack={() => setServicesOpen(false)} />
      </Modal>

      {/* INVOICE DETAIL MODAL — bottom-sheet hosting InvoiceSummaryCard
          in dual read/edit mode (timekeeper pattern). */}
      <Modal
        visible={!!selectedInvoice}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setSelectedInvoice(null)}
      >
        <View style={detailStyles.overlay}>
          <View style={detailStyles.sheet}>
            {selectedInvoice && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                <InvoiceSummaryCard
                  invoiceNumber={selectedInvoice.invoice_number}
                  createdAt={selectedInvoice.created_at}
                  onClose={() => setSelectedInvoice(null)}
                  clientName={selectedInvoice.client_name || ''}
                  clientPhone={detailClientData?.phone || undefined}
                  clientAddress={
                    [
                      detailClientData?.address_street,
                      detailClientData?.address_city,
                      detailClientData?.address_province,
                      detailClientData?.address_postal_code,
                    ].filter(Boolean).join(', ') || undefined
                  }
                  clientEmail={detailClientData?.email || undefined}
                  onEditClient={handleEditClientFromDetail}
                  dueDate={
                    selectedInvoice.due_date
                      ? new Date(selectedInvoice.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : undefined
                  }
                  dueDateISO={selectedInvoice.due_date || undefined}
                  days={selectedInvoice.type === 'hourly' ? detailDays : []}
                  totalDays={selectedInvoiceDays.length}
                  totalMinutes={selectedInvoiceDays.reduce((sum, d) => sum + d.total_minutes, 0)}
                  totalLabel={formatDuration(selectedInvoiceDays.reduce((sum, d) => sum + d.total_minutes, 0))}
                  rate={selectedInvoice.hourly_rate || 0}
                  taxRate={selectedInvoice.tax_rate || 0}
                  taxLabel={selectedInvoice.tax_rate === 13 ? 'HST' : selectedInvoice.tax_rate === 5 ? 'GST' : 'Tax'}
                  lineItems={
                    selectedInvoice.type === 'products_services'
                      ? selectedInvoiceItems.map((item) => ({
                          id: item.id,
                          description: item.description,
                          quantity: item.quantity,
                          unitPrice: item.unit_price,
                          total: item.total,
                        }))
                      : undefined
                  }
                  notes={selectedInvoice.notes || undefined}
                  fromName={businessProfile?.business_name || undefined}
                  fromPhone={businessProfile?.phone || undefined}
                  fromAddress={
                    [
                      businessProfile?.address_street,
                      businessProfile?.address_city,
                      businessProfile?.address_province,
                      businessProfile?.address_postal_code,
                    ].filter(Boolean).join(', ') || undefined
                  }
                  fromEmail={businessProfile?.email || undefined}
                  onEditFrom={handleEditFromDetail}
                  onSave={handleSaveDetail}
                />

                <View style={detailStyles.actionsSection}>
                  <PressableOpacity
                    style={[detailStyles.shareBtn, isRegeneratingPdf && { opacity: 0.6 }]}
                    activeOpacity={0.7}
                    disabled={isRegeneratingPdf}
                    onPress={handleShareDetail}
                  >
                    {isRegeneratingPdf ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Ionicons name="share-outline" size={18} color={colors.white} />
                    )}
                    <Text style={detailStyles.shareBtnText}>
                      {isRegeneratingPdf ? 'Preparing…' : 'Share invoice'}
                    </Text>
                  </PressableOpacity>

                  <PressableOpacity
                    style={detailStyles.paidBtn}
                    activeOpacity={0.7}
                    onPress={handleTogglePaid}
                  >
                    <Ionicons
                      name={selectedInvoice.status === 'paid' ? 'checkmark-done-circle' : 'checkmark-circle-outline'}
                      size={18}
                      color={selectedInvoice.status === 'paid' ? colors.success : colors.textSecondary}
                    />
                    <Text
                      style={[
                        detailStyles.paidBtnText,
                        selectedInvoice.status === 'paid' && { color: colors.success },
                      ]}
                    >
                      {selectedInvoice.status === 'paid' ? 'Paid — tap to undo' : 'Mark as paid'}
                    </Text>
                  </PressableOpacity>

                  <PressableOpacity
                    style={detailStyles.deleteBtn}
                    activeOpacity={0.7}
                    onPress={handleDeleteDetail}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                    <Text style={detailStyles.deleteBtnText}>Delete invoice</Text>
                  </PressableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================
// STYLES (hub mirrors timekeeper hubStyles)
// ============================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },

  // My Profile pill (teal accent — primary action color across the app)
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  profileBtnTitle: { fontSize: 15, fontWeight: '700', color: colors.white },
  profileBtnSub: {
    fontSize: 12,
    fontWeight: '500',
    color: withOpacity(colors.white, 0.75),
    marginTop: 1,
  },

  // 2-up grid of invoice type cards (Timesheet | Services)
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  typeCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: withOpacity(colors.accent, 0.4),
    ...shadows.sm,
  },
  typeCardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withOpacity(colors.accent, 0.12),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeCardIconAmber: {
    backgroundColor: withOpacity(colors.warningDark, 0.12),
  },
  typeCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  typeCardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Recent invoices section
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 14, color: colors.textMuted, marginTop: 8 },

  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  invoiceNumber: { fontSize: 14, fontWeight: '700', color: colors.text },
  invoiceClient: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  invoiceTotal: { fontSize: 15, fontWeight: '700', color: colors.text },
});

// ============================================
// DETAIL MODAL STYLES (timekeeper bottom-sheet)
// ============================================

const detailStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 20,
    maxHeight: Dimensions.get('window').height * 0.92,
  },
  actionsSection: { gap: 8, marginTop: 16 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  shareBtnText: { fontSize: 15, fontWeight: '600', color: colors.white },
  paidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: colors.surfaceMuted,
  },
  paidBtnText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: withOpacity(colors.error, 0.3),
  },
  deleteBtnText: { fontSize: 15, fontWeight: '500', color: colors.error },
});
