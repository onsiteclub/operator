/**
 * Requests Screen — Operator 2
 *
 * Each card is a conversation thread (one per request):
 * - H1: LOT number
 * - Chat bubbles: worker (left, gray) · machinist (right, accent)
 * - Intake bot exchange ("Which lot?" / "Got it") is hidden — only
 *   human↔human + delivery notification appear
 * - Reply bar expands when the machinist taps 💬; Send dispatches via
 *   the send-to-worker edge function
 * - Delivered goes through mark-delivered so the worker gets an SMS
 *   confirmation (accountability)
 * - Badge flags workers with multiple open requests
 */

import { useEffect, useCallback, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert,
  Modal, RefreshControl, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@onsite/tokens';
import { supabase } from '../../src/lib/supabase';

interface IncomingRequest {
  id: string;
  raw_message: string | null;
  source: string | null;
  material_name: string | null;
  quantity: number | null;
  notes: string | null;
  status: string;
  confidence: number | null;
  language_detected: string | null;
  delivered_at: string | null;
  worker_phone: string | null;
  worker_name: string | null;
  created_at: string;
  lot_text_hint: string | null;
  lot: { lot_number: string } | null;
}

interface ChatMessage {
  id: string;
  sender_type: string;
  sender_name: string;
  content: string;
  created_at: string;
}

type Tab = 'queue' | 'delivered';

const LANG_FLAGS: Record<string, string> = {
  en: '🇬🇧', pt: '🇵🇹', es: '🇪🇸', fr: '🇫🇷', tl: '🇵🇭',
  vi: '🇻🇳', zh: '🇨🇳', ar: '🇸🇦', hi: '🇮🇳', ru: '🇷🇺',
};

export default function RequestsScreen() {
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('queue');
  const [aiModalRequest, setAiModalRequest] = useState<IncomingRequest | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('frm_material_requests')
        .select('*, lot:frm_lots!lot_id(lot_number)')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
  }, [fetchRequests]);

  useEffect(() => {
    fetchRequests();
    const channel = supabase
      .channel('requests-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'frm_material_requests',
      }, () => fetchRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRequests]);

  const handleDeliver = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('mark-delivered', {
        body: { request_id: id },
      });
      if (error) throw error;
      // Realtime will refresh; fallback fetch:
      fetchRequests();
    } catch (err) {
      console.error('mark-delivered failed:', err);
      Alert.alert('Error', 'Failed to mark as delivered');
    }
  };

  const queueItems = useMemo(
    () => requests.filter(
      (r) => r.status !== 'delivered'
        && r.status !== 'cancelled'
        && r.status !== 'awaiting_info',
    ),
    [requests],
  );
  const deliveredItems = useMemo(
    () => requests.filter((r) => r.status === 'delivered'),
    [requests],
  );

  // Count open requests per worker for the "multiple open" badge
  const openCountByPhone = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of queueItems) {
      const key = r.worker_phone || r.worker_name || '';
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [queueItems]);

  const displayedItems = activeTab === 'queue' ? queueItems : deliveredItems;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Requests</Text>
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'queue' && styles.tabActive]}
          onPress={() => setActiveTab('queue')}
        >
          <Text style={[styles.tabText, activeTab === 'queue' && styles.tabTextActive]}>Queue</Text>
          {queueItems.length > 0 && (
            <View style={[styles.badge, activeTab === 'queue' && styles.badgeActive]}>
              <Text style={[styles.badgeText, activeTab === 'queue' && styles.badgeTextActive]}>
                {queueItems.length}
              </Text>
            </View>
          )}
        </Pressable>

        <Pressable
          style={[styles.tab, activeTab === 'delivered' && styles.tabActive]}
          onPress={() => setActiveTab('delivered')}
        >
          <Text style={[styles.tabText, activeTab === 'delivered' && styles.tabTextActive]}>Delivered</Text>
          {deliveredItems.length > 0 && (
            <View style={[styles.badge, activeTab === 'delivered' && styles.badgeActive]}>
              <Text style={[styles.badgeText, activeTab === 'delivered' && styles.badgeTextActive]}>
                {deliveredItems.length}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={displayedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            displayedItems.length === 0 ? styles.listEmpty : styles.list
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {activeTab === 'queue' ? 'No pending requests' : 'No deliveries yet'}
              </Text>
              <Text style={styles.emptyHint}>
                {activeTab === 'queue'
                  ? 'Send a WhatsApp or SMS to start receiving requests\nPull down to refresh'
                  : 'Delivered requests will appear here'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const workerKey = item.worker_phone || item.worker_name || '';
            const totalOpen = openCountByPhone.get(workerKey) || 0;
            return (
              <RequestCard
                request={item}
                onDeliver={handleDeliver}
                onOpenAI={() => setAiModalRequest(item)}
                showDeliverButton={activeTab === 'queue'}
                otherOpenCount={Math.max(totalOpen - 1, 0)}
              />
            );
          }}
        />
      )}

      <AIHelperModal
        request={aiModalRequest}
        onClose={() => setAiModalRequest(null)}
      />
    </SafeAreaView>
  );
}

