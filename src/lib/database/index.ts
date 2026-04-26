/**
 * Database Module - OnSite Operator
 *
 * Barrel for the SQLite layer. Phase 1 ships with daily_hours only;
 * business_profile / invoices / clients CRUD modules will be added in
 * later phases as their stores are ported.
 */

// ============================================
// CORE
// ============================================

export {
  db,
  initDatabase,
  generateUUID,
  now,
  getToday,
  toLocalDateString,
  calculateDuration,
  formatDuration,
  // Types
  type DailyHoursSource,
  type DailyHoursType,
  type ErrorLogDB,
  type DailyHoursDB,
  type BusinessProfileDB,
  type InvoiceDB,
  type InvoiceItemDB,
  type InvoiceType,
  type InvoiceStatus,
  type ClientDB,
  type ActiveTrackingDB,
} from './core';

// ============================================
// DAILY HOURS
// ============================================

export {
  // Query
  getDailyHours,
  getTodayHours,
  getDailyHoursByPeriod,
  getAllDailyHours,
  getUnsyncedDailyHours,
  getDeletedDailyHoursForSync,
  getRecentLocationNames,
  // Mutations
  upsertDailyHours,
  updateDailyHours,
  addMinutesToDay,
  deleteDailyHours,
  deleteDailyHoursById,
  purgeDeletedDailyHours,
  // Sync
  markDailyHoursSynced,
  upsertDailyHoursFromSync,
  // Helpers
  resolveConflict,
  formatTimeHHMM,
  roundToHalfHour,
  getDateString,
  // Web bootstrap (no-op on native)
  initWebData as initDailyWebData,
  // Types
  type DailyHoursEntry,
  type UpsertDailyHoursParams,
  type UpdateDailyHoursParams,
  type ConflictAction,
} from './daily';
