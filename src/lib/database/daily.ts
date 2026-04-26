/**
 * Daily Hours - OnSite Operator
 *
 * CRUD operations for daily_hours table.
 * This is the user-facing consolidated view (1 record per day).
 *
 * Ported verbatim from onsite-timekeeper.
 */

import { db, generateUUID, now, getToday, type DailyHoursDB, type DailyHoursSource, type DailyHoursType } from './core';
import { logger } from '../logger';

// ============================================
// TYPES
// ============================================

export interface DailyHoursEntry {
  id: string;
  user_id: string;
  date: string;
  total_minutes: number;
  break_minutes: number;
  location_name: string | null;
  location_id: string | null;
  verified: boolean; // Converted from INTEGER
  source: DailyHoursSource;
  type: DailyHoursType;
  first_entry: string | null;
  last_exit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

export interface UpsertDailyHoursParams {
  userId: string;
  date: string;
  totalMinutes: number;
  breakMinutes?: number;
  locationName?: string;
  locationId?: string;
  verified?: boolean;
  source?: DailyHoursSource;
  type?: DailyHoursType;
  firstEntry?: string;
  lastExit?: string;
  notes?: string;
}

export interface UpdateDailyHoursParams {
  totalMinutes?: number;
  breakMinutes?: number;
  locationName?: string;
  locationId?: string;
  verified?: boolean;
  source?: DailyHoursSource;
  type?: DailyHoursType;
  firstEntry?: string;
  lastExit?: string;
  notes?: string;
}

// ============================================
// CONFLICT RESOLUTION
// ============================================

export type ConflictAction = 'write' | 'confirm' | 'ignore' | 'sum';

export function resolveConflict(
  existing: DailyHoursEntry | null,
  writerSource: DailyHoursSource
): ConflictAction {
  if (!existing || existing.total_minutes === 0) return 'write';
  if (writerSource === 'manual' || writerSource === 'edited') return 'confirm';
  if (writerSource === 'gps' && existing.source === 'gps') return 'sum';
  if (writerSource === 'gps') return 'write';
  return 'confirm';
}

// ============================================
// HELPERS
// ============================================

function toEntry(record: DailyHoursDB): DailyHoursEntry {
  return {
    ...record,
    verified: record.verified === 1,
    type: record.type || 'work',
  };
}

export function formatTimeHHMM(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function roundToHalfHour(date: Date, direction: 'ceil' | 'floor'): Date {
  const result = new Date(date);
  const minutes = result.getMinutes();
  const seconds = result.getSeconds();
  const ms = result.getMilliseconds();

  if ((minutes === 0 || minutes === 30) && seconds === 0 && ms === 0) {
    return result;
  }

  if (direction === 'ceil') {
    if (minutes < 30) {
      result.setMinutes(30, 0, 0);
    } else {
      result.setMinutes(0, 0, 0);
      result.setHours(result.getHours() + 1);
    }
  } else {
    if (minutes < 30) {
      result.setMinutes(0, 0, 0);
    } else {
      result.setMinutes(30, 0, 0);
    }
  }

  return result;
}

export function getDateString(date: Date | string): string {
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================
// GET OPERATIONS
// ============================================

export function getDailyHours(userId: string, date: string): DailyHoursEntry | null {
  try {
    const record = db.getFirstSync<DailyHoursDB>(
      `SELECT * FROM daily_hours WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
      [userId, date]
    );

    if (!record) return null;
    return toEntry(record);
  } catch (error) {
    logger.error('database', '[daily_hours] GET error', { error: String(error) });
    return null;
  }
}

export function getTodayHours(userId: string): DailyHoursEntry | null {
  return getDailyHours(userId, getToday());
}

export function getDailyHoursByPeriod(
  userId: string,
  startDate: string,
  endDate: string
): DailyHoursEntry[] {
  try {
    const records = db.getAllSync<DailyHoursDB>(
      `SELECT * FROM daily_hours
       WHERE user_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
       ORDER BY date ASC`,
      [userId, startDate, endDate]
    );

    return records.map(toEntry);
  } catch (error) {
    logger.error('database', '[daily_hours] GET BY PERIOD error', { error: String(error) });
    return [];
  }
}

export function getAllDailyHours(userId: string): DailyHoursEntry[] {
  try {
    const records = db.getAllSync<DailyHoursDB>(
      `SELECT * FROM daily_hours WHERE user_id = ? AND deleted_at IS NULL ORDER BY date DESC`,
      [userId]
    );

    return records.map(toEntry);
  } catch (error) {
    logger.error('database', '[daily_hours] GET ALL error', { error: String(error) });
    return [];
  }
}

export function getUnsyncedDailyHours(userId: string): DailyHoursEntry[] {
  try {
    const records = db.getAllSync<DailyHoursDB>(
      `SELECT * FROM daily_hours WHERE user_id = ? AND synced_at IS NULL AND deleted_at IS NULL ORDER BY date ASC`,
      [userId]
    );

    return records.map(toEntry);
  } catch (error) {
    logger.error('database', '[daily_hours] GET UNSYNCED error', { error: String(error) });
    return [];
  }
}

// ============================================
// CREATE / UPDATE OPERATIONS
// ============================================

export function upsertDailyHours(params: UpsertDailyHoursParams): DailyHoursEntry | null {
  const {
    userId,
    date,
    totalMinutes,
    breakMinutes = 0,
    locationName,
    locationId,
    verified = false,
    source = 'manual',
    type = 'work',
    firstEntry,
    lastExit,
    notes,
  } = params;

  try {
    const safeTotalMinutes = typeof totalMinutes === 'number' && !isNaN(totalMinutes) ? Math.round(totalMinutes) : 0;
    const safeBreakMinutes = typeof breakMinutes === 'number' && !isNaN(breakMinutes) ? Math.round(breakMinutes) : 0;

    if (safeTotalMinutes !== totalMinutes || safeBreakMinutes !== breakMinutes) {
      logger.warn('database', '[daily_hours] UPSERT: sanitized non-numeric values', {
        totalMinutes: String(totalMinutes), safeTotalMinutes,
        breakMinutes: String(breakMinutes), safeBreakMinutes,
      });
    }

    const existing = getDailyHours(userId, date);
    const timestamp = now();

    if (existing) {
      db.runSync(
        `UPDATE daily_hours SET
          total_minutes = ?,
          break_minutes = ?,
          location_name = COALESCE(?, location_name),
          location_id = COALESCE(?, location_id),
          verified = ?,
          source = ?,
          type = ?,
          first_entry = COALESCE(?, first_entry),
          last_exit = CASE
            WHEN ? IS NULL THEN last_exit
            WHEN last_exit IS NULL THEN ?
            WHEN ? > last_exit THEN ?
            ELSE last_exit
          END,
          notes = COALESCE(?, notes),
          updated_at = ?,
          synced_at = NULL
        WHERE user_id = ? AND date = ?`,
        [
          safeTotalMinutes,
          safeBreakMinutes,
          locationName || null,
          locationId || null,
          verified ? 1 : 0,
          source,
          type,
          firstEntry || null,
          lastExit || null,
          lastExit || null,
          lastExit || null,
          lastExit || null,
          notes || null,
          timestamp,
          userId,
          date,
        ]
      );

      logger.info('database', `[daily_hours] UPDATED ${date}`, {
        totalMinutes: safeTotalMinutes,
        source,
        type,
        verified,
      });
    } else {
      const softDeleted = db.getFirstSync<{ id: string }>(
        `SELECT id FROM daily_hours WHERE user_id = ? AND date = ? AND deleted_at IS NOT NULL`,
        [userId, date]
      );

      if (softDeleted) {
        db.runSync(
          `UPDATE daily_hours SET
            total_minutes = ?,
            break_minutes = ?,
            location_name = ?,
            location_id = ?,
            verified = ?,
            source = ?,
            type = ?,
            first_entry = ?,
            last_exit = ?,
            notes = ?,
            deleted_at = NULL,
            updated_at = ?,
            synced_at = NULL
          WHERE user_id = ? AND date = ?`,
          [
            safeTotalMinutes,
            safeBreakMinutes,
            locationName || null,
            locationId || null,
            verified ? 1 : 0,
            source,
            type,
            firstEntry || null,
            lastExit || null,
            notes || null,
            timestamp,
            userId,
            date,
          ]
        );

        logger.info('database', `[daily_hours] RESURRECTED (was soft-deleted) ${date}`, {
          totalMinutes: safeTotalMinutes,
          source,
          type,
        });
      } else {
        const id = generateUUID();

        db.runSync(
          `INSERT INTO daily_hours (
            id, user_id, date, total_minutes, break_minutes,
            location_name, location_id, verified, source, type,
            first_entry, last_exit, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            userId,
            date,
            safeTotalMinutes,
            safeBreakMinutes,
            locationName || null,
            locationId || null,
            verified ? 1 : 0,
            source,
            type,
            firstEntry || null,
            lastExit || null,
            notes || null,
            timestamp,
            timestamp,
          ]
        );

        logger.info('database', `[daily_hours] CREATED ${date}`, {
          totalMinutes: safeTotalMinutes,
          source,
          type,
          verified,
        });
      }
    }

    return getDailyHours(userId, date);
  } catch (error) {
    logger.error('database', '[daily_hours] UPSERT error', { error: String(error) });
    return null;
  }
}

export function updateDailyHours(
  userId: string,
  date: string,
  updates: UpdateDailyHoursParams
): DailyHoursEntry | null {
  try {
    const existing = getDailyHours(userId, date);
    if (!existing) {
      logger.warn('database', `[daily_hours] UPDATE failed - not found: ${date}`);
      return null;
    }

    const setClauses: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.totalMinutes !== undefined) {
      setClauses.push('total_minutes = ?');
      values.push(updates.totalMinutes);
    }
    if (updates.breakMinutes !== undefined) {
      setClauses.push('break_minutes = ?');
      values.push(updates.breakMinutes);
    }
    if (updates.locationName !== undefined) {
      setClauses.push('location_name = ?');
      values.push(updates.locationName);
    }
    if (updates.locationId !== undefined) {
      setClauses.push('location_id = ?');
      values.push(updates.locationId);
    }
    if (updates.verified !== undefined) {
      setClauses.push('verified = ?');
      values.push(updates.verified ? 1 : 0);
    }
    if (updates.source !== undefined) {
      setClauses.push('source = ?');
      values.push(updates.source);
    }
    if (updates.type !== undefined) {
      setClauses.push('type = ?');
      values.push(updates.type);
    }
    if (updates.firstEntry !== undefined) {
      setClauses.push('first_entry = ?');
      values.push(updates.firstEntry);
    }
    if (updates.lastExit !== undefined) {
      setClauses.push('last_exit = ?');
      values.push(updates.lastExit);
    }
    if (updates.notes !== undefined) {
      setClauses.push('notes = ?');
      values.push(updates.notes);
    }

    if (setClauses.length === 0) {
      return existing;
    }

    setClauses.push('updated_at = ?');
    values.push(now());
    setClauses.push('synced_at = NULL');

    values.push(userId, date);

    db.runSync(
      `UPDATE daily_hours SET ${setClauses.join(', ')} WHERE user_id = ? AND date = ?`,
      values
    );

    logger.info('database', `[daily_hours] UPDATED ${date}`, { fields: Object.keys(updates) });

    return getDailyHours(userId, date);
  } catch (error) {
    logger.error('database', '[daily_hours] UPDATE error', { error: String(error) });
    return null;
  }
}