function RequestCard({
  request: req,
  onDeliver,
  onOpenAI,
  showDeliverButton,
  otherOpenCount,
}: {
  request: IncomingRequest;
  onDeliver: (id: string) => void;
  onOpenAI: () => void;
  showDeliverButton: boolean;
  otherOpenCount: number;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const isDelivered = req.status === 'delivered';
  const flag = req.language_detected ? LANG_FLAGS[req.language_detected] : null;
  const timeLabel = new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const lotLabel = req.lot?.lot_number ?? req.lot_text_hint ?? '?';
  const lotUnmatched = !req.lot?.lot_number && !!req.lot_text_hint;
  const workerLabel = req.worker_name || req.worker_phone || 'Unknown';

  const fetchThread = useCallback(async () => {
    // Only human↔human + delivery notification. Intake bot exchange is excluded.
    const { data } = await supabase
      .from('frm_messages')
      .select('id, sender_type, sender_name, content, created_at')
      .eq('request_id', req.id)
      .in('sender_type', ['worker', 'machinist', 'system'])
      .order('created_at', { ascending: true });
    setMessages((data || []) as ChatMessage[]);
  }, [req.id]);

  useEffect(() => {
    fetchThread();
    const channel = supabase
      .channel(`msgs-${req.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'frm_messages',
        filter: `request_id=eq.${req.id}`,
      }, () => fetchThread())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchThread, req.id]);

  const handleSend = async () => {
    const text = replyText.trim();
    if (!text) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-to-worker', {
        body: { request_id: req.id, text },
      });
      if (error) throw error;
      setReplyText('');
      setReplyOpen(false);
      fetchThread();
    } catch (err) {
      console.error('send-to-worker failed:', err);
      Alert.alert('Error', 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.card, isDelivered && styles.cardDelivered]}>
      <Text style={styles.metaText} numberOfLines={1}>
        {workerLabel}
        {'  ·  '}
        {timeLabel}
        {flag ? `  ·  ${flag}` : ''}
      </Text>

      {otherOpenCount > 0 ? (
        <Text style={styles.multiOpenBadge}>
          🔗 {workerLabel} has {otherOpenCount} more open
        </Text>
      ) : null}

      <View style={styles.lotRow}>
        <Text style={[styles.lotTitle, isDelivered && styles.textMuted]}>
          LOT {lotLabel}
        </Text>
        {lotUnmatched ? (
          <Text style={styles.lotUnmatchedBadge}>unverified</Text>
        ) : null}
      </View>

      {/* Chat thread */}
      <View style={styles.thread}>
        {messages.length === 0 ? (
          <View style={styles.bubbleLeft}>
            <Text style={styles.bubbleText}>{req.raw_message || '(empty)'}</Text>
          </View>
        ) : (
          messages.map((m) => {
            if (m.sender_type === 'worker') {
              return (
                <View key={m.id} style={styles.bubbleLeft}>
                  <Text style={styles.bubbleText}>{m.content}</Text>
                </View>
              );
            }
            if (m.sender_type === 'machinist') {
              return (
                <View key={m.id} style={styles.bubbleRight}>
                  <Text style={styles.bubbleTextRight}>{m.content}</Text>
                </View>
              );
            }
            // system (delivery notification)
            return (
              <View key={m.id} style={styles.bubbleSystem}>
                <Text style={styles.bubbleSystemText}>{m.content}</Text>
              </View>
            );
          })
        )}
      </View>

      {/* Reply input (only when Reply is tapped) */}
      {replyOpen ? (
        <View style={styles.replyRow}>
          <TextInput
            style={styles.replyInput}
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Type a message"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={500}
            editable={!sending}
          />
          <Pressable
            style={[styles.sendBtn, (!replyText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!replyText.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color={colors.background} size="small" />
              : <Text style={styles.sendBtnText}>Send</Text>}
          </Pressable>
        </View>
      ) : null}

      {/* Action icons */}
      <View style={styles.actionsRow}>
        <View style={styles.actionsLeft}>
          <Pressable
            onPress={onOpenAI}
            style={styles.iconBtn}
            hitSlop={8}
            accessibilityLabel="AI helper"
          >
            <Text style={styles.iconBtnText}>✨</Text>
          </Pressable>
          {!isDelivered ? (
            <Pressable
              onPress={() => setReplyOpen((v) => !v)}
              style={[styles.iconBtn, replyOpen && styles.iconBtnActive]}
              hitSlop={8}
              accessibilityLabel="Reply"
            >
              <Text style={styles.iconBtnText}>💬</Text>
            </Pressable>
          ) : null}
        </View>

        {isDelivered && req.delivered_at ? (
          <Text style={styles.deliveredTime}>
            {'✓'} Delivered{' '}
            {new Date(req.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        ) : showDeliverButton ? (
          <Pressable
            style={[styles.iconBtn, styles.deliverIconBtn]}
            onPress={() => onDeliver(req.id)}
            hitSlop={8}
            accessibilityLabel="Mark delivered"
          >
            <Text style={styles.deliverIconText}>✓</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function AIHelperModal({
  request,
  onClose,
}: {
  request: IncomingRequest | null;
  onClose: () => void;
}) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  useEffect(() => {
    setTranslation(null);
    setTranslating(false);
    setTranslateError(null);
  }, [request?.id]);

  if (!request) return null;

  const handleTranslate = async () => {
    if (!request.raw_message) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      const { data, error } = await supabase.functions.invoke('translate-message', {
        body: { text: request.raw_message, target_lang: 'en' },
      });
      if (error) throw error;
      setTranslation(data?.translation || '(empty)');
    } catch (err) {
      console.error('Translate failed:', err);
      setTranslateError('Could not translate. Try again.');
    } finally {
      setTranslating(false);
    }
  };

  const lot = request.lot?.lot_number || request.lot_text_hint || '?';
  const material = request.material_name || '?';
  const qty = request.quantity != null ? String(request.quantity) : '?';
  const confidencePct = request.confidence != null
    ? `${Math.round(request.confidence * 100)}%`
    : 'n/a';
  const flag = request.language_detected ? LANG_FLAGS[request.language_detected] : '';

  return (
    <Modal
      visible={!!request}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>AI helper</Text>

          <Text style={styles.modalSectionLabel}>Original {flag}</Text>
          <Text style={styles.modalOriginal}>{request.raw_message || '(empty)'}</Text>

          <Text style={styles.modalSectionLabel}>Translation</Text>
          {translation ? (
            <Text style={styles.modalTranslation}>{translation}</Text>
          ) : translateError ? (
            <View>
              <Text style={styles.modalError}>{translateError}</Text>
              <Pressable style={styles.modalBtn} onPress={handleTranslate}>
                <Text style={styles.modalBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : translating ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.sm }} />
          ) : (
            <Pressable style={styles.modalBtn} onPress={handleTranslate}>
              <Text style={styles.modalBtnText}>🌐 Translate to English</Text>
            </Pressable>
          )}

          <Text style={styles.modalSectionLabel}>Parsed fields</Text>
          <View style={styles.parseGrid}>
            <View style={styles.parseRow}>
              <Text style={styles.parseKey}>Lot</Text>
              <Text style={styles.parseValue}>{lot}</Text>
            </View>
            <View style={styles.parseRow}>
              <Text style={styles.parseKey}>Material</Text>
              <Text style={styles.parseValue}>{material}</Text>
            </View>
            <View style={styles.parseRow}>
              <Text style={styles.parseKey}>Quantity</Text>
              <Text style={styles.parseValue}>{qty}</Text>
            </View>
            <View style={styles.parseRow}>
              <Text style={styles.parseKey}>Confidence</Text>
              <Text style={styles.parseValue}>{confidencePct}</Text>
            </View>
            {request.notes ? (
              <View style={styles.parseRow}>
                <Text style={styles.parseKey}>Notes</Text>
                <Text style={styles.parseValue}>{request.notes}</Text>
              </View>
            ) : null}
          </View>

          <Pressable style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  title: { ...typography.screenTitle },

  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full ?? 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.background },
  badge: {
    backgroundColor: colors.border,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeActive: { backgroundColor: colors.background },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  badgeTextActive: { color: colors.text },

  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  listEmpty: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: spacing.xxl,
  },
  emptyText: { ...typography.cardTitle, marginBottom: spacing.xs },
  emptyHint: { ...typography.meta, textAlign: 'center', paddingHorizontal: spacing.xl },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  cardDelivered: { opacity: 0.6 },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  multiOpenBadge: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontStyle: 'italic',
  },
  lotRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  lotTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  lotUnmatchedBadge: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.warning,
    letterSpacing: 0.5,
  },
  textMuted: { color: colors.textSecondary },

  // Chat thread
  thread: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    borderBottomLeftRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleRight: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    borderBottomRightRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleSystem: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  bubbleTextRight: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.background,
  },
  bubbleSystemText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // Reply input
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  replyInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 14,
  },
  sendBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accent,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },

  // Action row
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionsLeft: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  iconBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '22',
  },
  iconBtnText: { fontSize: 20, color: colors.text },
  deliverIconBtn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  deliverIconText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.background,
  },
  deliveredTime: { fontSize: 13, color: colors.textSecondary },

  // AI modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  modalOriginal: { fontSize: 16, color: colors.text, lineHeight: 22 },
  modalTranslation: { fontSize: 16, color: colors.text, lineHeight: 22, fontStyle: 'italic' },
  modalError: { fontSize: 14, color: colors.warning, marginBottom: spacing.sm },
  modalBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
  },
  modalBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  parseGrid: { gap: spacing.xs },
  parseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  parseKey: { fontSize: 14, color: colors.textSecondary },
  parseValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  modalClose: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.text,
  },
  modalCloseText: { fontSize: 15, fontWeight: '600', color: colors.background },
});
