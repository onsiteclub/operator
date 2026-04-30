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

import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Modal,
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, spacing, borderRadius, shadows, withOpacity } from '@onsite/tokens';

import { HourlyWizard } from '../../src/screens/invoice/HourlyWizard';
import { HeaderRow } from '../../src/components/ui/HeaderRow';
import { useAuthStore } from '../../src/stores/authStore';
import { useBusinessProfileStore } from '../../src/stores/businessProfileStore';
import { useInvoiceStore } from '../../src/stores/invoiceStore';
import type { InvoiceDB } from '../../src/lib/database/core';
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
  const [detail, setDetail] = useState<InvoiceDB | null>(null);

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

  // Auto-open Detail modal when arriving with ?openInvoiceId=X (after a
  // successful save in /client-edit or /business-profile via the
  // "View Invoice" snackbar action).
  useEffect(() => {
    if (!params.openInvoiceId) return;
    const target = recentInvoices.find((i) => i.id === params.openInvoiceId);
    if (target) {
      setDetail(target);
      router.setParams({ openInvoiceId: undefined as any });
    }
  }, [params.openInvoiceId, recentInvoices, router]);

  const handleEditHoursFromWizard = () => {
    setWizardOpen(false);
    router.push('/hours?from=wizard' as any);
  };

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

        {/* TIMESHEET INVOICE CARD (full width) */}
        <Pressable
          style={styles.typeCard}
          onPress={() => setWizardOpen(true)}
        >
          <View style={styles.typeCardIcon}>
            <Ionicons name="time-outline" size={28} color={colors.accent} />
          </View>
          <Text style={styles.typeCardTitle}>Timesheet Invoice</Text>
          <Text style={styles.typeCardSubtitle}>Generate from your logged hours</Text>
        </Pressable>

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
                onPress={() => setDetail(inv)}
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

      <InvoiceDetailModal
        invoice={detail}
        onClose={() => setDetail(null)}
      />
    </SafeAreaView>
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
      <SafeAreaView style={styles.detailRoot} edges={['top']}>
        <View style={styles.detailHeader}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.detailBack}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.detailTitle}>{invoice.invoice_number}</Text>
          <View style={styles.detailBack} />
        </View>

        <ScrollView contentContainerStyle={styles.detailBody}>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Send to</Text>
            <Text style={styles.detailValue}>{invoice.client_name || '—'}</Text>
          </View>

          {periodLabel ? (
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Period</Text>
              <Text style={styles.detailValue}>{periodLabel}</Text>
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
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Notes</Text>
              <Text style={styles.detailSub}>{invoice.notes}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.detailFooter}>
          <Pressable
            style={[styles.shareBtn, !invoice.pdf_uri && styles.shareBtnDisabled]}
            onPress={handleShare}
            disabled={!invoice.pdf_uri || sharing}
          >
            {sharing ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.shareBtnText}>Share PDF</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
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

  // Single full-width type card — soft teal border + tint, mirrors Machine squares
  typeCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: withOpacity(colors.accent, 0.4),
    marginBottom: 20,
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

  // Detail modal
  detailRoot: { flex: 1, backgroundColor: colors.background },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  detailBack: { width: 40, height: 40, justifyContent: 'center' },
  detailTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  detailBody: { padding: spacing.lg, paddingBottom: spacing.xxl },
  detailFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  detailCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  detailValue: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 4 },
  detailSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  shareBtnDisabled: { opacity: 0.4 },
  shareBtnText: { fontSize: 15, fontWeight: '600', color: colors.white },

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