export function addMinutesToDay(
  userId: string,
  date: string,
  minutesToAdd: number,
  lastExit?: string
): DailyHoursEntry | null {
  try {
    const existing = getDailyHours(userId, date);

    if (!existing) {
      return upsertDailyHours({
        userId,
        date,
        totalMinutes: minutesToAdd,
        lastExit,
        verified: true,
        source: 'gps',
      });
    }

    const newTotal = existing.total_minutes + minutesToAdd;

    db.runSync(
      `UPDATE daily_hours SET
        total_minutes = ?,
        last_exit = COALESCE(?, last_exit),
        updated_at = ?,
        synced_at = NULL
      WHERE user_id = ? AND date = ?`,
      [newTotal, lastExit || null, now(), userId, date]
    );

    logger.info('database', `[daily_hours] ADDED ${minutesToAdd}min to ${date}`, {
      newTotal,
    });

    return getDailyHours(userId, date);
  } catch (error) {
    logger.error('database', '[daily_hours] ADD MINUTES error', { error: String(error) });
    return null;
  }
}

// ============================================
// DELETE OPERATIONS
// ============================================

export function deleteDailyHours(userId: string, date: string): boolean {
  try {
    db.runSync(
      `UPDATE daily_hours SET deleted_at = ?, updated_at = ?, synced_at = NULL WHERE user_id = ? AND date = ?`,
      [now(), now(), userId, date]
    );
    logger.info('database', `[daily_hours] SOFT-DELETED ${date}`);
    return true;
  } catch (error) {
    logger.error('database', '[daily_hours] DELETE error', { error: String(error) });
    return false;
  }
}

