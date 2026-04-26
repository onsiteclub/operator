/**
 * Sync Store - OnSite Operator
 *
 * Bidirectional sync between local SQLite and Supabase. Adapted from
 * the timekeeper version, stripped down to what operator actually
 * needs:
 *   - daily_hours        (bidirectional, plus tombstone deletes)
 *   - business_profile   (bidirectional, last-writer-wins)
 *
 * Supabase tables are namespaced `app_operator_*` so they coexist
 * with timekeeper's `daily_hours` / `business_profiles` tables in the
 * same project.
 *
 * Sync triggers:
 *   - On boot, after auth hydration       (initial sync)
 *   - At midnight, once per local day     (rollover)
 *   - When the network comes back online  (reconnect)
 *   - Manually via syncNow()              (debug / forced)
 *
 * Invoices, invoice_items and clients sync are deliberately NOT in
 * this phase — schema is provisioned, but the upload/download wiring
 * is a follow-up.
 */

import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import {
  getUnsyncedDailyHours,
  getDeletedDailyHoursForSync,
  markDailyHoursSynced,
  purgeDeletedDailyHours,
  upsertDailyHoursFromSync,
} from '../lib/database/daily';
import {
  getUnsyncedBusinessProfile,
  markBusinessProfileSynced,
  upsertBusinessProfileFromSync,
} from '../lib/database/businessProfile';
import { useAuthStore } from './authStore';
import { useDailyLogStore } from './dailyLogStore';
import { useBusinessProfileStore } from './businessProfileStore';

// ============================================
// CONSTANTS
// ============================================

const MIDNIGHT_CHECK_INTERVAL_MS = 60 * 1000;

const TABLE_DAILY_HOURS = 'app_operator_daily_hours';
const TABLE_BUSINESS_PROFILE = 'app_operator_business_profile';

// ============================================
// TYPES
// ============================================

interface SyncStats {
  uploadedDailyHours: number;
  downloadedDailyHours: number;
  syncedBusinessProfile: boolean;
  errors: string[];
}

function emptyStats(): SyncStats {
  return {
    uploadedDailyHours: 0,
    downloadedDailyHours: 0,
    syncedBusinessProfile: false,
    errors: [],
  };
}

interface SyncState {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  isOnline: boolean;
  syncEnabled: boolean;
  lastSyncStats: SyncStats | null;

  initialize: () => Promise<() => void>;
  syncNow: () => Promise<SyncStats>;
  toggleSync: () => void;
}

// ============================================
// MODULE STATE (timers, listener handles)
// ============================================

let midnightInterval: ReturnType<typeof setInterval> | null = null;
let netUnsubscribe: (() => void) | null = null;
let lastMidnightSyncDate: string | null = null;
let lastOnlineState: boolean | null = null;

// ============================================
// HELPERS
// ============================================

function isSupabaseConfigured(): boolean {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  return url.length > 0 && key.length > 0;
}

function getLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isMidnightWindow(): boolean {
  const now = new Date();
  return now.getHours() === 0 && now.getMinutes() < 5;
}

