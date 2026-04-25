/**
 * Reports Screen — Operator 2
 *
 * Today's live summary (computed from frm_material_requests)
 * + archive list from frm_daily_reports.
 */

import { useEffect, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@onsite/tokens';
import { supabase } from '../../src/lib/supabase';

interface TodayStats {
  delivered: number;
  pending: number;
  alerts: number;
}

interface ArchivedReport {
  id: string;
  report_date: string;
  summary_json: {
    delivered_count?: number;
    pending_count?: number;
    alerts_count?: number;
  };
  pdf_url: string | null;
}

export default function ReportsScreen() {
  const [today, setToday] = useState<TodayStats>({ delivered: 0, pending: 0, alerts: 0 });
  const [archive, setArchive] = useState<ArchivedReport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchToday = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const iso = todayStart.toISOString();

    const [reqRes, alertRes] = await Promise.all([
      supabase
        .from('frm_material_requests')
        .select('id, status')
        .gte('created_at', iso),
      supabase
        .from('frm_alerts')
        .select('id')
        .gte('created_at', iso),
    ]);

    const requests = reqRes.data || [];
    const delivered = requests.filter((r) => r.status === 'delivered').length;
    const pending = requests.filter((r) => r.status !== 'delivered' && r.status !== 'cancelled').length;
    const alerts = alertRes.data?.length || 0;

    setToday({ delivered, pending, alerts });
  }, []);

  const fetchArchive = useCallback(async () => {
    const { data } = await supabase
      .from('frm_daily_reports')
      .select('id, report_date, summary_json, pdf_url')
      .order('report_date', { ascending: false })
      .limit(30);

    setArchive(data || []);
  }, []);

  useEffect(() => {
    Promise.all([fetchToday(), fetchArchive()]).finally(() => setLoading(false));

    // Realtime updates for today's counts
    const channel = supabase
      .channel('reports-live')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'frm_material_requests',
      }, () => fetchToday())
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'frm_alerts',
      }, () => fetchToday())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchToday, fetchArchive]);

  const openPdf = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Reports</Text>
      </View>

      <View style={styles.content}>
        {/* Today Card */}
        <View style={styles.todayCard}>
          <View style={styles.todayHeader}>
            <Text style={styles.todayLabel}>Today</Text>
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>Live</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <StatBox label="Delivered" value={today.delivered} color={colors.accent} />
            <StatBox label="Pending" value={today.pending} color={colors.amber} />
            <StatBox label="Alerts" value={today.alerts} color={colors.error} />
          </View>
        </View>

        {/* Archive */}
        <Text style={styles.sectionLabel}>ARCHIVE</Text>
        {archive.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No reports yet</Text>
            <Text style={styles.emptyHint}>Daily reports will appear here automatically</Text>
          </View>
        ) : (
          <FlatList
            data={archive}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const d = item.summary_json;
              return (
                <Pressable
                  style={styles.archiveRow}
                  onPress={() => item.pdf_url && openPdf(item.pdf_url)}
                  disabled={!item.pdf_url}
                >
                  <View>
                    <Text style={styles.archiveDate}>{item.report_date}</Text>
                    <Text style={styles.archiveStats}>
                      {d.delivered_count ?? 0} delivered · {d.alerts_count ?? 0} alerts
                    </Text>
                  </View>
                  {item.pdf_url && (
                    <Text style={styles.pdfLink}>PDF</Text>
                  )}
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.screenTitle,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  todayCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  todayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  todayLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  liveBadge: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  emptyText: {
    ...typography.cardTitle,
    marginBottom: spacing.xs,
  },
  emptyHint: {
    ...typography.meta,
    textAlign: 'center',
  },
  archiveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  archiveDate: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  archiveStats: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pdfLink: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
});