export function deleteDailyHoursById(userId: string, id: string): boolean {
  try {
    db.runSync(
      `UPDATE daily_hours SET deleted_at = ?, updated_at = ?, synced_at = NULL WHERE user_id = ? AND id = ?`,
      [now(), now(), userId, id]
    );
    logger.info('database', `[daily_hours] SOFT-DELETED by id ${id.substring(0, 8)}...`);
    return true;
  } catch (error) {
    logger.error('database', '[daily_hours] DELETE BY ID error', { error: String(error) });
    return false;
  }
}

export function getDeletedDailyHoursForSync(userId: string): DailyHoursEntry[] {
  try {
    const records = db.getAllSync<DailyHoursDB>(
      `SELECT * FROM daily_hours WHERE user_id = ? AND deleted_at IS NOT NULL AND synced_at IS NULL`,
      [userId]
    );
    return records.map(toEntry);
  } catch (error) {
    logger.error('database', '[daily_hours] GET DELETED FOR SYNC error', { error: String(error) });
    return [];
  }
}

export function purgeDeletedDailyHours(userId: string, date: string): void {
  try {
    db.runSync(
      `DELETE FROM daily_hours WHERE user_id = ? AND date = ? AND deleted_at IS NOT NULL`,
      [userId, date]
    );
  } catch (error) {
    logger.error('database', '[daily_hours] PURGE error', { error: String(error) });
  }
}