// ============================================
// STORE
// ============================================

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  lastSyncAt: null,
  isOnline: true,
  syncEnabled: true,
  lastSyncStats: null,

  initialize: async () => {
    logger.info('boot', 'Initializing sync store');

    // Network listener: update isOnline, run sync on reconnect
    netUnsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected;
      const wasOffline = lastOnlineState === false;
      lastOnlineState = online;
      set({ isOnline: online });

      if (online && wasOffline) {
        const { syncEnabled, isSyncing } = get();
        if (syncEnabled && !isSyncing) {
          logger.info('sync', 'Network reconnected — triggering sync');
          void get().syncNow();
        }
      }
    });

    const initialNet = await NetInfo.fetch();
    const initialOnline = !!initialNet.isConnected;
    lastOnlineState = initialOnline;
    set({ isOnline: initialOnline });

    // Midnight rollover check (cheap — fires every minute, only acts at 00:00–00:05)
    midnightInterval = setInterval(() => {
      const today = getLocalDateString();
      if (isMidnightWindow() && lastMidnightSyncDate !== today) {
        const { isOnline, syncEnabled, isSyncing } = get();
        if (isOnline && syncEnabled && !isSyncing) {
          logger.info('sync', 'Midnight sync triggered');
          lastMidnightSyncDate = today;
          void get().syncNow();
        }
      }
    }, MIDNIGHT_CHECK_INTERVAL_MS);

    // Initial sync if we have credentials and a network
    if (isSupabaseConfigured() && initialOnline) {
      try {
        await get().syncNow();
      } catch (error) {
        logger.error('sync', 'Initial sync error', { error: String(error) });
      }
    }

    return () => {
      if (netUnsubscribe) netUnsubscribe();
      if (midnightInterval) clearInterval(midnightInterval);
      netUnsubscribe = null;
      midnightInterval = null;
    };
  },

  syncNow: async () => {
    const { isSyncing, isOnline, syncEnabled } = get();

    if (isSyncing) {
      logger.warn('sync', 'Sync already running');
      return get().lastSyncStats || emptyStats();
    }
    if (!syncEnabled) return emptyStats();
    if (!isSupabaseConfigured()) {
      logger.warn('sync', 'Supabase not configured');
      return emptyStats();
    }
    if (!isOnline) return emptyStats();

    const userId = useAuthStore.getState().getUserId();
    if (!userId) return emptyStats();

    set({ isSyncing: true, lastSyncStats: null });
    const stats = emptyStats();

    try {
      logger.info('sync', 'Starting sync');

      // 1. daily_hours upload + tombstone deletes
      const dhUp = await uploadDailyHours(userId);
      stats.uploadedDailyHours = dhUp.count;
      stats.errors.push(...dhUp.errors);

      // 2. daily_hours download
      const dhDown = await downloadDailyHours(userId);
      stats.downloadedDailyHours = dhDown.count;
      stats.errors.push(...dhDown.errors);

      // 3. business_profile bidirectional
      const bpRes = await syncBusinessProfile(userId);
      stats.syncedBusinessProfile = bpRes.changed;
      stats.errors.push(...bpRes.errors);

      set({ lastSyncAt: new Date(), lastSyncStats: stats });

      const ok = stats.errors.length === 0;
      logger.info('sync', `${ok ? 'OK' : 'with errors'} — up ${stats.uploadedDailyHours}D / down ${stats.downloadedDailyHours}D`, {
        errors: stats.errors.length,
      });

      // Refresh in-memory caches if anything came down
      if (stats.downloadedDailyHours > 0) {
        await useDailyLogStore.getState().reloadToday();
        await useDailyLogStore.getState().reloadWeek();
      }
      if (stats.syncedBusinessProfile) {
        useBusinessProfileStore.getState().loadProfile(userId);
      }

      return stats;
    } catch (error) {
      const msg = String(error);
      logger.error('sync', 'Sync error', { error: msg });
      stats.errors.push(msg);
      set({ lastSyncStats: stats });
      return stats;
    } finally {
      set({ isSyncing: false });
    }
  },

  toggleSync: () => {
    set((s) => ({ syncEnabled: !s.syncEnabled }));
  },
}));

// ============================================
// DAILY HOURS — UPLOAD + DELETE
// ============================================

async function uploadDailyHours(userId: string): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Upserts
  try {
    const pending = getUnsyncedDailyHours(userId);
    for (const day of pending) {
      try {
        const payload = {
          id: day.id,
          user_id: day.user_id,
          date: day.date,
          total_minutes: day.total_minutes,
          break_minutes: day.break_minutes,
          location_name: day.location_name,
          location_id: day.location_id,
          verified: day.verified,
          source: day.source,
          type: day.type || 'work',
          first_entry: day.first_entry,
          last_exit: day.last_exit,
          notes: day.notes,
          created_at: day.created_at,
          updated_at: day.updated_at,
          synced_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from(TABLE_DAILY_HOURS)
          .upsert(payload, { onConflict: 'user_id,date' })
          .select();

        if (error) {
          errors.push(`daily_hours ${day.date}: ${error.message}`);
        } else if (!data || data.length === 0) {
          errors.push(`daily_hours ${day.date}: no row returned`);
        } else {
          markDailyHoursSynced(userId, day.date);
          count++;
        }
      } catch (e) {
        errors.push(`daily_hours ${day.date}: ${String(e)}`);
      }
    }
  } catch (error) {
    errors.push(String(error));
  }

  // Tombstone deletes
  try {
    const tombstones = getDeletedDailyHoursForSync(userId);
    for (const day of tombstones) {
      try {
        const { error } = await supabase
          .from(TABLE_DAILY_HOURS)
          .delete()
          .eq('user_id', userId)
          .eq('date', day.date);

        if (error) {
          errors.push(`delete daily_hours ${day.date}: ${error.message}`);
        } else {
          purgeDeletedDailyHours(userId, day.date);
          count++;
        }
      } catch (e) {
        errors.push(`delete daily_hours ${day.date}: ${String(e)}`);
      }
    }
  } catch (error) {
    errors.push(String(error));
  }

  return { count, errors };
}