// ============================================
// SYNC OPERATIONS
// ============================================

export function markDailyHoursSynced(userId: string, date: string): void {
  try {
    db.runSync(
      `UPDATE daily_hours SET synced_at = ? WHERE user_id = ? AND date = ?`,
      [now(), userId, date]
    );
  } catch (error) {
    logger.error('database', '[daily_hours] MARK SYNCED error', { error: String(error) });
  }
}

export function upsertDailyHoursFromSync(record: DailyHoursDB): void {
  try {
    const existing = db.getFirstSync<{ id: string; deleted_at: string | null; updated_at: string | null; synced_at: string | null }>(
      `SELECT id, deleted_at, updated_at, synced_at FROM daily_hours WHERE user_id = ? AND date = ?`,
      [record.user_id, record.date]
    );

    if (existing?.deleted_at) {
      logger.debug('database', `[daily_hours] SKIP upsert from sync (locally deleted): ${record.date}`);
      return;
    }

    if (existing) {
      if (!existing.synced_at) {
        logger.debug('database', `[daily_hours] SKIP upsert from sync (local edit pending upload): ${record.date}`);
        return;
      }

      if (existing.updated_at && record.updated_at && existing.updated_at > record.updated_at) {
        logger.debug('database', `[daily_hours] SKIP upsert from sync (local is newer): ${record.date}`);
        return;
      }

      db.runSync(
        `UPDATE daily_hours SET
          total_minutes = ?,
          break_minutes = ?,
          location_name = ?,
          location_id = ?,
          verified = ?,
          source = ?,
          type = ?,
          first_entry = ?,
          last_exit = ?,
          notes = ?,
          updated_at = ?,
          synced_at = ?
        WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
        [
          record.total_minutes,
          record.break_minutes,
          record.location_name,
          record.location_id,
          record.verified,
          record.source,
          record.type || 'work',
          record.first_entry,
          record.last_exit,
          record.notes,
          record.updated_at,
          now(),
          record.user_id,
          record.date,
        ]
      );
    } else {
      db.runSync(
        `INSERT INTO daily_hours (
          id, user_id, date, total_minutes, break_minutes,
          location_name, location_id, verified, source, type,
          first_entry, last_exit, notes, created_at, updated_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.user_id,
          record.date,
          record.total_minutes,
          record.break_minutes,
          record.location_name,
          record.location_id,
          record.verified,
          record.source,
          record.type || 'work',
          record.first_entry,
          record.last_exit,
          record.notes,
          record.created_at,
          record.updated_at,
          now(),
        ]
      );
    }
  } catch (error) {
    logger.error('database', '[daily_hours] UPSERT FROM SYNC error', { error: String(error) });
  }
}

export function getRecentLocationNames(userId: string, limit = 10): string[] {
  try {
    const results = db.getAllSync<{ location_name: string }>(
      `SELECT location_name, MAX(date) as last_used
       FROM daily_hours
       WHERE user_id = ? AND location_name IS NOT NULL AND location_name != '' AND deleted_at IS NULL
       GROUP BY location_name
       ORDER BY last_used DESC
       LIMIT ?`,
      [userId, limit]
    );
    return results.map(r => r.location_name);
  } catch {
    return [];
  }
}

/**
 * Web data initialization (no-op on native — SQLite is source of truth).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function initWebData(_userId: string): Promise<void> {
  // No-op on native
}