// ============================================
// DAILY HOURS — DOWNLOAD
// ============================================

async function downloadDailyHours(userId: string): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  try {
    const { data, error } = await supabase
      .from(TABLE_DAILY_HOURS)
      .select('*')
      .eq('user_id', userId);

    if (error) {
      errors.push(error.message);
      return { count, errors };
    }

    for (const remote of data || []) {
      try {
        upsertDailyHoursFromSync({
          id: remote.id,
          user_id: remote.user_id,
          date: remote.date,
          total_minutes: remote.total_minutes,
          break_minutes: remote.break_minutes ?? 0,
          location_name: remote.location_name,
          location_id: remote.location_id,
          verified: remote.verified ? 1 : 0,
          source: remote.source || 'manual',
          type: remote.type || 'work',
          first_entry: remote.first_entry,
          last_exit: remote.last_exit,
          notes: remote.notes,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          synced_at: new Date().toISOString(),
        });
        count++;
      } catch (e) {
        errors.push(`daily_hours ${remote.date}: ${String(e)}`);
      }
    }
  } catch (error) {
    errors.push(String(error));
  }

  return { count, errors };
}

// ============================================
// BUSINESS PROFILE — BIDIRECTIONAL
// ============================================

async function syncBusinessProfile(userId: string): Promise<{ changed: boolean; errors: string[] }> {
  const errors: string[] = [];
  let changed = false;

  try {
    // Upload local edits first so the download below sees them.
    const unsynced = getUnsyncedBusinessProfile(userId);
    if (unsynced) {
      const payload = {
        id: unsynced.id,
        user_id: unsynced.user_id,
        business_name: unsynced.business_name,
        address_street: unsynced.address_street,
        address_city: unsynced.address_city,
        address_province: unsynced.address_province,
        address_postal_code: unsynced.address_postal_code,
        phone: unsynced.phone,
        email: unsynced.email,
        business_number: unsynced.business_number,
        gst_hst_number: unsynced.gst_hst_number,
        default_hourly_rate: unsynced.default_hourly_rate,
        tax_rate: unsynced.tax_rate,
        next_invoice_number: unsynced.next_invoice_number ?? 1,
        created_at: unsynced.created_at,
        updated_at: unsynced.updated_at,
        synced_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from(TABLE_BUSINESS_PROFILE)
        .upsert(payload, { onConflict: 'user_id' })
        .select();

      if (error) {
        errors.push(`business_profile upload: ${error.message}`);
      } else {
        markBusinessProfileSynced(userId);
        changed = true;
      }
    }

    // Download — last-writer-wins is enforced by upsertBusinessProfileFromSync
    const { data, error } = await supabase
      .from(TABLE_BUSINESS_PROFILE)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      errors.push(`business_profile download: ${error.message}`);
    } else if (data) {
      upsertBusinessProfileFromSync({
        id: data.id,
        user_id: data.user_id,
        business_name: data.business_name,
        address_street: data.address_street,
        address_city: data.address_city,
        address_province: data.address_province,
        address_postal_code: data.address_postal_code,
        phone: data.phone,
        email: data.email,
        business_number: data.business_number,
        gst_hst_number: data.gst_hst_number,
        default_hourly_rate: data.default_hourly_rate,
        tax_rate: data.tax_rate,
        next_invoice_number: data.next_invoice_number ?? 1,
        created_at: data.created_at,
        updated_at: data.updated_at,
        synced_at: new Date().toISOString(),
      });
      changed = true;
    }
  } catch (error) {
    errors.push(`business_profile sync: ${String(error)}`);
  }

  return { changed, errors };
}
